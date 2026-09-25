"""Independent analytical oracles and failure cases for the EEG v2 contract."""
import json

import numpy as np
import pandas as pd
import pytest
from scipy.signal import welch

from neurodatics.modules.analytics.application.services.eeg_analytics_service import (
    EegAnalyticsService as EEG,
)
from neurodatics.modules.analytics.application.services.eeg_signal import (
    AMPLITUDE_Z_THRESHOLD,
    PEAK_TO_PEAK_THRESHOLD_UV,
    STEP_THRESHOLD_CEILING_UV,
    prepare_eeg,
    robust_scale,
)
from neurodatics.modules.analytics.api.schemas import (
    EegTimeseriesResponse,
    EegSpectrogramResponse,
)
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingService as CSV,
    CsvProcessingError,
    ChannelMetadata,
)


def sine(fs=128, seconds=16, amplitude=2):
    time = np.arange(fs * seconds) / fs
    values = amplitude * np.sin(2 * np.pi * 10 * time)
    return pd.DataFrame({"time": time, "f3": values, "f4": values, "c3": values})


def test_sine_parseval_and_alpha_band_power():
    result = EEG.compute_psd(sine(), use_db=False)
    assert result["frequency"][np.argmax(result["power"]["f3"])] == pytest.approx(10)
    assert result["total_power"]["f3"] == pytest.approx(2, rel=1e-10)
    assert result["band_power"]["f3"]["alpha"] == pytest.approx(2, rel=1e-10)
    assert result["band_power"]["f3"]["theta"] < 1e-20


def test_db_conversion_and_power_scaling_and_display_invariance():
    linear = EEG.compute_psd(sine(), use_db=False, max_points=3, max_freq_hz=5)
    db = EEG.compute_psd(sine(amplitude=20))
    base = EEG.compute_psd(sine())
    assert db["total_power"]["f3"] / linear["total_power"]["f3"] == pytest.approx(100)
    peak = np.argmax(base["power"]["f3"])
    assert db["power"]["f3"][peak] - base["power"]["f3"][peak] == pytest.approx(20)
    assert linear["band_power"] == base["band_power"]


def test_missing_rows_are_not_deleted_before_fourier_analysis():
    frame = sine()
    frame.loc[512:1023, "f3"] = np.nan
    result = EEG.compute_psd(frame, channels=["f3"], use_db=False)
    assert result["metadata"]["valid_windows"]["f3"] == 1
    f, expected = welch(frame.f3.to_numpy()[1024:], fs=128, window="hann", nperseg=1024)
    np.testing.assert_allclose(result["frequency"], f)
    np.testing.assert_allclose(result["power"]["f3"], expected, atol=1e-13)


def test_short_runs_do_not_become_a_long_recording():
    frame = sine()
    frame.loc[np.arange(len(frame)) % 7 == 0, "f3"] = np.nan
    assert EEG.compute_psd(frame, channels=["f3"])["frequency"] == []


@pytest.mark.parametrize("bad", ["duplicate", "reverse"])
def test_ambiguous_chronology_is_rejected_without_sorting(bad):
    frame = sine()
    frame.loc[100, "time"] = frame.loc[99, "time"] - (1 if bad == "reverse" else 0)
    for method in [EEG.compute_psd, EEG.compute_spectrogram, EEG.compute_topography]:
        assert method(frame)["channels"] == []


def test_spectrogram_keeps_actual_time_and_channel_specific_gaps():
    frame = sine(seconds=8)
    frame.loc[512:, "time"] += 20
    frame.loc[128:255, "f3"] = np.nan
    result = EEG.compute_spectrogram(frame, window_s=1, overlap_ratio=0, use_db=False)
    assert result["time"] == pytest.approx([0.5, 1.5, 2.5, 3.5, 24.5, 25.5, 26.5, 27.5])
    assert all(row[1] is None for row in result["power"]["f3"])
    assert all(row[1] is not None for row in result["power"]["f4"])
    assert all(row[4] is not None for row in result["power"]["f4"])
    EegSpectrogramResponse(**result)
    json.dumps(result, allow_nan=False)


def test_one_complete_spectrogram_window_is_sufficient():
    result = EEG.compute_spectrogram(sine(seconds=1), window_s=1)
    assert result["time"] == pytest.approx([0.5])
    assert result["normalize"] == "none"
    assert result["metadata"]["smooth_sigma_bins"] == 0


def test_spectrogram_density_matches_analytic_hann_bin_and_mean_square():
    result = EEG.compute_spectrogram(sine(seconds=2), window_s=1, overlap_ratio=0, use_db=False, max_freq_hz=None)
    matrix = np.array(result["power"]["f3"])
    # 2 uV peak sine, periodic Hann, 128 samples at 128 Hz: peak density 4/3.
    np.testing.assert_allclose(matrix[10], [4/3, 4/3], atol=1e-12)
    np.testing.assert_allclose(matrix.sum(axis=0), [2, 2], atol=1e-12)


def test_correlation_never_changes_montage_after_channel_dropout():
    from neurodatics.modules.analytics.application.services.correlation_service import CorrelationAnalyticsService as C
    frame = sine(seconds=4)
    frame["scenario"] = "a"
    frame["f4"] *= 10
    full, _, _ = C._eeg_signal(C._scenario_frame(frame, "a"), 16)
    frame.loc[256:, "f4"] = np.nan
    dropped, channels, _ = C._eeg_signal(C._scenario_frame(frame, "a"), 16)
    np.testing.assert_allclose(dropped.iloc[:8], full.iloc[:8])
    assert dropped.iloc[8:].isna().all()
    assert set(channels) == {"f3", "f4", "c3"}


def test_comparison_chart_preserves_a_ten_hz_raw_signal():
    from neurodatics.modules.analytics.application.services.comparison_chart_config import ChartConfigBuilder
    frame = sine(seconds=2)
    chart = ChartConfigBuilder._build_eeg(frame, "all", 5000)
    values = np.array([row["f3"] for row in chart["data"]])
    assert np.sqrt(np.mean(values**2)) == pytest.approx(np.sqrt(2), abs=1e-6)


def test_topography_removes_dc_per_window_and_never_interpolates():
    frame = sine(seconds=4)
    frame.loc[256:, ["f3", "f4", "c3"]] += 1000
    result = EEG.compute_topography(frame, window_s=2, overlap_ratio=0)
    np.testing.assert_allclose(result["power"]["f3"], [2, 2], atol=1e-5)
    frame.loc[256:300, "c3"] = np.nan
    result = EEG.compute_topography(frame, window_s=2, overlap_ratio=0)
    assert len(result["time"]) == 1


def test_condition_boundaries_are_not_bridged():
    frame = sine(seconds=2)
    frame["scenario"] = np.repeat(["a", "b"], 128)
    assert EEG.compute_topography(frame, window_s=2)["time"] == []


def test_raw_default_and_full_resolution_statistics_are_preserved():
    frame = sine()
    frame.loc[300:450, "f3"] = np.nan
    full = EEG.compute_timeseries(frame)
    small = EEG.compute_timeseries(frame, max_points=12)
    assert full["raw"] == full["smooth"]
    assert full["statistics"] == small["statistics"]
    assert full["statistics"]["raw"]["f3"]["count"] == len(frame) - 151
    assert full["raw"]["f3"][350] is None
    assert None in small["raw"]["f3"]
    EegTimeseriesResponse(**small)
    json.dumps(small, allow_nan=False)


def test_insufficient_nyquist_band_is_unavailable():
    result = EEG.compute_psd(sine(fs=60))
    assert result["band_power"]["f3"]["gamma"] is None
    assert result["band_power"]["f3"]["alpha"] == pytest.approx(2, rel=0.001)


def test_multiple_time_columns_fail_closed():
    with pytest.raises(CsvProcessingError, match="múltiples columnas Time"):
        CSV._build_dataframe_with_info(
            ["Time;EEG / F3;Time;EEG / F4", "0;1;0.1;2"], ";"
        )


@pytest.mark.parametrize(
    ("unit", "factor"), [("kilo", 1000), ("mV", 1000), ("V", 1e6), ("uV", 1)]
)
def test_eeg_unit_normalization_survives_parquet(tmp_path, unit, factor):
    frame = sine(seconds=1)
    metadata = [ChannelMetadata(raw_name="EEG / F3", canonical_name="f3", unit=unit)]
    normalized, contract, _ = CSV._normalize_declared_units(frame, metadata)
    path = tmp_path / "eeg.parquet"
    CSV._write_parquet_with_metadata(normalized, path, {"recording_units": contract})
    loaded = pd.read_parquet(path)
    np.testing.assert_allclose(loaded.f3, frame.f3 * factor)
    assert loaded.attrs["eeg_acquisition"]["source_units"]["f3"] == unit.lower()
    assert EEG.compute_psd(loaded)["total_power"]["f3"] == pytest.approx(
        2 * factor**2
    )


def quality(frame, channel="f3"):
    return prepare_eeg(frame, None, [channel]).metadata["channels"][channel]


def slow_excursion():
    """SAIO block 5 F3: 200 uV over a 1 s ramp, no single step above 100 uV."""
    frame = sine()
    frame.loc[1000:1063, "f3"] += np.linspace(0, 200, 64)
    frame.loc[1064:1127, "f3"] += np.linspace(200, 0, 64)
    return frame


def one_sample_step():
    """SAIO block 3 C3: a lone sample jumps while the distribution stays wide."""
    frame = sine(amplitude=100)
    frame.loc[1000, "f3"] = 700.0
    return frame


def test_step_detector_is_bounded_above_by_a_physiological_ceiling():
    # 20 * 1.4826 * MAD(diff) alone reached 6825 uV on SAIO block 4 P4 and let a
    # documented 556.9 uV transient through. The ceiling is what recovers it.
    wide = quality(one_sample_step())
    assert wide["transient_step_threshold_uV_assumed"] == STEP_THRESHOLD_CEILING_UV
    assert wide["step_threshold_ceiling_uV_assumed"] == STEP_THRESHOLD_CEILING_UV
    # The floor still holds for a quiet channel, unchanged from v2.
    assert quality(sine())["transient_step_threshold_uV_assumed"] == 100.0


def test_amplitude_detector_sees_what_the_step_detector_cannot():
    marked = quality(slow_excursion())
    assert marked["amplitude_z_max"] == pytest.approx(92.5, abs=0.1)
    assert marked["amplitude_outlier_samples"] > 0
    assert marked["transient_candidates"] == 0
    assert marked["peak_to_peak_excursions"] == 0


def test_step_detector_sees_what_the_amplitude_detector_cannot():
    marked = quality(one_sample_step())
    assert marked["transient_candidates"] > 0
    assert marked["max_absolute_step"] > STEP_THRESHOLD_CEILING_UV
    # Neither detector alone covers the set: here the robust z stays ordinary.
    assert marked["amplitude_z_max"] == pytest.approx(6.68, abs=0.01)
    assert marked["amplitude_outlier_samples"] == 0


def test_clean_channels_up_to_the_measured_margin_are_never_marked():
    # 7.8 is the largest robust z measured over the 42 clean SAIO channel/block
    # pairs. k=10 keeps that margin; the k=8 originally proposed does not.
    frame = sine()
    scale = robust_scale(frame.f3.to_numpy())
    frame.loc[1000, "f3"] = float(frame.f3.median()) + 7.8 * scale
    marked = quality(frame)
    assert marked["amplitude_z_threshold"] == AMPLITUDE_Z_THRESHOLD == 10
    assert marked["amplitude_z_max"] == pytest.approx(7.8)
    assert marked["amplitude_outlier_samples"] == 0


def test_peak_to_peak_test_covers_excursions_that_are_gradual_everywhere():
    frame = sine()
    frame.loc[1000:1127, "f3"] += np.linspace(0, 1200, 128)
    frame.loc[1128:1255, "f3"] += np.linspace(1200, 0, 128)
    marked = quality(frame)
    assert marked["peak_to_peak_max_uV"] > PEAK_TO_PEAK_THRESHOLD_UV
    assert marked["peak_to_peak_excursions"] > 0
    assert marked["transient_candidates"] == 0


def test_artifact_spans_locate_each_detector_instead_of_only_counting():
    metadata = prepare_eeg(slow_excursion(), None, ["f3"]).metadata
    spans = [s for s in metadata["artifact_spans"] if s["detector"] == "amplitude"]
    assert len(spans) == 1
    span = spans[0]
    assert span["channel"] == "f3"
    assert span["peak_uV"] == pytest.approx(200, abs=2)
    assert span["z"] == pytest.approx(92.5, abs=0.1)
    # 1000..1127 at 128 Hz, narrowed to the samples whose z clears the threshold.
    assert 7.8 < span["start_s"] < span["end_s"] < 8.8
    assert metadata["artifact_detection"]["amplitude_z_threshold"] == 10
    assert metadata["artifact_spans_total"] == len(metadata["artifact_spans"])


def test_one_artifact_sample_contaminates_two_overlapping_welch_windows():
    # 2048 samples, nperseg 1024, 50 % overlap: windows start at 0, 512, 1024.
    # A single bad sample at index 1000 lies inside the first two and only those.
    frame = sine()
    frame.loc[1000, "f3"] = 200.0
    included = EEG.compute_psd(frame, channels=["f3"], use_db=False)
    metadata = included["metadata"]
    assert metadata["windows_total"]["f3"] == 3
    assert metadata["windows_flagged"]["f3"] == 2
    assert metadata["artifact_window_criterion"] == (
        "overlaps_any_artifact_span_of_the_channel"
    )
    # The default number stays the contaminated one: 18x the clean power here.
    assert metadata["artifact_windows_excluded"] is False
    assert metadata["valid_windows"]["f3"] == 3
    assert included["total_power"]["f3"] == pytest.approx(36.3056, rel=1e-4)

    excluded = EEG.compute_psd(
        frame, channels=["f3"], use_db=False, exclude_artifact_windows=True
    )
    assert excluded["metadata"]["artifact_windows_excluded"] is True
    assert excluded["metadata"]["windows_flagged"]["f3"] == 2
    assert excluded["metadata"]["valid_windows"]["f3"] == 1
    assert excluded["total_power"]["f3"] == pytest.approx(2, rel=1e-10)


def test_a_short_channel_is_reported_incomplete_instead_of_shortening_nperseg():
    frame = sine()
    frame["p4"] = frame["f3"]
    frame.loc[np.arange(len(frame)) != np.clip(np.arange(len(frame)), 400, 799), "p4"] = np.nan
    base = EEG.compute_psd(sine(), use_db=False)
    degraded = EEG.compute_psd(frame, use_db=False)
    assert degraded["metadata"]["nperseg"] == base["metadata"]["nperseg"] == 1024
    assert degraded["metadata"]["incomplete_channels"] == ["p4"]
    assert "1024" in degraded["metadata"]["channel_unavailable_reason"]["p4"]
    assert "p4" not in degraded["channels"]
    assert degraded["metadata"]["nperseg_by_channel"]["f3"] == 1024
    assert degraded["metadata"]["frequency_resolution_hz_by_channel"]["f3"] == (
        pytest.approx(128 / 1024)
    )
    # The other channels' own data is untouched, so their power must be too.
    for channel in base["channels"]:
        assert degraded["total_power"][channel] == pytest.approx(
            base["total_power"][channel], rel=1e-9
        )


def contaminated_sine(fs=128, seconds=16):
    """A 10 Hz rhythm buried under a DC offset and mains interference."""
    time = np.arange(fs * seconds) / fs
    values = (
        2 * np.sin(2 * np.pi * 10 * time)
        + 50
        + 3 * np.sin(2 * np.pi * 60 * time)
    )
    return pd.DataFrame({"time": time, "f3": values, "f4": values * 2, "c3": values / 2})


def test_no_filter_and_no_rereferencing_happen_unless_asked():
    frame = contaminated_sine()
    metadata = prepare_eeg(frame, None, ["f3"]).metadata
    assert metadata["reference"] == "as_exported"
    assert metadata["reference_channels"] == []
    assert metadata["filtering"] == {"status": "none"}
    assert metadata["artifact_correction"] == "none"
    assert metadata["quality_basis"] == "as_exported_before_optional_processing"


def test_optional_band_pass_and_notch_recover_the_ten_hz_rhythm():
    frame = contaminated_sine()
    signal = prepare_eeg(frame, None, ["f3"], bandpass_hz=(1, 45), notch_hz=60.0)
    values = signal.values["f3"]
    values = values[np.isfinite(values)]
    # The 2 uV peak sine alone has RMS sqrt(2); the offset and the 60 Hz are gone.
    assert np.sqrt(np.mean(values**2)) == pytest.approx(np.sqrt(2), rel=0.02)
    filtering = signal.metadata["filtering"]
    assert filtering["status"] == "applied"
    assert filtering["bandpass_hz"] == [1.0, 45.0]
    assert filtering["notch_hz"] == 60.0
    assert filtering["phase"] == "zero_phase_forward_backward"
    assert filtering["scope"] == "within_each_contiguous_valid_run"
    assert any("Filtro aplicado" in warning for warning in signal.metadata["warnings"])
    # Quality still describes the export: the offset it reported is still there.
    assert signal.metadata["channels"]["f3"]["median_offset"] == pytest.approx(50, abs=1)


def test_a_filter_that_does_not_fit_under_nyquist_is_refused_not_approximated():
    signal = prepare_eeg(contaminated_sine(), None, ["f3"], bandpass_hz=(1, 200))
    assert signal.metadata["filtering"]["status"] == "not_applied"
    assert "64.00 Hz" in signal.metadata["filtering"]["reason"]
    values = signal.values["f3"]
    assert np.sqrt(np.mean(values[np.isfinite(values)] ** 2)) == pytest.approx(
        50.065, rel=1e-3
    )


def test_the_filter_never_runs_across_a_gap():
    frame = contaminated_sine()
    frame.loc[512:1023, "f3"] = np.nan
    signal = prepare_eeg(frame, None, ["f3"], bandpass_hz=(1, 45))
    assert signal.metadata["filtering"]["status"] == "applied"
    # The gap is still a gap, and each side was filtered on its own.
    assert not np.isfinite(signal.values["f3"][512:1024]).any()
    assert np.isfinite(signal.values["f3"][:512]).all()


def test_common_average_reference_is_recorded_and_excludes_bad_channels():
    frame = contaminated_sine()
    frame.loc[1000, "c3"] = 9000.0
    signal = prepare_eeg(frame, None, ["f3", "f4", "c3"], reference="common_average")
    assert signal.metadata["reference"] == "common_average"
    assert signal.metadata["reference_requested"] == "common_average"
    # C3 carries an artifact, so it must not define everyone else's zero.
    assert signal.metadata["reference_channels"] == ["f3", "f4"]
    assert any("Referencia promedio" in w for w in signal.metadata["warnings"])
    average = (frame.f3.to_numpy() + frame.f4.to_numpy()) / 2
    np.testing.assert_allclose(signal.values["f3"], frame.f3.to_numpy() - average)


def test_common_average_reference_declines_rather_than_inventing_one():
    frame = contaminated_sine()
    frame.loc[1000, ["f3", "f4", "c3"]] = 9000.0
    signal = prepare_eeg(frame, None, ["f3", "f4", "c3"], reference="common_average")
    # Every channel is marked, so no clean average exists to reference against.
    assert signal.metadata["reference"] == "as_exported"
    assert signal.metadata["reference_requested"] == "common_average"
    np.testing.assert_allclose(signal.values["f3"], frame.f3.to_numpy())


def test_minmax_envelope_keeps_a_one_sample_peak_that_selection_drops():
    frame = sine(seconds=16)
    frame.loc[1000, "f3"] = 916.5
    selected = EEG.compute_timeseries(frame, max_points=80)
    envelope = EEG.compute_timeseries(
        frame, max_points=80, decimation="minmax_envelope"
    )
    assert max(selected["raw"]["f3"], key=abs) != pytest.approx(916.5)
    assert max(envelope["raw"]["f3"], key=abs) == pytest.approx(916.5)
    assert len(envelope["time"]) == len(selected["time"]) == 80
    assert envelope["metadata"]["display_reduction"] == "min_max_envelope_per_bucket"
    assert selected["metadata"]["display_reduction"] == "sample_selection_only"
    # Neither reduction is allowed to move a statistic.
    assert envelope["statistics"] == selected["statistics"]
    EegTimeseriesResponse(**envelope)
    json.dumps(envelope, allow_nan=False)


def test_spectrogram_and_topography_accept_the_time_window_they_advertise():
    frame = sine(seconds=8)
    windowed = EEG.compute_spectrogram(
        frame, window_s=1, overlap_ratio=0, start_time_s=2.0, end_time_s=6.0
    )
    assert windowed["time"] == pytest.approx([2.5, 3.5, 4.5, 5.5])
    topography = EEG.compute_topography(frame, window_s=2, start_time_s=4.0)
    assert topography["time"] and min(topography["time"]) >= 4.0


def test_per_channel_spectrogram_colour_limits_are_opt_in():
    frame = sine(seconds=4)
    frame["f4"] *= 100
    shared = EEG.compute_spectrogram(frame, window_s=1, overlap_ratio=0)
    assert shared["channel_color_domain"] == {}
    assert shared["metadata"]["color_domain_basis"] == "all_selected_channels"
    split = EEG.compute_spectrogram(
        frame, window_s=1, overlap_ratio=0, per_channel_color_domain=True
    )
    assert split["color_domain"] == shared["color_domain"]
    assert split["metadata"]["color_domain_basis"] == "per_channel"
    # 100x amplitude is 40 dB, so F4's own limits sit well above F3's.
    assert split["channel_color_domain"]["f4"]["max"] > (
        split["channel_color_domain"]["f3"]["max"] + 35
    )
    EegSpectrogramResponse(**split)

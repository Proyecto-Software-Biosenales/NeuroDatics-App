import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.correlation_service import (
    CORRELATION_SIGNAL_IDS,
    CorrelationAnalyticsService,
)


TEST_BIN_SIZE_S = 0.25


def _make_multisensor_df(bin_count=12, samples_per_bin=10):
    sample_count = bin_count * samples_per_bin
    bins = np.repeat(np.arange(bin_count), samples_per_bin)
    within_bin = np.tile(np.arange(samples_per_bin), bin_count)
    relative_time = bins * TEST_BIN_SIZE_S + within_bin * (
        TEST_BIN_SIZE_S / samples_per_bin
    )
    phase = 2.0 * np.pi * within_bin / samples_per_bin
    level = bins.astype(float) + 1.0

    data = {
        "time": 100.0 + relative_time,
        "scenario": ["Target"] * sample_count,
        "lx_pupil": 2.5 + level * 0.05,
        "rx_pupil": 2.7 + level * 0.05,
        "gx": 20.0 + level,
        "gy": 80.0 - level,
        "distance": 500.0 + level * 10.0,
        "gsr": 1.0 + level * 0.1,
        "le": 1000.0 + level * 100.0,
    }
    for channel_offset, channel in enumerate(
        ("f3", "f4", "c3", "c4", "p3", "p4"), start=1
    ):
        amplitude = (1.0 + level * 0.1) * (1.0 + channel_offset * 0.05)
        data[channel] = amplitude * np.sin(phase)
    return pd.DataFrame(data)


def _cell(result, signal_x, signal_y):
    x_index = list(CORRELATION_SIGNAL_IDS).index(signal_x)
    y_index = list(CORRELATION_SIGNAL_IDS).index(signal_y)
    return result["matrix"][x_index][y_index]


def _metadata(result, signal_id):
    return next(item for item in result["signals"] if item["id"] == signal_id)


def test_scenario_is_filtered_before_relative_quarter_second_binning():
    target = _make_multisensor_df()
    decoy = target.copy()
    decoy["scenario"] = "Other"
    decoy["time"] = decoy["time"] - 100.0
    decoy["distance"] = 99999.0
    df = pd.concat([decoy, target], ignore_index=True)

    result = CorrelationAnalyticsService.compute(df, "Target")

    assert result["time_basis"] == "scenario_relative"
    assert result["bin_size_s"] == TEST_BIN_SIZE_S
    assert result["duration_s"] == 2.975
    assert result["total_bins"] == 12
    assert _metadata(result, "distance_cm")["valid_bins"] == 12
    assert _cell(result, "pupil_avg_mm", "distance_cm")["coefficient"] > 0.99


def test_short_32_hz_scenario_produces_twenty_bins_and_valid_correlations():
    df = _make_multisensor_df(bin_count=20, samples_per_bin=8)

    result = CorrelationAnalyticsService.compute(df, "Target")

    assert len(df) == 160
    assert df["time"].iloc[-1] - df["time"].iloc[0] == pytest.approx(4.96875)
    assert result["duration_s"] == 4.9688
    assert result["total_bins"] == 20
    assert result["bin_size_s"] == TEST_BIN_SIZE_S
    for signal_y in ("distance_cm", "gaze_y_pct", "eeg_broadband_power_db"):
        cell = _cell(result, "pupil_avg_mm", signal_y)
        assert cell["n_samples"] == 20
        assert cell["status"] == "ok"
        assert cell["coefficient"] is not None


def test_scenario_matching_accepts_normalized_file_stem():
    df = _make_multisensor_df()
    df["scenario"] = "Instruction 1.png"

    result = CorrelationAnalyticsService.compute(df, "instruction1")

    assert result["total_bins"] == 12
    assert all(item["available"] for item in result["signals"])


def test_matrix_is_symmetric_bounded_and_has_expected_positive_and_negative_pairs():
    result = CorrelationAnalyticsService.compute(_make_multisensor_df(), "Target")

    positive = _cell(result, "pupil_avg_mm", "distance_cm")
    negative = _cell(result, "pupil_avg_mm", "gaze_y_pct")
    assert positive["status"] == "ok"
    assert positive["coefficient"] > 0.99
    assert negative["status"] == "ok"
    assert negative["coefficient"] < -0.99

    for row_index, row in enumerate(result["matrix"]):
        for column_index, cell in enumerate(row):
            mirror = result["matrix"][column_index][row_index]
            assert cell["coefficient"] == mirror["coefficient"]
            assert cell["n_samples"] == mirror["n_samples"]
            assert cell["status"] == mirror["status"]
            if cell["coefficient"] is not None:
                assert -1.0 <= cell["coefficient"] <= 1.0

        diagonal = row[row_index]
        assert diagonal["coefficient"] == 1.0
        assert diagonal["status"] == "ok"


def test_pairwise_missing_bins_report_overlap_and_insufficient_status():
    df = _make_multisensor_df()
    relative_bins = np.floor((df["time"] - df["time"].min()) / TEST_BIN_SIZE_S).astype(
        int
    )
    df.loc[relative_bins.isin([1, 4]), "distance"] = np.nan

    enough = CorrelationAnalyticsService.compute(df, "Target")
    enough_cell = _cell(enough, "pupil_avg_mm", "distance_cm")
    assert enough_cell["n_samples"] == 10
    assert enough_cell["coverage"] == round(10 / 12, 4)
    assert enough_cell["status"] == "ok"

    df.loc[relative_bins == 7, "distance"] = np.nan
    insufficient = CorrelationAnalyticsService.compute(df, "Target")
    insufficient_cell = _cell(insufficient, "pupil_avg_mm", "distance_cm")
    assert insufficient_cell["n_samples"] == 9
    assert insufficient_cell["coefficient"] is None
    assert insufficient_cell["status"] == "insufficient_overlap"


def test_constant_signal_is_distinct_from_unavailable_and_never_returns_zero_placeholder():
    df = _make_multisensor_df()
    df["distance"] = 600.0
    result = CorrelationAnalyticsService.compute(df, "Target")

    constant = _cell(result, "pupil_avg_mm", "distance_cm")
    assert _metadata(result, "distance_cm")["available"] is True
    assert constant["status"] == "constant_signal"
    assert constant["coefficient"] is None

    missing_df = df.drop(columns=["gsr"])
    missing = CorrelationAnalyticsService.compute(missing_df, "Target")
    unavailable = _cell(missing, "pupil_avg_mm", "gsr_smoothed_us")
    assert unavailable["status"] == "unavailable"
    assert unavailable["coefficient"] is None
    assert _metadata(missing, "gsr_smoothed_us")["unavailable_reason"]


def test_pupil_falls_back_to_single_eye_and_distance_is_converted_to_centimetres():
    df = _make_multisensor_df().drop(columns=["rx_pupil"])

    _, total_bins, signals, metadata = CorrelationAnalyticsService.build_binned_signals(
        df,
        "Target",
    )

    assert total_bins == 12
    assert signals["pupil_avg_mm"].notna().all()
    assert metadata[0]["source_columns"] == ["lx_pupil"]
    assert signals["distance_cm"].iloc[0] == 51.0


def test_non_positive_pupil_samples_are_invalid_and_fall_back_to_valid_eye():
    df = _make_multisensor_df()
    first_bin = (
        np.floor((df["time"] - df["time"].min()) / TEST_BIN_SIZE_S).astype(int) == 0
    )
    df["rx_pupil"] = 4.0
    df.loc[first_bin, "lx_pupil"] = np.resize(
        np.array([0.0, -1.0]), int(first_bin.sum())
    )

    _, _, signals, _ = CorrelationAnalyticsService.build_binned_signals(df, "Target")

    assert signals["pupil_avg_mm"].iloc[0] == 4.0


def test_gaze_is_cleaned_to_percent_and_gsr_uses_scenario_relative_smoothed_bins():
    df = _make_multisensor_df()
    df["gx"] = df["gx"] / 100.0
    df["gy"] = df["gy"] / 100.0

    _, total_bins, signals, _ = CorrelationAnalyticsService.build_binned_signals(
        df, "Target"
    )

    assert total_bins == 12
    assert 20.0 <= signals["gaze_x_pct"].iloc[0] <= 22.0
    assert 78.0 <= signals["gaze_y_pct"].iloc[0] <= 80.0
    assert signals["gsr_smoothed_us"].index.tolist() == list(range(12))
    assert signals["gsr_smoothed_us"].notna().all()


def test_delayed_first_valid_gsr_sample_keeps_scenario_relative_bin():
    df = _make_multisensor_df()
    relative_bins = np.floor((df["time"] - df["time"].min()) / TEST_BIN_SIZE_S).astype(
        int
    )
    df.loc[relative_bins < 3, "gsr"] = np.nan

    _, total_bins, signals, metadata = CorrelationAnalyticsService.build_binned_signals(
        df, "Target"
    )
    gsr_metadata = next(item for item in metadata if item["id"] == "gsr_smoothed_us")

    assert total_bins == 12
    assert signals["gsr_smoothed_us"].iloc[:3].isna().all()
    assert signals["gsr_smoothed_us"].iloc[3:].notna().all()
    assert gsr_metadata["valid_bins"] == 9
    assert gsr_metadata["coverage"] == 0.75


@pytest.mark.parametrize(
    ("missing_column", "present_id", "missing_id"),
    [
        ("gy", "gaze_x_pct", "gaze_y_pct"),
        ("gx", "gaze_y_pct", "gaze_x_pct"),
    ],
)
def test_gaze_axes_remain_independently_available(
    missing_column,
    present_id,
    missing_id,
):
    df = _make_multisensor_df().drop(columns=[missing_column])

    result = CorrelationAnalyticsService.compute(df, "Target")
    present = _metadata(result, present_id)
    missing = _metadata(result, missing_id)

    assert present["available"] is True
    assert present["valid_bins"] == 12
    assert present["source_columns"] == ["gx" if present_id == "gaze_x_pct" else "gy"]
    assert present["unavailable_reason"] is None
    assert missing["available"] is False
    assert missing["valid_bins"] == 0
    assert missing["source_columns"] == []
    assert missing_column in missing["unavailable_reason"]
    assert _cell(result, "pupil_avg_mm", present_id)["status"] == "ok"
    assert _cell(result, "pupil_avg_mm", missing_id)["status"] == "unavailable"


def test_eeg_broadband_power_uses_scalp_channels_and_excludes_le():
    df = _make_multisensor_df()
    _, _, signals, metadata = CorrelationAnalyticsService.build_binned_signals(
        df, "Target"
    )
    eeg_meta = next(item for item in metadata if item["id"] == "eeg_broadband_power_db")

    assert "le" not in eeg_meta["source_columns"]
    assert eeg_meta["source_columns"] == ["f3", "f4", "c3", "c4", "p3", "p4"]
    assert signals["eeg_broadband_power_db"].notna().all()
    assert (
        _cell(
            CorrelationAnalyticsService.compute(df, "Target"),
            "pupil_avg_mm",
            "eeg_broadband_power_db",
        )["coefficient"]
        > 0.95
    )

    only_reference = df.drop(columns=["f3", "f4", "c3", "c4", "p3", "p4"])
    result = CorrelationAnalyticsService.compute(only_reference, "Target")
    assert _metadata(result, "eeg_broadband_power_db")["available"] is False


def test_empty_scenario_returns_stable_partial_payload():
    result = CorrelationAnalyticsService.compute(_make_multisensor_df(), "Missing")

    assert result["total_bins"] == 0
    assert result["duration_s"] == 0.0
    assert [item["id"] for item in result["signals"]] == list(CORRELATION_SIGNAL_IDS)
    assert all(not item["available"] for item in result["signals"])
    assert all(
        cell["status"] == "unavailable" for row in result["matrix"] for cell in row
    )

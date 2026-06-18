import numpy as np
import pandas as pd

from neurodatics.modules.analytics.application.services.analytics_service import (
    EEG_CHANNELS,
    EEG_TOPOGRAPHY_CHANNELS,
    EegAnalyticsService,
)


def _make_eeg_df(rows=12):
    data = {
        "time": np.arange(rows, dtype=float),
        "scenario": ["A" if idx < rows // 2 else "B" for idx in range(rows)],
    }
    for offset, channel in enumerate(EEG_CHANNELS, start=1):
        data[channel] = np.arange(rows, dtype=float) + offset
    return pd.DataFrame(data)


def _make_psd_df(rows=256, fs=100.0):
    time = np.arange(rows, dtype=float) / fs
    data = {
        "time": time,
        "scenario": ["A" if idx < rows // 2 else "B" for idx in range(rows)],
    }
    for offset, channel in enumerate(EEG_CHANNELS, start=1):
        data[channel] = np.sin(2 * np.pi * (8 + offset) * time) + offset * 0.01
    return pd.DataFrame(data)


def _make_topography_df(rows=500, fs=100.0):
    time = np.arange(rows, dtype=float) / fs
    data = {
        "time": time,
        "scenario": ["A" if idx < rows // 2 else "B" for idx in range(rows)],
        "le": np.sin(2 * np.pi * 3 * time),
    }
    for offset, channel in enumerate(EEG_TOPOGRAPHY_CHANNELS, start=1):
        data[channel] = offset * np.sin(2 * np.pi * (6 + offset) * time) + offset * 0.05
    return pd.DataFrame(data)


def test_eeg_timeseries_returns_all_default_channels():
    df = _make_eeg_df()

    result = EegAnalyticsService.compute_timeseries(df)

    assert result["channels"] == list(EEG_CHANNELS)
    assert result["available_channels"] == list(EEG_CHANNELS)
    assert result["time"] == list(np.arange(12, dtype=float))
    assert result["sampling_rate_hz"] == 1.0
    for channel in EEG_CHANNELS:
        assert len(result["raw"][channel]) == len(result["time"])
        assert len(result["smooth"][channel]) == len(result["time"])


def test_eeg_timeseries_honors_requested_channel_subset_and_dedupes():
    df = _make_eeg_df()

    result = EegAnalyticsService.compute_timeseries(
        df,
        channels=["f4", "bad", "f4", "p3"],
    )

    assert result["channels"] == ["f4", "p3"]
    assert set(result["raw"].keys()) == {"f4", "p3"}
    assert set(result["smooth"].keys()) == {"f4", "p3"}


def test_eeg_timeseries_ignores_missing_channels_and_returns_empty_if_none_remain():
    df = _make_eeg_df().drop(columns=["f3"])

    result = EegAnalyticsService.compute_timeseries(
        df,
        channels=["missing", "f3"],
    )

    assert result["time"] == []
    assert result["channels"] == []
    assert "f3" not in result["available_channels"]
    assert result["raw"] == {}
    assert result["smooth"] == {}


def test_eeg_timeseries_filters_scenario_without_resetting_time():
    df = _make_eeg_df()

    result = EegAnalyticsService.compute_timeseries(df, scenario="B", channels=["le"])

    assert result["channels"] == ["le"]
    assert result["time"][0] == 6.0
    assert result["time"][-1] == 11.0
    assert result["raw"]["le"][0] == 7.0


def test_eeg_timeseries_smoothing_stays_aligned_with_time():
    df = _make_eeg_df()

    result = EegAnalyticsService.compute_timeseries(
        df,
        channels=["c3"],
        smooth_window_s=0.2,
    )

    assert len(result["time"]) == len(result["raw"]["c3"])
    assert len(result["time"]) == len(result["smooth"]["c3"])


def test_eeg_timeseries_downsampling_preserves_alignment():
    df = _make_eeg_df(rows=10)

    result = EegAnalyticsService.compute_timeseries(
        df,
        channels=["f4", "p4"],
        max_points=4,
    )

    assert result["time"] == [0.0, 3.0, 6.0, 9.0]
    assert result["raw"]["f4"] == [2.0, 5.0, 8.0, 11.0]
    assert result["raw"]["p4"] == [4.0, 7.0, 10.0, 13.0]
    assert len(result["smooth"]["f4"]) == 4
    assert len(result["smooth"]["p4"]) == 4


def test_eeg_psd_returns_all_default_channels():
    df = _make_psd_df()

    result = EegAnalyticsService.compute_psd(df)

    assert result["channels"] == list(EEG_CHANNELS)
    assert result["available_channels"] == list(EEG_CHANNELS)
    assert result["sampling_rate_hz"] == 100.0
    assert result["use_db"] is True
    assert result["unit"] == "dB"
    assert result["frequency"]
    for channel in EEG_CHANNELS:
        assert len(result["power"][channel]) == len(result["frequency"])
        assert all(np.isfinite(result["power"][channel]))


def test_eeg_psd_honors_requested_channel_subset_and_dedupes():
    df = _make_psd_df()

    result = EegAnalyticsService.compute_psd(
        df,
        channels=["f4", "bad", "f4", "p3"],
    )

    assert result["channels"] == ["f4", "p3"]
    assert set(result["power"].keys()) == {"f4", "p3"}


def test_eeg_psd_ignores_missing_channels_and_returns_empty_if_none_remain():
    df = _make_psd_df().drop(columns=["f3"])

    result = EegAnalyticsService.compute_psd(
        df,
        channels=["missing", "f3"],
    )

    assert result["frequency"] == []
    assert result["channels"] == []
    assert "f3" not in result["available_channels"]
    assert result["power"] == {}


def test_eeg_psd_filters_scenario_before_computing_power():
    df = _make_psd_df()
    df.loc[df["scenario"] == "B", "le"] = 0.0

    result_a = EegAnalyticsService.compute_psd(
        df,
        scenario="A",
        channels=["le"],
        use_db=False,
    )
    result_b = EegAnalyticsService.compute_psd(
        df,
        scenario="B",
        channels=["le"],
        use_db=False,
    )

    assert result_a["channels"] == ["le"]
    assert result_b["channels"] == ["le"]
    assert max(result_a["power"]["le"]) > max(result_b["power"]["le"])


def test_eeg_psd_skips_channels_with_insufficient_samples():
    df = _make_psd_df(rows=7)

    result = EegAnalyticsService.compute_psd(df)

    assert result["frequency"] == []
    assert result["channels"] == []
    assert result["power"] == {}


def test_eeg_psd_can_return_linear_power():
    df = _make_psd_df()

    result = EegAnalyticsService.compute_psd(df, channels=["c3"], use_db=False)

    assert result["use_db"] is False
    assert result["unit"] == "uV^2/Hz"
    assert result["channels"] == ["c3"]
    assert min(result["power"]["c3"]) >= 0


def test_eeg_psd_applies_max_frequency_filter():
    df = _make_psd_df()

    result = EegAnalyticsService.compute_psd(df, channels=["f4"], max_freq_hz=15.0)

    assert result["frequency"]
    assert max(result["frequency"]) <= 15.0
    assert len(result["power"]["f4"]) == len(result["frequency"])


def test_eeg_psd_downsampling_preserves_alignment():
    df = _make_psd_df()

    result = EegAnalyticsService.compute_psd(
        df,
        channels=["f4", "p4"],
        max_points=5,
    )

    assert len(result["frequency"]) == 5
    assert len(result["power"]["f4"]) == 5
    assert len(result["power"]["p4"]) == 5


def test_eeg_spectrogram_returns_matrix_per_default_channel():
    df = _make_psd_df(rows=600)

    result = EegAnalyticsService.compute_spectrogram(df)

    assert result["channels"] == list(EEG_CHANNELS)
    assert result["available_channels"] == list(EEG_CHANNELS)
    assert result["sampling_rate_hz"] == 100.0
    assert result["use_db"] is True
    assert result["normalize"] == "freq_demean"
    assert result["unit"] == "dB centrado"
    assert result["time"]
    assert result["frequency"]
    assert result["color_domain"]["min"] < result["color_domain"]["max"]
    for channel in EEG_CHANNELS:
        assert len(result["power"][channel]) == len(result["frequency"])
        assert len(result["power"][channel][0]) == len(result["time"])


def test_eeg_spectrogram_honors_requested_channel_subset_and_dedupes():
    df = _make_psd_df(rows=600)

    result = EegAnalyticsService.compute_spectrogram(
        df,
        channels=["f4", "bad", "f4", "p3"],
    )

    assert result["channels"] == ["f4", "p3"]
    assert set(result["power"].keys()) == {"f4", "p3"}


def test_eeg_spectrogram_filters_scenario_before_computing_power():
    df = _make_psd_df(rows=600)

    result_a = EegAnalyticsService.compute_spectrogram(df, scenario="A", channels=["le"])
    result_b = EegAnalyticsService.compute_spectrogram(df, scenario="B", channels=["le"])

    assert result_a["channels"] == ["le"]
    assert result_b["channels"] == ["le"]
    assert result_b["time"][0] > result_a["time"][0]


def test_eeg_spectrogram_applies_max_frequency_filter():
    df = _make_psd_df(rows=600)

    result = EegAnalyticsService.compute_spectrogram(df, channels=["f4"], max_freq_hz=12.0)

    assert result["frequency"]
    assert max(result["frequency"]) <= 12.0
    assert len(result["power"]["f4"]) == len(result["frequency"])


def test_eeg_spectrogram_skips_channels_with_insufficient_samples():
    df = _make_psd_df(rows=120)

    result = EegAnalyticsService.compute_spectrogram(df)

    assert result["time"] == []
    assert result["frequency"] == []
    assert result["channels"] == []
    assert result["power"] == {}


def test_eeg_spectrogram_downsampling_caps_time_and_frequency_bins():
    df = _make_psd_df(rows=1200)

    result = EegAnalyticsService.compute_spectrogram(
        df,
        channels=["f4", "p4"],
        max_time_bins=3,
        max_frequency_bins=5,
    )

    assert len(result["time"]) <= 3
    assert len(result["frequency"]) <= 5
    assert len(result["power"]["f4"]) == len(result["frequency"])
    assert len(result["power"]["f4"][0]) == len(result["time"])
    assert len(result["power"]["p4"]) == len(result["frequency"])
    assert len(result["power"]["p4"][0]) == len(result["time"])


def test_eeg_topography_returns_default_broadband_power_frames():
    df = _make_topography_df()

    result = EegAnalyticsService.compute_topography(df)

    assert result["channels"] == list(EEG_TOPOGRAPHY_CHANNELS)
    assert result["available_channels"] == list(EEG_TOPOGRAPHY_CHANNELS)
    assert result["sampling_rate_hz"] == 100.0
    assert result["unit"] == "uV^2"
    assert result["window_s"] == 2.0
    assert result["overlap_ratio"] == 0.5
    assert result["remove_dc"] is True
    assert result["time"]
    assert set(result["positions"].keys()) == set(EEG_TOPOGRAPHY_CHANNELS)
    for channel in EEG_TOPOGRAPHY_CHANNELS:
        assert len(result["positions"][channel]) == 2
        assert len(result["power"][channel]) == len(result["time"])
        assert all(np.isfinite(result["power"][channel]))
    assert result["color_domain"]["max"] >= result["color_domain"]["min"]


def test_eeg_topography_filters_scenario_before_windowing():
    df = _make_topography_df()

    result_a = EegAnalyticsService.compute_topography(df, scenario="A")
    result_b = EegAnalyticsService.compute_topography(df, scenario="B")

    assert result_a["channels"] == list(EEG_TOPOGRAPHY_CHANNELS)
    assert result_b["channels"] == list(EEG_TOPOGRAPHY_CHANNELS)
    assert result_b["time"][0] > result_a["time"][0]


def test_eeg_topography_honors_requested_channel_subset_and_dedupes():
    df = _make_topography_df()

    result = EegAnalyticsService.compute_topography(
        df,
        channels=["f4", "bad", "f4", "p3", "c3"],
    )

    assert result["channels"] == ["f4", "p3", "c3"]
    assert set(result["power"].keys()) == {"f4", "p3", "c3"}
    assert set(result["positions"].keys()) == {"f4", "p3", "c3"}


def test_eeg_topography_returns_empty_with_fewer_than_three_electrodes():
    df = _make_topography_df().drop(columns=["c3", "c4", "p3", "p4"])

    result = EegAnalyticsService.compute_topography(df)

    assert result["time"] == []
    assert result["channels"] == []
    assert result["available_channels"] == ["f3", "f4"]
    assert result["positions"] == {}
    assert result["power"] == {}


def test_eeg_topography_returns_empty_with_insufficient_samples():
    df = _make_topography_df(rows=100)

    result = EegAnalyticsService.compute_topography(df)

    assert result["time"] == []
    assert result["channels"] == []
    assert result["power"] == {}


def test_eeg_topography_remove_dc_reduces_constant_offset_power():
    df = _make_topography_df()
    for offset, channel in enumerate(EEG_TOPOGRAPHY_CHANNELS, start=1):
        df[channel] = float(offset)

    centered = EegAnalyticsService.compute_topography(df, remove_dc=True)
    uncentered = EegAnalyticsService.compute_topography(df, remove_dc=False)

    centered_max = max(max(values) for values in centered["power"].values())
    uncentered_max = max(max(values) for values in uncentered["power"].values())
    assert centered_max < uncentered_max
    assert centered_max == 0.0


def test_eeg_topography_downsampling_caps_frames():
    df = _make_topography_df(rows=2000)

    result = EegAnalyticsService.compute_topography(df, max_frames=3)

    assert len(result["time"]) == 3
    for channel in result["channels"]:
        assert len(result["power"][channel]) == 3

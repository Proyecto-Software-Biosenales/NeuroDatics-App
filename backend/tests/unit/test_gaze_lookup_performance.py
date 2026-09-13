"""Nearest-row ordering and legacy context remain observable after narrowing."""

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.pupil_analytics_service import (
    PupilAnalyticsService,
)


def _applied_frame(times, scenarios, x):
    return pd.DataFrame({
        "time": times,
        "scenario": scenarios,
        "gx": [95.0] * len(times),
        "gy": [95.0] * len(times),
        "gaze_x_stimulus_norm": x,
        "gaze_y_stimulus_norm": [0.6] * len(times),
        "stimulus_transform_status": ["applied"] * len(times),
        "stimulus_transform_version": ["screen-stimulus-v1"] * len(times),
        "stimulus_transform_fingerprint": ["a" * 64] * len(times),
    })


@pytest.mark.parametrize("times, scenarios, x, t_s, expected", [
    ([0.0, 1.0, 2.0], ["A"] * 3, [0.1, 0.2, 0.3], -1.0, (0.0, "A", 10.0)),
    ([0.0, 1.0, 2.0], ["A"] * 3, [0.1, 0.2, 0.3], 3.0, (2.0, "A", 30.0)),
    ([0.0, 1.0, 2.0], ["A"] * 3, [0.1, 0.2, 0.3], 1.5, (1.0, "A", 20.0)),
    ([0.0, 0.0, 1.0, 1.0, 2.0], ["A"] * 5, [0.1, 0.2, 0.3, 0.4, 0.5], 1.5, (1.0, "A", 30.0)),
    ([2.0, 0.0], ["A", "A"], [0.8, 0.1], 1.0, (0.0, "A", 10.0)),
    ([2.0, 0.0, 1.0, 1.0, 3.0], ["B", "A", "A", "A", "B"], [0.8, 0.1, 0.2, 0.3, 0.9], 1.5, (2.0, "B", 80.0)),
    ([None, "bad", "1.0", "3.0"], ["A"] * 4, [0.1, 0.2, 0.3, 0.4], 1.1, (1.0, "A", 30.0)),
])
def test_applied_lookup_preserves_boundaries_ties_and_original_scenario(
    times, scenarios, x, t_s, expected
):
    frame = _applied_frame(times, scenarios, x)
    frame.index = np.arange(len(frame)) * 3 + 12
    original = frame.copy(deep=True)

    result = PupilAnalyticsService.find_gaze_at(frame, t_s)

    assert (result["nearest_time_s"], result["scenario"], result["gx"]) == expected
    assert result["gy"] == 60.0
    assert result["coordinate_transform"]["contract_fingerprint"] == "a" * 64
    pd.testing.assert_frame_equal(frame, original)


def test_applied_lookup_transforms_only_selected_row(monkeypatch):
    frame = _applied_frame(np.arange(1000) / 10, ["A"] * 1000, [0.25] * 1000)
    transform = PupilAnalyticsService._gaze_in_output_space
    transformed_sizes = []

    def record_transform(selected):
        transformed_sizes.append(len(selected))
        return transform(selected)

    monkeypatch.setattr(PupilAnalyticsService, "_gaze_in_output_space", record_transform)

    assert PupilAnalyticsService.find_gaze_at(frame, 10.05)["gx"] == 25.0
    assert transformed_sizes == [1]


@pytest.mark.parametrize("gaze, expected", [
    ([0.0, 10.0, 80.0, 30.0, 40.0], 26.67),
    ([20.0, 40.0, None, 80.0, 90.0], 60.0),
])
@pytest.mark.parametrize("unsorted", [False, True])
def test_legacy_lookup_keeps_smoothing_and_interpolation_context(gaze, expected, unsorted):
    frame = pd.DataFrame({
        "time": np.arange(5) / 10,
        "scenario": ["A"] * 5,
        "gx": gaze,
        "gy": [60.0] * 5,
    })
    if unsorted:
        frame = frame.iloc[[4, 0, 2, 1, 3]]

    result = PupilAnalyticsService.find_gaze_at(frame, 0.2)

    assert result["gx"] == expected
    assert result["gy"] == 60.0
    assert result["coordinate_transform"]["status"] == "legacy_passthrough_missing"


def test_legacy_lookup_preserves_stringified_null_scenario_context():
    frame = pd.DataFrame({
        "time": pd.Series(np.arange(5) / 10, dtype="Float64"),
        "scenario": pd.Series(["<NA>", None, "<NA>", None, "B"], dtype="string"),
        "gx": [0.0, 10.0, 80.0, 30.0, 40.0],
        "gy": [60.0] * 5,
    })

    result = PupilAnalyticsService.find_gaze_at(frame, 0.2)

    assert result["scenario"] == "<NA>"
    assert result["gx"] == 31.67


def test_legacy_sample_in_mixed_transform_frame_keeps_only_legacy_cleaning_context():
    frame = _applied_frame(np.arange(5) / 10, ["A"] * 5, [0.99] * 5)
    frame["gx"] = [20.0, 40.0, 60.0, 80.0, 90.0]
    frame["gy"] = 60.0
    frame["stimulus_transform_status"] = ["legacy_passthrough_missing"] * 5
    frame.loc[1, "stimulus_transform_status"] = "applied"
    frame.loc[3, "stimulus_transform_status"] = "applied"

    result = PupilAnalyticsService.find_gaze_at(frame, 0.2)

    assert result["gx"] == 58.33
    assert result["gy"] == 60.0
    assert result["coordinate_transform"]["status"] == "legacy_passthrough_missing"

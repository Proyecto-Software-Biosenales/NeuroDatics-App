"""Nearest-row ordering of the gaze lookup over the ingestion-time clean gaze."""

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
        "gaze_x_clean": [value * 100.0 for value in x],
        "gaze_y_clean": [60.0] * len(times),
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
    ([2.0, 0.0, 1.0, 1.0, 3.0], ["B", "A", "A", "A", "B"], [0.8, 0.1, 0.2, 0.3, 0.9], 1.5, (1.0, "A", 20.0)),
    ([None, "bad", "1.0", "3.0"], ["A"] * 4, [0.1, 0.2, 0.3, 0.4], 1.1, (1.0, "A", 30.0)),
])
def test_lookup_preserves_boundaries_ties_and_scenario(times, scenarios, x, t_s, expected):
    frame = _applied_frame(times, scenarios, x)
    frame.index = np.arange(len(frame)) * 3 + 12
    original = frame.copy(deep=True)

    result = PupilAnalyticsService.find_gaze_at(frame, t_s)

    assert (result["nearest_time_s"], result["scenario"], result["gx"]) == expected
    assert result["gy"] == 60.0
    assert result["coordinate_transform"]["contract_fingerprint"] == "a" * 64
    pd.testing.assert_frame_equal(frame, original)


def test_lookup_reports_a_gap_as_no_gaze():
    frame = _applied_frame([0.0, 0.1, 0.2], ["A"] * 3, [0.2, np.nan, 0.4])

    result = PupilAnalyticsService.find_gaze_at(frame, 0.1)

    assert (result["nearest_time_s"], result["gx"], result["gy"]) == (0.1, None, None)


def test_parquet_without_clean_gaze_has_no_gaze():
    frame = pd.DataFrame({"time": [0.0, 0.1], "scenario": ["A", "A"], "gx": [50.0, 50.0], "gy": [50.0, 50.0]})

    result = PupilAnalyticsService.find_gaze_at(frame, 0.1)

    assert (result["gx"], result["gy"]) == (None, None)

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.aoi_analytics_service import (
    AoiAnalyticsService,
)
from neurodatics.modules.analytics.application.services.fixation_analytics_service import (
    FixationEventService,
)


def _scalar_mask(shape: dict, x_values: np.ndarray, y_values: np.ndarray) -> np.ndarray:
    return np.asarray(
        [
            AoiAnalyticsService._contains(shape, float(x_value), float(y_value))
            for x_value, y_value in zip(x_values, y_values)
        ],
        dtype=bool,
    )


@pytest.mark.parametrize(
    "shape",
    [
        {"x": 20.0, "y": 15.0, "width": 50.0, "height": 60.0, "type": "rect"},
        {"x": 20.0, "y": 15.0, "width": 0.0, "height": 60.0, "type": "rect"},
        {"x": 20.0, "y": 15.0, "width": 0.0, "height": 0.0, "type": "rect"},
        {"x": 20.0, "y": 15.0, "width": 50.0, "height": 60.0, "type": "circle"},
        {"x": 20.0, "y": 15.0, "width": 0.0, "height": 60.0, "type": "circle"},
        {
            "x": 20.0,
            "y": 15.0,
            "width": 50.0,
            "height": 60.0,
            "type": "polygon",
            "points": [
                {"x": 20.0, "y": 15.0},
                {"x": 70.0, "y": 15.0},
                {"x": 45.0, "y": 75.0},
            ],
        },
    ],
)
def test_shape_mask_matches_scalar_edges_degenerates_and_non_finite(shape):
    x_values = np.asarray(
        [
            0.2,
            0.7,
            0.2,
            0.7,
            0.45,
            0.19999,
            0.70001,
            np.nan,
            np.inf,
            -np.inf,
        ],
        dtype=np.float64,
    )
    y_values = np.asarray(
        [0.15, 0.15, 0.75, 0.75, 0.45, 0.15, 0.15, 0.45, 0.45, 0.45],
        dtype=np.float64,
    )

    actual = AoiAnalyticsService._mask_for_shape(shape, x_values, y_values)

    assert actual.dtype == np.bool_
    assert np.array_equal(actual, _scalar_mask(shape, x_values, y_values))


def test_shape_mask_rejects_coordinate_shape_mismatch():
    shape = {"x": 0.0, "y": 0.0, "width": 100.0, "height": 100.0, "type": "rect"}

    with pytest.raises(ValueError, match="same shape"):
        AoiAnalyticsService._mask_for_shape(
            shape, np.asarray([0.1, 0.2]), np.asarray([0.1])
        )


def test_metrics_reuse_one_mask_per_aoi_and_preserve_overlap_priority(monkeypatch):
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 0.3],
            "gx": [50.0, 50.0, 80.0, 80.0],
            "gy": [50.0, 50.0, 50.0, 50.0],
            "lx_pupil": [3.0, 3.1, 3.2, 3.3],
            "rx_pupil": [3.2, 3.3, 3.4, 3.5],
            "distance": [600.0, 600.0, 610.0, 610.0],
            "fix_x": [50.0, 50.0, 80.0, 80.0],
            "fix_y": [50.0, 50.0, 50.0, 50.0],
            "fixation_id": [1, 1, 2, 2],
            "fixation_segment_id": ["segment-a"] * 4,
            "fixation_method": ["idt"] * 4,
            "fixation_detector_version": ["fixation-v2.0"] * 4,
            "scenario": ["A"] * 4,
        }
    )
    # Deliberately reverse the input. The established contract sorts by name,
    # so the overlapping first fixation belongs to A and then transitions to B.
    aois = [
        SimpleNamespace(
            id="b",
            name="B",
            color="#00ff00",
            shape_type="rect",
            shape={"x": 40, "y": 0, "width": 60, "height": 100},
        ),
        SimpleNamespace(
            id="a",
            name="A",
            color="#ff0000",
            shape_type="rect",
            shape={"x": 0, "y": 0, "width": 60, "height": 100},
        ),
    ]
    calls = []
    original = AoiAnalyticsService._mask_for_shape

    def counted(cls, shape, x_values, y_values):
        calls.append(len(x_values))
        return original(shape, x_values, y_values)

    monkeypatch.setattr(
        AoiAnalyticsService, "_mask_for_shape", classmethod(counted)
    )

    result = AoiAnalyticsService.compute_metrics(frame, "A", aois)

    assert calls == [2, 4, 2, 4]
    assert [row["name"] for row in result["aois"]] == ["A", "B"]
    assert [row["fixation_count"] for row in result["aois"]] == [1, 2]
    assert result["observed_aoi_dwell_time_ms"] == result["total_dwell_time_ms"]
    assert result["transitions"] == [
        {"from_aoi": "A", "counts": {"A": 0, "B": 1}, "total": 1},
        {"from_aoi": "B", "counts": {"A": 0, "B": 0}, "total": 0},
    ]
    gaze_x_max = next(event for event in result["events"] if event["id"] == "gaze_x_max")
    assert gaze_x_max["aoi_name"] == "B"


def _legacy_cadence(times, segments, effective_rate):
    fallback = 1.0 / effective_rate if effective_rate and effective_rate > 0 else 0.0
    result = {}
    for segment in dict.fromkeys(segments):
        segment_times = np.asarray(
            [
                time_value
                for time_value, key in zip(times, segments)
                if key == segment and np.isfinite(time_value)
            ],
            dtype=float,
        )
        differences = np.diff(segment_times)
        differences = differences[
            (differences > 0) & np.isfinite(differences)
        ]
        result[segment] = (
            float(np.median(differences)) if differences.size else fallback
        )
    return result


@pytest.mark.parametrize("effective_rate", [60.0, None, 0.0])
def test_cadence_groups_interleaved_null_segments_once_in_original_order(
    effective_rate,
):
    times = np.asarray(
        [0.0, 5.0, 0.0, np.nan, 2.0, 4.0, 1.0, np.inf, 3.0, 8.0],
        dtype=np.float64,
    )
    segments = ["a", "b", "a", None, "a", "b", "a", "missing", "a", "b"]

    actual = FixationEventService._cadence_by_segment(
        times, segments, effective_rate
    )

    assert list(actual) == ["a", "b", None, "missing"]
    assert actual == _legacy_cadence(times, segments, effective_rate)


@pytest.mark.parametrize("effective_rate", [120.0, None])
def test_single_segment_fast_path_preserves_repeated_and_decreasing_clocks(
    effective_rate,
):
    times = np.asarray([2.0, 2.0, 1.0, np.nan, 4.0, np.inf, 5.0])
    segments = ["only"] * len(times)

    assert FixationEventService._cadence_by_segment(
        times, segments, effective_rate
    ) == _legacy_cadence(times, segments, effective_rate)


def test_empty_cadence_has_no_synthetic_segment():
    assert FixationEventService._cadence_by_segment(
        np.asarray([], dtype=np.float64), [], 60.0
    ) == {}

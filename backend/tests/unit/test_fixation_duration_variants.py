from __future__ import annotations

from types import SimpleNamespace

import pandas as pd
import pytest

from neurodatics.modules.analytics.api.schemas import (
    FixationDurationSensitivityResponse,
)
from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    FixationDataService,
    FixationDurationVariantService,
    FixationEventService,
    FixationHistogramService,
    ScanpathAnalyticsService,
)
from neurodatics.modules.projects.application.services.fixation_detection_service import (
    FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    fixation_duration_column,
)


def _variant_values(duration_ms: int) -> dict[str, list]:
    labels_by_duration = {
        100: [1, None, 2, 2, None, 3, 3, 3],
        150: [None, None, 2, 2, None, 3, 3, 3],
        200: [None, None, 2, 2, None, 3, 3, 3],
        250: [None, None, None, None, None, 3, 3, 3],
        300: [None, None, None, None, None, 3, 3, 3],
    }
    labels = labels_by_duration[duration_ms]
    valid = [label is not None for label in labels]
    detector_counts = [
        1 if label == 1 else 2 if label == 2 else 3 if label == 3 else 0
        for label in labels
    ]
    return {
        "fix_x": [10.0 if label == 1 else 40.0 if label == 2 else 70.0 if label == 3 else -100.0 for label in labels],
        "fix_y": [20.0 if label == 1 else 50.0 if label == 2 else 80.0 if label == 3 else -100.0 for label in labels],
        "fixation_id": labels,
        "fixation_detector_sample_count": detector_counts,
        "fixation_source_row_count": [count if keep else 0 for count, keep in zip(detector_counts, valid)],
    }


def _variant_frame() -> pd.DataFrame:
    frame = pd.DataFrame(
        {
            "time": [index / 10.0 for index in range(8)],
            "scenario": ["A"] * 8,
            "gx": [10.0, 20.0, 40.0, 40.0, 60.0, 70.0, 70.0, 70.0],
            "gy": [20.0, 30.0, 50.0, 50.0, 60.0, 80.0, 80.0, 80.0],
            "fixation_segment_id": [1] * 8,
            "fixation_method": ["i-dt-normalized"] * 8,
            "fixation_detector_version": ["fixation-v2"] * 8,
            "fixation_effective_rate_hz": [10.0] * 8,
            "fixation_coordinate_unit": ["percent"] * 8,
            FIXATION_MIN_DURATION_COLUMN: [200] * 8,
        }
    )
    for duration in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        for base, values in _variant_values(int(duration)).items():
            frame[fixation_duration_column(base, duration)] = values
    frame.attrs = {"fixation": {"fixture": True}}
    return frame


def _old_v2_frame() -> pd.DataFrame:
    frame = _variant_frame()
    drop_columns = [FIXATION_MIN_DURATION_COLUMN]
    for duration in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        if int(duration) == 200:
            continue
        drop_columns.extend(
            fixation_duration_column(base, duration)
            for base in FIXATION_DURATION_VARIANT_COLUMNS
        )
    frame = frame.drop(columns=drop_columns)
    frame.attrs = {}
    return frame


def test_selector_validates_discovers_and_projects_without_mutating_input() -> None:
    frame = _variant_frame()
    original_ids = frame["fixation_id"].copy()

    assert FixationDurationVariantService.validate_duration("200") == 200
    assert FixationDurationVariantService.available_durations(frame) == [
        100,
        150,
        200,
        250,
        300,
    ]
    with pytest.raises(ValueError, match="Supported values"):
        FixationDurationVariantService.validate_duration(125)

    selected = FixationDurationVariantService.select_variant(frame, 100)

    for base in FIXATION_DURATION_VARIANT_COLUMNS:
        expected = frame[fixation_duration_column(base, 100)]
        pd.testing.assert_series_equal(selected[base], expected, check_names=False)
    pd.testing.assert_series_equal(frame["fixation_id"], original_ids)
    assert set(selected[FIXATION_MIN_DURATION_COLUMN]) == {100}
    assert selected.attrs[FIXATION_MIN_DURATION_COLUMN] == 100
    assert selected.attrs["available_min_fixation_durations_ms"] == [
        100,
        150,
        200,
        250,
        300,
    ]
    assert FIXATION_MIN_DURATION_COLUMN not in frame.attrs["fixation"]


def test_selector_rejects_a_missing_exact_variant_with_available_choices() -> None:
    frame = _variant_frame().drop(columns=["fixation_id__150ms"])

    with pytest.raises(
        ValueError,
        match=r"Requested 150 ms fixation variant is unavailable.*100 ms.*200 ms",
    ):
        FixationDurationVariantService.select_variant(frame, 150)


def test_explicit_default_keeps_old_v2_data_honest_and_compatible() -> None:
    frame = _old_v2_frame()

    events, metadata = FixationEventService.build_events(
        frame,
        "A",
        min_fixation_duration_ms=200,
    )

    assert len(events) == 2
    assert metadata["min_fixation_duration_ms"] is None
    assert metadata["available_min_fixation_durations_ms"] == []
    assert any("legacy file" in item for item in metadata["warnings"])
    assert FIXATION_MIN_DURATION_COLUMN not in frame.columns

    with pytest.raises(ValueError, match="legacy file.*Reprocess"):
        FixationDurationVariantService.select_variant(frame, 100)


def test_selected_duration_provenance_reaches_all_fixation_analytics() -> None:
    frame = _variant_frame()
    aoi = SimpleNamespace(
        id="long",
        name="Long fixation",
        color="#ff0000",
        shape_type="rect",
        shape={"x": 60, "y": 70, "width": 30, "height": 30},
    )
    payloads = [
        FixationDataService.compute_fixation_data(frame, "A", 250),
        ScanpathAnalyticsService.compute_scanpath(
            frame,
            "A",
            min_fixation_duration_ms=250,
        ),
        FixationHistogramService.compute_histogram(frame, "A", 250),
        AoiAnalyticsService.compute_metrics(frame, "A", [aoi], 250),
    ]

    for payload in payloads:
        assert payload["min_fixation_duration_ms"] == 250
        assert payload["available_min_fixation_durations_ms"] == [
            100,
            150,
            200,
            250,
            300,
        ]


def test_sensitivity_reports_event_and_retained_dwell_metrics() -> None:
    result = FixationDurationVariantService.compute_sensitivity(_variant_frame(), "A")

    assert result["default_min_fixation_duration_ms"] == 200
    assert result["min_fixation_duration_ms"] == 200
    assert result["available_min_fixation_durations_ms"] == [100, 150, 200, 250, 300]
    points = {point["min_fixation_duration_ms"]: point for point in result["points"]}
    assert points[100] == {
        "min_fixation_duration_ms": 100,
        "n_fixations": 3,
        "total_duration_ms": 600.0,
        "mean_duration_ms": 200.0,
        "median_duration_ms": 200.0,
        "max_duration_ms": 300.0,
        "retained_dwell_percent": 100.0,
    }
    assert points[150]["n_fixations"] == 2
    assert points[150]["total_duration_ms"] == 500.0
    assert points[150]["retained_dwell_percent"] == pytest.approx(83.33, abs=0.01)
    assert points[250]["n_fixations"] == 1
    assert points[250]["median_duration_ms"] == 300.0
    assert points[250]["retained_dwell_percent"] == 50.0

    parsed = FixationDurationSensitivityResponse(**result)
    assert parsed.points[-1].min_fixation_duration_ms == 300

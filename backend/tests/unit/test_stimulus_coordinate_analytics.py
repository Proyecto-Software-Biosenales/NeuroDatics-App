from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    FixationDataService,
    FixationEventService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
)
from neurodatics.modules.analytics.domain.coordinate_transform import (
    coordinate_transform_provenance,
    transform_cache_token,
)


FINGERPRINT_A = "a" * 64
FINGERPRINT_B = "b" * 64


def _applied_columns(size: int, *, fingerprint: str = FINGERPRINT_A) -> dict:
    return {
        "stimulus_transform_status": ["applied"] * size,
        "stimulus_transform_version": ["screen-stimulus-v1"] * size,
        "stimulus_transform_fingerprint": [fingerprint] * size,
        "stimulus_display_width_px": [1000.0] * size,
        "stimulus_display_height_px": [500.0] * size,
    }


def _applied_gaze_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2],
            "scenario": ["A"] * 3,
            # Deliberately disagree with local coordinates: these are audit-only
            # once the persisted transform was applied.
            "gx": [90.0, 10.0, 90.0],
            "gy": [80.0, 50.0, 80.0],
            "gaze_x_stimulus_norm": [0.1, -0.1, 0.2],
            "gaze_y_stimulus_norm": [0.5, 0.5, 0.6],
            "is_valid_gaze": [True, False, True],
            "gaze_invalid_reason": [None, "outside_stimulus", None],
            **_applied_columns(3),
        }
    )


def _v2_frame_with_off_stimulus_boundary() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "time": [0.00, 0.01, 0.02, 0.03],
            "scenario": ["A"] * 4,
            "gx": [900.0, 100.0, 900.0, 900.0],
            "gy": [250.0] * 4,
            "gaze_x_stimulus_norm": [0.8, -0.1, 0.1, 0.2],
            "gaze_y_stimulus_norm": [0.5] * 4,
            "is_valid_gaze": [True, False, True, True],
            "gaze_invalid_reason": [None, "outside_stimulus", None, None],
            "fix_x": [80.0, -10.0, 10.0, 20.0],
            "fix_y": [50.0] * 4,
            "fixation_id": ["a", "a", "a", "b"],
            "fixation_segment_id": ["s"] * 4,
            "fixation_method": ["idt"] * 4,
            "fixation_detector_version": ["fixation-v2"] * 4,
            **_applied_columns(4),
        }
    )


def test_applied_gaze_uses_local_columns_and_drops_outside_rows_without_clipping():
    frame = _applied_gaze_frame()
    raw_before = frame[["gx", "gy"]].copy(deep=True)

    timeseries = PupilAnalyticsService.compute_gaze_timeseries(frame, "A")
    statistics = PupilAnalyticsService.compute_gaze_statistics(frame, "A")
    outside_point = PupilAnalyticsService.find_gaze_at(frame, 0.1, scenario="A")

    assert timeseries["time"] == [0.0, 0.2]
    assert timeseries["gx_clean"] == [10.0, 20.0]
    assert timeseries["gy_clean"] == [50.0, 60.0]
    assert statistics["gx_min"] == 10.0
    assert statistics["gx_max"] == 20.0
    assert outside_point["gx"] is None
    assert outside_point["gy"] is None
    assert outside_point["coordinate_transform"]["rejected_outside_count"] == 1
    assert outside_point["coordinate_transform"]["rejected_outside_by_reason"] == {
        "outside_screen": 0,
        "outside_viewport": 0,
        "outside_stimulus": 1,
    }
    pd.testing.assert_frame_equal(frame[["gx", "gy"]], raw_before)


def test_legacy_gaze_is_numerically_unchanged_and_explicitly_warned():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1],
            "scenario": ["A", "A"],
            "gx": [25.0, 25.0],
            "gy": [75.0, 75.0],
        }
    )

    result = PupilAnalyticsService.compute_gaze_timeseries(frame, "A")

    assert result["gx_clean"] == [25.0, 25.0]
    assert result["gy_clean"] == [75.0, 75.0]
    assert result["coordinate_transform"]["status"] == "legacy_passthrough_missing"
    assert result["coordinate_transform"]["applied"] is False
    assert result["coordinate_transform"]["contract_fingerprint"] is None
    assert (
        "stimulus_placement_missing; legacy screen-normalized coordinates used"
        in result["warnings"]
    )


def test_all_scenario_provenance_reports_applied_and_legacy_as_mixed():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1],
            "scenario": ["A", "B"],
            "gx": [90.0, 80.0],
            "gy": [90.0, 70.0],
            "gaze_x_stimulus_norm": [0.1, np.nan],
            "gaze_y_stimulus_norm": [0.2, np.nan],
            "is_valid_gaze": [True, True],
            "gaze_invalid_reason": [None, None],
            "stimulus_transform_status": ["applied", "legacy_passthrough_missing"],
            "stimulus_transform_version": ["screen-stimulus-v1", None],
            "stimulus_transform_fingerprint": [FINGERPRINT_A, None],
        }
    )

    result = PupilAnalyticsService.compute_gaze_timeseries(frame, "all")
    provenance = result["coordinate_transform"]

    assert result["gx_clean"] == [10.0, 80.0]
    assert provenance["status"] == "mixed"
    assert provenance["applied"] is None
    assert provenance["contract_fingerprint"] is None
    assert provenance["rejected_outside_count"] is None
    assert [entry["scenario"] for entry in provenance["scenario_transforms"]] == [
        "A",
        "B",
    ]
    assert [entry["status"] for entry in provenance["scenario_transforms"]] == [
        "applied",
        "legacy_passthrough_missing",
    ]


def test_off_stimulus_rows_split_events_and_scanpath_pixel_distance():
    frame = _v2_frame_with_off_stimulus_boundary()

    events, metadata = FixationEventService.build_events(frame, "A")
    scanpath = ScanpathAnalyticsService.compute_scanpath(frame, "A")
    fixations = FixationDataService.compute_fixation_data(frame, "A")

    assert events["x_norm"].tolist() == [0.8, 0.1, 0.2]
    assert len(set(events["segment_id"])) == 2
    # Only 0.1 -> 0.2 is within one post-boundary detector segment: 10% of
    # the persisted 1000 px displayed width. 0.8 -> 0.1 is never connected.
    assert scanpath["total_distance_px"] == pytest.approx(100.0)
    assert [item["x_norm"] for item in fixations["fixations"]] == [0.8, 0.1, 0.2]
    assert metadata["coordinate_transform"]["rejected_outside_count"] == 1
    assert metadata["coordinate_transform"]["contract_fingerprint"] == FINGERPRINT_A


def test_aoi_sample_metrics_use_valid_local_gaze_not_raw_screen_gaze():
    samples = 40
    outside_position = 10
    local_x = (
        [0.8] * outside_position + [-0.1] + [0.1] * (samples - outside_position - 1)
    )
    valid = [True] * samples
    valid[outside_position] = False
    reasons = [None] * samples
    reasons[outside_position] = "outside_stimulus"
    frame = pd.DataFrame(
        {
            "time": np.arange(samples, dtype=float) / 100.0,
            "scenario": ["A"] * samples,
            "gx": [90.0] * outside_position
            + [10.0]
            + [90.0] * (samples - outside_position - 1),
            "gy": [50.0] * samples,
            "gaze_x_stimulus_norm": local_x,
            "gaze_y_stimulus_norm": [0.5] * samples,
            "is_valid_gaze": valid,
            "gaze_invalid_reason": reasons,
            "fix_x": [value * 100.0 for value in local_x],
            "fix_y": [50.0] * samples,
            "fixation_id": ["right"] * outside_position
            + ["outside"]
            + ["left"] * (samples - outside_position - 1),
            "fixation_segment_id": ["s"] * samples,
            "fixation_method": ["idt"] * samples,
            "fixation_detector_version": ["fixation-v2"] * samples,
            "lx_pupil": [2.0] * outside_position
            + [100.0]
            + [3.0] * (samples - outside_position - 1),
            "rx_pupil": [2.0] * outside_position
            + [100.0]
            + [3.0] * (samples - outside_position - 1),
            **_applied_columns(samples),
        }
    )
    aoi = SimpleNamespace(
        id="left",
        name="Left",
        color="#00ff00",
        shape_type="rect",
        shape={"x": 0.0, "y": 0.0, "width": 20.0, "height": 100.0},
    )

    result = AoiAnalyticsService.compute_metrics(frame, "A", [aoi])

    metric = result["aois"][0]
    assert metric["fixation_count"] == 1
    assert metric["pupil_sample_count"] == samples - outside_position - 1
    assert metric["avg_pupil_mm"] < 10.0
    assert all(
        event["gx"] is None or 0.0 <= event["gx"] <= 100.0 for event in result["events"]
    )
    assert result["coordinate_transform"]["status"] == "applied"


def test_fixation_filter_rejects_outside_values_instead_of_clipping_them():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1],
            "fix_x": [-5.0, 50.0],
            "fix_y": [50.0, 50.0],
        }
    )

    filtered = ScanpathAnalyticsService._filter_fixations(frame)

    assert filtered["fix_x"].tolist() == [0.5]
    assert filtered["fix_y"].tolist() == [0.5]


def test_transform_cache_token_changes_with_persisted_fingerprint():
    left = _applied_gaze_frame()
    right = _applied_gaze_frame()
    right["stimulus_transform_fingerprint"] = FINGERPRINT_B

    assert transform_cache_token(left) != transform_cache_token(right)
    assert (
        coordinate_transform_provenance(left)["contract_fingerprint"] == FINGERPRINT_A
    )


@pytest.mark.asyncio
async def test_scanpath_route_requires_one_concrete_scenario():
    with pytest.raises(HTTPException) as exc_info:
        await routes.scanpath(
            uuid4(),
            participant_code="P-01",
            scenario="all",
            db=object(),
            current_user=str(uuid4()),
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "scenario must be specified"


@pytest.mark.asyncio
async def test_empty_aoi_response_still_exposes_transform_provenance(monkeypatch):
    project_id = uuid4()

    async def allow(*_args, **_kwargs):
        return SimpleNamespace(id=project_id)

    async def resolve(*_args, **_kwargs):
        return SimpleNamespace(name="A", file_id=None, aois=[])

    class Reader:
        def __init__(self, _db):
            pass

        async def read(self, _project_id, _participant_code, generation=None):
            return _applied_gaze_frame()

    monkeypatch.setattr(routes, "_verify_ownership", allow)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", resolve)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)

    response = await routes.aoi_metrics(
        project_id,
        participant_code="P-01",
        scenario="A",
        db=object(),
        current_user=str(uuid4()),
    )

    assert response.aois == []
    assert response.total_fixations == 0
    assert response.coordinate_transform is not None
    assert response.coordinate_transform.status == "applied"
    assert response.coordinate_transform.contract_fingerprint == FINGERPRINT_A

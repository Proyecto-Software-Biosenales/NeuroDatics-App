from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.api.schemas import FixationDataResponse
from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    FixationDataService,
    FixationEventService,
    FixationHistogramService,
    HeatmapAnalyticsService,
    ScanpathAnalyticsService,
)


def _v2_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "time": [0.00, 0.01, 0.02, 0.03, 0.50, 0.51, 0.52],
            "fix_x": [10.0, 10.0, 10.0, -100.0, 40.0, 40.0, 40.0],
            "fix_y": [20.0, 20.0, 20.0, -100.0, 50.0, 50.0, 50.0],
            "fixation_id": [1, 1, 1, None, 2, 2, 2],
            "fixation_segment_id": ["segment-a"] * 7,
            "fixation_method": ["idt"] * 7,
            "fixation_detector_version": ["fixation-v2.0"] * 7,
            "fixation_detector_sample_count": [3, 3, 3, None, 3, 3, 3],
            "scenario": ["A"] * 7,
        }
    )


def test_v2_services_share_unique_events_and_do_not_charge_the_saccade_gap():
    frame = _v2_frame()

    fixation = FixationDataService.compute_fixation_data(frame, "A")
    scanpath = ScanpathAnalyticsService.compute_scanpath(frame, "A")
    histogram = FixationHistogramService.compute_histogram(frame, "A")

    assert fixation["stats"]["n_fixations"] == 2
    assert [event["id"] for event in fixation["fixations"]] == [
        "segment-a:1",
        "segment-a:2",
    ]
    assert [event["duration_s"] for event in fixation["fixations"]] == [0.03, 0.03]
    assert [event["source_row_count"] for event in fixation["fixations"]] == [3, 3]
    assert [event["detector_sample_count"] for event in fixation["fixations"]] == [3, 3]
    assert fixation["algorithm_version"] == "fixation-v2.0"
    assert fixation["method"] == "idt"
    assert fixation["source"] == "raw_gaze"
    assert fixation["effective_sampling_rate_hz"] == pytest.approx(100.0)

    assert scanpath["n_objectives"] == 2
    assert [objective["duration_s"] for objective in scanpath["objectives"]] == [
        0.03,
        0.03,
    ]
    assert histogram["n_fixations"] == 2
    assert histogram["total_duration_ms"] == 60.0
    assert histogram["algorithm_version"] == fixation["algorithm_version"]


def test_v2_repeated_id_is_split_after_a_long_invalid_gap():
    frame = pd.DataFrame(
        {
            "time": [0.00, 0.01, 0.02, 0.50, 0.51],
            "fix_x": [10.0, 10.0, -100.0, 10.0, 10.0],
            "fix_y": [20.0, 20.0, -100.0, 20.0, 20.0],
            "fixation_id": [7, 7, None, 7, 7],
            "fixation_segment_id": ["segment-a"] * 5,
            "fixation_method": ["idt"] * 5,
            "fixation_detector_version": ["fixation-v2.0"] * 5,
        }
    )

    result = FixationDataService.compute_fixation_data(frame)

    assert [event["id"] for event in result["fixations"]] == [
        "segment-a:7",
        "segment-a:7#span2",
    ]
    assert [event["duration_s"] for event in result["fixations"]] == [0.02, 0.02]
    assert any("long discontinuity" in warning for warning in result["warnings"])


def test_v2_short_bridged_gap_keeps_one_event_but_excludes_gap_from_dwell():
    frame = pd.DataFrame(
        {
            "time": [0.00, 0.01, 0.02, 0.03, 0.04],
            "fix_x": [10.0, 10.0, -100.0, 10.0, 10.0],
            "fix_y": [20.0, 20.0, -100.0, 20.0, 20.0],
            "fixation_id": [7, 7, None, 7, 7],
            "fixation_segment_id": ["segment-a"] * 5,
            "fixation_method": ["idt"] * 5,
            "fixation_detector_version": ["fixation-v2.0"] * 5,
        }
    )

    result = FixationDataService.compute_fixation_data(frame)

    assert len(result["fixations"]) == 1
    assert result["fixations"][0]["id"] == "segment-a:7"
    assert result["fixations"][0]["t_end_s"] == 0.05
    assert result["fixations"][0]["duration_s"] == 0.04
    assert any("bridged gap" in warning for warning in result["warnings"])


def test_v2_metadata_decodes_json_warnings_and_preserves_rate_precision():
    rate = 300.313802515981
    frame = _v2_frame()
    frame["fixation_effective_rate_hz"] = rate
    frame[
        "fixation_warnings"
    ] = '["resampled to eye rate", "coordinate outlier removed"]'

    result = FixationDataService.compute_fixation_data(frame, "A")

    assert result["effective_sampling_rate_hz"] == rate
    # The stored warnings are decoded in order and kept ahead of anything the
    # adapter itself has to report about this frame.
    assert result["warnings"][:2] == [
        "resampled to eye rate",
        "coordinate outlier removed",
    ]


def test_v2_with_no_labelled_events_does_not_fall_back_to_continuous_gaze():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.01, 0.02],
            "gx": [10.0, 11.0, 12.0],
            "gy": [20.0, 21.0, 22.0],
            "fix_x": [-100.0, -100.0, -100.0],
            "fix_y": [-100.0, -100.0, -100.0],
            "fixation_id": [None, None, None],
            "fixation_segment_id": ["segment-a"] * 3,
            "fixation_method": ["idt"] * 3,
            "fixation_detector_version": ["fixation-v2.0"] * 3,
        }
    )

    result = FixationDataService.compute_fixation_data(frame)

    assert result["fixations"] == []
    assert result["stats"]["n_fixations"] == 0
    assert result["source"] == "raw_gaze"
    assert HeatmapAnalyticsService.compute_heatmap_overlay(frame) is None


def test_legacy_fixations_remain_available_without_summing_the_invalid_gap():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 1.0, 1.1],
            "fix_x": [10.0, 10.0, -100.0, 10.0, 10.0],
            "fix_y": [20.0, 20.0, -100.0, 20.0, 20.0],
        }
    )

    result = FixationDataService.compute_fixation_data(frame)

    assert result["stats"]["n_fixations"] == 2
    assert [event["duration_s"] for event in result["fixations"]] == [0.2, 0.2]
    assert result["algorithm_version"] == "legacy-adapter-v1"
    assert result["source"] == "legacy_fixation_columns"


def test_aoi_transitions_reset_between_detector_segments():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.01, 1.0, 1.01],
            "fix_x": [10.0, 10.0, 70.0, 70.0],
            "fix_y": [10.0, 10.0, 70.0, 70.0],
            "fixation_id": [1, 1, 1, 1],
            "fixation_segment_id": ["segment-a", "segment-a", "segment-b", "segment-b"],
            "fixation_method": ["idt"] * 4,
            "fixation_detector_version": ["fixation-v2.0"] * 4,
            "scenario": ["A"] * 4,
        }
    )
    aois = [
        SimpleNamespace(
            id="left",
            name="Left",
            color="#ff0000",
            shape_type="rect",
            shape={"x": 0, "y": 0, "width": 30, "height": 30},
        ),
        SimpleNamespace(
            id="right",
            name="Right",
            color="#00ff00",
            shape_type="rect",
            shape={"x": 60, "y": 60, "width": 30, "height": 30},
        ),
    ]

    result = AoiAnalyticsService.compute_metrics(frame, "A", aois)

    assert result["total_fixations"] == 2
    assert sum(row["total"] for row in result["transitions"]) == 0
    assert result["algorithm_version"] == "fixation-v2.0"


def _resampled_v2_frame(
    *,
    grid_rate_hz: float = 300.0,
    eye_rate_hz: float = 60.0,
    event_ms: int = 300,
) -> pd.DataFrame:
    """One 300 ms detector event exported on a grid five times faster.

    The detector saw ``event_ms`` worth of samples on the eye clock; the export
    wrote every one of them five times on the master grid.
    """

    rows = int(round(grid_rate_hz * event_ms / 1000.0))
    detector_samples = int(round(eye_rate_hz * event_ms / 1000.0))
    return pd.DataFrame(
        {
            "time": [index / grid_rate_hz for index in range(rows)],
            "fix_x": [30.0] * rows,
            "fix_y": [40.0] * rows,
            "fixation_id": [1] * rows,
            "fixation_segment_id": ["segment-a"] * rows,
            "fixation_method": ["i-dt-normalized"] * rows,
            "fixation_detector_version": ["fixation-v2"] * rows,
            "fixation_detector_sample_count": [detector_samples] * rows,
            "fixation_effective_rate_hz": [eye_rate_hz] * rows,
            "scenario": ["A"] * rows,
        }
    )


def test_v2_duration_follows_detector_support_not_the_exported_row_grid():
    frame = _resampled_v2_frame()

    fixation = FixationDataService.compute_fixation_data(frame, "A")
    scanpath = ScanpathAnalyticsService.compute_scanpath(frame, "A")
    histogram = FixationHistogramService.compute_histogram(frame, "A")
    aoi = AoiAnalyticsService.compute_metrics(
        frame,
        "A",
        [
            SimpleNamespace(
                id="target",
                name="Target",
                color="#ff0000",
                shape_type="rect",
                shape={"x": 20, "y": 30, "width": 30, "height": 30},
            )
        ],
    )

    # 18 detector samples on a 60 Hz eye clock is 300 ms, whatever the export
    # grid did with them.
    assert fixation["stats"]["n_fixations"] == 1
    event = fixation["fixations"][0]
    assert event["duration_s"] == pytest.approx(0.300, abs=1e-6)
    assert event["detector_sample_count"] == 18
    assert event["source_row_count"] == 90
    assert scanpath["objectives"][0]["duration_s"] == pytest.approx(0.300, abs=1e-4)
    assert histogram["total_duration_ms"] == pytest.approx(300.0, abs=1e-2)
    assert aoi["aois"][0]["total_dwell_time_ms"] == pytest.approx(300.0, abs=1e-2)
    assert aoi["total_dwell_time_ms"] == pytest.approx(300.0, abs=1e-2)
    assert fixation["estimated"] is False


def test_v2_heatmap_weights_the_event_by_its_detector_duration():
    events, _ = FixationEventService.build_events(_resampled_v2_frame(), "A")

    assert len(events) == 1
    assert float(events["duration_s"].iloc[0]) == pytest.approx(0.300, abs=1e-6)


def test_three_hundred_hertz_rows_do_not_become_three_hundred_events():
    frame = _resampled_v2_frame(event_ms=1000)
    rows = len(frame)
    # Three consecutive fixations exported on the same fast grid.
    frame["fixation_id"] = [1] * (rows // 3) + [2] * (rows // 3) + [3] * (
        rows - 2 * (rows // 3)
    )
    frame["fix_x"] = [30.0] * (rows // 3) + [50.0] * (rows // 3) + [70.0] * (
        rows - 2 * (rows // 3)
    )

    fixation = FixationDataService.compute_fixation_data(frame, "A")
    histogram = FixationHistogramService.compute_histogram(frame, "A")
    scanpath = ScanpathAnalyticsService.compute_scanpath(frame, "A")

    assert rows == 300
    assert fixation["stats"]["n_fixations"] == 3
    assert histogram["n_fixations"] == 3
    assert scanpath["n_objectives"] == 3
    assert sum(event["source_row_count"] for event in fixation["fixations"]) == rows


def test_repeated_export_timestamps_do_not_split_one_event_per_row():
    frame = _resampled_v2_frame(event_ms=100)
    # A slower sensor dictated the grid, so each eye timestamp repeats five
    # times instead of advancing once per exported row.
    frame["time"] = [float(index // 5) / 60.0 for index in range(len(frame))]

    result = FixationDataService.compute_fixation_data(frame, "A")

    assert len(result["fixations"]) == 1
    assert not any("#span" in event["id"] for event in result["fixations"])


def test_v2_short_absent_row_gap_is_not_charged_back_as_dwell():
    # 100 Hz rows with a 50 ms stretch of rows simply missing from the export.
    times = [0.00, 0.01, 0.02, 0.07, 0.08]
    frame = pd.DataFrame(
        {
            "time": times,
            "fix_x": [10.0] * 5,
            "fix_y": [20.0] * 5,
            "fixation_id": [4] * 5,
            "fixation_segment_id": ["segment-a"] * 5,
            "fixation_method": ["idt"] * 5,
            "fixation_detector_version": ["fixation-v2.0"] * 5,
        }
    )

    result = FixationDataService.compute_fixation_data(frame)
    event = result["fixations"][0]

    # Five supported rows at 100 Hz is 50 ms; the 50 ms of absent rows is not
    # dwell, even though the wall clock spans 90 ms.
    assert event["duration_s"] == pytest.approx(0.05, abs=1e-9)
    assert event["t_end_s"] == pytest.approx(0.09, abs=1e-9)


def test_v2_declared_rate_above_the_row_grid_is_not_used_for_duration():
    frame = _resampled_v2_frame(event_ms=100)
    frame["fixation_effective_rate_hz"] = 3000.0

    result = FixationDataService.compute_fixation_data(frame, "A")
    event = result["fixations"][0]

    assert event["duration_s"] == pytest.approx(0.100, abs=1e-6)
    assert any("exceeds the exported row grid" in item for item in result["warnings"])


def test_v2_without_a_stored_detector_count_measures_the_exported_rows():
    frame = _resampled_v2_frame(event_ms=100)
    frame = frame.drop(columns=["fixation_detector_sample_count"])

    result = FixationDataService.compute_fixation_data(frame, "A")
    event = result["fixations"][0]

    # 30 rows on a 300 Hz grid is 100 ms.  Reading those rows as 60 Hz detector
    # samples would have claimed half a second.
    assert event["duration_s"] == pytest.approx(0.100, abs=1e-6)
    assert event["source_row_count"] == 30


def test_explicit_invalid_rows_inside_an_event_add_no_dwell():
    frame = _resampled_v2_frame(event_ms=200)
    # A 50 ms blackout in the middle keeps its paired sentinel, so the detector
    # kept 9 of the 12 samples this 200 ms stretch could have carried.
    blackout = (frame["time"] >= 0.075) & (frame["time"] < 0.125)
    frame.loc[blackout, ["fix_x", "fix_y"]] = -100.0
    frame.loc[blackout, "fixation_id"] = None
    frame.loc[~blackout, "fixation_detector_sample_count"] = 9

    result = FixationDataService.compute_fixation_data(frame, "A")
    event = result["fixations"][0]

    assert int(blackout.sum()) == 15
    # The blackout buys nothing, even though the event still spans 200 ms of
    # wall clock either side of it.
    assert event["duration_s"] == pytest.approx(9 / 60.0, abs=1e-6)
    assert event["t_end_s"] - event["time_s"] == pytest.approx(0.200, abs=1e-4)
    assert not any("disagree" in item for item in result["warnings"])


def test_legacy_outlier_is_rejected_instead_of_pulled_onto_the_edge():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5],
            "fix_x": [50.0, 50.0, 50.0, 50.0, 260.0, 265.0],
            "fix_y": [50.0, 50.0, 50.0, 50.0, 240.0, 245.0],
        }
    )
    edge = [
        SimpleNamespace(
            id="edge",
            name="Edge",
            color="#ff0000",
            shape_type="rect",
            shape={"x": 90, "y": 90, "width": 10, "height": 10},
        )
    ]

    result = FixationDataService.compute_fixation_data(frame)
    aoi = AoiAnalyticsService.compute_metrics(frame, "all", edge)

    assert [event["x_norm"] for event in result["fixations"]] == [0.5]
    assert aoi["aois"][0]["fixation_count"] == 0
    assert aoi["aois"][0]["total_dwell_time_ms"] == 0.0
    assert any("outside the screen" in item for item in result["warnings"])


def test_legacy_single_row_never_becomes_a_scanpath_node():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
            # One transition sample sits alone between two real fixations.
            "fix_x": [10.0, 10.0, 10.0, -100.0, 55.0, -100.0, 80.0],
            "fix_y": [20.0, 20.0, 20.0, -100.0, 65.0, -100.0, 90.0],
        }
    )

    scanpath = ScanpathAnalyticsService.compute_scanpath(frame)
    result = FixationDataService.compute_fixation_data(frame)

    assert scanpath["n_objectives"] == 1
    assert result["stats"]["n_fixations"] == 1
    assert result["fixations"][0]["source_row_count"] == 3
    assert any("isolated legacy row" in item for item in result["warnings"])


def test_legacy_events_are_marked_as_estimates_everywhere():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 1.0, 1.1],
            "fix_x": [10.0, 10.0, -100.0, 10.0, 10.0],
            "fix_y": [20.0, 20.0, -100.0, 20.0, 20.0],
        }
    )

    fixation = FixationDataService.compute_fixation_data(frame)
    scanpath = ScanpathAnalyticsService.compute_scanpath(frame)
    histogram = FixationHistogramService.compute_histogram(frame)
    aoi = AoiAnalyticsService.compute_metrics(frame, "all", [])

    for payload in (fixation, scanpath, histogram, aoi):
        assert payload["estimated"] is True
        assert payload["algorithm_version"] == "legacy-adapter-v1"
        assert any("estimates rebuilt from stored samples" in item for item in payload["warnings"])

    assert FixationDataResponse(**fixation).estimated is True


def test_fixation_schema_accepts_legacy_payloads_and_exposes_v2_fields():
    legacy = FixationDataResponse(
        fixations=[{"x_norm": 0.1, "y_norm": 0.2, "time_s": 0.0, "duration_s": 0.1}],
        stats={"n_fixations": 1, "max_duration_s": 0.1, "avg_duration_s": 0.1},
    )
    assert legacy.fixations[0].id is None

    v2 = FixationDataResponse(
        fixations=[
            {
                "id": "segment-a:1",
                "x_norm": 0.1,
                "y_norm": 0.2,
                "time_s": 0.0,
                "t_end_s": 0.1,
                "duration_s": 0.1,
                "detector_sample_count": 6,
                "source_row_count": 30,
                "segment_id": "segment-a",
            }
        ],
        stats={"n_fixations": 1, "max_duration_s": 0.1, "avg_duration_s": 0.1},
        algorithm_version="fixation-v2.0",
        method="idt",
        source="raw_gaze",
    )
    assert v2.fixations[0].source_row_count == 30
    assert v2.source == "raw_gaze"

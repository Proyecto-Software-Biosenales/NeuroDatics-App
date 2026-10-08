"""G05 ownership and scientific boundaries; independent legacy/v2 oracles."""
from dataclasses import FrozenInstanceError
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    FixationDataService,
    FixationEventService,
    FixationHistogramService,
    HeatmapAnalyticsService,
    ScanpathAnalyticsService,
)
from test_fixation_duration_variants import _variant_frame
from test_fixation_event_analytics import _v2_frame
from test_stimulus_coordinate_analytics import _v2_frame_with_off_stimulus_boundary


def _aoi():
    return SimpleNamespace(id="a", name="A", color="#3B82F6", shape_type="rect",
                           shape={"x": 0, "y": 0, "width": 100, "height": 100})


@pytest.mark.parametrize("factory", [_v2_frame, _v2_frame_with_off_stimulus_boundary,
    lambda: pd.DataFrame({"time": [0, .01, .02, .03, .04, .05],
                          "fix_x": [10, 10, np.nan, 40, 40, 40],
                          "fix_y": [20, 20, np.nan, 50, 50, 50], "scenario": ["A"] * 6}),
    lambda: pd.DataFrame({"time": [], "scenario": []})])
def test_consumers_match_dataframe_wrappers_and_canonical_events(factory):
    frame = factory()
    result = FixationEventService.build_result(frame, "A")
    events, metadata = FixationEventService.build_events(frame, "A")
    pd.testing.assert_frame_equal(result.events, events)
    assert result.metadata == metadata
    assert FixationDataService.compute_fixation_data_from_events(result) == FixationDataService.compute_fixation_data(frame, "A")
    assert FixationHistogramService.compute_histogram_from_events(result) == FixationHistogramService.compute_histogram(frame, "A")
    assert ScanpathAnalyticsService.compute_scanpath_from_events(result) == ScanpathAnalyticsService.compute_scanpath(frame, "A")
    assert AoiAnalyticsService.compute_metrics_from_events(frame, "A", [_aoi()], result) == AoiAnalyticsService.compute_metrics(frame, "A", [_aoi()])
    assert HeatmapAnalyticsService.compute_heatmap_overlay_from_events(result, width=80, height=40) == HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(frame, "A", width=80, height=40)


@pytest.mark.parametrize("duration", [100, 150, 200, 250, 300])
def test_each_persisted_variant_keeps_its_own_events_metadata_and_consumers(duration):
    frame = _variant_frame()
    result = FixationEventService.build_result(frame, "A", min_fixation_duration_ms=duration)
    expected, metadata = FixationEventService.build_events(frame, "A", min_fixation_duration_ms=duration)
    pd.testing.assert_frame_equal(result.events, expected)
    assert result.metadata == metadata
    assert result.min_fixation_duration_ms == duration
    assert result.metadata["min_fixation_duration_ms"] == duration
    assert FixationHistogramService.compute_histogram_from_events(result) == FixationHistogramService.compute_histogram(frame, "A", duration)
    assert ScanpathAnalyticsService.compute_scanpath_from_events(result) == ScanpathAnalyticsService.compute_scanpath(frame, "A", min_fixation_duration_ms=duration)
    assert AoiAnalyticsService.compute_metrics_from_events(frame, "A", [_aoi()], result) == AoiAnalyticsService.compute_metrics(frame, "A", [_aoi()], duration)


def test_scenario_proximity_variant_and_source_boundaries_are_explicit():
    frame = pd.DataFrame({"time": [0., .01, .02, .03], "scenario": ["A"] * 4,
                          "fix_x": [10., 10., 12., 12.], "fix_y": [20.] * 4})
    close = FixationEventService.build_result(frame, "A", proximity_threshold=.03)
    separate = FixationEventService.build_result(frame, "A", proximity_threshold=.001)
    absent = FixationEventService.build_result(frame, "B")
    assert len(close.events) == 1
    assert len(separate.events) == 2
    assert absent.events.empty
    assert close.proximity_threshold != separate.proximity_threshold
    assert close.min_fixation_duration_ms is None
    with pytest.raises(ValueError, match="same source and scenario"):
        AoiAnalyticsService.compute_metrics_from_events(frame, "B", [_aoi()], close)
    with pytest.raises(ValueError, match="same source and scenario"):
        AoiAnalyticsService.compute_metrics_from_events(frame.copy(), "A", [_aoi()], close)


def test_result_and_consumer_outputs_do_not_share_mutable_events_or_provenance():
    frame = _v2_frame()
    source_before = frame.copy(deep=True)
    result = FixationEventService.build_result(frame, "A")
    original_events, original_metadata = result.events, result.metadata
    snapshot = result.events
    snapshot.loc[:, "duration_s"] = 999
    snapshot.attrs["consumer"] = ["changed"]
    metadata = result.metadata
    metadata["warnings"].append("changed")
    metadata["coordinate_transform"]["status"] = "changed"
    scanpath = ScanpathAnalyticsService.compute_scanpath_from_events(result)
    assert scanpath["warnings"] != result.metadata["warnings"]  # geometry warning is private
    for payload in (scanpath, FixationDataService.compute_fixation_data_from_events(result),
                    FixationHistogramService.compute_histogram_from_events(result),
                    AoiAnalyticsService.compute_metrics_from_events(frame, "A", [_aoi()], result)):
        payload["warnings"].append("consumer edit")
        payload["coordinate_transform"]["status"] = "consumer edit"
    with pytest.raises(FrozenInstanceError):
        result.scenario = "B"
    pd.testing.assert_frame_equal(result.events, original_events)
    pd.testing.assert_frame_equal(frame, source_before)
    assert result.metadata == original_metadata

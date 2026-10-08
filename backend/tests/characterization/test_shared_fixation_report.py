"""One construction per source/scenario in EyeTracker, no persistent cache."""
import pandas as pd
import pytest

from neurodatics.modules.reports.application.sensor_reports import eye_tracking
from test_sensor_reports import _context


def test_collect_shares_one_result_and_preserves_direct_service_outputs(corpus, aois, monkeypatch):
    context = _context(corpus.frames, aois, "EyeTracker", group=True)
    original = eye_tracking.FixationEventService.build_events
    calls = []
    def counted(frame, *a, **kw):
        calls.append((id(frame), kw.get("scenario"), kw.get("proximity_threshold"), kw.get("min_fixation_duration_ms")))
        return original(frame, *a, **kw)
    monkeypatch.setattr(eye_tracking.FixationEventService, "build_events", counted)
    recordings = [eye_tracking.collect(p, s) for p in context.participants for s in context.scenarios]
    assert len(calls) == 4
    assert len(set(calls)) == 4
    assert all(call[2:] == (.03, None) for call in calls)
    monkeypatch.setattr(eye_tracking.FixationEventService, "build_events", original)
    for recording, (participant, scenario) in zip(recordings, [(p, s) for p in context.participants for s in context.scenarios]):
        events, _ = original(participant.frame, scenario.name)
        pd.testing.assert_frame_equal(recording.events, events)
        assert recording.histogram == eye_tracking.FixationHistogramService.compute_histogram(participant.frame, scenario.name)
        assert recording.scanpath == eye_tracking.ScanpathAnalyticsService.compute_scanpath(participant.frame, scenario.name)
        assert recording.aoi == eye_tracking.AoiAnalyticsService.compute_metrics(participant.frame, scenario.name, list(scenario.aois))
    # Consumer mutations cannot reach sibling outputs or a later operation.
    recording = recordings[0]
    recording.events.loc[:, "duration_s"] = 999
    recording.scanpath["warnings"].append("mutated")
    assert "mutated" not in recording.histogram["warnings"]
    assert "mutated" not in recording.aoi["warnings"]
    again = eye_tracking.collect(context.participants[0], context.scenarios[0])
    assert "mutated" not in again.scanpath["warnings"]
    assert again.events["duration_s"].max() < 999


@pytest.mark.parametrize("has_aois", [False, True])
def test_collect_failure_is_attempted_once_and_keeps_partial_report(corpus, aois, monkeypatch, has_aois):
    context = _context(corpus.frames, aois if has_aois else [], "EyeTracker", group=False)
    calls = []
    def fail(*a, **kw):
        calls.append(kw)
        raise ValueError("synthetic corrupt fixation variant")
    monkeypatch.setattr(eye_tracking.FixationEventService, "build_events", fail)
    recording = eye_tracking.collect(context.participants[0], context.scenarios[0])
    assert len(calls) == 1
    assert recording.events.empty and recording.fixation_count == 0
    assert recording.histogram == {"bins": []}
    assert recording.scanpath == {"objectives": []}
    assert recording.aoi is None
    assert recording.pupil_time.size > 0

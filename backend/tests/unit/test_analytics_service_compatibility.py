"""Preserve shared class identity and overridable reconstruction boundaries."""

import pandas as pd

from neurodatics.modules.analytics.application.services import analytics_service as legacy


def _events_frame():
    return pd.DataFrame({
        "time": [0.0, 0.01, 0.02],
        "fix_x": [10.0, 10.0, 10.0],
        "fix_y": [20.0, 20.0, 20.0],
        "fixation_id": [1, 1, 1],
        "fixation_segment_id": ["segment-a"] * 3,
        "fixation_method": ["idt"] * 3,
        "fixation_detector_version": ["fixation-v2.0"] * 3,
        "fixation_detector_sample_count": [3, 3, 3],
        "scenario": ["A"] * 3,
    })


def test_legacy_class_patch_reaches_spatial_consumers(monkeypatch):
    calls = []
    original = legacy.FixationEventService._event_from_run.__func__

    def capture(cls, *args, **kwargs):
        calls.append(cls)
        return original(cls, *args, **kwargs)

    monkeypatch.setattr(legacy.FixationEventService, "_event_from_run", classmethod(capture))
    frame = _events_frame()

    assert legacy.FixationDataService.compute_fixation_data(frame, "A")["stats"]["n_fixations"] == 1
    assert legacy.ScanpathAnalyticsService.compute_scanpath(frame, "A")["n_objectives"] == 1
    assert legacy.FixationHistogramService.compute_histogram(frame, "A")["n_fixations"] == 1
    assert calls == [legacy.FixationEventService] * 3


def test_reconstruction_keeps_classmethod_subclass_dispatch():
    class AlternateSupport(legacy.FixationEventService):
        @staticmethod
        def _row_support_seconds(*args, **kwargs):
            return 0.02

    original, _ = legacy.FixationEventService.build_events(_events_frame(), "A")
    alternate, _ = AlternateSupport.build_events(_events_frame(), "A")

    assert original.iloc[0].duration_s == 0.03
    assert alternate.iloc[0].duration_s == 0.02

"""The scenarios of one recording, in the order shown, for the group modes."""

import numpy as np
import pandas as pd

from neurodatics.modules.analytics.application.services.scenario_timing_service import (
    StimulusSequenceService,
)


def test_runs_of_one_label_in_time_order_skip_unlabelled_rows():
    frame = pd.DataFrame(
        {
            # Out of order on purpose: segments follow time, not row order.
            "time": [9.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
            "scenario": ["A", None, "", " A", "A", None, "A", "B", "B", np.nan],
        }
    )

    assert StimulusSequenceService.compute(frame) == {
        "segments": [
            # The lead-in and the unlabelled row at 4 s neither start nor split a segment.
            {"scenario": "A", "onset_s": 2.0, "end_s": 5.0},
            {"scenario": "B", "onset_s": 6.0, "end_s": 7.0},
            # A scenario shown again is a new segment.
            {"scenario": "A", "onset_s": 9.0, "end_s": 9.0},
        ]
    }


def test_frames_without_scenario_labels_have_no_segments():
    assert StimulusSequenceService.compute(pd.DataFrame({"time": [0.0, 1.0]})) == {"segments": []}
    assert StimulusSequenceService.compute(pd.DataFrame({"time": [0.0], "scenario": [None]})) == {"segments": []}
    assert StimulusSequenceService.compute(pd.DataFrame()) == {"segments": []}

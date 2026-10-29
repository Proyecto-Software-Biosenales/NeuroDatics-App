"""Histogram bins are fixed 50 ms ranges, the same at every minimum duration."""
from types import SimpleNamespace

import numpy as np
import pandas as pd

from neurodatics.modules.analytics.application.services.analytics_service import (
    FixationHistogramService,
)


def _histogram(durations_ms, threshold_ms):
    durations_ms = np.asarray(durations_ms, dtype=float)
    result = SimpleNamespace(
        events=pd.DataFrame({"duration_s": durations_ms / 1000.0}),
        metadata={"min_fixation_duration_ms": threshold_ms},
    )
    return FixationHistogramService.compute_histogram_from_events(result)


def _limits(histogram):
    return [(item["rango_min"], item["rango_max"], item["label"]) for item in histogram["bins"]]


def test_limits_match_across_thresholds_even_when_the_longest_fixation_changes():
    # I-DT re-detects the fixations at each threshold: the longest one changes.
    at_100 = _histogram([100, 130, 260, 420, 1164], 100)
    at_150 = _histogram([150, 260, 410, 1364], 150)
    at_250 = _histogram([260, 410, 700], 250)

    shared = {limits[0]: limits for limits in _limits(at_100)}
    for other in (at_150, at_250):
        for limits in _limits(other):
            if limits[2] != "1000 o más":
                assert shared[limits[0]] == limits
    assert [limits[0] for limits in _limits(at_150)][0] == 150
    assert [limits[0] for limits in _limits(at_250)][0] == 250


def test_bins_are_50_ms_wide_and_start_at_the_threshold():
    histogram = _histogram([100, 149, 150, 320], 100)
    assert [item["label"] for item in histogram["bins"]] == [
        "100-149", "150-199", "200-249", "250-299", "300-349",
    ]
    assert [item["conteo"] for item in histogram["bins"]] == [2, 1, 0, 0, 1]


def test_fixations_of_one_second_or_more_go_in_the_open_bin():
    histogram = _histogram([100, 990, 1000, 1164.2, 2500], 100)
    last = histogram["bins"][-1]
    assert last["label"] == "1000 o más"
    assert last["rango_min"] == 1000
    assert last["rango_max"] == 2500
    assert last["conteo"] == 3
    assert histogram["bins"][-2]["label"] == "950-999"
    assert sum(item["conteo"] for item in histogram["bins"]) == histogram["n_fixations"] == 5


def test_no_open_bin_when_every_fixation_is_under_a_second():
    histogram = _histogram([100, 999.9], 100)
    assert histogram["bins"][-1]["label"] == "950-999"


def test_rounding_error_under_the_threshold_counts_in_the_first_bin():
    histogram = _histogram([249.9999999999, 260, 700], 250)
    assert histogram["bins"][0]["label"] == "250-299"
    assert histogram["bins"][0]["conteo"] == 2
    assert sum(item["conteo"] for item in histogram["bins"]) == 3


def test_unknown_threshold_starts_at_the_multiple_of_50_under_the_shortest_fixation():
    histogram = _histogram([130, 180, 420], None)
    assert histogram["bins"][0]["label"] == "100-149"
    assert histogram["bins"][0]["rango_min"] == 100
    assert sum(item["conteo"] for item in histogram["bins"]) == 3

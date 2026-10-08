"""The fast I-DT window search must reproduce the original per-window search exactly.

``_reference_idt_run`` is the detector's ``_idt_run`` as it was before the window
search was sped up (fixation-v2): every candidate window recomputes its support
from scratch.  The optimized search skips windows that cannot reach the required
support and reads precomputed intervals; neither may move a single event
boundary.  The same change was checked on the private SAIO export, whose 60
Parquets came out byte-identical.
"""

import math

import numpy as np
import pytest

from neurodatics.modules.projects.application.services.fixation_detection_service import (
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    FixationDetectionService,
    _RunSupport,
)


def _reference_idt_run(
    x, y, original_valid, time_s, run_start, run_end, rate_hz, min_duration_ms, threshold
):
    if rate_hz <= 0.0:
        return []
    required_support_s = min_duration_ms / 1000.0
    support_tolerance_s = max(1e-9, abs(required_support_s) * 1e-9)
    detected = []
    start = run_start
    while start < run_end:
        end = start
        support_s = 0.0
        while end < run_end and support_s + support_tolerance_s < required_support_s:
            end += 1
            support_s = FixationDetectionService._valid_support_seconds(
                time_s,
                np.arange(start, end, dtype=np.int64),
                original_valid,
                rate_hz,
            )
        if support_s + support_tolerance_s < required_support_s:
            break

        window_x = x[start:end]
        window_y = y[start:end]
        dispersion = (float(np.max(window_x)) - float(np.min(window_x))) + (
            float(np.max(window_y)) - float(np.min(window_y))
        )
        if dispersion > threshold + 1e-12:
            start += 1
            continue

        event_end = end
        min_x = float(np.min(window_x))
        max_x = float(np.max(window_x))
        min_y = float(np.min(window_y))
        max_y = float(np.max(window_y))
        while event_end < run_end:
            candidate_x = float(x[event_end])
            candidate_y = float(y[event_end])
            candidate_min_x = min(min_x, candidate_x)
            candidate_max_x = max(max_x, candidate_x)
            candidate_min_y = min(min_y, candidate_y)
            candidate_max_y = max(max_y, candidate_y)
            candidate_dispersion = (candidate_max_x - candidate_min_x) + (
                candidate_max_y - candidate_min_y
            )
            if candidate_dispersion > threshold + 1e-12:
                break
            min_x, max_x = candidate_min_x, candidate_max_x
            min_y, max_y = candidate_min_y, candidate_max_y
            event_end += 1

        event_indices = np.arange(start, event_end, dtype=np.int64)
        event_support_s = FixationDetectionService._valid_support_seconds(
            time_s,
            event_indices,
            original_valid,
            rate_hz,
        )
        if event_support_s + support_tolerance_s >= required_support_s:
            detected.append(event_indices)
        start = event_end
    return detected


def _gaze_series(rng, rate_hz, seconds):
    """Fixation-like gaze with jitter, gaps, repeated or backward stamps and invalid samples."""

    count = int(seconds * rate_hz)
    period = 1.0 / rate_hz
    jitter = rng.choice([0.0, 0.02, 0.1, 0.3]) * period
    steps = period + rng.uniform(-jitter, jitter, count)
    gaps = rng.random(count) < 0.02
    steps[gaps] += rng.uniform(0.3, 6.0, int(gaps.sum())) * period
    stalls = rng.random(count) < 0.01
    steps[stalls] = rng.choice([0.0, -0.3 * period], int(stalls.sum()))
    time_s = 3.25 + np.cumsum(steps)
    time_s[rng.random(count) < 0.003] = np.nan
    valid = rng.random(count) >= rng.choice([0.0, 0.03, 0.15])

    x = np.empty(count)
    y = np.empty(count)
    index = 0
    while index < count:
        length = int(rng.integers(1, max(2, int(0.7 * rate_hz))))
        noise = rng.choice([0.001, 0.006, 0.015])
        stop = min(count, index + length)
        x[index:stop] = rng.uniform(0.1, 0.9) + rng.normal(0.0, noise, stop - index)
        y[index:stop] = rng.uniform(0.1, 0.9) + rng.normal(0.0, noise, stop - index)
        index = stop
    return time_s, valid, x, y


def _assert_same_events(actual, expected):
    assert len(actual) == len(expected)
    for got, want in zip(actual, expected):
        assert got.dtype == want.dtype
        np.testing.assert_array_equal(got, want)


# The reference search is quadratic, so the series stay short (about 250 samples).
@pytest.mark.parametrize(("rate_hz", "seconds"), [(60.0, 4.0), (120.0, 2.0), (300.0, 0.8)])
@pytest.mark.parametrize("seed", range(2))
def test_idt_run_matches_reference_search(rate_hz, seconds, seed):
    rng = np.random.default_rng([seed, int(rate_hz)])
    time_s, valid, x, y = _gaze_series(rng, rate_hz, seconds)
    run_start = int(rng.integers(0, 4))
    run_end = len(time_s) - int(rng.integers(0, 4))
    # The detector's rate is estimated, so it rarely equals the true one.
    detector_rate = rate_hz * float(rng.choice([1.0, 0.97, 1.002, 1.04]))
    events_seen = 0
    for min_duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        for threshold in (0.015, 0.04):
            args = (
                x,
                y,
                valid,
                time_s,
                run_start,
                run_end,
                detector_rate,
                float(min_duration_ms),
                threshold,
            )
            expected = _reference_idt_run(*args)
            _assert_same_events(FixationDetectionService._idt_run(*args), expected)
            events_seen += len(expected)
    assert events_seen > 0


@pytest.mark.parametrize("rate_hz", [0.0, -5.0, math.inf, math.nan])
def test_idt_run_matches_reference_for_degenerate_rates(rate_hz):
    time_s, valid, x, y = _gaze_series(np.random.default_rng(7), 60.0, 3.0)
    for min_duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        args = (x, y, valid, time_s, 0, len(time_s), rate_hz, float(min_duration_ms), 0.03)
        _assert_same_events(
            FixationDetectionService._idt_run(*args), _reference_idt_run(*args)
        )


@pytest.mark.parametrize("rate_hz", [60.0, 60.113, 120.0, 300.0, math.inf, math.nan])
def test_run_support_is_bit_identical_to_valid_support_seconds(rate_hz):
    rng = np.random.default_rng(11)
    for _ in range(4):
        time_s, valid, _, _ = _gaze_series(rng, 120.0, 3.0)
        run_start, run_end = 2, len(time_s) - 1
        support = _RunSupport(time_s, valid, run_start, run_end, rate_hz)
        for _ in range(1500):
            start = int(rng.integers(run_start, run_end))
            end = int(rng.integers(start, min(run_end, start + 160) + 1))
            expected = FixationDetectionService._valid_support_seconds(
                time_s, np.arange(start, end, dtype=np.int64), valid, rate_hz
            )
            assert support.seconds(start, end).hex() == float(expected).hex()


def test_skipped_windows_cannot_reach_the_required_support():
    rng = np.random.default_rng(5)
    checked = 0
    for rate_hz in (60.0, 60.113, 120.0, 300.0):
        time_s, valid, _, _ = _gaze_series(rng, rate_hz, 4.0)
        # Intervals at or just above the period make support as large as it can be.
        time_s = 1.0 + np.cumsum(np.full(len(time_s), 1.0 / rate_hz))
        for min_duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
            required = min_duration_ms / 1000.0
            tolerance = max(1e-9, abs(required) * 1e-9)
            min_valid = FixationDetectionService._min_supporting_valid_samples(
                rate_hz, required, tolerance
            )
            assert min_valid > 0
            for start in range(0, len(time_s) - 200, 7):
                end = start
                while end < len(time_s) and valid[start:end + 1].sum() < min_valid:
                    end += 1
                support = FixationDetectionService._valid_support_seconds(
                    time_s, np.arange(start, end, dtype=np.int64), valid, rate_hz
                )
                assert support + tolerance < required
                checked += 1
    assert checked > 0


@pytest.mark.parametrize("rate_hz", [0.0, math.inf, math.nan])
def test_skip_is_disabled_when_the_period_does_not_cap_intervals(rate_hz):
    assert (
        FixationDetectionService._min_supporting_valid_samples(rate_hz, 0.2, 2e-10)
        == 0
    )

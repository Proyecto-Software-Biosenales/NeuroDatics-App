"""Ingestion-time gaze cleaning, computed once per scenario and persisted.

Analytics reads the result (``shared.gaze_contract``) instead of cleaning each
query's time window, so a sample has the same value whatever the zoom.
"""

from __future__ import annotations

from typing import Iterator, Sequence, Tuple

import numpy as np
import pandas as pd

# The exporter ramps linearly toward the (0,0) of a lost eye over one native
# period on each side; two periods cover the ramp with slack.
TRANSITION_MARGIN_PERIODS = 2.0
MAX_FILL_S = 0.150
MEDIAN_WINDOW_S = 0.060
MEAN_WINDOW_S = 0.040
MAX_SPEED_PERCENT_PER_S = 1500.0


def _scenario_positions(scenario_keys: np.ndarray) -> Iterator[np.ndarray]:
    _, inverse = np.unique(scenario_keys, return_inverse=True)
    for key in range(int(inverse.max()) + 1 if inverse.size else 0):
        yield np.flatnonzero(inverse == key)


def transition_margin(
    signal_missing: np.ndarray,
    time_s: np.ndarray,
    scenario_keys: np.ndarray,
    rate_hz: float,
) -> np.ndarray:
    """Rows within two native periods of a lost sample of the same scenario."""

    margin = np.zeros(len(time_s), dtype=bool)
    if not rate_hz > 0.0 or not signal_missing.any():
        return margin
    reach = TRANSITION_MARGIN_PERIODS / rate_hz + 1e-9
    for positions in _scenario_positions(scenario_keys):
        times = time_s[positions]
        lost = np.sort(times[signal_missing[positions] & np.isfinite(times)])
        if not lost.size:
            continue
        right = np.searchsorted(lost, times).clip(max=lost.size - 1)
        left = (right - 1).clip(min=0)
        with np.errstate(invalid="ignore"):
            distance = np.minimum(np.abs(times - lost[left]), np.abs(lost[right] - times))
            margin[positions] = distance <= reach
    return margin


def clean_gaze(
    x_percent: np.ndarray,
    y_percent: np.ndarray,
    time_s: np.ndarray,
    invalid: np.ndarray,
    hard_boundary: np.ndarray,
    scenario_keys: np.ndarray,
    pupils: Sequence[np.ndarray],
) -> Tuple[np.ndarray, np.ndarray]:
    """Clean gaze in percent: NaN in every gap that is not bridged."""

    clean_x = np.full(len(x_percent), np.nan, dtype=float)
    clean_y = np.full(len(y_percent), np.nan, dtype=float)
    for positions in _scenario_positions(scenario_keys):
        clean_x[positions], clean_y[positions] = _clean_scenario(
            x_percent[positions],
            y_percent[positions],
            time_s[positions],
            invalid[positions],
            hard_boundary[positions],
            [pupil[positions] for pupil in pupils],
        )
    return clean_x, clean_y


def _clean_scenario(
    x: np.ndarray,
    y: np.ndarray,
    time_s: np.ndarray,
    invalid: np.ndarray,
    hard_boundary: np.ndarray,
    pupils: Sequence[np.ndarray],
) -> Tuple[np.ndarray, np.ndarray]:
    dt = np.diff(time_s)
    dt = dt[np.isfinite(dt) & (dt > 0)]
    fs = float(1.0 / np.median(dt)) if dt.size else 60.0

    with np.errstate(invalid="ignore"):
        bad = invalid | ~np.isfinite(x) | ~np.isfinite(y)
        bad |= (x < 0.0) | (x > 100.0) | (y < 0.0) | (y > 100.0)
        for pupil in pupils:
            bad |= ~(pupil > 0.0)
        speed = np.hypot(np.diff(x, prepend=np.nan), np.diff(y, prepend=np.nan)) * fs
        bad |= speed > MAX_SPEED_PERCENT_PER_S

    max_gap = max(1, int(round(MAX_FILL_S * fs)))
    w_median = max(3, int(round(MEDIAN_WINDOW_S * fs)))
    w_mean = max(3, int(round(MEAN_WINDOW_S * fs)))

    def clean(values: np.ndarray) -> np.ndarray:
        # Up to 150 ms is filled from each side of a gap, so a gap of up to
        # 300 ms closes; what stays empty, and any row off the stimulus, is a gap.
        filled = pd.Series(np.where(bad, np.nan, values)).interpolate(
            limit=max_gap, limit_direction="both"
        )
        filled[hard_boundary] = np.nan
        gap = filled.isna().to_numpy()
        result = (
            filled.rolling(w_median, center=True, min_periods=1).median()
            .rolling(w_mean, center=True, min_periods=1).mean()
            .to_numpy(dtype=float)
        )
        result[gap] = np.nan
        return result

    return clean(x), clean(y)

"""Descriptive statistics with the dashboard's definitions.

The dashboard summarises a displayed signal with its sample count, mean,
standard deviation (n - 1), median, extremes, a robust baseline (the mean of the
values between the 5th and 20th percentiles) and ``Pico %``, the maximum's
change over that baseline. Reports use the same definitions so a number in a
PDF matches the number on screen.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from ....analytics.application.services.numeric_helpers import _robust_baseline


@dataclass(frozen=True)
class Descriptive:
    count: int
    mean: float
    sd: float
    median: float
    minimum: float
    maximum: float
    baseline: float
    min_time: Optional[float] = None
    max_time: Optional[float] = None

    @property
    def peak_percent(self) -> Optional[float]:
        if not np.isfinite(self.baseline) or self.baseline == 0:
            return None
        return (self.maximum - self.baseline) / abs(self.baseline) * 100.0

    @property
    def amplitude(self) -> float:
        return self.maximum - self.baseline


def describe(values: Sequence[float], times: Optional[Sequence[float]] = None) -> Optional[Descriptive]:
    """Summarise the finite values; times, when given, locate the extremes."""

    value_arr = np.asarray(values, dtype=float)
    finite = np.isfinite(value_arr)
    time_arr = None
    if times is not None:
        time_arr = np.asarray(times, dtype=float)
        if time_arr.size != value_arr.size:
            time_arr = None
    if not finite.any():
        return None
    clean = value_arr[finite]
    min_index = int(np.argmin(clean))
    max_index = int(np.argmax(clean))
    clean_times = time_arr[finite] if time_arr is not None else None
    return Descriptive(
        count=int(clean.size),
        mean=float(np.mean(clean)),
        sd=float(np.std(clean, ddof=1)) if clean.size > 1 else 0.0,
        median=float(np.median(clean)),
        minimum=float(clean[min_index]),
        maximum=float(clean[max_index]),
        baseline=float(_robust_baseline(clean)),
        min_time=float(clean_times[min_index]) if clean_times is not None else None,
        max_time=float(clean_times[max_index]) if clean_times is not None else None,
    )


def mean_and_sd(values: Iterable[Any]) -> Tuple[Optional[float], Optional[float], int]:
    """Group mean and sample deviation over participants with a finite value."""

    finite: List[float] = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if np.isfinite(number):
            finite.append(number)
    if not finite:
        return None, None, 0
    array = np.asarray(finite, dtype=float)
    sd = float(np.std(array, ddof=1)) if array.size > 1 else None
    return float(np.mean(array)), sd, int(array.size)


def from_service(
    payload: Dict[str, Any],
    count: int,
    prefix: str = "",
    times: Optional[Sequence[float]] = None,
    values: Optional[Sequence[float]] = None,
) -> Optional[Descriptive]:
    """Wrap a dashboard statistics payload so a report shows the same numbers.

    The analytics services return ``mean``/``std``/``median``/``min``/``max``/
    ``baseline`` (optionally prefixed, e.g. ``gx_`` or ``raw_``). ``times`` and
    ``values`` locate the extremes on the charted series.
    """

    def value(key: str) -> Optional[float]:
        try:
            number = float(payload.get(f"{prefix}{key}"))
        except (TypeError, ValueError):
            return None
        return number if np.isfinite(number) else None

    mean = value("mean")
    if count <= 0 or mean is None:
        return None
    min_time = max_time = None
    if times is not None and values is not None:
        time_arr = np.asarray(times, dtype=float)
        value_arr = np.asarray(values, dtype=float)
        if time_arr.size == value_arr.size:
            finite = np.isfinite(value_arr) & np.isfinite(time_arr)
            if finite.any():
                indices = np.flatnonzero(finite)
                min_time = float(time_arr[indices[int(np.argmin(value_arr[finite]))]])
                max_time = float(time_arr[indices[int(np.argmax(value_arr[finite]))]])
    return Descriptive(
        count=int(count),
        mean=mean,
        sd=value("std") or 0.0,
        median=value("median") if value("median") is not None else mean,
        minimum=value("min") if value("min") is not None else mean,
        maximum=value("max") if value("max") is not None else mean,
        baseline=value("baseline") or 0.0,
        min_time=min_time,
        max_time=max_time,
    )

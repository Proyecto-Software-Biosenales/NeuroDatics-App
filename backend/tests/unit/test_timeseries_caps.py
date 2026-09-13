"""The capped timeseries are the full-rate series sampled, never recomputed.

Smoothing runs before decimation, and one index set is applied to every
series, so a capped response is exactly the uncapped one at those indices.
"""

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.gsr_analytics_service import (
    GsrAnalyticsService,
)
from neurodatics.modules.analytics.application.services.pupil_analytics_service import (
    PupilAnalyticsService,
)
from neurodatics.modules.analytics.infrastructure.redis_cache import AnalyticsRedisCache

ROWS = 1200
MAX_POINTS = 100


def _frame() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    return pd.DataFrame(
        {
            "time": np.arange(ROWS) / 60.0,
            "lx_pupil": rng.random(ROWS) * 2 + 3,
            "rx_pupil": rng.random(ROWS) * 2 + 3,
            "gx": rng.random(ROWS) * 0.5 + 0.25,
            "gy": rng.random(ROWS) * 0.5 + 0.25,
            "distance": rng.random(ROWS) * 50 + 600,
            "gsr": rng.random(ROWS) + 2,
            "scenario": ["A"] * ROWS,
        }
    )


@pytest.mark.parametrize(
    "compute",
    [
        PupilAnalyticsService.compute_timeseries,
        PupilAnalyticsService.compute_gaze_timeseries,
        PupilAnalyticsService.compute_distance_timeseries,
        GsrAnalyticsService.compute_timeseries,
    ],
)
def test_capped_series_are_the_full_rate_series_sampled(compute):
    frame = _frame()
    full = compute(frame, "A")
    capped = compute(frame, "A", max_points=MAX_POINTS)

    size = len(full["time"])
    assert size > MAX_POINTS
    indices = np.linspace(0, size - 1, MAX_POINTS, dtype=int)
    series = [key for key, value in full.items() if isinstance(value, list) and len(value) == size]
    assert "time" in series and len(series) > 1
    for key in series:
        assert capped[key] == [full[key][index] for index in indices], key
    assert {k: v for k, v in capped.items() if k not in series} == {
        k: v for k, v in full.items() if k not in series
    }


def test_a_cap_above_the_sample_count_returns_every_sample():
    frame = _frame()
    assert PupilAnalyticsService.compute_timeseries(frame, "A", max_points=ROWS * 2) == (
        PupilAnalyticsService.compute_timeseries(frame, "A")
    )


def test_oversized_json_is_not_written_to_redis(monkeypatch):
    writes = []
    cache = AnalyticsRedisCache()
    cache._client = SimpleNamespace(set=lambda key, value, ex=None: writes.append(key))
    monkeypatch.setattr(AnalyticsRedisCache, "MAX_JSON_BYTES", 64)

    cache.set_json("small", {"time": [1.0]})
    cache.set_json("large", {"time": [1.0] * 100})

    assert writes == ["small"]

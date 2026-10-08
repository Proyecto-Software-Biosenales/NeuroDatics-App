"""Synthetic component benchmarks, not API or application speedup estimates.

Run from the repository root:
  .venv/Scripts/python.exe docs/perf/bench/bench_runtime_algorithms.py

Compare current application helpers with isolated candidate algorithms. No
application data, external services, or production implementation is modified.
Timings are medians after a warm-up; equivalence covers only the cases below.
"""

import json
import platform
import statistics
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend" / "src"))

from neurodatics.modules.analytics.application.services.aoi_analytics_service import (  # noqa: E402
    AoiAnalyticsService,
)
from neurodatics.modules.analytics.application.services.fixation_analytics_service import (  # noqa: E402
    FixationEventService,
)


def measure(function, repeats=5):
    function()
    samples = []
    for _ in range(repeats):
        started = time.perf_counter()
        function()
        samples.append((time.perf_counter() - started) * 1000)
    return round(statistics.median(samples), 4)


def current_rect_mask(shape, gx, gy):
    valid = np.isfinite(gx) & np.isfinite(gy)
    return np.array([
        bool(finite) and AoiAnalyticsService._contains(shape, x / 100.0, y / 100.0)
        for x, y, finite in zip(gx, gy, valid)
    ], dtype=bool)


def candidate_rect_mask(shape, gx, gy):
    x, y = gx / 100.0, gy / 100.0
    return (
        np.isfinite(x) & np.isfinite(y)
        & (x >= shape["x"] / 100.0)
        & (x <= (shape["x"] + shape["width"]) / 100.0)
        & (y >= shape["y"] / 100.0)
        & (y <= (shape["y"] + shape["height"]) / 100.0)
    )


def candidate_cadence(times, segments, effective_rate):
    fallback = 1.0 / effective_rate if effective_rate and effective_rate > 0 else 0.0
    buckets = {}
    for value, key in zip(times, segments):
        values = buckets.setdefault(key, [])
        if np.isfinite(value):
            values.append(value)
    result = {}
    for key, values in buckets.items():
        differences = np.diff(np.asarray(values, dtype=float))
        differences = differences[(differences > 0) & np.isfinite(differences)]
        result[key] = float(np.median(differences)) if differences.size else fallback
    return result


def verify_edge_cases():
    shapes = [
        {"x": 20.0, "y": 15.0, "width": 50.0, "height": 60.0, "type": "rect"},
        {"x": 20.0, "y": 15.0, "width": 0.0, "height": 0.0, "type": "rect"},
    ]
    gx = np.array([20., 70., 20., 70., 19.999, 70.001, np.nan, np.inf, 20., 20.])
    gy = np.array([15., 15., 75., 75., 15., 15., 15., 15., np.nan, -np.inf])
    for shape in shapes:
        assert np.array_equal(current_rect_mask(shape, gx, gy), candidate_rect_mask(shape, gx, gy))
    # Interleaved segments, decreasing/repeated clocks, missing samples, and a
    # segment with no finite time must retain the current order and fallback.
    times = np.array([0., 5., 0., np.nan, 2., 4., 1., np.inf, 3., 8.])
    segments = ["a", "b", "a", None, "a", "b", "a", "missing", "a", "b"]
    for rate in (60.0, None, 0.0):
        assert FixationEventService._cadence_by_segment(times, segments, rate) == candidate_cadence(times, segments, rate)
    assert FixationEventService._cadence_by_segment(np.array([]), [], None) == candidate_cadence(np.array([]), [], None)


def main():
    verify_edge_cases()
    rng = np.random.default_rng(20261001)
    rows = 300_000
    gx, gy = rng.uniform(0, 100, (2, rows))
    gx[::997] = np.nan
    shape = {"x": 20.0, "y": 15.0, "width": 50.0, "height": 60.0, "type": "rect"}
    assert np.array_equal(current_rect_mask(shape, gx, gy), candidate_rect_mask(shape, gx, gy))
    output = {
        "scope": "synthetic component timings only; not end-to-end API latency",
        "python": platform.python_version(),
        "numpy": np.__version__,
        "repeats": 5,
        "edge_case_equivalence": True,
        "rectangle_mask": {
            "rows": rows,
            "current_median_ms": measure(lambda: current_rect_mask(shape, gx, gy)),
            "candidate_median_ms": measure(lambda: candidate_rect_mask(shape, gx, gy)),
            "exact_equal": True,
        },
        "cadence": [],
    }
    rows = 100_000
    times = np.arange(rows, dtype=float) / 60.0
    for count in (1, 20, 100):
        segments = [str(value) for value in np.arange(rows) // (rows // count)]
        assert FixationEventService._cadence_by_segment(times, segments, 60.0) == candidate_cadence(times, segments, 60.0)
        output["cadence"].append({
            "rows": rows,
            "segments": count,
            "current_median_ms": measure(lambda: FixationEventService._cadence_by_segment(times, segments, 60.0)),
            "candidate_median_ms": measure(lambda: candidate_cadence(times, segments, 60.0)),
            "exact_equal": True,
        })
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

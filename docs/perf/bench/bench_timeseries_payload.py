"""Response size of the uncapped timeseries endpoints, and Parquet read cost.

Run from `backend/` so `src` is importable:

    ..\\.venv\\Scripts\\python.exe ..\\docs\\perf\\bench\\bench_timeseries_payload.py

Covers FINDINGS.md M1 and M4. The payload figure is what step 4 of PLAN.md moves;
the Parquet figure is the window during which step 1 stops blocking the event loop.

Writes one temporary Parquet next to this script and removes it afterwards.
"""

import json
import os
import sys
import tempfile
import time

import numpy as np
import pandas as pd

sys.path.insert(0, "src")

from neurodatics.modules.analytics.application.services.pupil_analytics_service import (  # noqa: E402
    PupilAnalyticsService,
)

ROW_COUNTS = (60_000, 300_000)
EXTRA_COLUMNS = 22


def timed(fn, repeats: int = 3) -> float:
    fn()
    start = time.perf_counter()
    for _ in range(repeats):
        fn()
    return (time.perf_counter() - start) / repeats * 1000


def build_frame(rows: int, wide: bool = False) -> pd.DataFrame:
    scenario = np.repeat([f"stim_{index}.png" for index in range(8)], rows // 8)
    frame = pd.DataFrame(
        {
            "time": np.arange(len(scenario)) / 60.0,
            "lx_pupil": np.random.rand(len(scenario)) * 2 + 3,
            "rx_pupil": np.random.rand(len(scenario)) * 2 + 3,
            "gx": np.random.rand(len(scenario)) * 100,
            "gy": np.random.rand(len(scenario)) * 100,
            "scenario": scenario,
        }
    )
    if wide:
        for index in range(EXTRA_COLUMNS):
            frame[f"channel_{index}"] = np.random.rand(len(frame))
    return frame


def report_payloads() -> None:
    print("== compute_timeseries response size (no max_points today) ==")
    for rows in ROW_COUNTS:
        frame = build_frame(rows)
        start = time.perf_counter()
        result = PupilAnalyticsService.compute_timeseries(frame, "all")
        elapsed_ms = (time.perf_counter() - start) * 1000
        payload = json.dumps(result)
        print(
            "rows=%7d  compute=%6.0f ms  JSON=%6.1f MB  (series=%d, points/series=%d)"
            % (rows, elapsed_ms, len(payload) / 1e6, len(result), len(result["time"]))
        )


def report_parquet() -> None:
    print()
    print("== Parquet read cost (runs on the event loop until PLAN.md step 1) ==")
    frame = build_frame(300_000, wide=True)
    handle, path = tempfile.mkstemp(suffix=".parquet", dir=os.path.dirname(__file__))
    os.close(handle)
    try:
        frame.to_parquet(path)
        print("file size                       : %6.1f MB" % (os.path.getsize(path) / 1e6))
        print("pd.read_parquet (full frame)    : %6.0f ms" % timed(lambda: pd.read_parquet(path)))
        print(
            "pd.read_parquet (time+scenario) : %6.0f ms"
            % timed(lambda: pd.read_parquet(path, columns=["time", "scenario"]))
        )
    finally:
        os.unlink(path)


if __name__ == "__main__":
    report_payloads()
    report_parquet()

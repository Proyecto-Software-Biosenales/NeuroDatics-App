"""Response size of the uncapped timeseries endpoints, and Parquet read cost.

Two figures: how large a `compute_timeseries` payload gets when nothing caps its points,
and how long the Parquet read behind it takes with and without a column projection.

Run from `backend/`:

    ..\\.venv\\Scripts\\python.exe benchmarks\\bench_timeseries_payload.py

Writes one temporary Parquet inside the output directory and removes it afterwards.
The directory is `--output-dir`, else `$NEURODATICS_BENCH_OUTPUT`, else `output/benchmarks/`.
"""

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from neurodatics.modules.analytics.application.services.pupil_analytics_service import (  # noqa: E402
    PupilAnalyticsService,
)

ROW_COUNTS = (60_000, 300_000)
EXTRA_COLUMNS = 22
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "output" / "benchmarks"


def output_dir(override: str = "") -> Path:
    """Where this benchmark may write its temporary Parquet."""
    chosen = override or os.environ.get("NEURODATICS_BENCH_OUTPUT") or str(DEFAULT_OUTPUT)
    path = Path(chosen)
    path.mkdir(parents=True, exist_ok=True)
    return path


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
    print("== compute_timeseries response size, no max_points ==")
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


def report_parquet(directory: Path) -> None:
    print()
    print("== Parquet read cost, full frame against a column projection ==")
    frame = build_frame(300_000, wide=True)
    handle, path = tempfile.mkstemp(suffix=".parquet", dir=str(directory))
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="", help="where the temporary Parquet is written")
    args = parser.parse_args()
    directory = output_dir(args.output_dir)
    report_payloads()
    report_parquet(directory)


if __name__ == "__main__":
    main()

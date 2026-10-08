"""Synthetic local-read probe; does not access application data or services.

Run from the repository root:
  .venv/Scripts/python.exe docs/perf/bench/bench_runtime_projection.py

Times are warm filesystem-cache medians, not end-to-end API latencies.
Memory is pandas deep dataframe size, not process peak RSS.
"""

import gc
import json
import platform
import statistics
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow


def measure(path, columns=None):
    samples = []
    for _ in range(7):
        gc.collect()
        started = time.perf_counter()
        frame = pd.read_parquet(path, columns=columns)
        samples.append((time.perf_counter() - started) * 1000)
        memory = int(frame.memory_usage(deep=True).sum())
        del frame
    return {"median_ms": round(statistics.median(samples[1:]), 2), "dataframe_bytes": memory}


def main():
    rows = 300_000
    rng = np.random.default_rng(20261001)
    frame = pd.DataFrame({
        "time": np.arange(rows, dtype=np.float64) / 250,
        "scenario": np.asarray([f"scenario_{i:02d}" for i in range(12)])[np.arange(rows) // 25_000],
        "gsr": rng.normal(5, 0.5, rows),
        **{f"signal_{i:02d}": rng.normal(size=rows) for i in range(32)},
    })
    projection = ["time", "scenario", "gsr"]
    with tempfile.TemporaryDirectory(prefix="neurodatics-runtime-probe-") as directory:
        path = Path(directory) / "synthetic.parquet"
        frame.to_parquet(path, index=False)
        full_result = measure(path)
        projected_result = measure(path, projection)
        pd.testing.assert_frame_equal(pd.read_parquet(path)[projection], pd.read_parquet(path, columns=projection))
        categorical = frame["scenario"].astype("category")
        assert np.array_equal(categorical.astype(object).to_numpy(), frame["scenario"].to_numpy())
        print(json.dumps({
            "python": platform.python_version(),
            "pandas": pd.__version__, "numpy": np.__version__, "pyarrow": pyarrow.__version__,
            "rows": rows, "columns": len(frame.columns), "projected_columns": projection,
            "parquet_bytes": path.stat().st_size,
            "full_read": full_result, "projected_read": projected_result,
            "scenario_object_bytes": int(frame["scenario"].memory_usage(deep=True)),
            "scenario_category_bytes": int(categorical.memory_usage(deep=True)),
            "projection_exact_equal": True, "category_values_exact_equal": True,
        }, indent=2))


if __name__ == "__main__":
    main()

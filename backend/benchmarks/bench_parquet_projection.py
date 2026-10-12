"""Local Parquet read: whole frame against a column projection.

Times are warm filesystem-cache medians, not end-to-end API latencies. Memory is the pandas
deep dataframe size, not process peak RSS. The run also checks that the projection returns
exactly the columns the full read would, and that a categorical scenario column keeps its
values, so the figures cannot be read as a speed-up that changes data.

Run from `backend/`:

    ..\\.venv\\Scripts\\python.exe benchmarks\\bench_parquet_projection.py

The synthetic Parquet lives in a temporary folder inside the output directory and is removed
afterwards. The directory is `--output-dir`, else `$NEURODATICS_BENCH_OUTPUT`, else
`output/benchmarks/`.
"""

import argparse
import gc
import json
import os
import platform
import statistics
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "output" / "benchmarks"


def output_dir(override: str = "") -> Path:
    """Where this benchmark may create its temporary folder."""
    chosen = override or os.environ.get("NEURODATICS_BENCH_OUTPUT") or str(DEFAULT_OUTPUT)
    path = Path(chosen)
    path.mkdir(parents=True, exist_ok=True)
    return path


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
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="", help="where the temporary Parquet is written")
    args = parser.parse_args()
    rows = 300_000
    rng = np.random.default_rng(20261001)
    frame = pd.DataFrame({
        "time": np.arange(rows, dtype=np.float64) / 250,
        "scenario": np.asarray([f"scenario_{i:02d}" for i in range(12)])[np.arange(rows) // 25_000],
        "gsr": rng.normal(5, 0.5, rows),
        **{f"signal_{i:02d}": rng.normal(size=rows) for i in range(32)},
    })
    projection = ["time", "scenario", "gsr"]
    with tempfile.TemporaryDirectory(prefix="neurodatics-parquet-probe-", dir=str(output_dir(args.output_dir))) as directory:
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

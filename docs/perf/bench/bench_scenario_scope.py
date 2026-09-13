"""Cost of scoping a participant frame to one scenario.

Run from `backend/` so `src` is importable:

    ..\\.venv\\Scripts\\python.exe ..\\docs\\perf\\bench\\bench_scenario_scope.py

Covers FINDINGS.md M3. The `category` line is deliberate: converting the column is
the obvious fix and it makes things slower, because `astype(str)` forces
materialization. Keep it in the output so nobody re-derives that.
"""

import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, "src")

from neurodatics.modules.analytics.application.services.numeric_helpers import (  # noqa: E402
    scope_to_scenario,
)

ROWS = 300_000
TARGET = "stim_3.png"


def timed(fn, repeats: int = 5) -> float:
    """Median-ish wall time in ms, after one warm-up call."""
    fn()
    start = time.perf_counter()
    for _ in range(repeats):
        fn()
    return (time.perf_counter() - start) / repeats * 1000


def build_frame(rows: int) -> pd.DataFrame:
    scenarios = np.array([f"stim_{index}.png" for index in range(8)])
    return pd.DataFrame(
        {
            "time": np.arange(rows) / 60.0,
            "gx": np.random.rand(rows) * 100,
            "gy": np.random.rand(rows) * 100,
            "lx_pupil": np.random.rand(rows) * 5,
            "rx_pupil": np.random.rand(rows) * 5,
            "scenario": np.random.choice(scenarios, rows),
        }
    )


def main() -> None:
    df = build_frame(ROWS)
    categorical = df.copy()
    categorical["scenario"] = categorical["scenario"].astype("category")
    prestripped = df["scenario"].astype(str).str.strip()

    print(f"rows={ROWS}")
    print("scope_to_scenario (as written)      : %6.1f ms" % timed(lambda: scope_to_scenario(df, TARGET)))
    print("scope_to_scenario (category dtype)  : %6.1f ms" % timed(lambda: scope_to_scenario(categorical, TARGET)))
    print("  astype(str).str.strip() alone     : %6.1f ms" % timed(lambda: df["scenario"].astype(str).str.strip()))
    print("  pd.unique(dropna().astype(str))   : %6.1f ms" % timed(lambda: pd.unique(df["scenario"].dropna().astype(str))))
    print("  mask + .loc only (the floor)      : %6.1f ms" % timed(lambda: df.loc[prestripped == TARGET]))


if __name__ == "__main__":
    main()

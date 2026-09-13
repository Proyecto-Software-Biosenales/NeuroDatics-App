"""Cost of one timeline scrub tick, broken down by component.

Run from `backend/` so `src` is importable:

    ..\\.venv\\Scripts\\python.exe ..\\docs\\perf\\bench\\bench_gaze_at.py

Covers FINDINGS.md M2. The gap between the `idxmin` line and the `searchsorted`
line is the whole finding: everything above them is work done to the entire frame
to return a single row.
"""

import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, "src")

from neurodatics.modules.analytics.application.services.pupil_analytics_service import (  # noqa: E402
    PupilAnalyticsService,
)

ROWS = 300_000
EXTRA_COLUMNS = 20  # brings the frame to the ~26 columns a real participant carries
LOOKUP_TIME_S = 1234.5


def timed(fn, repeats: int = 3) -> float:
    fn()
    start = time.perf_counter()
    for _ in range(repeats):
        fn()
    return (time.perf_counter() - start) / repeats * 1000


def build_frame(rows: int) -> pd.DataFrame:
    # Contiguous scenario blocks, the way a real session records them.
    scenario = np.repeat([f"stim_{index}.png" for index in range(8)], rows // 8)
    frame = pd.DataFrame(
        {
            "time": np.arange(len(scenario)) / 60.0,
            "gx": np.random.rand(len(scenario)) * 100,
            "gy": np.random.rand(len(scenario)) * 100,
            "lx_pupil": np.random.rand(len(scenario)) * 5,
            "rx_pupil": np.random.rand(len(scenario)) * 5,
            "scenario": scenario,
        }
    )
    for index in range(EXTRA_COLUMNS):
        frame[f"channel_{index}"] = np.random.rand(len(frame))
    return frame


def main() -> None:
    df = build_frame(ROWS)
    times = df["time"].to_numpy()

    print("rows=%d cols=%d" % df.shape)
    print("find_gaze_at (one scrub tick)   : %6.0f ms" % timed(lambda: PupilAnalyticsService.find_gaze_at(df, LOOKUP_TIME_S, "all")))
    print("  df.copy()                     : %6.0f ms" % timed(lambda: df.copy()))
    print("  sort_values('time')           : %6.0f ms" % timed(lambda: df.sort_values("time").reset_index(drop=True)))
    print("  idxmin scan                   : %6.1f ms" % timed(lambda: (df["time"] - LOOKUP_TIME_S).abs().idxmin()))
    print("  searchsorted (the target)     : %8.3f ms" % timed(lambda: np.searchsorted(times, LOOKUP_TIME_S)))


if __name__ == "__main__":
    main()

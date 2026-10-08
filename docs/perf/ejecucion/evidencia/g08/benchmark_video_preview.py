"""G08 before/after micro-benchmark on one synthetic real video corpus.

The benchmark calls the received preview helpers, while replacing only the
Parquet repository with a deterministic in-memory frame. FFprobe and FFmpeg
remain real processes. Each observation is a fresh navigation session of four
times (including one repeated time); one unrecorded warm-up precedes n=5.
"""

from __future__ import annotations

import argparse
import asyncio
import inspect
import json
import os
import statistics
import sys
import time
from pathlib import Path
from uuid import uuid4

import pandas as pd


REPO = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(REPO / "backend" / "src"))

from neurodatics.modules.projects.api import routes  # noqa: E402


TIMES = (1.2, 2.3, 3.4, 2.3)


def _summary(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    return {
        "min": round(ordered[0], 3),
        "median": round(statistics.median(ordered), 3),
        "max": round(ordered[-1], 3),
        "mean": round(statistics.mean(ordered), 3),
        "stdev": round(statistics.stdev(ordered), 3),
    }


async def _onset_sample(sample: int) -> tuple[float, float, dict[str, int]]:
    counts = {"parquet_cache_reads": 0, "parquet_reads": 0}
    frame = pd.DataFrame(
        {
            "time": [0.0, 10.1234567, 10.2234567, 20.0],
            "scenario": ["other", "target", "target", "other"],
            "unused_payload": ["x" * 1024] * 4,
        }
    )

    class Reader:
        def __init__(self, _db):
            pass

        async def resolve_cache_generation(self, _project_id):
            return "generation-1"

        async def read_from_cache_only(self, *_args, **_kwargs):
            counts["parquet_cache_reads"] += 1
            return None

        async def read(self, *_args, **_kwargs):
            counts["parquet_reads"] += 1
            return frame.copy()

    original = routes.ParquetReaderService
    routes.ParquetReaderService = Reader
    project_id = uuid4()
    wall_start = time.perf_counter()
    cpu_start = time.process_time()
    try:
        for value in TIMES:
            await routes._compute_video_frame_time_s(
                object(), project_id, f"participant-{sample}", "target", value + 10.0
            )
    finally:
        routes.ParquetReaderService = original
    return (
        (time.perf_counter() - wall_start) * 1000,
        (time.process_time() - cpu_start) * 1000,
        counts,
    )


def _duration_sample(video: Path, output_dir: Path, sample: int):
    counts = {"ffprobe": 0, "ffmpeg": 0, "downloads": 0}
    original_probe = routes._probe_video_duration_s
    original_ffmpeg = routes._run_ffmpeg_frame_extract

    def counted_probe(path):
        counts["ffprobe"] += 1
        return original_probe(path)

    def counted_ffmpeg(path, frame_path, value):
        counts["ffmpeg"] += 1
        return original_ffmpeg(path, frame_path, value)

    routes._probe_video_duration_s = counted_probe
    routes._run_ffmpeg_frame_extract = counted_ffmpeg
    wall_start = time.perf_counter()
    cpu_start = time.process_time()
    try:
        parameters = inspect.signature(routes._extract_video_frame).parameters
        for index, value in enumerate(TIMES):
            frame_path = output_dir / f"sample-{sample}-{index}.jpg"
            args = [video, frame_path, value]
            if len(parameters) >= 4:
                args.append(f"video-session-{sample}")
            routes._extract_video_frame(*args)
    finally:
        routes._probe_video_duration_s = original_probe
        routes._run_ffmpeg_frame_extract = original_ffmpeg
    return (
        (time.perf_counter() - wall_start) * 1000,
        (time.process_time() - cpu_start) * 1000,
        counts,
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("before", "after"))
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    frames = REPO / "output" / "perf-g08" / f"{args.phase}-frames"
    frames.mkdir(parents=True, exist_ok=True)

    # Warm-up is deliberately not reported.
    await _onset_sample(-1)
    _duration_sample(args.video, frames, -1)

    onset = [await _onset_sample(i) for i in range(5)]
    duration = [_duration_sample(args.video, frames, i) for i in range(5)]

    def aggregate(samples):
        totals = {
            key: sum(sample[2][key] for sample in samples)
            for key in samples[0][2]
        }
        return {
            "wall_ms": _summary([sample[0] for sample in samples]),
            "process_cpu_ms": _summary([sample[1] for sample in samples]),
            "counts_total_n5": totals,
            "counts_per_navigation": {
                key: totals[key] / 5 for key in totals
            },
        }

    payload = {
        "phase": args.phase,
        "runtime": sys.version,
        "platform": sys.platform,
        "pid": os.getpid(),
        "corpus": str(args.video),
        "protocol": "warmup + n=5; each n is 4 times (1.2,2.3,3.4,2.3)",
        "onset_navigation": aggregate(onset),
        "real_video_navigation": aggregate(duration),
        "limits": [
            "process_cpu_ms excludes CPU consumed inside FFmpeg/FFprobe children",
            "micro-benchmark isolates preview helpers; it is not HTTP or deployment latency",
        ],
    }
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        args.phase,
        "onset_reads=",
        payload["onset_navigation"]["counts_total_n5"],
        "video_processes=",
        payload["real_video_navigation"]["counts_total_n5"],
        "medians_ms=",
        payload["onset_navigation"]["wall_ms"]["median"],
        payload["real_video_navigation"]["wall_ms"]["median"],
    )


if __name__ == "__main__":
    asyncio.run(main())

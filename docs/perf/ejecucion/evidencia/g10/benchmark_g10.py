"""Reproducible G10 service benchmark; prints one compact JSON document."""

import json
import platform
import statistics
import sys
import tempfile
import time
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT / "backend" / "src"))

import numpy as np
import pandas as pd
import pyarrow

from neurodatics.modules.analytics.application.services.analytics_service import (
    EegAnalyticsService,
    GsrAnalyticsService,
    PupilAnalyticsService,
)
from neurodatics.modules.analytics.application.services.comparison_chart_config import (
    ChartConfigBuilder,
)
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingService,
)


SCENARIO = "stimulus-a"
MAX_POINTS = 5000
VIEWS = ["pupil", "distance", "gaze", "gsr", "eeg_timeseries"]


def encoded_size(value):
    return len(
        json.dumps(
            value, ensure_ascii=False, allow_nan=True, separators=(",", ":")
        ).encode("utf-8")
    )


def baseline(frame):
    responses = [{"charts": ChartConfigBuilder.build_many(
        frame, SCENARIO, VIEWS, max_points=MAX_POINTS
    )}]
    responses.extend([
        PupilAnalyticsService.compute_timeseries(
            frame, SCENARIO, max_points=MAX_POINTS
        ),
        PupilAnalyticsService.compute_distance_timeseries(
            frame, SCENARIO, max_points=MAX_POINTS
        ),
        PupilAnalyticsService.compute_gaze_timeseries(
            frame, SCENARIO, max_points=MAX_POINTS
        ),
        GsrAnalyticsService.compute_timeseries(
            frame, SCENARIO, max_points=MAX_POINTS
        ),
        EegAnalyticsService.compute_timeseries(
            frame, scenario=SCENARIO, smooth_window_s=0.0,
            max_points=MAX_POINTS,
        ),
    ])
    return {
        "bytes": sum(encoded_size(response) for response in responses),
        "requests": len(responses),
        "service_calculations": 10,
    }


def final(frame):
    response = ChartConfigBuilder.build_comparison_payload(
        frame, SCENARIO, VIEWS, max_points=MAX_POINTS
    )
    return {
        "bytes": encoded_size(response),
        "requests": 1,
        "service_calculations": 5,
    }


def measure(function, frame, iterations_per_sample):
    function(frame)  # warmup
    samples = []
    result = None
    for _ in range(5):
        started = time.process_time_ns()
        for _ in range(iterations_per_sample):
            result = function(frame)
        samples.append(
            (time.process_time_ns() - started)
            / (iterations_per_sample * 1_000_000)
        )
    return {
        **result,
        "cpu_ms_n5": samples,
        "cpu_ms_median": statistics.median(samples),
        "cpu_ms_min": min(samples),
        "cpu_ms_max": max(samples),
    }


def main():
    archive_path = ROOT / "backend" / "tests" / "fixtures" / "golden" / "synthetic-experiment.zip"
    with tempfile.TemporaryDirectory(prefix="g10-benchmark-") as directory:
        directory_path = Path(directory)
        with zipfile.ZipFile(archive_path) as archive:
            csv_path = directory_path / "experiment.csv"
            csv_path.write_bytes(archive.read("experiment.csv"))
        processed = CsvProcessingService.process(
            str(csv_path), str(directory_path / "parquet")
        )
        parquet_path = dict(processed.user_parquet_paths)[1]
        small = pd.read_parquet(parquet_path)
        pieces = []
        for block in range(64):
            part = small.copy(deep=True)
            part["time"] += block * 16
            for column in ("segment_id", "fixation_segment_id"):
                if column in part:
                    part[column] = part[column].astype(str) + f"-block-{block}"
            for column in part.columns:
                if column == "fixation_id" or column.startswith("fixation_id__"):
                    part[column] = part[column] + block * 10000
            pieces.append(part)
        large = pd.concat(pieces, ignore_index=True)
        large.attrs = dict(small.attrs)
        for index in range(16):
            large[f"g00_unused_{index:02d}"] = np.sin(
                np.arange(len(large), dtype=float) / (index + 5)
            )
        corpora = {
            "small": (small, 10),
            "large_g00_64_blocks": (large, 1),
        }
        measurements = {}
        for name, (frame, iterations) in corpora.items():
            measurements[name] = {
                "rows": len(frame),
                "iterations_per_sample": iterations,
                "before": measure(baseline, frame, iterations),
                "after": measure(final, frame, iterations),
            }
    print(json.dumps({
        "protocol": {
            "corpus": "G00 small and exact 64-block large construction / SYN-01 / stimulus-a",
            "warmup": 1, "samples": 5,
            "max_points": MAX_POINTS,
            "timer": "time.process_time_ns", "cache_state": "compute path each iteration",
            "serialization": "compact UTF-8 JSON",
        },
        "runtime": {
            "python": platform.python_version(), "pyarrow": pyarrow.__version__,
            "platform": platform.platform(),
        },
        "corpora": measurements,
        "cold_http_topology": {
            "before": {"parquet_reader_calls": 6, "transform_token_calculations_max": 2},
            "after": {"parquet_reader_calls": 1, "transform_token_calculations_max": 1},
            "basis": "instrumented HTTP contracts: comparison and gaze resolve a transform token; detached fixture cannot persist it",
        },
        "limits": [
            "Synthetic fixture only; no whole-application latency claim.",
            "CPU excludes network, auth, Redis and Parquet because the same in-memory frame is timed.",
            "Parquet/transform counts are deterministic route topology for a cold response cache, not timed I/O.",
        ],
    }, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()

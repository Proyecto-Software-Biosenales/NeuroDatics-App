"""G07 group-load probe using the exact G00 large synthetic corpus.

Run each phase/state in a separate process.  "cold" adds 20 ms of synthetic
remote I/O per full Parquet; the OS page cache is not flushed.  Collect,
figures and PDF rendering are intentionally excluded.
"""

import argparse
import asyncio
import gc
import importlib.util
import json
import platform
import statistics
import sys
import tempfile
import threading
import time
from collections import Counter
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import g00_backend as baseline
import numpy as np
import pandas as pd
import pyarrow

ROOT = baseline.ROOT
EVIDENCE = ROOT / "docs/perf/ejecucion/evidencia/g07"
RUNTIME = ROOT / "output/perf-g07/runtime"
COUNTS = Counter()
COUNT_LOCK = threading.Lock()


def count(key, amount=1):
    with COUNT_LOCK:
        COUNTS[key] += amount


def received_service_module():
    name = "neurodatics.modules.reports.application.services.g07_received_executive_report_service"
    path = (
        ROOT
        / "output/perf-g07/base/backend/src/neurodatics/modules/reports/application/services/executive_report_service.py"
    )
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def build_large_parquet():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    fixture = baseline.load_fixture_module()
    with tempfile.TemporaryDirectory(prefix="g07-fixture-", dir=RUNTIME) as temporary:
        class Factory:
            def mktemp(self, name):
                target = Path(temporary) / name
                target.mkdir()
                return target

        corpus = fixture.corpus.__wrapped__(Factory())
        base = corpus.frames["SYN-01"]
        pieces = []
        for block in range(64):
            part = base.copy(deep=True)
            part["time"] += block * 16
            for column in ("segment_id", "fixation_segment_id"):
                if column in part:
                    part[column] = part[column].astype(str) + f"-block-{block}"
            for column in part.columns:
                if column == "fixation_id" or column.startswith("fixation_id__"):
                    part[column] += block * 10000
            pieces.append(part)
        large = pd.concat(pieces, ignore_index=True)
        large.attrs = dict(base.attrs)
        for index in range(16):
            large[f"g00_unused_{index:02d}"] = np.sin(
                np.arange(len(large), dtype=float) / (index + 5)
            )
        path = RUNTIME / "large.parquet"
        large.to_parquet(path, index=False)
        deep_bytes = int(large.memory_usage(index=True, deep=True).sum())
        fingerprint = {
            "rows": len(large),
            "columns": list(large.columns),
            "deep_bytes": deep_bytes,
            "time_sum": float(large["time"].sum()),
            "gsr_sum": float(large["gsr"].sum()),
        }
        del pieces, large, corpus
        gc.collect()
        return path, fingerprint


class PeakSampler:
    def __init__(self):
        self.stop = threading.Event()
        self.peak = 0
        self.thread = threading.Thread(target=self._sample, daemon=True)

    def _sample(self):
        while not self.stop.is_set():
            current = baseline.rss()["rss_bytes"] or 0
            self.peak = max(self.peak, current)
            self.stop.wait(0.001)

    def __enter__(self):
        self.peak = baseline.rss()["rss_bytes"] or 0
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.stop.set()
        self.thread.join()
        self.peak = max(self.peak, baseline.rss()["rss_bytes"] or 0)


async def run_case(phase, state, path, expected):
    if phase == "before":
        module = received_service_module()
    else:
        from neurodatics.modules.analytics.application.services.parquet_reader_service import (
            PreparedParquetBatch,
        )
        from neurodatics.modules.reports.application.services import (
            executive_report_service as module,
        )

    codes = [f"SYN-L{index:02d}" for index in range(4)]
    generation = 17

    def decode():
        if state == "cold":
            count("downloads")
            count("download_bytes", path.stat().st_size)
            time.sleep(0.020)
        count("parquet_reads")
        return pd.read_parquet(path)

    if phase == "before":
        class Reader:
            def __init__(self, db):
                self.db = db

            async def read(self, project_id, code, received_generation):
                assert received_generation == generation
                if state == "cold":
                    count("candidate_queries")
                    count("oauth_queries")
                return await module.anyio.to_thread.run_sync(decode)
    else:
        class Reader:
            def __init__(self, db):
                self.db = db

            async def prepare_batch(self, project_id, received_codes, received_generation):
                assert received_codes == codes
                assert received_generation == generation
                count("candidate_queries")
                count("oauth_queries")
                return PreparedParquetBatch(
                    reads={code: SimpleNamespace(participant_code=code) for code in codes},
                    errors={},
                    storage_client=object() if state == "cold" else None,
                )

            async def read_prepared(self, prepared, storage_client, *, projection=None):
                assert projection is None
                return await module.settled_thread(decode)

    original_reader = module.ParquetReaderService
    module.ParquetReaderService = Reader
    service = module.ExecutiveReportService(SimpleNamespace())
    try:
        async def operation():
            before_rss = baseline.rss()["rss_bytes"] or 0
            before_counts = COUNTS.copy()
            cpu_started = time.process_time()
            started = time.perf_counter()
            with PeakSampler() as sampler:
                frames, warnings = await service._read_participant_frames(
                    uuid4(), codes, generation
                )
            elapsed = (time.perf_counter() - started) * 1000
            cpu_ms = (time.process_time() - cpu_started) * 1000
            assert not warnings
            assert list(frames) == codes
            for frame in frames.values():
                assert len(frame) == expected["rows"]
                assert list(frame.columns) == expected["columns"]
                assert float(frame["time"].sum()) == expected["time_sum"]
                assert float(frame["gsr"].sum()) == expected["gsr_sum"]
            counts = dict(COUNTS - before_counts)
            peak_rss = sampler.peak
            del frames
            gc.collect()
            return {
                "ms": elapsed,
                "cpu_ms": cpu_ms,
                "counts": counts,
                "rss_before_bytes": before_rss,
                "rss_peak_bytes": peak_rss,
                "rss_peak_delta_bytes": max(0, peak_rss - before_rss),
                "rss_after_gc_bytes": baseline.rss()["rss_bytes"],
            }

        await operation()  # warmup, excluded
        samples = [await operation() for _ in range(5)]
    finally:
        module.ParquetReaderService = original_reader
    return samples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("before", "after"), required=True)
    parser.add_argument("--state", choices=("cold", "warm"), required=True)
    args = parser.parse_args()
    path, fingerprint = build_large_parquet()
    COUNTS.clear()
    case_start_memory = baseline.rss()
    samples = asyncio.run(run_case(args.phase, args.state, path, fingerprint))
    case_end_memory = baseline.rss()
    times = [sample["ms"] for sample in samples]
    deltas = [sample["rss_peak_delta_bytes"] for sample in samples]
    result = {
        "phase": args.phase,
        "state": args.state,
        "runtime": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "pyarrow": pyarrow.__version__,
        },
        "scope": "G00 large x4; group load only; synthetic 20ms remote I/O; no DB/Drive/Redis/collect/render",
        "fixture": {
            **fingerprint,
            "parquet_bytes": path.stat().st_size,
            "participants": 4,
        },
        "n": 5,
        "warmup": 1,
        "median_ms": statistics.median(times),
        "min_ms": min(times),
        "max_ms": max(times),
        "median_peak_delta_bytes": statistics.median(deltas),
        "min_peak_delta_bytes": min(deltas),
        "max_peak_delta_bytes": max(deltas),
        "case_rss_before_warmup_bytes": case_start_memory["rss_bytes"],
        "case_peak_before_warmup_bytes": case_start_memory["process_lifetime_peak_bytes"],
        "case_peak_after_samples_bytes": case_end_memory["process_lifetime_peak_bytes"],
        "max_sampled_group_rss_bytes": max(sample["rss_peak_bytes"] for sample in samples),
        "samples": samples,
        "limits": [
            "Each phase/state is a separate process; per-operation RSS is sampled at 1ms.",
            "Cold means a synthetic 20ms remote delay; the OS page cache is not flushed.",
            "RSS is measured, not a bound; allocator reuse can make later per-sample deltas zero, so absolute sampled group RSS is retained.",
            "Fixture construction may set the lifetime peak before warmup; before/after lifetime peaks are reported separately.",
            "Collect and rendering are excluded and remain serial.",
        ],
    }
    if args.phase == "after":
        before = json.loads((EVIDENCE / f"before-{args.state}.json").read_text(encoding="utf-8"))
        assert result["runtime"] == before["runtime"]
        assert result["fixture"] == before["fixture"]
        result["equivalent_to_before"] = True
    target = EVIDENCE / f"{args.phase}-{args.state}.json"
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: result[key] for key in (
        "phase", "state", "n", "median_ms", "min_ms", "max_ms",
        "median_peak_delta_bytes", "min_peak_delta_bytes", "max_peak_delta_bytes",
        "case_rss_before_warmup_bytes", "case_peak_before_warmup_bytes",
        "case_peak_after_samples_bytes", "max_sampled_group_rss_bytes",
    )}, indent=2))


if __name__ == "__main__":
    main()

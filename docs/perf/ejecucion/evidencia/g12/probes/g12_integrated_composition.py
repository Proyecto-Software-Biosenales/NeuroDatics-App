"""Integrated G12 composition probe over current analytics/report helpers.

Synthetic G00 frames and fake DB/Drive adapters only.  The exercised product
path is authorization -> cached_frame_endpoint -> response/parquet flights and
ExecutiveReportService._read_participant_frames -> ReportIOBudget ->
ParquetReaderService.read_prepared.  No user data or external service is used.
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
from types import SimpleNamespace as NS
from uuid import UUID


ROOT = Path(__file__).resolve().parents[6]
os.environ.update(
    APP_ENV="test",
    DATABASE_URL="postgresql+psycopg://test:test@127.0.0.1:9/test",
    REDIS_URL="redis://127.0.0.1:9",
    AUTH_JWT_SECRET="g12-offline-synthetic-secret-long-enough",
)
sys.path.insert(0, str(ROOT / "backend/src"))

import pandas as pd
import pytest
from fastapi import HTTPException

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.api.schemas import PupilTimeseriesResponse
from neurodatics.modules.analytics.application.services.parquet_reader_service import (
    ParquetReaderService,
    PreparedParquetBatch,
    PreparedParquetRead,
)
from neurodatics.modules.analytics.domain.parquet_projection import PUPIL_PROJECTION
from neurodatics.modules.analytics.infrastructure.parquet_cache import ParquetCacheService
from neurodatics.modules.analytics.infrastructure.singleflight import (
    parquet_flights,
    response_flights,
)
from neurodatics.modules.reports.application.services import executive_report_service
from neurodatics.modules.reports.application.services.executive_report_service import (
    ExecutiveReportService,
)


PROJECT = UUID("00000000-0000-0000-0000-000000000112")
OWNER = UUID("00000000-0000-0000-0000-000000000212")
GENERATION = 12


def load_fixture_module():
    spec = importlib.util.spec_from_file_location(
        "g12_integrated_fixtures",
        ROOT / "backend/tests/characterization/conftest.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def rss() -> dict[str, int | None]:
    if os.name != "nt":
        return {"rss_bytes": None, "process_lifetime_peak_bytes": None}

    class Memory(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong)] + [
            (name, ctypes.c_size_t)
            for name in (
                "PeakWorkingSetSize",
                "WorkingSetSize",
                "QuotaPeakPagedPoolUsage",
                "QuotaPagedPoolUsage",
                "QuotaPeakNonPagedPoolUsage",
                "QuotaNonPagedPoolUsage",
                "PagefileUsage",
                "PeakPagefileUsage",
            )
        ]

    info = Memory()
    info.cb = ctypes.sizeof(info)
    kernel = ctypes.WinDLL("kernel32")
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    api = ctypes.WinDLL("psapi").GetProcessMemoryInfo
    api.argtypes = [ctypes.c_void_p, ctypes.POINTER(Memory), ctypes.c_ulong]
    if not api(kernel.GetCurrentProcess(), ctypes.byref(info), info.cb):
        return {"rss_bytes": None, "process_lifetime_peak_bytes": None}
    return {
        "rss_bytes": int(info.WorkingSetSize),
        "process_lifetime_peak_bytes": int(info.PeakWorkingSetSize),
    }


class ThreadCounter:
    def __init__(self):
        self.active = 0
        self.maximum = 0
        self.calls = 0
        self.lock = threading.Lock()

    def enter(self):
        with self.lock:
            self.active += 1
            self.calls += 1
            self.maximum = max(self.maximum, self.active)

    def leave(self):
        with self.lock:
            self.active -= 1

    def snapshot(self):
        with self.lock:
            return {"active": self.active, "maximum": self.maximum, "calls": self.calls}


class BlockingDrive:
    def __init__(self, payloads: dict[str, bytes]):
        self.payloads = payloads
        self.counter = ThreadCounter()
        self.release = threading.Event()
        self.active_external_ids: set[str] = set()
        self.ids_lock = threading.Lock()

    def download_file_content(self, external_id: str) -> bytes:
        self.counter.enter()
        with self.ids_lock:
            self.active_external_ids.add(external_id)
        try:
            if not self.release.wait(timeout=20):
                raise TimeoutError("synthetic Drive release timed out")
            return self.payloads[external_id]
        finally:
            with self.ids_lock:
                self.active_external_ids.discard(external_id)
            self.counter.leave()

    def active_ids(self) -> list[str]:
        with self.ids_lock:
            return sorted(self.active_external_ids)


class FakeResponseCache:
    def __init__(self):
        self.values: dict[str, dict] = {}
        self.get_calls = 0
        self.set_calls = 0
        self.lock = threading.Lock()

    def build_key(self, project_id, participant_code, endpoint, scenario, *, generation):
        return f"{project_id}:{participant_code}:{endpoint}:{scenario}:g{generation}"

    def get_json(self, key):
        with self.lock:
            self.get_calls += 1
            return self.values.get(key)

    def set_json(self, key, value, ttl=None):
        with self.lock:
            self.set_calls += 1
            self.values[key] = value

    def snapshot(self):
        with self.lock:
            return {
                "get_calls": self.get_calls,
                "set_calls": self.set_calls,
                "items": len(self.values),
            }


class FakeAuthDB:
    def __init__(self, *, allowed: bool, counters: dict[str, int]):
        self.allowed = allowed
        self.counters = counters

    async def execute(self, statement):
        self.counters["authorization_queries"] += 1
        project = NS(id=PROJECT, owner_id=OWNER, ingestion_generation=GENERATION)
        return NS(scalar_one_or_none=lambda: project if self.allowed else None)


def response_payload(frame: pd.DataFrame) -> dict:
    left = frame["lx_pupil"].head(16).fillna(0.0).astype(float).tolist()
    right = frame["rx_pupil"].head(16).fillna(0.0).astype(float).tolist()
    average = [(a + b) / 2 for a, b in zip(left, right)]
    return {
        "time": frame["time"].head(16).astype(float).tolist(),
        "left": left,
        "right": right,
        "average": average,
        "smooth_left": left,
        "smooth_right": right,
    }


async def exercise(payloads: dict[str, bytes], cache_dir: Path) -> dict:
    cache = ParquetCacheService()
    cache._cache_dir = cache_dir
    drive = BlockingDrive(payloads)
    response_cache = FakeResponseCache()
    decode_counter = ThreadCounter()
    compute_counter = ThreadCounter()
    adapter_counts = {
        "authorization_queries": 0,
        "identity_resolutions": 0,
        "batch_preparations": 0,
        "drive_builds": 0,
    }
    real_init = ParquetReaderService.__init__
    real_read_parquet = pd.read_parquet

    def patched_init(self, db):
        real_init(self, db)
        self._cache = cache

    async def resolve_user_parquet(self, project_id, participant_code):
        adapter_counts["identity_resolutions"] += 1
        return NS(project_file=NS(id=f"file-{participant_code}", external_id=participant_code))

    async def build_drive(self):
        adapter_counts["drive_builds"] += 1
        return drive

    async def prepare_batch(self, project_id, participant_codes, generation):
        adapter_counts["batch_preparations"] += 1
        reads = {
            code: PreparedParquetRead(
                project_id=project_id,
                participant_code=code,
                generation=GENERATION if generation is None else int(generation),
                file_id=f"file-{code}",
                external_id=code,
            )
            for code in participant_codes
        }
        return PreparedParquetBatch(reads=reads, errors={}, storage_client=drive)

    def counted_read_parquet(*args, **kwargs):
        decode_counter.enter()
        try:
            time.sleep(0.02)
            return real_read_parquet(*args, **kwargs)
        finally:
            decode_counter.leave()

    class RequestReader:
        def __init__(self, db):
            self.db = db

        async def read(self, project_id, participant_code, generation, *, projection=None):
            return await ParquetReaderService(self.db).read(
                project_id,
                participant_code,
                generation,
                projection=projection,
            )

    def compute(frame):
        compute_counter.enter()
        try:
            time.sleep(0.02)
            return response_payload(frame)
        finally:
            compute_counter.leave()

    stop_monitor = asyncio.Event()
    maxima = {
        "response_entries": 0,
        "response_running": 0,
        "response_consumers": 0,
        "parquet_entries": 0,
        "parquet_running": 0,
        "parquet_consumers": 0,
        "report_running": 0,
        "report_waiting": 0,
        "rss_bytes": 0,
    }

    async def monitor():
        while not stop_monitor.is_set():
            response = response_flights.stats()
            parquet = parquet_flights.stats()
            report = executive_report_service.report_io_budget.stats()
            sample = rss()
            maxima["response_entries"] = max(maxima["response_entries"], response["entries"])
            maxima["response_running"] = max(maxima["response_running"], response["running"])
            maxima["response_consumers"] = max(maxima["response_consumers"], response["consumers"])
            maxima["parquet_entries"] = max(maxima["parquet_entries"], parquet["entries"])
            maxima["parquet_running"] = max(maxima["parquet_running"], parquet["running"])
            maxima["parquet_consumers"] = max(maxima["parquet_consumers"], parquet["consumers"])
            maxima["report_running"] = max(maxima["report_running"], report["running"])
            maxima["report_waiting"] = max(maxima["report_waiting"], report["waiting"])
            if sample["rss_bytes"] is not None:
                maxima["rss_bytes"] = max(maxima["rss_bytes"], sample["rss_bytes"])
            await asyncio.sleep(0.002)

    async def request(participant_code: str, *, allowed: bool = True):
        db = FakeAuthDB(allowed=allowed, counters=adapter_counts)
        project = await routes._verify_ownership(db, PROJECT, str(OWNER if allowed else UUID(int=999)))
        return await routes.cached_frame_endpoint(
            reader=RequestReader(db),
            projection=PUPIL_PROJECTION,
            project=project,
            participant_code=participant_code,
            scenario="stimulus-a",
            endpoint="g12-integrated-pupil",
            compute=compute,
            response_model=PupilTimeseriesResponse,
        )

    baseline_rss = rss()
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(ParquetReaderService, "__init__", patched_init)
        patch.setattr(ParquetReaderService, "resolve_user_parquet", resolve_user_parquet)
        patch.setattr(ParquetReaderService, "_build_drive_client", build_drive)
        patch.setattr(ParquetReaderService, "prepare_batch", prepare_batch)
        patch.setattr(pd, "read_parquet", counted_read_parquet)
        patch.setattr(routes, "_redis", response_cache)

        before_denied = {"drive": drive.counter.snapshot()["calls"], "cache": response_cache.snapshot()["get_calls"]}
        denied_status = None
        try:
            await request("Q01", allowed=False)
        except HTTPException as exc:
            denied_status = exc.status_code
        after_denied = {"drive": drive.counter.snapshot()["calls"], "cache": response_cache.snapshot()["get_calls"]}
        assert denied_status == 404
        assert before_denied == after_denied

        monitor_task = asyncio.create_task(monitor())
        service = ExecutiveReportService(FakeAuthDB(allowed=True, counters=adapter_counts))
        report_codes = ["R01", "R02", "R03", "R04"]
        report_tasks = [
            asyncio.create_task(service._read_participant_frames(PROJECT, report_codes, GENERATION))
            for _ in range(3)
        ]
        query_tasks = []
        try:
            for _ in range(500):
                if drive.counter.snapshot()["active"] >= 2:
                    break
                await asyncio.sleep(0.002)
            query_tasks = [asyncio.create_task(request(f"Q{index:02d}")) for index in range(1, 7)]
            for _ in range(500):
                if drive.counter.snapshot()["active"] >= 4:
                    break
                await asyncio.sleep(0.002)
            assert drive.counter.snapshot()["active"] == 4

            active_query_ids = [code for code in drive.active_ids() if code.startswith("Q")]
            assert active_query_ids
            cancelled_query_index = int(active_query_ids[0][1:]) - 1

            report_tasks[0].cancel()
            report_tasks[0].cancel()
            query_tasks[cancelled_query_index].cancel()
            query_tasks[cancelled_query_index].cancel()
            await asyncio.sleep(0.04)
            during_cancel = {
                "cancelled_report_done_before_physical_release": report_tasks[0].done(),
                "cancelled_query": active_query_ids[0],
                "cancelled_query_done_before_physical_release": query_tasks[cancelled_query_index].done(),
                "response_flights": response_flights.stats(),
                "parquet_flights": parquet_flights.stats(),
                "report_io_budget": executive_report_service.report_io_budget.stats(),
                "drive": drive.counter.snapshot(),
                "rss": rss(),
            }
            assert not report_tasks[0].done()
            assert not query_tasks[cancelled_query_index].done()
            assert during_cancel["report_io_budget"]["running"] == 2
            assert during_cancel["parquet_flights"]["running"] == 4
        finally:
            drive.release.set()

        report_outcomes = await asyncio.gather(*report_tasks, return_exceptions=True)
        query_outcomes = await asyncio.gather(*query_tasks, return_exceptions=True)
        stop_monitor.set()
        await monitor_task

    def classify(value):
        if isinstance(value, BaseException):
            return type(value).__name__
        return "ok"

    report_summaries = []
    for outcome in report_outcomes:
        if isinstance(outcome, BaseException):
            report_summaries.append({"outcome": type(outcome).__name__})
        else:
            frames, warnings = outcome
            report_summaries.append({
                "outcome": "ok",
                "frame_order": list(frames),
                "warnings": warnings,
            })
    final_stats = {
        "response_flights": response_flights.stats(),
        "parquet_flights": parquet_flights.stats(),
        "report_io_budget": executive_report_service.report_io_budget.stats(),
        "drive": drive.counter.snapshot(),
        "decode": decode_counter.snapshot(),
        "compute": compute_counter.snapshot(),
        "rss": rss(),
    }
    assert final_stats["response_flights"] == {"entries": 0, "running": 0, "consumers": 0}
    assert final_stats["parquet_flights"] == {"entries": 0, "running": 0, "consumers": 0}
    assert final_stats["report_io_budget"] == {"running": 0, "waiting": 0}
    assert final_stats["drive"]["active"] == 0
    assert [classify(row) for row in query_outcomes].count("ok") == 5
    assert [row["outcome"] for row in report_summaries].count("ok") == 2

    return {
        "scope": "one Windows process/asyncio loop; current helpers; G00 synthetic Parquet; fake DB/Drive; no Redis/network/user data",
        "path": [
            "_verify_ownership",
            "cached_frame_endpoint",
            "response_flights",
            "ParquetReaderService.read/read_prepared",
            "parquet_flights",
            "ExecutiveReportService._read_participant_frames",
            "_run_ordered_io/report_io_budget",
        ],
        "authorization_before_cache": {
            "denied_status": denied_status,
            "before_denied": before_denied,
            "after_denied": after_denied,
        },
        "adapters": adapter_counts,
        "cancellation_before_release": during_cancel,
        "maxima_observed": maxima,
        "physical": {
            "drive": drive.counter.snapshot(),
            "parquet_decodes": decode_counter.snapshot(),
            "response_computes": compute_counter.snapshot(),
        },
        "outcomes": {
            "queries": [classify(row) for row in query_outcomes],
            "reports": report_summaries,
        },
        "settled": final_stats,
        "rss": {
            "before": baseline_rss,
            "during_cancel": during_cancel["rss"],
            "maximum_sampled_working_set_bytes": maxima["rss_bytes"],
            "after": final_stats["rss"],
        },
        "configured_limits": {
            "response": {
                "max_running": response_flights.max_running,
                "max_queued": response_flights.max_queued,
                "max_consumers": response_flights.max_consumers,
            },
            "parquet": {
                "max_running": parquet_flights.max_running,
                "max_queued": parquet_flights.max_queued,
                "max_consumers": parquet_flights.max_consumers,
            },
            "report": {
                "max_running": executive_report_service.report_io_budget.max_running,
                "max_waiting": executive_report_service.report_io_budget.max_waiting,
            },
        },
        "limits": [
            "RSS samples are this harness process working set, not a per-operation or deployment bound",
            "small G00 synthetic frames do not establish a global RAM bound",
            "DB ownership/identity and Drive bytes are controlled fakes; PostgreSQL, Drive and Redis are not validated",
            "physical maxima are observed for this overlap schedule, one process and one event loop",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "docs/perf/ejecucion/evidencia/g12/integrated-resource-composition.json",
    )
    args = parser.parse_args()
    runtime = ROOT / "output/perf-g12/backend"
    runtime.mkdir(parents=True, exist_ok=True)
    fixture = load_fixture_module()
    with tempfile.TemporaryDirectory(prefix="g12-integrated-", dir=runtime) as temporary:
        directory = Path(temporary)

        class Factory:
            def mktemp(self, name):
                target = directory / name
                target.mkdir()
                return target

        corpus = fixture.corpus.__wrapped__(Factory())
        base_frames = list(corpus.frames.values())
        payloads = {}
        for index, code in enumerate(["R01", "R02", "R03", "R04", "Q01", "Q02", "Q03", "Q04", "Q05", "Q06"]):
            frame = base_frames[index % len(base_frames)].copy(deep=True)
            path = directory / f"{code}.parquet"
            frame.to_parquet(path, index=False)
            payloads[code] = path.read_bytes()
        result = asyncio.run(exercise(payloads, directory / "cache"))
        result["fixture"] = {
            "source": "G00 synthetic corpus",
            "participants": len(payloads),
            "rows_each": len(base_frames[0]),
            "parquet_bytes": {code: len(value) for code, value in payloads.items()},
            "sha256": {code: hashlib.sha256(value).hexdigest() for code, value in payloads.items()},
        }
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "maxima": result["maxima_observed"],
        "physical": result["physical"],
        "outcomes": result["outcomes"],
        "settled": result["settled"],
    }, indent=2))


if __name__ == "__main__":
    main()

"""Offline baseline using real ingestion/services and explicit synthetic I/O.

From root: .venv/Scripts/python.exe docs/perf/bench/g00_backend.py
Generated files stay under ignored output/perf-g00; evidence contains summaries only.
No production data, database, Redis or Drive is contacted. No golden is updated.
"""
import argparse
import asyncio
from collections import Counter
import ctypes
import hashlib
import importlib.util
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import time
from types import SimpleNamespace as NS
from uuid import UUID

ROOT = Path(__file__).resolve().parents[3]
os.environ.update(APP_ENV="test", DATABASE_URL="postgresql+psycopg://test:test@127.0.0.1:9/test",
                  REDIS_URL="redis://127.0.0.1:9", AUTH_JWT_SECRET="g00-offline-synthetic-secret-long-enough")
sys.path.insert(0, str(ROOT / "backend/src"))
import numpy as np
import pandas as pd
import pytest
from neurodatics.modules.analytics.application.services.aoi_analytics_service import AoiAnalyticsService
from neurodatics.modules.analytics.application.services.fixation_analytics_service import FixationEventService
from neurodatics.modules.analytics.application.services.parquet_reader_service import ParquetReaderService
from neurodatics.modules.analytics.infrastructure.parquet_cache import ParquetCacheService
from neurodatics.modules.analytics.api import routes as analytics_routes
from neurodatics.modules.projects.api import routes as project_routes
from neurodatics.modules.participants.infrastructure.repository_impl import SQLParticipantRepository
from neurodatics.modules.scenaries.infrastructure.repository_impl import SQLscenariesRepository
from neurodatics.modules.reports.application.services.executive_report_service import ExecutiveReportService
from neurodatics.modules.reports.application.sensor_reports import common, eye_tracking

PROJECT = UUID("00000000-0000-0000-0000-000000000101")
COUNTERS = Counter()


def load_fixture_module():
    spec = importlib.util.spec_from_file_location("g00_characterization_fixtures", ROOT / "backend/tests/characterization/conftest.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rss():
    """Current working set and process lifetime peak, never per-operation peak."""
    if os.name != "nt":
        return {"rss_bytes": None, "process_lifetime_peak_bytes": None}
    class Memory(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong)] + [(name, ctypes.c_size_t) for name in (
            "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage",
            "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
    info = Memory()
    info.cb = ctypes.sizeof(info)
    kernel = ctypes.WinDLL("kernel32")
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    api = ctypes.WinDLL("psapi").GetProcessMemoryInfo
    api.argtypes = [ctypes.c_void_p, ctypes.POINTER(Memory), ctypes.c_ulong]
    api(kernel.GetCurrentProcess(), ctypes.byref(info), info.cb)
    return {"rss_bytes": info.WorkingSetSize, "process_lifetime_peak_bytes": info.PeakWorkingSetSize}


def measure(name, operation, repeats, warm=True):
    if warm:
        operation()
    rows = []
    for _ in range(repeats):
        before = COUNTERS.copy()
        cpu = time.process_time()
        started = time.perf_counter()
        result = operation()
        rows.append({"ms": (time.perf_counter() - started) * 1000, "cpu_ms": (time.process_time() - cpu) * 1000,
                     "counts": dict(COUNTERS - before), **rss()})
    values = [row["ms"] for row in rows]
    return {"name": name, "n": repeats, "warmup": int(warm), "median_ms": statistics.median(values),
            "min_ms": min(values), "max_ms": max(values), "samples": rows}


class SyntheticStorage:
    def __init__(self, payload, delay):
        self.payload, self.delay = payload, delay

    def download_file_content(self, external_id):
        COUNTERS["downloads"] += 1
        COUNTERS["download_bytes"] += len(self.payload[external_id])
        time.sleep(self.delay)
        return self.payload[external_id]


class RecordingDB:
    """Repository control-flow counters, not PostgreSQL SQL/transaction emulation."""
    def __init__(self, scenario=False):
        self.scenario, self.calls = scenario, 0

    async def execute(self, statement):
        COUNTERS["execute_select"] += 1
        self.calls += 1
        values = [NS(name="stimulus-a", id=UUID(int=200))] if self.scenario and self.calls == 1 else []
        return NS(scalar_one_or_none=lambda: None, scalars=lambda: NS(all=lambda: values))

    def add(self, entity):
        COUNTERS["add"] += 1

    async def flush(self):
        COUNTERS["flush"] += 1

    async def commit(self):
        COUNTERS["commit"] += 1

    async def refresh(self, entity):
        COUNTERS["refresh"] += 1

    async def delete(self, entity):
        COUNTERS["delete"] += 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--io-ms", type=float, default=20)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/perf/ejecucion/evidencia/g00/backend-baseline.json")
    args = parser.parse_args()
    assert args.repeats > 0 and args.io_ms >= 0
    runtime = ROOT / "output/perf-g00/backend"
    runtime.mkdir(parents=True, exist_ok=True)
    fixture = load_fixture_module()
    results = []
    manifest = []
    with tempfile.TemporaryDirectory(prefix="g00-", dir=runtime) as temporary:
        directory = Path(temporary)
        class Factory:
            def mktemp(self, name):
                target = directory / name
                target.mkdir()
                return target
        corpus = fixture.corpus.__wrapped__(Factory())
        aois = fixture.aois.__wrapped__()
        small = corpus.frames
        base = small["SYN-01"]
        # Repeated synthetic recording blocks. Keep clocks, float64, NaN and original attrs.
        pieces = []
        for block in range(64):
            part = base.copy(deep=True)
            part["time"] += block * 16
            for column in ("segment_id", "fixation_segment_id"):
                if column in part:
                    part[column] = part[column].astype(str) + f"-block-{block}"
            for column in part.columns:
                if column == "fixation_id" or column.startswith("fixation_id__"):
                    part[column] = part[column] + block * 10000
            pieces.append(part)
        large_frame = pd.concat(pieces, ignore_index=True)
        large_frame.attrs = dict(base.attrs)
        for scenario in ("stimulus-a", "stimulus-b"):
            original_events = FixationEventService.build_events(base, scenario=scenario)[0]
            extended_events = FixationEventService.build_events(large_frame, scenario=scenario)[0]
            assert len(extended_events) == 64 * len(original_events)
            assert extended_events["duration_s"].min() > 0
        for index in range(16):
            large_frame[f"g00_unused_{index:02d}"] = np.sin(np.arange(len(large_frame), dtype=float) / (index + 5))
        corpora = {"small": small, "large": {f"SYN-L{index:02d}": large_frame.copy(deep=True) for index in range(4)}}
        real_read = pd.read_parquet
        real_events = FixationEventService.build_events
        def counted_read(*a, **kw):
            COUNTERS["parquet_reads"] += 1
            return real_read(*a, **kw)
        def counted_events(*a, **kw):
            COUNTERS["event_builds"] += 1
            return real_events(*a, **kw)
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(pd, "read_parquet", counted_read)
            patch.setattr(FixationEventService, "build_events", staticmethod(counted_events))
            for label, frames in corpora.items():
                paths, payloads = {}, {}
                for code, frame in frames.items():
                    path = directory / f"{code}.parquet"
                    frame.to_parquet(path, index=False)
                    paths[code] = path
                    payloads[code] = path.read_bytes()
                code = next(iter(frames))
                frame = frames[code]
                manifest.append({"fixture": label, "participants": len(frames), "rows_each": len(frame), "columns": list(frame.columns),
                                 "dataframe_bytes_each": int(frame.memory_usage(deep=True).sum()),
                                 "parquet_bytes_each": len(payloads[code]), "sha256_first_parquet": hashlib.sha256(payloads[code]).hexdigest(),
                                 "scenarios": sorted(frame.scenario.unique().tolist()), "segments": int(frame.segment_id.nunique()) if "segment_id" in frame else None})
                storage = SyntheticStorage(payloads, args.io_ms / 1000)
                cache = ParquetCacheService()
                cache._cache_dir = directory / f"cache-{label}"
                reader = ParquetReaderService(None)
                reader._cache = cache
                async def resolve(project_id, participant_code):
                    COUNTERS["resolve_files"] += 1
                    return NS(project_file=NS(external_id=participant_code))
                async def drive():
                    return storage
                async def generation(project_id):
                    COUNTERS["resolve_generation"] += 1
                    return 3
                patch.setattr(reader, "resolve_user_parquet", resolve)
                patch.setattr(reader, "_build_drive_client", drive)
                patch.setattr(reader, "resolve_cache_generation", generation)
                def cold():
                    # A fresh synthetic generation is empty; do not touch any existing cache.
                    generation_value = COUNTERS["downloads"] + 100
                    return asyncio.run(reader.read(PROJECT, code, generation_value))
                results.append(measure(f"{label}/parquet_cold_simulated", cold, args.repeats))
                cache.put(PROJECT, code, payloads[code], 3)
                results.append(measure(f"{label}/parquet_disk_hit", lambda: asyncio.run(reader.read(PROJECT, code, 3)), args.repeats))
                results.append(measure(f"{label}/aoi_metrics", lambda: AoiAnalyticsService.compute_metrics(frame, "stimulus-a", aois), args.repeats))
                def collect_group():
                    rows = []
                    for participant_code, participant_frame in frames.items():
                        participant = common.ReportParticipant(participant_code, participant_code, "#2563EB", participant_frame)
                        for scenario in ("stimulus-a", "stimulus-b"):
                            row = eye_tracking.collect(participant, common.ReportScenario(scenario, scenario, 1, aois))
                            assert row is not None and row.fixation_count > 0 and row.aoi is not None
                            rows.append(row)
                    return rows
                results.append(measure(f"{label}/report_group_collect", collect_group, args.repeats))
                patch.setattr(project_routes, "ParquetReaderService", lambda db: reader)
                def video_metadata():
                    values = [asyncio.run(project_routes._compute_video_frame_time_s(None, PROJECT, code, "stimulus-b", t)) for t in (8.1, 8.1, 8.2, 8.3)]
                    assert values == pytest.approx([0.1, 0.1, 0.2, 0.3])
                    return values
                results.append(measure(f"{label}/video_onset_repeat_and_scrub", video_metadata, args.repeats))
                patch.setattr(analytics_routes, "ParquetReaderService", lambda db: reader)
                corpus.frames = frames
                client_generator = fixture.http_client.__wrapped__(corpus, aois, patch)
                client = next(client_generator)
                # The existing HTTP fixture installs an in-memory reader; replace it only inside this process.
                patch.setattr(analytics_routes, "ParquetReaderService", lambda db: reader)
                prefix = f"/api/projects/{PROJECT}/analytics"
                endpoints = ["/timeseries/eeg", "/psd/eeg", "/spectrogram/eeg", "/topography/eeg", "/timeseries/gsr", "/aois"]
                for endpoint in endpoints:
                    cache_http = analytics_routes._redis
                    params = {"participant_code": code, "scenario": "stimulus-a"}
                    def request(clear=False):
                        if clear:
                            cache_http.values.clear()
                        response = client.get(prefix + endpoint, params=params)
                        assert response.status_code == 200, response.text
                        COUNTERS["http_requests"] += 1
                        COUNTERS["response_bytes"] += len(response.content)
                        return response
                    results.append(measure(f"{label}/http_no_response_cache{endpoint}", lambda: request(True), args.repeats))
                    results.append(measure(f"{label}/http_response_cache_hit{endpoint}", request, args.repeats))
                client_generator.close()
                # Actual sequential report loading using the actual reader and synthetic storage.
                import neurodatics.modules.reports.application.services.executive_report_service as report_module
                patch.setattr(report_module, "ParquetReaderService", lambda db: reader)
                service = ExecutiveReportService(None)
                def load_group():
                    unique_generation = COUNTERS["downloads"] + 10000
                    loaded, warnings = asyncio.run(service._read_participant_frames(PROJECT, list(frames), unique_generation))
                    assert set(loaded) == set(frames) and not warnings
                    return loaded
                results.append(measure(f"{label}/report_group_load_cold_simulated", load_group, args.repeats))
            for count in (10, 100, 1000):
                participants = [{"participant_code": f"SYN-{index:04d}", "age": 30, "sex": None} for index in range(count)]
                aois_input = [{"scenaries_name": "stimulus-a", "name": f"AOI-{index:04d}", "color": "#2563EB", "shape_type": "rect", "shape": {"x": 0, "y": 0, "width": 50, "height": 50}} for index in range(count)]
                results.append(measure(f"save/participants/{count}", lambda: asyncio.run(SQLParticipantRepository(RecordingDB()).upsert_participants(PROJECT, participants)), args.repeats))
                results.append(measure(f"save/aois/{count}", lambda: asyncio.run(SQLscenariesRepository(RecordingDB(True)).upsert_aois(PROJECT, aois_input)), args.repeats))
    output = {"scope": "synthetic offline; real services; simulated storage delay and DB control-flow counts",
              "python": platform.python_version(), "versions": {name: version(name) for name in ("pandas", "numpy", "pyarrow", "fastapi", "sqlalchemy", "pytest", "typst")},
              "io_delay_ms_per_download": args.io_ms, "fixtures": manifest, "results": results,
              "limits": ["no real Drive/PostgreSQL/Redis", "OS file cache warm, not OS cold", "DB counters are execute/refresh calls, not actual SQL", "report collect/load measured separately; no PDF rendering timing", "video onset helper only; no FFmpeg timing", "process lifetime peak RSS is cumulative"]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "flows": len(results), "fixtures": manifest}, indent=2))


if __name__ == "__main__":
    main()

"""Compare received G03 source vs G04 on the same corpus/runtime, offline.

Real endpoint helper, reader/Parquet/publication/services; DB identity resolution
and 20ms object-store transport synthetic. No response cache in either mode.
"""

import asyncio
import gc
import hashlib
import importlib.util
import json
import platform
import statistics
import sys
import tempfile
import threading
import time
from collections import Counter
from types import SimpleNamespace as NS

import g00_backend as baseline
import numpy as np
import pandas as pd
import pyarrow
import pytest

ROOT = baseline.ROOT
COUNTS = Counter()
COUNT_LOCK = threading.Lock()


def count(key):
    with COUNT_LOCK:
        COUNTS[key] += 1


def received(module, relative):
    path = ROOT / "output/perf-g04/base" / relative
    spec = importlib.util.spec_from_file_location(module, path)
    result = importlib.util.module_from_spec(spec)
    sys.modules[module] = result
    spec.loader.exec_module(result)
    return result


class NoRedis:
    build_key = staticmethod(baseline.analytics_routes.AnalyticsRedisCache.build_key)

    def get_json(self, key):
        count("response_lookups")

    def set_json(self, *args, **kwargs):
        count("response_write_attempts")


def summary(rows):
    times = [row["ms"] for row in rows]
    return {"n": len(rows), "warmup": 1, "median_ms": statistics.median(times),
            "failures": sum(row["failures"] for row in rows),
            "min_ms": min(times), "max_ms": max(times), "samples": rows}


async def main():
    from neurodatics.modules.analytics.api.schemas import PupilTimeseriesResponse
    from neurodatics.modules.analytics.application.services import (
        parquet_reader_service as new_reader,
    )
    from neurodatics.modules.analytics.domain.parquet_projection import PUPIL_PROJECTION

    old_reader = received("neurodatics.modules.analytics.application.services.g04_received_reader",
                          "backend/src/neurodatics/modules/analytics/application/services/parquet_reader_service.py")
    old_routes = received("neurodatics.modules.analytics.api.g04_received_routes",
                          "backend/src/neurodatics/modules/analytics/api/routes.py")
    modes = {"before": (old_reader, old_routes), "after": (new_reader, baseline.analytics_routes)}
    evidence = ROOT / "docs/perf/ejecucion/evidencia/g04/medidas.json"
    runtime = ROOT / "output/perf-g04/runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    fixture = baseline.load_fixture_module()
    result = {"python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__,
              "pyarrow": pyarrow.__version__, "scope": "same received G03/G04 code, helper+file IO; no Redis/DB/Drive",
              "fixtures": [], "cases": []}
    with tempfile.TemporaryDirectory(dir=runtime) as temp:
        from pathlib import Path
        directory = Path(temp)

        class Factory:
            def mktemp(self, name):
                path = directory / name
                path.mkdir()
                return path

        corpus = fixture.corpus.__wrapped__(Factory())
        small = corpus.frames["SYN-01"]
        pieces = []
        for block in range(64):
            part = small.copy(deep=True)
            part["time"] += block * 16
            for column in ("segment_id", "fixation_segment_id"):
                if column in part:
                    part[column] = part[column].astype(str) + f"-block-{block}"
            for column in part.columns:
                if column == "fixation_id" or column.startswith("fixation_id__"):
                    part[column] += block * 10000
            pieces.append(part)
        large = pd.concat(pieces, ignore_index=True)
        large.attrs = dict(small.attrs)
        for index in range(16):
            large[f"g00_unused_{index:02d}"] = np.sin(np.arange(len(large), dtype=float) / (index + 5))
        for label, frame in [("small", small), ("large", large)]:
            path = directory / f"{label}.parquet"
            frame.to_parquet(path, index=False)
            payload = path.read_bytes()
            result["fixtures"].append({"name": label, "rows": len(frame), "parquet_bytes": len(payload),
                                       "sha256": hashlib.sha256(payload).hexdigest()})
            caches = {}
            for mode in modes:
                cache = baseline.ParquetCacheService()
                cache._cache_dir = directory / mode / label
                caches[mode] = cache
                cache.put(baseline.PROJECT, "SYN-01", payload, 0)
            generation = 10
            for level, state, requests in [("response", "disk", 1), ("response", "cold", 1),
                                            ("response", "disk", 10), ("response", "cold", 10),
                                            ("file", "cold", 10)]:
                rows = {mode: [] for mode in modes}
                expected = None
                for repeat in range(6):
                    for mode, (reader_module, route_module) in modes.items():
                        generation += 1
                        gen = generation if state == "cold" else 0
                        cache = caches[mode]
                        project = NS(id=baseline.PROJECT, owner_id=fixture.USER_ID, ingestion_generation=gen)
                        reader = reader_module.ParquetReaderService(None)
                        reader._cache = cache

                        async def resolve(project_id, participant_code):
                            count("resolve_files")
                            return NS(project_file=NS(id="synthetic-file", external_id=participant_code))

                        class Storage:
                            def download_file_content(self, external_id, payload=payload):
                                count("downloads")
                                count("download_bytes")
                                time.sleep(0.020)
                                return payload

                        async def drive(storage_type=Storage):
                            return storage_type()

                        reader.resolve_user_parquet, reader._build_drive_client = resolve, drive

                        class FrameReader:
                            db = None

                            async def read(self, project_id, participant_code, generation, *, projection=None, reader=reader):
                                return await reader.read(project_id, participant_code, generation, projection=projection)

                        def compute(data, route_module=route_module):
                            count("computations")
                            return route_module.PupilAnalyticsService.compute_timeseries(data, "stimulus-a", max_points=5000)

                        async def request(level=level, reader=reader, project=project, gen=gen, route_module=route_module, frame_reader=FrameReader, compute=compute):
                            if level == "file":
                                data = await reader.read(project.id, "SYN-01", gen, projection=PUPIL_PROJECTION)
                                return data.to_json()
                            value = await route_module.cached_frame_endpoint(
                                reader=frame_reader(), project=project, participant_code="SYN-01", scenario="stimulus-a",
                                endpoint="timeseries_pupil:5000", compute=compute, response_model=PupilTimeseriesResponse,
                                projection=PUPIL_PROJECTION,
                            )
                            return value.model_dump_json()

                        gc.collect()
                        COUNTS.clear()
                        decode = pd.read_parquet

                        def counted_read(*args, decode=decode, **kwargs):
                            count("parquet_reads")
                            return decode(*args, **kwargs)

                        with pytest.MonkeyPatch.context() as patch:
                            patch.setattr(pd, "read_parquet", counted_read)
                            patch.setattr(route_module, "_redis", NoRedis())
                            started, cpu = time.perf_counter(), time.process_time()
                            values = await asyncio.gather(*(request() for _ in range(requests)), return_exceptions=True)
                            sample = {"ms": (time.perf_counter() - started) * 1000,
                                      "cpu_ms": (time.process_time() - cpu) * 1000,
                                      "counts": dict(COUNTS), **baseline.rss()}
                        errors = [value for value in values if isinstance(value, BaseException)]
                        sample["failures"] = len(errors)
                        sample["errors"] = [type(value).__name__ + ": " + str(value) for value in errors]
                        if mode == "after":
                            assert not errors
                        values = [value for value in values if not isinstance(value, BaseException)]
                        assert values and len(set(values)) == 1
                        if expected is None:
                            expected = values[0]
                        assert values[0] == expected
                        sample["counts"]["download_bytes"] = COUNTS["downloads"] * len(payload)
                        if repeat:
                            rows[mode].append(sample)
                result["cases"].append({"fixture": label, "level": level, "state": state,
                                        "requests": requests, "equivalent": True,
                                        "timings_comparable": not any(row["failures"] for samples in rows.values() for row in samples),
                                        **{mode: summary(samples) for mode, samples in rows.items()}})
                evidence.write_text(json.dumps(result, indent=2), encoding="utf-8")
    result["limits"] = ["n=5 median/range, no p95", "20ms synthetic storage, complete bytes each download",
                        "OS file cache not cleared", "RSS snapshot/lifetime peak, not operation peak",
                        "request auth checked in tests, benchmark measures helper+reader rather than network/DB latency",
                        "received Windows baseline concurrent publication errors are recorded; failed timings do not prove acceleration",
                        "sequential misses intentionally bypass response cache to expose coordination overhead"]
    evidence.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(evidence), "cases": len(result["cases"])}))


if __name__ == "__main__":
    asyncio.run(main())

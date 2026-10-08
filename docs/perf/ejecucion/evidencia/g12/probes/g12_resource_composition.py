"""Exercise the process/loop-local admission budgets together and sample RSS.

This is an offline capacity probe.  The admissions are the real G04/G07 image
and report primitives; calibrated byte buffers model the observed G00 large
frame footprint.  It is not a deployed-service or DataFrame peak measurement.
"""

from __future__ import annotations

import asyncio
import ctypes
import gc
import json
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[6]
os.environ.update(
    APP_ENV="test",
    DATABASE_URL="postgresql+psycopg://test:test@127.0.0.1:9/test",
    REDIS_URL="redis://127.0.0.1:9",
    AUTH_JWT_SECRET="g12-offline-synthetic-secret-long-enough",
)
sys.path.insert(0, str(ROOT / "backend/src"))

from neurodatics.config.settings import settings
from neurodatics.infra.cache.memory_cache import InProcessCache
from neurodatics.modules.analytics.infrastructure.redis_cache import AnalyticsRedisCache
from neurodatics.modules.analytics.infrastructure.singleflight import (
    parquet_flights,
    response_flights,
)
from neurodatics.modules.projects.infrastructure import image_cache
from neurodatics.modules.projects.infrastructure.video_preview_metadata import (
    video_preview_metadata_stats,
)
from neurodatics.modules.reports.application.services.executive_report_service import (
    report_io_budget,
)


LARGE_FRAME_DEEP_BYTES = 161_056_772
TRANSIENT_FRAMES = 6  # four HTTP decodes plus two report workers
RETAINED_REPORT_FRAMES = 4


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


async def exercise_admission() -> dict:
    release = asyncio.Event()

    async def blocked():
        await release.wait()
        return True

    async def submit_singleflight(flight, prefix: str, count: int):
        async def one(index: int):
            try:
                await flight.run((prefix, index), blocked)
                return "settled"
            except Exception as exc:  # bounded admission is the expected branch
                return type(exc).__name__

        return [asyncio.create_task(one(index)) for index in range(count)]

    async def submit_report(count: int):
        async def one():
            try:
                await report_io_budget.run(blocked)
                return "settled"
            except Exception as exc:
                return type(exc).__name__

        return [asyncio.create_task(one()) for _ in range(count)]

    response = await submit_singleflight(response_flights, "response", 40)
    parquet = await submit_singleflight(parquet_flights, "parquet", 40)
    images = await submit_singleflight(image_cache.image_flights, "image", 22)
    reports = await submit_report(22)
    for _ in range(200):
        await asyncio.sleep(0)
        if (
            response_flights.stats()["entries"] == 36
            and response_flights.stats()["running"] == response_flights.max_running
            and parquet_flights.stats()["entries"] == 36
            and parquet_flights.stats()["running"] == parquet_flights.max_running
            and image_cache.image_flights.stats()["entries"] == 18
            and image_cache.image_flights.stats()["running"] == image_cache.image_flights.max_running
            and report_io_budget.stats()["waiting"] == settings.report_io_max_waiting
        ):
            break

    observed = {
        "process_id": os.getpid(),
        "event_loop_id": id(asyncio.get_running_loop()),
        "instances": {
            "response_flights": {
                "stats": response_flights.stats(),
                "configured": {
                    "max_running": response_flights.max_running,
                    "max_queued": response_flights.max_queued,
                    "max_consumers": response_flights.max_consumers,
                },
            },
            "parquet_flights": {
                "stats": parquet_flights.stats(),
                "configured": {
                    "max_running": parquet_flights.max_running,
                    "max_queued": parquet_flights.max_queued,
                    "max_consumers": parquet_flights.max_consumers,
                },
            },
            "image_flights": {
                "stats": image_cache.image_flights.stats(),
                "configured": {
                    "max_running": image_cache.image_flights.max_running,
                    "max_queued": image_cache.image_flights.max_queued,
                    "max_consumers": image_cache.image_flights.max_consumers,
                },
            },
            "report_io_budget": {
                "stats": report_io_budget.stats(),
                "configured": {
                    "max_running": report_io_budget.max_running,
                    "max_waiting": report_io_budget.max_waiting,
                },
            },
        },
        "rss_at_admission": rss(),
    }
    release.set()
    results = {
        "response": await asyncio.gather(*response),
        "parquet": await asyncio.gather(*parquet),
        "image": await asyncio.gather(*images),
        "report": await asyncio.gather(*reports),
    }
    observed["outcomes"] = {
        name: {value: rows.count(value) for value in sorted(set(rows))}
        for name, rows in results.items()
    }
    observed["after_settlement"] = {
        "response_flights": response_flights.stats(),
        "parquet_flights": parquet_flights.stats(),
        "image_flights": image_cache.image_flights.stats(),
        "report_io_budget": report_io_budget.stats(),
    }
    return observed


def allocate_calibrated_frames() -> dict:
    samples = {"before": rss()}
    retained: list[bytearray] = []
    transient: list[bytearray] = []
    try:
        for _ in range(RETAINED_REPORT_FRAMES):
            retained.append(bytearray(LARGE_FRAME_DEEP_BYTES))
        samples["retained_four_frames"] = rss()
        for _ in range(TRANSIENT_FRAMES):
            transient.append(bytearray(LARGE_FRAME_DEEP_BYTES))
        samples["retained_plus_transient_ten_frames"] = rss()
        transient.clear()
        gc.collect()
        samples["after_transient_release"] = rss()
        retained.clear()
        gc.collect()
        samples["after_all_release"] = rss()
        status = "complete"
    except MemoryError:
        status = "memory_error"
        transient.clear()
        retained.clear()
        gc.collect()
        samples["after_memory_error_release"] = rss()
    return {
        "status": status,
        "calibration": {
            "large_frame_deep_bytes_g00": LARGE_FRAME_DEEP_BYTES,
            "retained_report_frames": RETAINED_REPORT_FRAMES,
            "transient_frames": TRANSIENT_FRAMES,
            "estimated_retained_bytes": RETAINED_REPORT_FRAMES * LARGE_FRAME_DEEP_BYTES,
            "estimated_transient_bytes": TRANSIENT_FRAMES * LARGE_FRAME_DEEP_BYTES,
            "estimated_simultaneous_bytes": (RETAINED_REPORT_FRAMES + TRANSIENT_FRAMES) * LARGE_FRAME_DEEP_BYTES,
        },
        "rss_samples": samples,
        "limits": [
            "bytearray pages are calibrated to G00 DataFrame deep bytes but are not DataFrames",
            "RSS is the current Windows working set and peak is process-lifetime, not per operation",
            "file dimensions and Parquet size are not numerically bounded by the product",
        ],
    }


def main() -> None:
    result = {
        "scope": "one Windows process, one asyncio loop, real admission primitives; no DB, Redis, Drive or network",
        "admission": asyncio.run(exercise_admission()),
        "memory": allocate_calibrated_frames(),
        "caches": {
            "redis_json_max_bytes_per_value": AnalyticsRedisCache.MAX_JSON_BYTES,
            "redis_ttl_seconds": settings.analytics_redis_ttl_seconds,
            "local_no_redis_total_max_bytes": InProcessCache.DEFAULT_MAX_BYTES,
            "image_memory_max_items": image_cache.IMAGE_CACHE_MAX_ITEMS,
            "image_memory_max_bytes": image_cache.IMAGE_CACHE_MAX_BYTES,
            "image_memory_current_items": len(image_cache._cache_store),
            "image_memory_current_bytes": image_cache._cache_total_bytes,
            "video_metadata": video_preview_metadata_stats(),
            "media_disk_max_bytes": settings.media_cache_max_bytes,
            "media_disk_max_age_hours": settings.media_cache_max_age_hours,
            "parquet_ttl_hours": settings.parquet_cache_ttl_hours,
            "parquet_global_byte_limit": None,
        },
        "global_ram_bound": None,
        "global_ram_bound_reason": "no numeric product bound for Parquet bytes, frame rows/columns, response working sets, or concurrent reports",
    }
    output = ROOT / "docs/perf/ejecucion/evidencia/g12/resource-composition.json"
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "admission": result["admission"]["outcomes"], "memory_status": result["memory"]["status"]}, indent=2))


if __name__ == "__main__":
    main()

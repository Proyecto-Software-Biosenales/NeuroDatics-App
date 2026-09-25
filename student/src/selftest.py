"""Frozen self-test: real ingestion, analytics, reports and media code, frozen or not.

It runs the building blocks the upload route and the dashboard use and writes one JSON
document, so a frozen run can be compared with an unfrozen one. It is a gate, so it is written
to fail when it did no work: an empty result, a missing ffprobe or a fixture without video is a
failure, never a skipped stage. (Digests alone cannot catch that; frozen and unfrozen would
fail identically and still match.)

The storage adapters and the HTTP routes are covered by ``http_check.py``.
"""
from __future__ import annotations

import argparse
import contextlib
import ctypes
import hashlib
import json
import math
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import time
import traceback
from ctypes import wintypes

# The settings are read once, at import; nothing here talks to the database or Drive.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:x@127.0.0.1:1/x")
os.environ.setdefault("AUTH_JWT_SECRET", "selftest-only-jwt-secret-0123456789abcdef0123")

RESULTS: dict = {"stages": {}}


class _Counters(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
    ]


def peak_working_set_mb() -> float:
    kernel32, psapi = ctypes.windll.kernel32, ctypes.windll.psapi
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(_Counters), wintypes.DWORD]
    counters = _Counters()
    counters.cb = ctypes.sizeof(counters)
    psapi.GetProcessMemoryInfo(kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb)
    return round(counters.PeakWorkingSetSize / 1048576, 1)


@contextlib.contextmanager
def stage(name: str):
    record: dict = {"ok": False}
    RESULTS["stages"][name] = record
    started = time.perf_counter()
    print(f"[stage] {name} ...", flush=True)
    try:
        yield record
        record["ok"] = True
    except Exception as exc:  # a failed stage must not hide the later ones
        record["error"] = f"{type(exc).__name__}: {exc}"
        record["traceback"] = traceback.format_exc()[-1800:]
    finally:
        record["seconds"] = round(time.perf_counter() - started, 2)
        record["peak_working_set_mb_so_far"] = peak_working_set_mb()
        print(f"[stage] {name}: {'ok' if record['ok'] else 'FAILED'} in {record['seconds']} s", flush=True)


def digest(obj) -> str:
    def clean(value):
        if isinstance(value, float):
            return None if value != value else round(value, 9)
        if isinstance(value, dict):
            return {str(k): clean(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [clean(v) for v in value]
        if hasattr(value, "tolist"):
            return clean(value.tolist())
        return value
    payload = json.dumps(clean(obj), sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def finite_numbers(value) -> int:
    """How many finite numbers a result holds, however deeply nested. Zero means it is empty."""
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return 1 if math.isfinite(value) else 0
    if isinstance(value, dict):
        return sum(finite_numbers(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return sum(finite_numbers(v) for v in value)
    if hasattr(value, "tolist"):
        return finite_numbers(value.tolist())
    return 0


def tools_dir(args) -> pathlib.Path:
    if args.tools_dir:
        return pathlib.Path(args.tools_dir)
    return pathlib.Path(sys.executable).resolve().parent / "tools"


# Each result must hold at least this many finite numbers. Statistics are a handful of values;
# series, spectra and maps are many. The counts are recorded so a drop is visible in the JSON.
MIN_NUMBERS = {
    "eeg_timeseries": 100, "eeg_psd": 20, "eeg_spectrogram": 100, "eeg_topography": 5,
    "gsr_statistics": 3, "gsr_timeseries": 20, "pupil_distance": 3,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--workdir", required=True)
    parser.add_argument("--tools-dir")
    parser.add_argument("--out", required=True)
    parser.add_argument("--scenarios", type=int, default=3, help="scenarios per report")
    args = parser.parse_args()

    work = pathlib.Path(args.workdir).resolve()
    work.mkdir(parents=True, exist_ok=True)
    for name in ("parquet_cache", "image_cache", "video_cache", "video_frame_cache"):
        os.environ[name.upper() + "_DIR"] = str(work / name)

    tools = tools_dir(args)
    if tools.is_dir():
        os.environ["PATH"] = str(tools) + os.pathsep + os.environ.get("PATH", "")

    from neurodatics.local import offline_guard

    offline_guard.install()

    with stage("environment") as rec:
        rec.update(
            frozen=bool(getattr(sys, "frozen", False)),
            meipass=getattr(sys, "_MEIPASS", None),
            executable=sys.executable,
            python=sys.version.split()[0],
            platform=platform.platform(),
            tools_dir=str(tools),
            ffmpeg=shutil.which("ffmpeg"),
            ffprobe=shutil.which("ffprobe"),
            cwd=os.getcwd(),
        )
        assert rec["ffmpeg"] and rec["ffprobe"], "ffmpeg and ffprobe must be on PATH from the package tools folder"

    with stage("offline_guard_live") as rec:
        # The guard is only evidence if it demonstrably refuses in this runtime, on both paths.
        import asyncio
        import socket

        before = len(offline_guard.BLOCKED)
        try:
            socket.create_connection(("203.0.113.9", 9), timeout=1)
            raise AssertionError("synchronous connect to a non-loopback address was not refused")
        except OSError:
            pass
        try:
            asyncio.run(asyncio.open_connection("203.0.113.9", 9))
            raise AssertionError("asyncio connect to a non-loopback address was not refused")
        except OSError:
            pass
        refused = offline_guard.BLOCKED[before:]
        rec["refused"] = refused
        assert any(entry.startswith("asyncio connect") for entry in refused), refused
        assert any(entry.startswith(("connect ", "getaddrinfo ")) for entry in refused), refused
        del offline_guard.BLOCKED[before:]  # these two were deliberate

    from neurodatics.modules.projects.application.services.csv_processing_service import CsvProcessingService
    from neurodatics.modules.projects.application.services.stimulus_probe_service import probe_stimulus
    from neurodatics.modules.projects.application.services.zip_extraction_service import ZipExtractionService
    from neurodatics.modules.projects.application.services.zip_validation_service import (
        UploadSelection, ZipValidationService,
    )

    zip_path = pathlib.Path(args.zip).resolve()
    processed = work / "processed"
    state: dict = {}

    with stage("ingest_zip") as rec:
        entries, counts, selection, acquisition, excluded = ZipValidationService.validate_and_analyze(
            filename=zip_path.name, mime_type="application/zip",
            zip_path=str(zip_path), selection=UploadSelection(),
        )
        ingested = [e for e in entries if e.kind in {"raw_csv", "scenario_image", "scenario_video"}]
        rec["manifest_counts"] = counts
        rec["acquisition_recordings"] = len(acquisition.recordings)
        shutil.rmtree(processed, ignore_errors=True)
        processed.mkdir(parents=True)
        media_dir = work / "media"
        shutil.rmtree(media_dir, ignore_errors=True)
        media_dir.mkdir(parents=True)
        t0 = time.perf_counter()
        with ZipExtractionService.extract_to_temp(str(zip_path), ingested) as extracted:
            rec["extract_seconds"] = round(time.perf_counter() - t0, 2)
            csv_entry = next(e for e in ingested if e.kind == "raw_csv")
            for entry in ingested:
                if entry.kind != "raw_csv":
                    target = media_dir / pathlib.PurePosixPath(entry.source_entry_path).name
                    shutil.copyfile(extracted.files_by_entry_path[entry.source_entry_path], target)
                    state.setdefault("media", []).append((entry.kind, str(target)))
            t1 = time.perf_counter()
            result = CsvProcessingService.process(
                extracted.files_by_entry_path[csv_entry.source_entry_path], str(processed),
                screen_geometry=None, stimulus_placements_by_scenario={},
            )
            rec["csv_process_seconds"] = round(time.perf_counter() - t1, 2)
        rec["sensors"] = result.detected_sensors
        rec["participants"] = len(result.participants)
        rec["user_parquets"] = len(result.user_parquet_paths)
        rec["scenario_parquets"] = len(result.scenario_parquet_paths)
        rec["parquet_mb"] = round(
            sum(pathlib.Path(p).stat().st_size for _, p in result.user_parquet_paths) / 1048576
            + sum(pathlib.Path(p).stat().st_size for _, _, p in result.scenario_parquet_paths) / 1048576, 1,
        )
        assert rec["participants"] > 0 and rec["user_parquets"] > 0 and rec["scenario_parquets"] > 0, rec
        state["result"] = result

    with stage("media_probe_and_ffmpeg") as rec:
        media = state.get("media", [])
        images = [p for k, p in media if k == "scenario_image"]
        videos = [p for k, p in media if k == "scenario_video"]
        # probe_stimulus never raises: a broken ffprobe shows up as null dimensions, so the
        # dimensions themselves are what has to be checked.
        assert images and videos, f"the gate fixture must carry images and a video (images={len(images)}, videos={len(videos)})"
        probed = {}
        for kind, path in media:
            dims = probe_stimulus(path, kind)
            assert dims.width and dims.width > 0 and dims.height and dims.height > 0, (path, dims)
            if kind == "scenario_video":
                assert dims.fps and dims.fps > 0 and dims.duration_ms and dims.duration_ms > 0, (path, dims)
            probed[pathlib.Path(path).name] = [dims.width, dims.height, dims.fps, dims.duration_ms]
        rec["probed"] = probed
        rec["digest"] = digest(probed)
        frame = work / "frame.jpg"
        frame.unlink(missing_ok=True)
        completed = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "1.000", "-i", videos[0],
             "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2", "-q:v", "3", "-y", str(frame)],
            capture_output=True, text=True, timeout=60, check=False,
        )
        rec["ffmpeg_returncode"] = completed.returncode
        rec["ffmpeg_frame_bytes"] = frame.stat().st_size if frame.exists() else 0
        assert frame.exists() and frame.stat().st_size > 1000, completed.stderr[-300:]

    import pandas as pd

    from neurodatics.modules.analytics.application.services.eeg_analytics_service import EegAnalyticsService
    from neurodatics.modules.analytics.application.services.gsr_analytics_service import GsrAnalyticsService
    from neurodatics.modules.analytics.application.services.heatmap_analytics_service import HeatmapAnalyticsService
    from neurodatics.modules.analytics.application.services.pupil_analytics_service import PupilAnalyticsService

    frames: dict[str, "pd.DataFrame"] = {}
    with stage("read_parquet") as rec:
        for index, path in state["result"].user_parquet_paths:
            frames[f"SAIO-{index:02d}"] = pd.read_parquet(path)
        first = next(iter(frames.values()))
        rec["frames"] = len(frames)
        rec["first_frame_shape"] = list(first.shape)
        counts_by_scenario = first["scenario"].value_counts()
        state["scenario"] = str(counts_by_scenario.index[0])
        rec["scenario_used"] = state["scenario"]
        state["first"] = first

    with stage("analytics") as rec:
        df, scenario = state["first"], state["scenario"]
        out = {}
        out["eeg_timeseries"] = EegAnalyticsService.compute_timeseries(df, scenario=scenario)
        out["eeg_psd"] = EegAnalyticsService.compute_psd(df, scenario=scenario)
        out["eeg_spectrogram"] = EegAnalyticsService.compute_spectrogram(df, scenario=scenario)
        out["eeg_topography"] = EegAnalyticsService.compute_topography(df, scenario=scenario)
        out["gsr_statistics"] = GsrAnalyticsService.compute_statistics(df, scenario=scenario)
        out["gsr_timeseries"] = GsrAnalyticsService.compute_timeseries(df, scenario=scenario)
        out["pupil_distance"] = PupilAnalyticsService.compute_distance_statistics(df, scenario=scenario)
        png, meta = HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(
            df, scenario=scenario, width=1280, height=720,
        )
        out["heatmap_meta"] = meta
        rec["heatmap_png_bytes"] = len(png) if png else 0
        rec["digests"] = {name: digest(value) for name, value in out.items()}
        rec["finite_numbers"] = {name: finite_numbers(value) for name, value in out.items()}
        assert rec["heatmap_png_bytes"] > 1000 and png[:8] == b"\x89PNG\r\n\x1a\n", "heatmap is not a real PNG"
        assert meta, "heatmap metadata is empty"
        empty = {
            name: (rec["finite_numbers"][name], minimum)
            for name, minimum in MIN_NUMBERS.items()
            if rec["finite_numbers"][name] < minimum
        }
        assert not empty, f"analytics returned too little (found, needed): {empty}"

    from datetime import datetime, timezone

    from neurodatics.modules.reports.application.sensor_reports import common, eeg, eye_tracking, gsr
    from neurodatics.modules.reports.infrastructure.pdf_adapter import PDFAdapter

    def stimulus_for(name: str):
        for kind, path in state.get("media", []):
            if kind == "scenario_image" and pathlib.Path(path).stem == name:
                return pathlib.Path(path).read_bytes()
        return None

    with stage("reports_typst") as rec:
        codes = list(frames)
        names = [str(n) for n in state["first"]["scenario"].value_counts().index[: args.scenarios]]
        pdfs = {}
        for device, builder, group in (("GSR", gsr.build, True), ("EEG", eeg.build, True), ("EyeTracker", eye_tracking.build, False)):
            use = codes if group else codes[:1]
            participants = [
                common.ReportParticipant(code, alias, color, frames[code])
                for code, alias, color in common.participant_aliases(use)
            ]
            scenarios = [
                common.ReportScenario(name, name, position, [], stimulus_for(name))
                for position, name in enumerate(names, start=1)
            ]
            context = common.ReportContext(
                project_name="Self-test", device=common.DEVICES[device], participants=participants,
                scenarios=scenarios, group=group, generated_at=datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc),
            )
            started = time.perf_counter()
            document = builder(context)
            pdf = PDFAdapter().render(document.as_json(), document.assets, timestamp=context.generated_at)
            assert pdf.startswith(b"%PDF") and len(pdf) > 5000, f"{device} report is not a real PDF"
            (work / f"report-{device}.pdf").write_bytes(pdf)
            pdfs[device] = {"bytes": len(pdf), "seconds": round(time.perf_counter() - started, 2), "scenarios": names}
        rec["pdfs"] = pdfs

    RESULTS["network_attempts_blocked"] = list(offline_guard.BLOCKED)
    RESULTS["all_ok"] = all(s["ok"] for s in RESULTS["stages"].values()) and not offline_guard.BLOCKED
    pathlib.Path(args.out).write_text(json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: (v if k != "stages" else {n: s["ok"] for n, s in v.items()}) for k, v in RESULTS.items()}, default=str))
    return 0 if RESULTS["all_ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

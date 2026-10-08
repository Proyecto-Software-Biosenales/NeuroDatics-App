"""Repeat G00 media/report flows for G12 without changing the original evidence."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace as NS
from uuid import UUID

import g12_backend as baseline
import pandas as pd
import pytest
from starlette.requests import Request
from neurodatics.modules.projects.api import routes
from neurodatics.modules.reports.application.sensor_reports import eye_tracking
from neurodatics.modules.reports.infrastructure.pdf_adapter import PDFAdapter


def main():
    runtime = baseline.ROOT / "output/perf-g12/backend"
    runtime.mkdir(parents=True, exist_ok=True)
    result = {"scope": "real FFmpeg and Typst, synthetic media and data, no database/storage/network", "results": []}
    fixture = baseline.load_fixture_module()
    with tempfile.TemporaryDirectory(prefix="g00-media-", dir=runtime) as temporary:
        directory = Path(temporary)
        class Factory:
            def mktemp(self, name):
                target = directory / name
                target.mkdir()
                return target
        corpus = fixture.corpus.__wrapped__(Factory())
        aois = fixture.aois.__wrapped__()
        spec = importlib.util.spec_from_file_location("g00_report_fixture", baseline.ROOT / "backend/tests/characterization/test_sensor_reports.py")
        report_fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(report_fixture)
        context = report_fixture._context(corpus.frames, aois, "EyeTracker", group=True)
        video = directory / "synthetic.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=duration=2:size=320x240:rate=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", str(video)], check=True, capture_output=True)
        result["video"] = {"fixture": "FFmpeg testsrc2, 2s, 320x240, 10 fps", "bytes": video.stat().st_size,
                           "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, check=True).stdout.splitlines()[0]}
        frame_path = directory / "participant.parquet"
        corpus.frames["SYN-01"].to_parquet(frame_path, index=False)
        calls = [0]
        frame_dir = [directory / "frames-0"]
        project_file = NS(id=UUID(int=300), project_id=fixture.PROJECT_ID, external_id="synthetic", mime_type="video/mp4", file_size=video.stat().st_size, updated_at=None)
        real_run = subprocess.run
        real_read = routes._read_video_frame_cache
        real_events = eye_tracking.FixationEventService.build_events
        class Reader:
            def __init__(self, db):
                pass
            async def resolve_cache_generation(self, project_id):
                baseline.COUNTERS["generation_resolution"] += 1
                return 3
            async def read_from_cache_only(self, *args, projection=None):
                assert projection is not None and projection.name == "video-preview-timing"
                baseline.COUNTERS["parquet_reads"] += 1
                return pd.read_parquet(frame_path)
        async def owned(project_id, file_id, user_id, db):
            assert project_id == fixture.PROJECT_ID and file_id == project_file.id and user_id == str(fixture.USER_ID)
            baseline.COUNTERS["owner_lookup_simulated"] += 1
            return project_file
        async def source(*args):
            baseline.COUNTERS["video_source_cache_hits"] += 1
            return video
        def process(args, **kwargs):
            command = str(args[0]).lower()
            if "ffprobe" in command:
                baseline.COUNTERS["ffprobe"] += 1
            elif "ffmpeg" in command:
                baseline.COUNTERS["ffmpeg"] += 1
            return real_run(args, **kwargs)
        def jpeg_read(path):
            baseline.COUNTERS["jpeg_cache_checks"] += 1
            response = real_read(path)
            if response:
                baseline.COUNTERS["jpeg_body_reads"] += 1
                baseline.COUNTERS["jpeg_bytes_read"] += len(response)
            return response
        def events(*args, **kwargs):
            baseline.COUNTERS["event_builds"] += 1
            return real_events(*args, **kwargs)
        def fresh_dir():
            calls[0] += 1
            frame_dir[0] = directory / f"frames-{calls[0]}"
            frame_dir[0].mkdir()
        def preview(time, etag=None):
            request = Request({"type": "http", "headers": [] if etag is None else [(b"if-none-match", etag.encode())]})
            response = asyncio.run(routes.get_project_file_preview(fixture.PROJECT_ID, project_file.id, request, time_s=time, scenario="stimulus-b", participant_code="SYN-01", current_user=str(fixture.USER_ID), db=None))
            assert response.status_code == (304 if etag else 200)
            if etag:
                assert not response.body
            else:
                assert response.body.startswith(b"\xff\xd8")
            baseline.COUNTERS["response_bytes"] += len(response.body)
            return response
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(routes, "ParquetReaderService", Reader)
            patch.setattr(routes, "_load_project_file", owned)
            patch.setattr(routes, "_ensure_video_source_cached", source)
            patch.setattr(routes, "_video_frame_cache_path", lambda key, time: frame_dir[0] / f"{time:.1f}.jpg")
            patch.setattr(routes, "_read_video_frame_cache", jpeg_read)
            patch.setattr(subprocess, "run", process)
            patch.setattr(eye_tracking.FixationEventService, "build_events", staticmethod(events))
            def cold():
                fresh_dir()
                return preview(8.1)
            result["results"].append(baseline.measure("video/cold_frame_local_source", cold, 5))
            cached = preview(8.1)
            result["results"].append(baseline.measure("video/frame_disk_hit", lambda: preview(8.1), 5))
            result["results"].append(baseline.measure("video/frame_304", lambda: preview(8.1, cached.headers["etag"]), 5))
            def scrub():
                fresh_dir()
                return [preview(t) for t in (8.1, 8.2, 8.3)]
            result["results"].append(baseline.measure("video/three_distinct_frames", scrub, 5))
            def report():
                document = eye_tracking.build(context)
                pdf = PDFAdapter().render(document.as_json(), document.assets, timestamp=context.generated_at)
                assert pdf.startswith(b"%PDF")
                baseline.COUNTERS["pdf_bytes"] += len(pdf)
                baseline.COUNTERS["report_assets"] += len(document.assets)
                return pdf
            result["results"].append(baseline.measure("small/report_group_eye_build_and_pdf", report, 5))
    result["limits"] = ["video source already local; no download timing", "direct async route call with simulated owner lookup; not auth/HTTP integration", "report data/images already in memory; includes figures and PDF, excludes I/O", "peak RSS is process-lifetime cumulative"]
    evidence = Path(os.environ.get("G00_MEDIA_OUTPUT", str(baseline.ROOT / "docs/perf/ejecucion/evidencia/g12/media-report-g12.json")))
    evidence.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(evidence), "results": [{k: row[k] for k in ("name", "n", "median_ms", "min_ms", "max_ms")} for row in result["results"]]}, indent=2))


if __name__ == "__main__":
    main()

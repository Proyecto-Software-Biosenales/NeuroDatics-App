from __future__ import annotations

import os
from uuid import uuid4

import pandas as pd
import pytest

from neurodatics.modules.projects.api import routes
from neurodatics.modules.analytics.application.services.scenario_timing_service import (
    ScenarioTimingService,
)
from neurodatics.modules.projects.infrastructure import video_preview_metadata as metadata


@pytest.fixture(autouse=True)
def _empty_metadata():
    metadata.clear_video_preview_metadata()
    yield
    metadata.clear_video_preview_metadata()


def test_preview_onset_preserves_nonfinite_and_precision_contract():
    with_negative_infinity = pd.DataFrame(
        {"time": [-float("inf"), 10.123456789], "scenario": ["target", "target"]}
    )
    precise = pd.DataFrame(
        {"time": [10.123456789, 11.0], "scenario": ["target", "target"]}
    )

    assert metadata.compute_preview_scenario_onset_s(
        with_negative_infinity, "target"
    ) is None
    assert (
        metadata.compute_preview_scenario_onset_s(precise, "target")
        == 10.123456789
    )
    assert metadata.compute_preview_scenario_onset_s(precise, "all") is None
    timing = ScenarioTimingService.compute(with_negative_infinity, "target")
    assert timing["onset_s"] == 10.123457
    assert timing["gsr_origin_s"] is None


@pytest.mark.asyncio
async def test_onset_is_reused_by_generation_participant_scenario(monkeypatch):
    reads = []
    generation = ["g1"]
    frame = pd.DataFrame(
        {"time": [10.123456789, 11.0], "scenario": ["target", "target"]}
    )

    class Reader:
        def __init__(self, _db):
            pass

        async def resolve_cache_generation(self, _project_id):
            return generation[0]

        async def read_from_cache_only(self, *args, projection=None):
            reads.append(("cache", args[1], projection))
            return None

        async def read(self, *args, projection=None):
            reads.append(("read", args[1], projection))
            return frame.copy()

    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    project_id = uuid4()

    first = await routes._compute_video_frame_time_s(
        object(), project_id, "p1", "target", 12.12349
    )
    second = await routes._compute_video_frame_time_s(
        object(), project_id, "p1", "target", 12.12349
    )
    await routes._compute_video_frame_time_s(
        object(), project_id, "p2", "target", 12.12349
    )
    generation[0] = "g2"
    await routes._compute_video_frame_time_s(
        object(), project_id, "p1", "target", 12.12349
    )

    assert first == second == 2.0
    assert [(kind, participant) for kind, participant, _ in reads] == [
        ("cache", "p1"),
        ("read", "p1"),
        ("cache", "p2"),
        ("read", "p2"),
        ("cache", "p1"),
        ("read", "p1"),
    ]
    assert all(
        projection.name == "video-preview-timing" for _, _, projection in reads
    )


@pytest.mark.asyncio
async def test_unknown_generation_and_missing_onset_fall_back_safely(monkeypatch):
    reads = 0
    frame = pd.DataFrame(
        {"time": [-float("inf"), 11.0], "scenario": ["target", "target"]}
    )

    class Reader:
        def __init__(self, _db):
            pass

        async def resolve_cache_generation(self, _project_id):
            return None

        async def read_from_cache_only(self, *_args, **_kwargs):
            return None

        async def read(self, *_args, **_kwargs):
            nonlocal reads
            reads += 1
            return frame.copy()

    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    project_id = uuid4()

    assert await routes._compute_video_frame_time_s(
        object(), project_id, "p1", "target", 12.0
    ) == 12.0
    assert await routes._compute_video_frame_time_s(
        object(), project_id, "p1", "target", 12.0
    ) == 12.0
    assert await routes._compute_video_frame_time_s(
        object(), project_id, "p1", "all", 12.0
    ) == 12.0
    assert reads == 2


@pytest.mark.asyncio
async def test_missing_onset_is_cached_for_a_known_generation(monkeypatch):
    reads = 0
    frame = pd.DataFrame(
        {"time": [-float("inf"), 11.0], "scenario": ["target", "target"]}
    )

    class Reader:
        def __init__(self, _db):
            pass

        async def resolve_cache_generation(self, _project_id):
            return "known"

        async def read_from_cache_only(self, *_args, **_kwargs):
            return None

        async def read(self, *_args, **_kwargs):
            nonlocal reads
            reads += 1
            return frame.copy()

    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    project_id = uuid4()

    for _ in range(2):
        assert await routes._compute_video_frame_time_s(
            object(), project_id, "p1", "target", 12.0
        ) == 12.0
    assert reads == 1


def test_duration_reuses_only_an_unchanged_source_file(tmp_path):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"first")
    probes = []

    def probe(path):
        probes.append(path.read_bytes())
        return 6.0

    assert metadata.get_video_duration_s("identity", video, probe) == 6.0
    assert metadata.get_video_duration_s("identity", video, probe) == 6.0

    previous = video.stat().st_mtime_ns
    video.write_bytes(b"other")
    os.utime(video, ns=(previous + 10_000_000, previous + 10_000_000))
    assert metadata.get_video_duration_s("identity", video, probe) == 6.0
    assert probes == [b"first", b"other"]


def test_failed_duration_probe_is_not_cached(tmp_path):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"video")
    results = iter((None, 4.0))

    assert metadata.get_video_duration_s("identity", video, lambda _path: next(results)) is None
    assert metadata.get_video_duration_s("identity", video, lambda _path: next(results)) == 4.0


def test_extract_clamps_to_end_and_falls_back_to_zero(tmp_path, monkeypatch):
    video = tmp_path / "video.mp4"
    frame = tmp_path / "frame.jpg"
    video.write_bytes(b"video")
    calls = []

    monkeypatch.setattr(routes, "get_video_duration_s", lambda *_args: 5.0)

    def extract(_video, output, time_s):
        calls.append(time_s)
        if len(calls) == 1:
            raise RuntimeError("end seek failed")
        output.write_bytes(b"jpeg")

    monkeypatch.setattr(routes, "_run_ffmpeg_frame_extract", extract)

    routes._extract_video_frame(video, frame, 99.0, "identity")

    assert calls == [4.95, 0.0]
    assert frame.read_bytes() == b"jpeg"


def test_cache_stats_are_counts_and_estimates_not_rss(tmp_path):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"video")
    metadata.observe_project_generation("project", "generation")
    metadata.cache_preview_onset("project", "generation", "p1", "s1", 1.0)
    metadata.get_video_duration_s("video", video, lambda _path: 5.0)

    stats = metadata.video_preview_metadata_stats()

    assert stats["onset_items"] == 1
    assert stats["duration_items"] == 1
    assert stats["onset_estimated_bytes"] == 320
    assert stats["duration_estimated_bytes"] == 256


def test_metadata_cache_enforces_ttl_and_lru_capacity(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(metadata.time, "monotonic", lambda: now[0])
    cache = metadata._BoundedTTLCache(max_items=2, ttl_seconds=5)
    cache.put("a", 1)
    cache.put("b", 2)
    assert cache.get("a") == (True, 1)
    cache.put("c", 3)

    assert cache.get("b") == (False, None)
    assert cache.size() == 2
    now[0] += 6
    assert cache.get("a") == (False, None)
    assert cache.get("c") == (False, None)


def test_onset_capacity_bounds_entries_from_excess_projects(monkeypatch):
    small = metadata._BoundedTTLCache(max_items=2, ttl_seconds=300)
    monkeypatch.setattr(metadata, "_onsets", small)
    for project in ("p1", "p2", "p3"):
        metadata.cache_preview_onset(project, "generation", "person", "s1", 1.0)

    assert metadata.get_cached_preview_onset(
        "p1", "generation", "person", "s1"
    ) == (False, None)
    assert metadata.get_cached_preview_onset(
        "p3", "generation", "person", "s1"
    ) == (True, 1.0)
    assert metadata.video_preview_metadata_stats()["onset_max_items"] == 2


def test_project_deletion_invalidation_is_scoped():
    for project in ("p1", "p2"):
        metadata.cache_preview_onset(project, "generation", "person", "s1", 1.0)

    metadata.invalidate_project_video_metadata("p1")

    assert metadata.get_cached_preview_onset(
        "p1", "generation", "person", "s1"
    ) == (False, None)
    assert metadata.get_cached_preview_onset(
        "p2", "generation", "person", "s1"
    ) == (True, 1.0)

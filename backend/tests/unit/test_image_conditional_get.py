"""A stimulus revalidation must not pay for bytes it will never send.

The image ETag derives from ``id:external_id:updated_at``, so a matching
``If-None-Match`` can be answered before any cache tier is read.
"""

import asyncio
import threading
import time
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from starlette.datastructures import Headers

from neurodatics.modules.projects.api import routes
from neurodatics.modules.projects.infrastructure import image_cache


def _project_file():
    return SimpleNamespace(
        id=uuid4(),
        external_id="drive-file",
        mime_type="image/png",
        updated_at=datetime(2026, 9, 1, 12, 0, 0),
    )


def _video_file():
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        external_id="drive-video",
        filename="stimulus.mp4",
        mime_type="video/mp4",
        kind="scenario_video",
        updated_at=datetime(2026, 9, 1, 12, 0, 0),
    )


def _request(if_none_match=None):
    headers = {} if if_none_match is None else {"if-none-match": if_none_match}
    return SimpleNamespace(headers=Headers(headers))


@pytest.mark.asyncio
async def test_matching_etag_is_answered_without_touching_the_disk_cache(monkeypatch):
    project_file = _project_file()
    etag = routes._build_image_etag(routes._project_file_cache_key(project_file))

    def fail_disk_read(_ref):
        raise AssertionError("the disk cache was read for a conditional GET")

    monkeypatch.setattr(image_cache, "_read_disk_cache", fail_disk_read)

    response = await routes._serve_project_file_image(project_file, _request(etag), db=None)

    assert response.status_code == 304
    assert response.headers["etag"] == etag
    assert not response.body


@pytest.mark.asyncio
async def test_stale_etag_still_serves_the_disk_cached_bytes(monkeypatch):
    project_file = _project_file()
    reads = []

    def disk_read(ref):
        reads.append(ref.file_id)
        return b"png-bytes", "image/png"

    monkeypatch.setattr(image_cache, "_read_disk_cache", disk_read)

    response = await routes._serve_project_file_image(
        project_file, _request('"stale"'), db=None
    )

    assert reads == [project_file.id]
    assert response.status_code == 200
    assert response.body == b"png-bytes"
    assert response.headers["x-image-cache"] == "DISK"


@pytest.mark.asyncio
async def test_video_matching_etag_checks_auth_and_identity_but_not_jpeg_bytes(
    tmp_path, monkeypatch
):
    project_file = _video_file()
    frame = tmp_path / "frame.jpg"
    frame.write_bytes(b"jpeg")
    loads = []

    async def load(project_id, file_id, current_user, db):
        loads.append((project_id, file_id, current_user, db))
        return project_file

    async def compute(*_args):
        return 2.0

    def fail_read(_path):
        raise AssertionError("JPEG bytes were read for a conditional GET")

    monkeypatch.setattr(routes, "_load_project_file", load)
    monkeypatch.setattr(routes, "_compute_video_frame_time_s", compute)
    monkeypatch.setattr(routes, "_video_frame_cache_path", lambda *_args: frame)
    monkeypatch.setattr(routes, "_read_video_frame_cache", fail_read)

    cache_key = routes._project_file_cache_key(project_file)
    etag = routes._build_image_etag(f"{cache_key}:frame:2.0")
    response = await routes.get_project_file_preview(
        project_file.project_id,
        project_file.id,
        _request(etag),
        time_s=2.0,
        scenario="all",
        participant_code="p1",
        current_user=str(uuid4()),
        db=object(),
    )

    assert len(loads) == 1
    assert response.status_code == 304
    assert response.headers["etag"] == etag
    assert not response.body


@pytest.mark.asyncio
async def test_video_miss_is_coordinated_once_per_video(tmp_path, monkeypatch):
    project_file = _video_file()
    frame = tmp_path / "frame.jpg"
    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    extractions = 0

    async def load(*_args):
        return project_file

    async def compute(*_args):
        return 2.0

    async def ensure(*_args):
        return source

    def extract(_source, output, _time_s, _identity):
        nonlocal extractions
        extractions += 1
        time.sleep(0.05)
        output.write_bytes(b"jpeg")

    monkeypatch.setattr(routes, "_load_project_file", load)
    monkeypatch.setattr(routes, "_compute_video_frame_time_s", compute)
    monkeypatch.setattr(routes, "_video_frame_cache_path", lambda *_args: frame)
    monkeypatch.setattr(routes, "_ensure_video_source_cached", ensure)
    monkeypatch.setattr(routes, "_extract_video_frame", extract)

    async def request_once():
        return await routes.get_project_file_preview(
            project_file.project_id,
            project_file.id,
            _request(),
            time_s=2.0,
            scenario="all",
            participant_code="p1",
            current_user=str(uuid4()),
            db=object(),
        )

    responses = await asyncio.gather(request_once(), request_once())

    assert extractions == 1
    assert [response.status_code for response in responses] == [200, 200]
    assert sorted(response.headers["x-video-frame-cache"] for response in responses) == [
        "DISK",
        "MISS",
    ]


@pytest.mark.asyncio
async def test_video_lock_entry_survives_unlocked_handoff_window():
    key = f"handoff-{uuid4()}"
    first = await routes._get_video_preview_lock(key)
    queued = await routes._get_video_preview_lock(key)
    assert first is queued
    assert first.users == 2

    await first.lock.acquire()
    waiter_acquired = asyncio.Event()
    release_waiter = asyncio.Event()

    async def wait_for_turn():
        async with queued.lock:
            waiter_acquired.set()
            await release_waiter.wait()

    waiter = asyncio.create_task(wait_for_turn())
    await asyncio.sleep(0)
    first.lock.release()
    await routes._cleanup_video_preview_lock(key, first)
    arriving = await routes._get_video_preview_lock(key)

    assert arriving is first
    assert first.users == 2
    await waiter_acquired.wait()
    release_waiter.set()
    await waiter
    await routes._cleanup_video_preview_lock(key, queued)
    await routes._cleanup_video_preview_lock(key, arriving)
    assert key not in routes._video_preview_locks


@pytest.mark.asyncio
async def test_cancelled_preview_holds_video_lock_until_worker_settles(
    tmp_path, monkeypatch
):
    project_file = _video_file()
    frame = tmp_path / "frame.jpg"
    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    started = threading.Event()
    release = threading.Event()

    async def load(*_args):
        return project_file

    async def compute(*_args):
        return 2.0

    async def ensure(*_args):
        return source

    def extract(_source, output, _time_s, _identity):
        started.set()
        release.wait(timeout=2)
        output.write_bytes(b"jpeg")

    monkeypatch.setattr(routes, "_load_project_file", load)
    monkeypatch.setattr(routes, "_compute_video_frame_time_s", compute)
    monkeypatch.setattr(routes, "_video_frame_cache_path", lambda *_args: frame)
    monkeypatch.setattr(routes, "_ensure_video_source_cached", ensure)
    monkeypatch.setattr(routes, "_extract_video_frame", extract)

    task = asyncio.create_task(
        routes.get_project_file_preview(
            project_file.project_id,
            project_file.id,
            _request(),
            time_s=2.0,
            scenario="all",
            participant_code="p1",
            current_user=str(uuid4()),
            db=object(),
        )
    )
    assert await asyncio.to_thread(started.wait, 1)
    task.cancel()
    await asyncio.sleep(0.02)
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert frame.read_bytes() == b"jpeg"

"""A stimulus revalidation must not pay for bytes it will never send.

The image ETag derives from ``id:external_id:updated_at``, so a matching
``If-None-Match`` can be answered before any cache tier is read.
"""

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from starlette.datastructures import Headers

from neurodatics.modules.projects.api import routes


def _project_file():
    return SimpleNamespace(
        id=uuid4(),
        external_id="drive-file",
        mime_type="image/png",
        updated_at=datetime(2026, 9, 1, 12, 0, 0),
    )


def _request(if_none_match=None):
    headers = {} if if_none_match is None else {"if-none-match": if_none_match}
    return SimpleNamespace(headers=Headers(headers))


@pytest.mark.asyncio
async def test_matching_etag_is_answered_without_touching_the_disk_cache(monkeypatch):
    project_file = _project_file()
    etag = routes._build_image_etag(routes._project_file_cache_key(project_file))

    def fail_disk_read(_file_id):
        raise AssertionError("the disk cache was read for a conditional GET")

    monkeypatch.setattr(routes, "_read_disk_cache", fail_disk_read)

    response = await routes._serve_project_file_image(project_file, _request(etag), db=None)

    assert response.status_code == 304
    assert response.headers["etag"] == etag
    assert not response.body


@pytest.mark.asyncio
async def test_stale_etag_still_serves_the_disk_cached_bytes(monkeypatch):
    project_file = _project_file()
    reads = []

    def disk_read(file_id):
        reads.append(file_id)
        return b"png-bytes", "image/png"

    monkeypatch.setattr(routes, "_read_disk_cache", disk_read)

    response = await routes._serve_project_file_image(
        project_file, _request('"stale"'), db=None
    )

    assert reads == [project_file.id]
    assert response.status_code == 200
    assert response.body == b"png-bytes"
    assert response.headers["x-image-cache"] == "DISK"

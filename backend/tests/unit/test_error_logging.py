"""A request that ends in 5xx leaves its traceback in the log (app.log in the student edition)."""

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from neurodatics.api import middlewares
from neurodatics.config.settings import settings
from neurodatics.modules.projects.api import routes


def errors_with_traceback(caplog):
    return [record for record in caplog.records if record.levelno >= logging.ERROR and record.exc_info]


def test_an_unhandled_error_is_logged_with_its_traceback(caplog):
    app = FastAPI()
    middlewares.register_middlewares(app)

    @app.get("/explota")
    async def explode():
        raise RuntimeError("boom")

    response = TestClient(app).get("/explota")

    assert response.status_code == 500
    logged = errors_with_traceback(caplog)
    assert logged and logged[0].exc_info[0] is RuntimeError
    assert "GET /explota" in logged[0].getMessage()


@pytest.mark.asyncio
async def test_a_failed_project_deletion_is_logged_before_answering_500(monkeypatch, caplog):
    use_case = SimpleNamespace(execute=AsyncMock(side_effect=RuntimeError("db down")))
    monkeypatch.setattr(routes, "DeleteProjectUseCase", lambda *args, **kwargs: use_case)

    with pytest.raises(HTTPException) as answered:
        await routes.delete_project(uuid4(), str(uuid4()), db=AsyncMock())

    assert answered.value.status_code == 500
    assert errors_with_traceback(caplog)


@pytest.mark.asyncio
async def test_a_failed_video_download_is_logged_before_answering_502(monkeypatch, tmp_path, caplog):
    def fail(*args):
        raise OSError("drive down")

    monkeypatch.setattr(settings, "video_cache_dir", str(tmp_path))
    monkeypatch.setattr(
        routes, "build_isolated_drive_client", AsyncMock(return_value=SimpleNamespace(download_file_to_path=fail))
    )
    project_file = SimpleNamespace(id=uuid4(), filename="clip.avi", external_id="drive-id")

    with pytest.raises(HTTPException) as answered:
        await routes._ensure_video_source_cached(project_file, AsyncMock(), "clip")

    assert answered.value.status_code == 502
    assert errors_with_traceback(caplog)

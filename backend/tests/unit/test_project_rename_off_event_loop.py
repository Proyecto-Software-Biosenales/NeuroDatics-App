"""Renaming a project's Drive folder never blocks the event loop (C14)."""

import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from neurodatics.modules.projects.api import routes
from neurodatics.modules.projects.api.schemas import UpdateProjectRequest


@pytest.mark.asyncio
async def test_the_drive_rename_runs_in_a_worker_thread(monkeypatch):
    project = SimpleNamespace(id=uuid4(), drive_root_folder_id="folder", drive_root_folder_name="old", name="old")
    repository = SimpleNamespace(
        get_basic_by_id=AsyncMock(return_value=project),
        get_by_owner_and_name=AsyncMock(return_value=None),
        update=AsyncMock(),
        get_summary_by_id=AsyncMock(return_value=None),
    )
    threads = []

    def rename_file(folder_id, name):
        threads.append(threading.current_thread())
        return {"name": name}

    monkeypatch.setattr(routes, "SQLProjectRepository", lambda db: repository)
    monkeypatch.setattr(routes, "configure_gdrive_client_with_oauth", AsyncMock(return_value=True))
    monkeypatch.setattr(routes.gdrive_client, "rename_file", rename_file)

    with pytest.raises(HTTPException):  # the stub repository has nothing to re-load
        await routes.update_project(project.id, UpdateProjectRequest(name="nuevo"), str(uuid4()), db=AsyncMock())

    assert threads and threads[0] is not threading.current_thread()
    assert project.drive_root_folder_name.startswith("nuevo-")

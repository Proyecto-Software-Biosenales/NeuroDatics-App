from uuid import uuid4

import pytest
from fastapi import FastAPI, File, UploadFile
from fastapi.testclient import TestClient

from neurodatics.config.security import create_access_token
from neurodatics.config.settings import settings
from neurodatics.modules.projects.api.upload_route import (
    BoundedUploadParser,
    ProjectUploadRoute,
)
from neurodatics.modules.projects.application.services.zip_validation_service import (
    ZipValidationService,
)


@pytest.fixture
def upload_app(monkeypatch):
    monkeypatch.setattr(settings, "upload_min_seconds_between_uploads", 0)
    app = FastAPI()
    app.router.route_class = ProjectUploadRoute

    @app.post("/projects/{project_id}/files/experiment-zip")
    async def upload(project_id: str, file: UploadFile = File(...)):
        return {"size": len(await file.read())}

    return app


def auth():
    return {"Authorization": "Bearer " + create_access_token(str(uuid4()), None, None)}


@pytest.mark.asyncio
async def test_anonymous_upload_is_rejected_without_receiving_body(upload_app):
    calls, sent = [], []

    async def receive():
        calls.append(True)
        return {
            "type": "http.request",
            "body": b"body must not be read",
            "more_body": False,
        }

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/projects/test/files/experiment-zip",
        "raw_path": b"/projects/test/files/experiment-zip",
        "root_path": "",
        "query_string": b"",
        "headers": [],
        "server": ("test", 80),
        "client": ("test", 1),
    }
    await upload_app(scope, receive, send)
    assert calls == []
    assert sent[0]["status"] == 401


def test_oversized_declared_body_rejected_before_multipart(upload_app, monkeypatch):
    monkeypatch.setattr(ZipValidationService, "get_max_file_size_bytes", lambda: 1)
    response = TestClient(upload_app).post(
        "/projects/test/files/experiment-zip",
        headers={
            **auth(),
            "Content-Length": str(3 * 1024 * 1024),
            "Content-Type": "multipart/form-data; boundary=x",
        },
        content=b"not a multipart archive",
    )
    assert response.status_code == 413


def test_chunked_body_limit_counts_actual_bytes(upload_app, monkeypatch):
    monkeypatch.setattr(ZipValidationService, "get_max_file_size_bytes", lambda: 1)
    chunks = [
        b'--x\r\nContent-Disposition: form-data; name="file"; filename="x.zip"\r\n\r\n',
        b"x" * (2 * 1024 * 1024),
        b"\r\n--x--\r\n",
    ]
    response = TestClient(upload_app).post(
        "/projects/test/files/experiment-zip",
        headers={
            **auth(),
            "Content-Type": "multipart/form-data; boundary=x",
        },
        content=iter(chunks),
    )
    assert response.status_code == 413


def test_non_file_fields_have_small_memory_limit(upload_app, monkeypatch):
    monkeypatch.setattr(BoundedUploadParser, "MAX_FIELD_BYTES", 32)
    response = TestClient(upload_app).post(
        "/projects/test/files/experiment-zip",
        headers=auth(),
        files={"file": ("x.zip", b"data", "application/zip")},
        data={"selected_csv_path": "x" * 33},
    )
    assert response.status_code == 400


def test_multiple_upload_parts_are_rejected_and_open_spools_closed(
    upload_app, monkeypatch
):
    parsed = []
    original = BoundedUploadParser.parse

    async def capture(self):
        try:
            return await original(self)
        finally:
            parsed.extend(self._files_to_close_on_error)

    monkeypatch.setattr(BoundedUploadParser, "parse", capture)
    response = TestClient(upload_app).post(
        "/projects/test/files/experiment-zip",
        headers=auth(),
        files=[
            ("file", ("one.zip", b"one")),
            ("file", ("two.zip", b"two")),
        ],
    )
    assert response.status_code == 400
    assert parsed and all(file.closed for file in parsed)


def test_duplicate_selection_fields_are_rejected(upload_app):
    response = TestClient(upload_app).post(
        "/projects/test/files/experiment-zip",
        headers=auth(),
        files=[
            ("file", ("one.zip", b"one")),
            ("selected_csv_path", (None, "one.csv")),
            ("selected_csv_path", (None, "two.csv")),
        ],
    )
    assert response.status_code == 400


def test_normal_upload_is_parsed_once_and_releases_admission_slot(upload_app):
    client, headers = TestClient(upload_app), auth()
    for _ in range(2):
        response = client.post(
            "/projects/test/files/experiment-zip",
            headers=headers,
            files={"file": ("x.zip", b"1234")},
        )
        assert response.status_code == 200
        assert response.json() == {"size": 4}

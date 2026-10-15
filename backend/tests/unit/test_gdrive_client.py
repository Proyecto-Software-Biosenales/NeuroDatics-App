import hashlib
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import httplib2
import pytest
from googleapiclient.errors import HttpError
from googleapiclient.http import HttpRequest

import neurodatics.infra.storage.gdrive_client as gdrive_module


def test_drive_transport_preserves_resumable_upload_308(monkeypatch):
    captured = {}
    service = object()

    def fake_build(api_name, api_version, *, http, cache_discovery):
        assert (api_name, api_version) == ("drive", "v3")
        assert cache_discovery is False
        captured["authorized_http"] = http
        return service

    monkeypatch.setattr(gdrive_module, "build", fake_build)

    client = gdrive_module.GoogleDriveClient()
    client.set_oauth_credentials(object())
    client._initialize_service()

    assert client._service is service
    assert client._initialization_error is None

    base_http = captured["authorized_http"].http
    assert base_http.timeout == max(
        30, int(gdrive_module.settings.gdrive_http_timeout_seconds)
    )
    assert 308 not in base_http.redirect_codes
    assert 307 in base_http.redirect_codes


def test_worker_threads_have_isolated_transports_and_credential_refresh(monkeypatch):
    built = []

    def fake_build(*args, http, **kwargs):
        service = SimpleNamespace(http=http, closed=False)
        service.close = lambda: setattr(service, "closed", True)
        built.append(service)
        return service

    monkeypatch.setattr(gdrive_module, "build", fake_build)
    client = gdrive_module.GoogleDriveClient()
    original_credentials = SimpleNamespace(token="original")
    client.set_oauth_credentials(original_credentials)
    ready = threading.Barrier(3)
    updated = threading.Event()

    def work():
        first = client._require_service()
        assert client._require_service() is first
        first.http.credentials.token = "worker refreshed"
        ready.wait(timeout=5)
        assert updated.wait(timeout=5)
        second = client._require_service()
        assert client._require_service() is second
        return first, second

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(work) for _ in range(2)]
        ready.wait(timeout=5)
        client.set_oauth_credentials(SimpleNamespace(token="replacement"))
        updated.set()
        pairs = [future.result(timeout=5) for future in futures]

    assert original_credentials.token == "original"
    assert len(built) == 4
    assert len({id(service.http.http) for service in built}) == 4
    assert len({id(service.http.credentials) for service in built}) == 4
    for first, second in pairs:
        assert first.closed
        assert first is not second
        assert second.http.credentials.token == "replacement"


def test_credentials_rotated_during_initialization_are_not_published(monkeypatch):
    started = threading.Event()
    proceed = threading.Event()
    built = []

    def fake_build(*args, http, **kwargs):
        service = SimpleNamespace(http=http, closed=False)
        service.close = lambda: setattr(service, "closed", True)
        built.append(service)
        if len(built) == 1:
            started.set()
            assert proceed.wait(timeout=5)
        return service

    monkeypatch.setattr(gdrive_module, "build", fake_build)
    client = gdrive_module.GoogleDriveClient()
    client.set_oauth_credentials(SimpleNamespace(token="old"))
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(client._require_service)
        assert started.wait(timeout=5)
        client.set_oauth_credentials(SimpleNamespace(token="new"))
        proceed.set()
        service = pending.result(timeout=5)
    assert service.http.credentials.token == "new"
    assert built[0].closed
    assert len(built) == 2


def test_clear_credentials_invalidates_other_thread_service(monkeypatch):
    monkeypatch.setattr(gdrive_module.settings, "google_application_credentials", None)
    monkeypatch.setattr(gdrive_module.settings, "gdrive_service_account_json", None)
    monkeypatch.setattr(
        gdrive_module, "build", lambda *args, **kwargs: SimpleNamespace(close=lambda: None)
    )
    client = gdrive_module.GoogleDriveClient()
    client.set_oauth_credentials(SimpleNamespace(token="old"))
    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(client._require_service).result(timeout=5)
        client.clear_oauth_credentials()
        with pytest.raises(RuntimeError, match="initialize"):
            executor.submit(client._require_service).result(timeout=5)


class Request:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.retry_counts = []

    def execute(self, *, num_retries):
        self.retry_counts.append(num_retries)
        if self.error is not None:
            raise self.error
        return self.response

    def next_chunk(self, *, num_retries):
        return None, self.execute(num_retries=num_retries)


class DriveFiles:
    def __init__(self, payload=b"sample", result=None):
        self.result = result if result is not None else {
            "id": "allocated-id",
            "size": str(len(payload)),
            "sha256Checksum": hashlib.sha256(payload).hexdigest(),
        }
        self.create_request = Request(self.result)
        self.get_request = Request(self.result)
        self.delete_request = Request()
        self.created = []
        self.looked_up = []
        self.deleted = []

    def generateIds(self, **kwargs):
        assert kwargs == {"count": 1, "space": "drive"}
        return Request({"ids": ["allocated-id"]})

    def create(self, **kwargs):
        self.created.append(kwargs)
        return self.create_request

    def get(self, **kwargs):
        self.looked_up.append(kwargs["fileId"])
        return self.get_request

    def delete(self, *, fileId):
        self.deleted.append(fileId)
        return self.delete_request


def client_with_files(files):
    client = gdrive_module.GoogleDriveClient()
    client._service = SimpleNamespace(files=lambda: files)
    return client


@pytest.mark.parametrize("on_disk", [False, True])
def test_upload_verifies_bytes_and_closes_stream(tmp_path, on_disk):
    payload = b"participant,time,value\n1,2,3\n"
    files = DriveFiles(payload)
    client = client_with_files(files)
    if on_disk:
        path = tmp_path / "signal.csv"
        path.write_bytes(payload)
        source = {"local_path": str(path)}
    else:
        source = {"file_content": payload}
    result = client.upload_file("signal.csv", "text/csv", **source)

    assert result["size_bytes"] == len(payload)
    assert result["checksum_sha256"] == hashlib.sha256(payload).hexdigest()
    assert files.created[0]["body"]["id"] == "allocated-id"
    assert "sha256Checksum" in files.created[0]["fields"]
    media = files.created[0]["media_body"]
    assert media.chunksize() == client.UPLOAD_CHUNK_SIZE
    assert media.stream().closed
    assert not files.deleted


def test_upload_accepts_drive_md5_when_sha256_not_available():
    payload = b"sample"
    files = DriveFiles(result={
        "id": "allocated-id", "size": "6", "md5Checksum": hashlib.md5(payload).hexdigest()
    })
    assert client_with_files(files).upload_file(
        "sample.csv", "text/csv", file_content=payload
    )["size_bytes"] == 6


@pytest.mark.parametrize("metadata", [
    {"size": "5"}, {"size": "invalid"}, {"size": None},
    {"sha256Checksum": "wrong"}, {"sha256Checksum": None},
])
def test_failed_upload_integrity_is_deleted_and_rejected(metadata):
    files = DriveFiles()
    files.result.update(metadata)
    with pytest.raises(gdrive_module.GoogleDriveOperationError, match="integrity") as caught:
        client_with_files(files).upload_file("sample.csv", "text/csv", file_content=b"sample")
    assert caught.value.drive_file_id == "allocated-id"
    assert files.deleted == ["allocated-id"]
    assert files.created[0]["media_body"].stream().closed


def test_missing_upload_size_is_rejected():
    files = DriveFiles()
    files.result.pop("size")
    with pytest.raises(gdrive_module.GoogleDriveOperationError, match="integrity"):
        client_with_files(files).upload_file("sample.csv", "text/csv", file_content=b"sample")
    assert files.deleted == ["allocated-id"]


@pytest.mark.parametrize("upload", [False, True])
@pytest.mark.parametrize("error", [
    OSError("private token should not appear"),
    HttpError(httplib2.Response({"status": "409"}), b"conflict"),
])
def test_lost_creation_response_recovers_exact_preallocated_id(monkeypatch, upload, error):
    monkeypatch.setattr(gdrive_module.settings, "gdrive_request_retries", 0)
    files = DriveFiles()
    files.create_request = Request(error=error)
    client = client_with_files(files)
    if upload:
        result = client.upload_file("sample.csv", "text/csv", file_content=b"sample")
    else:
        result = client.create_folder("experiment")
    assert result["drive_file_id"] == "allocated-id"
    assert len(files.created) == 1
    assert files.looked_up == ["allocated-id"]
    assert not files.deleted


def test_unknown_creation_outcome_retains_id_when_compensation_fails(monkeypatch, caplog):
    monkeypatch.setattr(gdrive_module.settings, "gdrive_request_retries", 0)
    files = DriveFiles()
    files.create_request = Request(error=OSError("private secret"))
    files.get_request = Request(error=OSError("private secret"))
    files.delete_request = Request(error=OSError("private secret"))
    with pytest.raises(gdrive_module.GoogleDriveOperationError) as caught:
        client_with_files(files).create_folder("experiment")
    assert caught.value.drive_file_id == "allocated-id"
    assert "private secret" not in str(caught.value)
    assert "private secret" not in caplog.text
    assert files.deleted == ["allocated-id"]


def test_rejected_creation_is_not_retried_or_reconciled(monkeypatch):
    monkeypatch.setattr(gdrive_module, "time", SimpleNamespace(sleep=lambda _delay: pytest.fail("retried")))
    files = DriveFiles()
    files.create_request = Request(error=HttpError(httplib2.Response({"status": "403"}), b"forbidden"))
    with pytest.raises(gdrive_module.GoogleDriveOperationError):
        client_with_files(files).upload_file("sample.csv", "text/csv", file_content=b"sample")
    assert files.looked_up == []
    assert files.deleted == ["allocated-id"]


@pytest.mark.parametrize("failure", [OSError("connection lost"), "server_error"])
def test_resumable_retry_queries_acknowledged_offset_after_consuming_chunk(monkeypatch, failure):
    monkeypatch.setattr(gdrive_module.settings, "gdrive_request_retries", 2)
    monkeypatch.setattr(gdrive_module.time, "sleep", lambda seconds: None)
    payload = b"abcdefgh"
    files = DriveFiles(payload)
    calls = []

    class Transport:
        def request(self, _uri, method, body=None, headers=None):
            data = body.read() if hasattr(body, "read") else body
            calls.append((method, data, headers))
            if len(calls) == 1:
                return httplib2.Response({"status": "200", "location": "https://upload.test/session"}), b""
            if len(calls) == 2:
                assert data == b"abcd"
                if failure == "server_error":
                    return httplib2.Response({"status": "503"}), b"temporary failure"
                raise failure
            if len(calls) == 3:
                assert headers["Content-Range"] == "bytes */8"
                assert data is None
                return httplib2.Response({"status": "308", "range": "bytes=0-3"}), b""
            assert len(calls) == 4
            assert data == b"efgh"
            assert headers["Content-Range"] == "bytes 4-7/8"
            return httplib2.Response({"status": "200"}), json.dumps(files.result).encode()

    def create(**kwargs):
        files.created.append(kwargs)
        return HttpRequest(
            Transport(), lambda response, content: json.loads(content),
            "https://drive.test/files", method="POST", body=json.dumps(kwargs["body"]),
            resumable=kwargs["media_body"],
        )

    files.create = create
    client = client_with_files(files)
    client.UPLOAD_CHUNK_SIZE = 4
    result = client.upload_file("sample.bin", "application/octet-stream", file_content=payload)
    assert result["size_bytes"] == 8
    assert not files.deleted
    assert not files.looked_up
    assert len(calls) == 4


def test_retry_budget_is_bounded(monkeypatch):
    monkeypatch.setattr(gdrive_module.settings, "gdrive_request_retries", 2)
    monkeypatch.setattr(gdrive_module.time, "sleep", lambda seconds: None)
    files = DriveFiles()
    files.create_request = Request(error=OSError("connection lost"))
    files.get_request = Request(error=OSError("connection lost"))
    with pytest.raises(gdrive_module.GoogleDriveOperationError):
        client_with_files(files).upload_file("sample.csv", "text/csv", file_content=b"sample")
    assert files.create_request.retry_counts == [0, 0, 0]
    assert files.created[0]["media_body"].stream().closed


@pytest.mark.parametrize("sources", [{}, {"file_content": b"data", "local_path": "local.csv"}])
def test_upload_requires_exactly_one_source(sources):
    with pytest.raises(ValueError, match="exactly one"):
        gdrive_module.GoogleDriveClient().upload_file("data.csv", "text/csv", **sources)

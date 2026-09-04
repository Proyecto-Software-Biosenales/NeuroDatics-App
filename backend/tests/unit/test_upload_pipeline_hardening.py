"""Auth, path confinement and admission control around the upload pipeline."""

import pytest
from fastapi.testclient import TestClient

from neurodatics.config.settings import settings
from neurodatics.main import app
from neurodatics.modules.projects.application.services.upload_throttle import (
    UploadAdmissionControl,
    UploadRejected,
)


client = TestClient(app, raise_server_exceptions=False)


# --------------------------------------------------------------------- auth

# Every route that used to be reachable with no credentials at all.
GUARDED_ROUTES = [
    ("GET", "/api/integrations/google-drive/authorize", {}),
]

RETIRED_ROUTES = [
    ("GET", "/api/integrations/google-drive/status", {}),
    ("DELETE", "/api/integrations/google-drive", {}),
    ("POST", "/api/integrations/google-drive/create-folder", {"folder_name": "x"}),
    ("POST", "/api/integrations/google-drive/sync-folder", {"local_folder_path": "/data"}),
    ("POST", "/api/integrations/google-drive/sync-folder-scheduled", {"local_folder_path": "/data"}),
    ("GET", "/api/integrations/google-drive/sync-status/sync_1", {}),
    ("GET", "/api/integrations/google-drive/sync-tasks", {}),
]


@pytest.mark.parametrize("method,path,params", GUARDED_ROUTES)
def test_google_drive_routes_reject_anonymous_callers(method, path, params):
    response = client.request(method, path, params=params)
    assert response.status_code == 401


@pytest.mark.parametrize("method,path,params", GUARDED_ROUTES)
def test_google_drive_routes_reject_a_forged_bearer_token(method, path, params):
    response = client.request(
        method, path, params=params, headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize("method,path,params", RETIRED_ROUTES)
def test_retired_google_drive_routes_are_not_mounted(method, path, params):
    response = client.request(method, path, params=params)
    assert response.status_code == 404


def test_oauth_callback_stays_reachable_without_a_token():
    """Google redirects the browser here, so it cannot carry an Authorization header."""
    response = client.get("/api/integrations/google-drive/callback")
    assert response.status_code == 400
    assert "Missing code" in response.json()["detail"]


def test_oauth_callback_rejects_a_forged_state():
    response = client.get(
        "/api/integrations/google-drive/callback",
        params={"code": "attacker-code", "state": "forged.signature"},
    )
    assert response.status_code == 400
    assert "state" in response.json()["detail"].lower()


def test_experiment_zip_upload_still_requires_auth():
    response = client.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/files/experiment-zip"
    )
    assert response.status_code == 401


# ---------------------------------------------------------- admission control


def test_a_second_concurrent_upload_by_the_same_user_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "upload_max_concurrent_per_user", 1, raising=False)
    monkeypatch.setattr(settings, "upload_min_seconds_between_uploads", 0, raising=False)
    control = UploadAdmissionControl()

    with control.slot("user-a"):
        with pytest.raises(UploadRejected, match="en curso"):
            with control.slot("user-a"):
                pass


def test_a_slot_is_released_even_when_the_upload_fails(monkeypatch):
    monkeypatch.setattr(settings, "upload_min_seconds_between_uploads", 0, raising=False)
    control = UploadAdmissionControl()

    with pytest.raises(RuntimeError):
        with control.slot("user-a"):
            raise RuntimeError("ingestion blew up")

    with control.slot("user-a"):
        pass  # the slot is free again


def test_other_users_are_not_blocked_by_one_users_upload(monkeypatch):
    monkeypatch.setattr(settings, "upload_max_concurrent_per_user", 1, raising=False)
    monkeypatch.setattr(settings, "upload_max_concurrent_global", 4, raising=False)
    monkeypatch.setattr(settings, "upload_min_seconds_between_uploads", 0, raising=False)
    control = UploadAdmissionControl()

    with control.slot("user-a"):
        with control.slot("user-b"):
            pass


def test_global_concurrency_cap_is_enforced(monkeypatch):
    monkeypatch.setattr(settings, "upload_max_concurrent_per_user", 5, raising=False)
    monkeypatch.setattr(settings, "upload_max_concurrent_global", 2, raising=False)
    monkeypatch.setattr(settings, "upload_min_seconds_between_uploads", 0, raising=False)
    control = UploadAdmissionControl()

    with control.slot("user-a"):
        with control.slot("user-b"):
            with pytest.raises(UploadRejected, match="maximo de cargas"):
                with control.slot("user-c"):
                    pass


def test_uploads_in_quick_succession_are_rate_limited(monkeypatch):
    monkeypatch.setattr(settings, "upload_min_seconds_between_uploads", 300, raising=False)
    control = UploadAdmissionControl()

    with control.slot("user-a"):
        pass

    with pytest.raises(UploadRejected) as excinfo:
        with control.slot("user-a"):
            pass

    assert excinfo.value.retry_after_seconds > 0

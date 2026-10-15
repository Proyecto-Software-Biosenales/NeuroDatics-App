"""Estado de instalación de Drive: autenticación, ausencia y filtrado de secretos."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from neurodatics.api.deps import get_current_user, get_db
from neurodatics.config.settings import settings
from neurodatics.modules.integrations.google_drive.api.routes import router
from neurodatics.modules.integrations.google_drive.api import routes
from neurodatics.modules.integrations.google_drive.infrastructure.repository import (
    SystemIntegrationRepository,
)


@pytest.fixture
def connection_api(monkeypatch):
    app = FastAPI()
    app.include_router(router, prefix="/api")
    repository_read = AsyncMock(return_value=None)
    monkeypatch.setattr(SystemIntegrationRepository, "get_by_provider", repository_read)
    monkeypatch.setattr(settings, "google_oauth_client_id", "synthetic-client")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "synthetic-client-secret")
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    return app, repository_read


def test_connection_requires_authentication(connection_api):
    app, repository_read = connection_api
    response = TestClient(app).get("/api/integrations/google-drive/connection")
    assert response.status_code == 401
    repository_read.assert_not_awaited()


@pytest.mark.parametrize("integration,connected,account_email", [
    (None, False, None),
    ({"account_email": "owner@example.test", "refresh_token": ""}, False, "owner@example.test"),
    ({
        "account_email": "owner@example.test",
        "refresh_token": "synthetic-refresh-secret",
        "access_token": "synthetic-access-secret",
        "metadata": {"private": "synthetic-private-data"},
    }, True, "owner@example.test"),
])
def test_connection_returns_only_safe_persisted_status(
    connection_api, integration, connected, account_email,
):
    app, repository_read = connection_api
    app.dependency_overrides[get_current_user] = lambda: "synthetic-user"
    repository_read.return_value = integration
    response = TestClient(app).get("/api/integrations/google-drive/connection")
    assert response.status_code == 200
    assert response.json() == {
        "connected": connected,
        "account_email": account_email,
        "oauth_configured": True,
    }
    repository_read.assert_awaited_once_with("google_drive")


@pytest.mark.parametrize("missing", ["google_oauth_client_id", "google_oauth_client_secret"])
def test_connection_reports_incomplete_oauth_without_exposing_values(
    connection_api, monkeypatch, missing,
):
    app, _ = connection_api
    app.dependency_overrides[get_current_user] = lambda: "synthetic-user"
    monkeypatch.setattr(settings, missing, None)
    response = TestClient(app).get("/api/integrations/google-drive/connection")
    assert response.status_code == 200
    assert response.json() == {
        "connected": False, "account_email": None, "oauth_configured": False,
    }


@pytest.mark.parametrize("accept,is_html", [("text/html", True), ("application/json", False)])
def test_callback_confirms_in_spanish_in_browser_and_preserves_json(monkeypatch, accept, is_html):
    app = FastAPI()
    app.include_router(routes.public_router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    complete = AsyncMock(return_value={
        "connected": True, "provider": "google_drive",
        "account_email": "owner@example.test", "refresh_token_received": True,
    })
    monkeypatch.setattr(routes, "_service_from_db", lambda db: SimpleNamespace(connect_from_callback=complete))
    response = TestClient(app).get(
        "/api/integrations/google-drive/callback",
        params={"code": "synthetic-code", "state": "synthetic-signed-state"},
        headers={"Accept": accept},
    )
    assert response.status_code == 200
    complete.assert_awaited_once_with(code="synthetic-code", state="synthetic-signed-state")
    if is_html:
        assert response.headers["content-type"].startswith("text/html")
        assert 'lang="es"' in response.text
        assert 'href="/configuracion"' in response.text
        assert "Google Drive conectado" in response.text
        assert "synthetic-code" not in response.text
        assert "owner@example.test" not in response.text
        assert response.headers["referrer-policy"] == "no-referrer"
    else:
        assert response.json()["connected"] is True

"""Cuenta de Drive compartida: solo la administra el servidor, nunca la aplicación."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from neurodatics.api.deps import get_db
from neurodatics.config.settings import settings
from neurodatics.modules.integrations.google_drive import admin
from neurodatics.modules.integrations.google_drive.api import routes


@pytest.fixture
def oauth_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_oauth_client_id", "synthetic-client")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "synthetic-client-secret")
    monkeypatch.setattr(settings, "google_drive_oauth_redirect_uri", "http://localhost:3000/api/integrations/google-drive/callback")


def test_the_app_exposes_only_the_oauth_callback():
    paths = {route.path for route in routes.public_router.routes}
    assert paths == {"/integrations/google-drive/callback"}
    assert not hasattr(routes, "router")


@pytest.mark.parametrize("integration,expected", [
    (None, "Google Drive no está conectado."),
    ({"account_email": "owner@example.test", "refresh_token": ""}, "Google Drive no está conectado."),
    ({
        "account_email": "owner@example.test",
        "refresh_token": "synthetic-refresh-secret",
        "access_token": "synthetic-access-secret",
        "updated_at": datetime(2026, 10, 19, 22, 7, tzinfo=timezone.utc),
    }, "Cuenta de almacenamiento: owner@example.test (última autorización: 2026-10-19 22:07 UTC)."),
])
def test_admin_status_shows_the_account_and_never_the_tokens(monkeypatch, capsys, integration, expected):
    monkeypatch.setattr(admin, "_read_integration", AsyncMock(return_value=integration))
    assert admin.main(["estado"]) == 0
    output = capsys.readouterr().out
    assert output.strip() == expected
    assert "synthetic" not in output


@pytest.mark.usefixtures("oauth_configured")
def test_admin_connect_prints_a_signed_google_link(monkeypatch, capsys):
    monkeypatch.setattr(admin, "_read_integration", AsyncMock(return_value=None))
    assert admin.main(["conectar"]) == 0
    link = capsys.readouterr().out.strip().splitlines()[-1]
    url = urlparse(link)
    assert (url.scheme, url.netloc) == ("https", "accounts.google.com")
    query = parse_qs(url.query)
    assert query["client_id"] == ["synthetic-client"]
    assert "synthetic-client-secret" not in link
    # The callback accepts exactly the state this command signs.
    admin.GoogleDriveIntegrationService(repository=None)._verify_state(query["state"][0])


@pytest.mark.usefixtures("oauth_configured")
@pytest.mark.parametrize("missing", ["google_oauth_client_id", "google_oauth_client_secret"])
def test_admin_connect_refuses_without_oauth_credentials(monkeypatch, missing):
    monkeypatch.setattr(admin, "_read_integration", AsyncMock(return_value=None))
    monkeypatch.setattr(settings, missing, None)
    with pytest.raises(SystemExit, match="GOOGLE_OAUTH_CLIENT"):
        admin.main(["conectar"])


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
        assert 'href="/"' in response.text
        assert "/configuracion" not in response.text
        assert "Google Drive conectado" in response.text
        assert "synthetic-code" not in response.text
        assert "owner@example.test" not in response.text
        assert response.headers["referrer-policy"] == "no-referrer"
    else:
        assert response.json()["connected"] is True

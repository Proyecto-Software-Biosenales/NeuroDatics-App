"""Local (student) mode: identity, settings, routes and the guard that replaces a login."""

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from neurodatics.api import middlewares, router as api_router
from neurodatics.config import security
from neurodatics.config.settings import Settings, settings
from neurodatics.infra.cache.memory_cache import shared_in_process_cache
from neurodatics.infra.health import readiness
from neurodatics.infra.queue import redis_connection

BACKEND = Path(__file__).parents[2]


def local_settings(tmp_path, **overrides):
    values = {
        "app_mode": "local",
        "local_data_dir": str(tmp_path),
        "database_url": "postgresql+psycopg://postgres@127.0.0.1:5432/neurodatics",
        "auth_jwt_secret": "test-secret-that-is-long-enough-for-unit-tests",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def local_mode(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "app_mode", "local")
    monkeypatch.setattr(settings, "local_data_dir", str(tmp_path))


# -- settings ------------------------------------------------------------------------------
def test_server_mode_is_the_default_and_keeps_docker_cache_paths():
    server = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://u:p@db:5432/x",
        auth_jwt_secret="test-secret-that-is-long-enough-for-unit-tests",
    )

    assert not server.is_local
    assert server.parquet_cache_dir == "/data/parquet_cache"


def test_local_mode_requires_a_data_directory():
    with pytest.raises(ValueError, match="LOCAL_DATA_DIR"):
        Settings(
            _env_file=None,
            app_mode="local",
            database_url="postgresql+psycopg://u:p@127.0.0.1:5432/x",
            auth_jwt_secret="test-secret-that-is-long-enough-for-unit-tests",
        )


def test_local_mode_keeps_every_cache_and_the_file_store_under_the_data_directory(tmp_path):
    local = local_settings(tmp_path)

    for name in ("parquet_cache", "image_cache", "video_cache", "video_frame_cache"):
        assert Path(getattr(local, f"{name}_dir")) == tmp_path / "cache" / name
    assert Path(local.local_storage_dir) == tmp_path / "storage"


def test_an_explicit_cache_directory_wins_in_local_mode(tmp_path):
    local = local_settings(tmp_path, image_cache_dir=str(tmp_path / "elsewhere"))

    assert local.image_cache_dir == str(tmp_path / "elsewhere")
    assert Path(local.parquet_cache_dir) == tmp_path / "cache" / "parquet_cache"


# -- identity ------------------------------------------------------------------------------
@pytest.mark.usefixtures("local_mode")
def test_local_mode_needs_no_token():
    assert asyncio.run(security.get_current_user_id(None)) == security.LOCAL_USER_ID


def test_server_mode_still_rejects_a_missing_token():
    with pytest.raises(HTTPException) as refused:
        asyncio.run(security.get_current_user_id(None))

    assert refused.value.status_code == 401


# -- routes ----------------------------------------------------------------------------------
def mounted_paths(app):
    return sorted(
        f"{method} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    )


@pytest.mark.usefixtures("local_mode")
def test_local_mode_replaces_sign_in_and_drive_routes_with_one_session_route():
    app = FastAPI()

    api_router.include_routes(app)

    paths = mounted_paths(app)
    assert "POST /api/auth/local-session" in paths
    assert not [path for path in paths if "google" in path]
    assert any(path.startswith("GET /api/projects") for path in paths)


@pytest.mark.usefixtures("local_mode")
def test_local_session_returns_the_fixed_user():
    app = FastAPI()
    api_router.include_routes(app)

    response = TestClient(app).post("/api/auth/local-session")

    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "local" and body["user"]["id"] == security.LOCAL_USER_ID
    assert body["access_token"]


# -- the guard that replaces a login --------------------------------------------------------
@pytest.mark.parametrize(
    ("host", "origin", "allowed"),
    [
        ("127.0.0.1:8765", None, True),
        ("localhost:8765", None, True),
        ("[::1]:8765", None, True),
        ("127.0.0.1:8765", "http://127.0.0.1:8765", True),
        ("evil.example:8765", None, False),  # DNS rebinding: a name we do not own
        ("127.0.0.1.evil.example", None, False),
        ("127.0.0.1:8765", "https://evil.example", False),  # another site posting to us
        ("127.0.0.1:8765", "null", False),
        ("127.0.0.1:8765", "http://127.0.0.1:9999", False),  # another local port
        ("", None, False),
    ],
)
def test_local_guard_only_admits_same_origin_loopback_requests(host, origin, allowed):
    refusal = middlewares._local_request_refusal(host, origin)

    assert (refusal is None) is allowed


@pytest.mark.usefixtures("local_mode")
def test_local_guard_is_installed_and_answers_403():
    app = FastAPI()
    middlewares.register_middlewares(app)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    client = TestClient(app, base_url="http://127.0.0.1:8765")

    assert client.get("/ping").status_code == 200
    forbidden = client.get("/ping", headers={"Origin": "https://evil.example"})
    assert forbidden.status_code == 403
    assert client.get("/ping", headers={"Host": "evil.example"}).status_code == 403


# -- cache and readiness ---------------------------------------------------------------------
@pytest.mark.usefixtures("local_mode")
def test_local_mode_uses_the_in_process_cache_instead_of_redis():
    assert redis_connection.get_redis_client() is shared_in_process_cache()


@pytest.mark.usefixtures("local_mode")
def test_local_readiness_does_not_wait_for_redis(monkeypatch):
    async def database_ok():
        return True

    def no_redis():
        raise AssertionError("local mode must not look for Redis")

    monkeypatch.setattr(readiness, "check_database", database_ok)
    monkeypatch.setattr(readiness, "get_redis_client", no_redis)

    assert asyncio.run(readiness.collect_readiness()) == {"database": "ok"}


# -- what the frozen package can leave out ----------------------------------------------------
def test_local_mode_never_loads_the_google_libraries(tmp_path):
    """A fresh process in local mode must build the whole app without Google's client."""
    script = "\n".join(
        [
            "import json, sys",
            "from neurodatics.main import app",
            "from neurodatics.modules.integrations import storage_provider",
            "google = {'googleapiclient', 'google_auth_httplib2', 'httplib2', 'oauth2client'}",
            "loaded = sorted(m for m in sys.modules if m.split('.')[0] in google",
            "                or m.startswith('google.oauth2') or m.startswith('google.auth'))",
            "print(json.dumps({'loaded': loaded,",
            "                  'store': type(storage_provider.gdrive_client).__name__,",
            "                  'provider': storage_provider.STORAGE_PROVIDER}))",
        ]
    )
    environment = {
        "PATH": "",
        "SYSTEMROOT": "C:\\Windows",
        "USERPROFILE": str(tmp_path),
        "MPLCONFIGDIR": str(tmp_path),
        "PYTHONPATH": str(BACKEND / "src"),
        "APP_MODE": "local",
        "LOCAL_DATA_DIR": str(tmp_path),
        "DATABASE_URL": "postgresql+psycopg://postgres@127.0.0.1:1/x",
        "AUTH_JWT_SECRET": "test-secret-that-is-long-enough-for-unit-tests",
    }

    completed = subprocess.run(
        [sys.executable, "-c", script],
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr[-800:]
    report = json.loads(completed.stdout.strip().splitlines()[-1])
    assert report == {"loaded": [], "store": "LocalStorageClient", "provider": "local"}

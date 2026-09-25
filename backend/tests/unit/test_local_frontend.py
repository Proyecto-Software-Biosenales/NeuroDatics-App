"""The student frontend: a static export served from the API's own origin."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from neurodatics.local import launcher
from neurodatics.local.static_frontend import mount_frontend

BACKEND = Path(__file__).parents[2]


@pytest.fixture
def exported_site(tmp_path):
    """The shape `next build` writes with output "export" and trailingSlash."""
    site = tmp_path / "frontend"
    (site / "proyectos").mkdir(parents=True)
    (site / "_next" / "static").mkdir(parents=True)
    (site / "index.html").write_text("<title>inicio</title>", encoding="utf-8")
    (site / "proyectos" / "index.html").write_text("<title>proyectos</title>", encoding="utf-8")
    (site / "404.html").write_text("<title>no encontrada</title>", encoding="utf-8")
    (site / "_next" / "static" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (site / "proyectos" / "__next.proyectos").mkdir()
    (site / "proyectos" / "__next.proyectos" / "__PAGE__.txt").write_text("datos de proyectos", encoding="utf-8")
    return site


def api_with_site(site):
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    @app.get("/api/projects/")
    async def list_projects():
        return []

    @app.post("/api/projects/")
    async def create_project(payload: dict):
        return payload

    assert mount_frontend(app, site) is True
    return TestClient(app, base_url="http://127.0.0.1:8765")


def test_pages_are_served_from_their_directory_urls(exported_site):
    client = api_with_site(exported_site)

    assert "inicio" in client.get("/").text
    assert "proyectos" in client.get("/proyectos/").text
    assert client.get("/_next/static/app.js").status_code == 200


def test_a_page_url_without_the_trailing_slash_reaches_the_page(exported_site):
    response = api_with_site(exported_site).get("/proyectos")

    assert response.status_code == 200 and "proyectos" in response.text


def test_the_page_data_next_prefetches_is_found_where_a_windows_export_puts_it(exported_site):
    client = api_with_site(exported_site)

    prefetch = client.get("/proyectos/__next.proyectos.__PAGE__.txt?_rsc=abc")

    assert prefetch.status_code == 200 and prefetch.text == "datos de proyectos"
    assert client.get("/proyectos/__next.otra.__PAGE__.txt").status_code == 404


def test_the_prefetched_page_data_can_be_revalidated_by_the_browser(exported_site):
    client = api_with_site(exported_site)
    url = "/proyectos/__next.proyectos.__PAGE__.txt"
    first = client.get(url)

    again = client.get(url, headers={"If-None-Match": first.headers["etag"]})

    assert again.status_code == 304


def test_unknown_paths_get_the_exported_not_found_page(exported_site):
    response = api_with_site(exported_site).get("/no-existe/")

    assert response.status_code == 404 and "no encontrada" in response.text


def test_api_routes_win_over_the_site(exported_site):
    assert api_with_site(exported_site).get("/health").json() == {"status": "healthy"}


def test_the_project_collection_answers_without_its_trailing_slash(exported_site):
    client = api_with_site(exported_site)

    assert client.get("/api/projects").json() == []
    posted = client.post("/api/projects", json={"name": "Estudio"})
    assert posted.status_code == 200 and posted.json() == {"name": "Estudio"}


def test_a_path_cannot_climb_out_of_the_site(exported_site):
    (exported_site.parent / "secret.txt").write_text("private", encoding="utf-8")
    client = api_with_site(exported_site)

    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt", "/_next/../../secret.txt"):
        assert "private" not in client.get(path).text


def test_a_folder_without_an_exported_site_is_not_mounted(tmp_path):
    app = FastAPI()
    routes_before = list(app.routes)

    assert mount_frontend(app, tmp_path) is False
    assert app.routes == routes_before


def test_the_launcher_points_the_app_at_the_frontend_only_when_it_exists(tmp_path, monkeypatch):
    monkeypatch.setattr(os, "environ", os.environ.copy())
    monkeypatch.delenv("LOCAL_FRONTEND_DIR", raising=False)
    package = tmp_path / "pkg"
    package.mkdir()
    url = "postgresql+psycopg://u:p@127.0.0.1:1/x"

    launcher.apply_environment(package, tmp_path / "data", url)
    assert "LOCAL_FRONTEND_DIR" not in os.environ

    (package / "frontend").mkdir()
    (package / "frontend" / "index.html").write_text("<title>x</title>", encoding="utf-8")
    launcher.apply_environment(package, tmp_path / "data", url)
    assert os.environ["LOCAL_FRONTEND_DIR"] == str(package / "frontend")


def app_in_fresh_process(tmp_path, site, mode):
    """Import the real app the way the launcher does and ask it for its first pages."""
    script = "\n".join(
        [
            "import json",
            "from fastapi.testclient import TestClient",
            "from neurodatics.main import app",
            "client = TestClient(app, base_url='http://127.0.0.1:8765')",
            "print(json.dumps({",
            "  'home': client.get('/').status_code,",
            "  'health': client.get('/health').json(),",
            "  'foreign_host': client.get('/', headers={'Host': 'evil.example'}).status_code,",
            "}))",
        ]
    )
    environment = {
        "PATH": "",
        "SYSTEMROOT": r"C:\Windows",
        "USERPROFILE": str(tmp_path),
        "MPLCONFIGDIR": str(tmp_path),
        "PYTHONPATH": str(BACKEND / "src"),
        "APP_MODE": mode,
        "LOCAL_DATA_DIR": str(tmp_path),
        "LOCAL_FRONTEND_DIR": str(site),
        "DATABASE_URL": "postgresql+psycopg://postgres@127.0.0.1:1/x",
        "AUTH_JWT_SECRET": "test-secret-that-is-long-enough-for-unit-tests",
    }
    completed = subprocess.run(
        [sys.executable, "-c", script], env=environment, capture_output=True, text=True, timeout=120, check=False
    )
    assert completed.returncode == 0, completed.stderr[-800:]
    return json.loads(completed.stdout.strip().splitlines()[-1])


def test_the_real_app_serves_the_site_in_local_mode_behind_the_host_guard(tmp_path, exported_site):
    report = app_in_fresh_process(tmp_path, exported_site, "local")

    assert report == {"home": 200, "health": {"status": "healthy"}, "foreign_host": 403}


def test_the_server_edition_never_serves_a_site_even_if_pointed_at_one(tmp_path, exported_site):
    report = app_in_fresh_process(tmp_path, exported_site, "server")

    assert report["home"] == 404

"""Drive a running local-mode app through its real HTTP routes with a real experiment ZIP.

This is what the M1 harness could not do: it went around the routes because they were hardwired
to Google Drive. Here the whole path runs - session, project, ZIP upload and ingestion into the
local store, analytics, media, a report, deletion - and the check fails on anything empty.

    neurodatics-estudiantes.exe http-check --url http://127.0.0.1:8765 --zip experiment.zip
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import time

import httpx

from selftest import RESULTS, finite_numbers, stage


def count_files(directory: pathlib.Path) -> int:
    return sum(1 for entry in directory.rglob("*") if entry.is_file()) if directory.exists() else 0


def run(args) -> int:
    base = args.url.rstrip("/")
    storage = pathlib.Path(args.data_dir) / "storage" if args.data_dir else None
    client = httpx.Client(base_url=base, timeout=httpx.Timeout(600.0, connect=10.0))
    state: dict = {}

    def get(path: str, **params) -> httpx.Response:
        response = client.get(path, params=params or None)
        assert response.status_code == 200, f"GET {path} -> {response.status_code}: {response.text[:200]}"
        return response

    with stage("guard_refuses_other_web_pages") as rec:
        hostile_origin = client.get("/health", headers={"Origin": "https://evil.example"})
        hostile_host = client.get("/health", headers={"Host": "evil.example"})
        rec["cross_origin"] = hostile_origin.status_code
        rec["foreign_host"] = hostile_host.status_code
        assert hostile_origin.status_code == 403 and hostile_host.status_code == 403, rec
        assert client.get("/health").status_code == 200

    with stage("web_app_is_served_from_the_same_origin") as rec:
        home = get("/")
        assert home.headers["content-type"].startswith("text/html") and "NeuroDatics" in home.text, home.text[:200]
        script = re.search(r'src="(/_next/static/[^"]+\.js)"', home.text)
        assert script, "the home page references no script"
        rec["script_bytes"] = len(get(script.group(1)).content)
        rec["pages"] = {page: get(page).status_code for page in ("/proyectos/", "/dashboard/", "/login/")}
        # What Next prefetches for a link, and the font that used to come from Google.
        rec["page_data"] = get("/proyectos/__next.proyectos.__PAGE__.txt").status_code
        rec["font_bytes"] = len(get("/fonts/poppins-latin-400.woff2").content)
        assert rec["script_bytes"] > 10_000 and rec["font_bytes"] > 1000 and rec["page_data"] == 200, rec
        assert all(status == 200 for status in rec["pages"].values()), rec
        assert client.get("/no-such-page/").status_code == 404
        assert client.get("/api/no-such-route").status_code == 404

    with stage("session_and_readiness") as rec:
        session = client.post("/api/auth/local-session")
        assert session.status_code == 200, session.text
        rec["user"] = session.json()["user"]
        ready = client.get("/health/ready")
        rec["ready"] = ready.json()
        assert ready.status_code == 200 and ready.json()["status"] == "ready", ready.text
        assert client.get("/api/integrations/google-drive/connection").status_code == 404, "Drive routes must not exist"
        rec["projects_before"] = len(get("/api/projects/").json())
        # The web app asks for the collection without the trailing slash (Next's rewrite adds it in the server edition).
        assert len(get("/api/projects").json()) == rec["projects_before"]

    with stage("create_project") as rec:
        created = client.post("/api/projects/", json={"name": "http-check " + time.strftime("%H%M%S")})
        assert created.status_code in (200, 201), created.text
        state["project"] = created.json()["id"]
        rec["project"] = state["project"]

    stored_before = count_files(storage) if storage else None
    with stage("upload_zip_through_the_route") as rec:
        zip_path = pathlib.Path(args.zip)
        started = time.perf_counter()
        with zip_path.open("rb") as handle:
            response = client.post(
                f"/api/projects/{state['project']}/files/experiment-zip",
                files={"file": (zip_path.name, handle, "application/zip")},
            )
        rec["seconds"] = round(time.perf_counter() - started, 1)
        assert response.status_code == 200, f"{response.status_code}: {response.text[:400]}"
        summary = response.json()
        rec["ingestion_status"] = summary["ingestion_status"]
        rec["counts"] = summary["counts"]
        rec["participants"] = len(summary["participants"])
        rec["sensors"] = summary["detected_sensors"]
        assert summary["ingestion_status"].upper() == "READY", summary["ingestion_status"]
        assert summary["counts"]["files_uploaded"] > 0 and summary["participants"], summary["counts"]
        if storage:
            rec["stored_files_after"] = count_files(storage)  # data and metadata
            assert rec["stored_files_after"] >= summary["counts"]["files_uploaded"], rec

    with stage("project_reads_back") as rec:
        detail = get(f"/api/projects/{state['project']}").json()
        kinds: dict = {}
        for file in detail["files"]:
            kinds.setdefault(file["kind"], []).append(file)
        rec["file_kinds"] = {kind: len(items) for kind, items in kinds.items()}
        rec["participants"] = [p["participant_code"] for p in detail["participants"]]
        rec["scenarios"] = [s["name"] for s in detail["scenaries"]]
        assert detail["ingestion_status"].upper() == "READY" and rec["participants"] and rec["scenarios"], rec
        state["images"] = [f for f in detail["files"] if f["kind"] == "scenario_image"]
        state["videos"] = [f for f in detail["files"] if f["kind"] == "scenario_video"]
        assert state["images"] and state["videos"], f"fixture must carry images and a video: {rec['file_kinds']}"
        state["participant"] = rec["participants"][0]
        state["scenario"] = rec["scenarios"][0]

    base_path = f"/api/projects/{state['project']}/analytics"
    with stage("analytics_over_http") as rec:
        participant = state["participant"]
        listed = get(f"{base_path}/participants").json()
        scenarios = get(f"{base_path}/scenarios", participant_code=participant).json()
        rec["participants_listed"] = len(listed)
        rec["scenarios_listed"] = len(scenarios)
        assert listed and scenarios, (listed, scenarios)
        numbers = {}
        for name, path in (
            ("eeg_timeseries", "timeseries/eeg"),
            ("gsr_statistics", "statistics/gsr"),
            ("gsr_timeseries", "timeseries/gsr"),
            ("pupil_statistics", "statistics/pupil"),
        ):
            numbers[name] = finite_numbers(get(f"{base_path}/{path}", participant_code=participant, scenario="all").json())
        rec["finite_numbers"] = numbers
        empty = [name for name, count in numbers.items() if count < 3]
        assert not empty, f"routes answered but returned nothing: {empty}"
        # The second read of the same request is served from the in-process cache.
        first = time.perf_counter()
        get(f"{base_path}/timeseries/eeg", participant_code=participant, scenario="all")
        rec["cached_read_seconds"] = round(time.perf_counter() - first, 3)

    with stage("media_from_the_local_store") as rec:
        image = get(f"/api/projects/{state['project']}/files/{state['images'][0]['id']}/image")
        rec["image_bytes"] = len(image.content)
        rec["image_type"] = image.headers.get("content-type")
        assert rec["image_bytes"] > 1000 and rec["image_type"].startswith("image/"), rec
        preview = get(f"/api/projects/{state['project']}/files/{state['videos'][0]['id']}/preview", time_s=1.0)
        rec["video_frame_bytes"] = len(preview.content)
        rec["video_frame_type"] = preview.headers.get("content-type")
        assert rec["video_frame_bytes"] > 1000 and rec["video_frame_type"].startswith("image/"), rec
        heatmap = get(
            f"{base_path}/heatmap", participant_code=state["participant"], scenario=state["scenario"],
            width=1280, height=720,
        )
        rec["heatmap_bytes"] = len(heatmap.content)
        assert heatmap.content[:8] == b"\x89PNG\r\n\x1a\n" and rec["heatmap_bytes"] > 1000, rec

    with stage("executive_report_reads_local_files") as rec:
        response = client.post(
            "/api/reports/executive",
            json={
                "project_id": state["project"],
                "scope": {"kind": "all_participants"},
                "mode": {"kind": "sensor", "sensor": "GSR"},
            },
        )
        assert response.status_code == 200, f"{response.status_code}: {response.text[:300]}"
        rec["bytes"] = len(response.content)
        rec["media_type"] = response.headers.get("content-type")
        assert response.content.startswith(b"%PDF") and rec["bytes"] > 5000, rec

    with stage("delete_project_removes_its_files") as rec:
        deleted = client.delete(f"/api/projects/{state['project']}")
        assert deleted.status_code == 200, deleted.text
        rec["response"] = deleted.json()
        assert client.get(f"/api/projects/{state['project']}").status_code == 404
        if storage:
            rec["stored_files_before_upload"] = stored_before
            rec["stored_files_after_delete"] = count_files(storage)
            assert rec["stored_files_after_delete"] == stored_before, rec

    RESULTS["all_ok"] = all(s["ok"] for s in RESULTS["stages"].values())
    pathlib.Path(args.out).write_text(json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"all_ok": RESULTS["all_ok"], "stages": {n: s["ok"] for n, s in RESULTS["stages"].items()}}))
    return 0 if RESULTS["all_ok"] else 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--zip", required=True)
    parser.add_argument("--data-dir", help="the app's data directory, to count stored files before and after")
    parser.add_argument("--out", default="http-check.json")
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

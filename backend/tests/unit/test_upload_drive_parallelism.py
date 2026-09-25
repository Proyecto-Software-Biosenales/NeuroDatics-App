import threading
import time
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

import neurodatics.modules.projects.application.use_cases.upload_experiment_zip as upload_module
from neurodatics.config.settings import settings
from neurodatics.modules.participants.domain.entities import Participant  # noqa: F401
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingService,
    ParticipantInfo,
    ProcessingResult,
)
from neurodatics.modules.projects.application.services.zip_extraction_service import (
    ExtractedZipContext,
    ZipExtractionService,
)
from neurodatics.modules.projects.application.services.zip_validation_service import (
    AcquisitionSummary,
    UploadSelection,
    ZipManifestEntry,
    ZipValidationService,
)
from neurodatics.modules.projects.application.use_cases.upload_experiment_zip import (
    UploadExperimentZipUseCase,
)


class _ConcurrencyProbe:
    def __init__(self):
        self._lock = threading.Lock()
        self.active = 0
        self.peak = 0

    @contextmanager
    def running(self):
        with self._lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
        try:
            time.sleep(0.02)
            yield
        finally:
            with self._lock:
                self.active -= 1


@pytest.mark.asyncio
async def test_bounded_runner_caps_concurrency_and_keeps_job_order(monkeypatch):
    monkeypatch.setattr(settings, "gdrive_upload_concurrency", 3)
    probe = _ConcurrencyProbe()
    completed = []

    def job(value):
        with probe.running():
            return value * 10

    async def on_done(key, result):
        completed.append((key, result))

    results = await UploadExperimentZipUseCase._run_bounded(
        [(index, lambda index=index: job(index)) for index in range(10)], on_done
    )

    assert results == [index * 10 for index in range(10)]
    assert sorted(completed) == [(index, index * 10) for index in range(10)]
    assert probe.peak == 3


@pytest.mark.asyncio
async def test_bounded_runner_waits_for_in_flight_calls_before_raising(monkeypatch):
    monkeypatch.setattr(settings, "gdrive_upload_concurrency", 4)
    finished = []
    started = []

    def failing():
        raise RuntimeError("drive down")

    def slow(index):
        started.append(index)
        time.sleep(0.05)
        finished.append(index)
        return index

    jobs = [("fail", failing)] + [(index, lambda index=index: slow(index)) for index in range(6)]

    async def on_done(key, result):
        return None

    with pytest.raises(RuntimeError, match="drive down"):
        await UploadExperimentZipUseCase._run_bounded(jobs, on_done)

    # Only the calls already admitted ran, and each finished before the error
    # surfaced, so cleanup never races an upload into the root it deletes.
    assert sorted(finished) == sorted(started)
    assert len(started) == 3


@pytest.mark.asyncio
async def test_folder_tree_creates_parents_first_without_lookups(monkeypatch):
    created = []

    def fake_create_folder(name, parent_id=None):
        created.append((name, parent_id))
        return {"drive_file_id": f"id:{parent_id}/{name}", "name": name}

    def forbidden_lookup(**kwargs):
        raise AssertionError("a fresh root has no folders to look up")

    monkeypatch.setattr(upload_module.gdrive_client, "create_folder", fake_create_folder)
    monkeypatch.setattr(
        upload_module.gdrive_client, "find_child_folder_by_name", forbidden_lookup
    )
    use_case = UploadExperimentZipUseCase(SimpleNamespace())
    use_case.lifecycle = SimpleNamespace(check_canceled=AsyncMock())
    counters = {"folders_created": 0}
    uploaded_ids = []

    folder_ids = await use_case._create_folder_tree(
        {"", "Images", "processed/user1/escenarios", "processed/user2"},
        "root",
        uploaded_ids,
        counters,
    )

    assert folder_ids[""] == "root"
    assert folder_ids["processed"] == "id:root/processed"
    assert folder_ids["processed/user1"] == "id:id:root/processed/user1"
    assert folder_ids["processed/user1/escenarios"] == (
        "id:id:id:root/processed/user1/escenarios"
    )
    assert counters["folders_created"] == len(created) == 5
    assert sorted(uploaded_ids) == sorted(folder_ids[path] for path in folder_ids if path)


@pytest.mark.asyncio
async def test_ingestion_uploads_only_media_and_parquets_in_parallel(monkeypatch, tmp_path):
    project_id = uuid4()
    csv_path = tmp_path / "recording.csv"
    csv_path.write_text("data")
    image_path = tmp_path / "scene.png"
    image_path.write_bytes(b"png")
    notes_path = tmp_path / "notes.txt"
    notes_path.write_text("unused")
    user_parquet = tmp_path / "user1.parquet"
    user_parquet.write_bytes(b"parquet")
    scenario_parquets = []
    for index in range(4):
        path = tmp_path / f"Scene {index}.parquet"
        path.write_bytes(b"parquet")
        scenario_parquets.append((1, f"Scene {index}", str(path)))

    def manifest_entry(path, kind, mime_type):
        return ZipManifestEntry(
            source_entry_path=path,
            filename=path.rpartition("/")[2],
            extension="." + path.rpartition(".")[2],
            mime_type=mime_type,
            size_bytes=4,
            kind=kind,
        )

    entries = [
        manifest_entry("recording.csv", "raw_csv", "text/csv"),
        manifest_entry("Images/scene.png", "scenario_image", "image/png"),
        manifest_entry("Images/notes.txt", "other_asset", "text/plain"),
    ]
    extracted_entries = []

    @contextmanager
    def fake_extraction(entries_to_extract):
        extracted_entries.extend(entry.source_entry_path for entry in entries_to_extract)
        yield ExtractedZipContext(
            temp_dir=str(tmp_path),
            extracted_root=str(tmp_path),
            files_by_entry_path={
                "recording.csv": str(csv_path),
                "Images/scene.png": str(image_path),
                "Images/notes.txt": str(notes_path),
            },
            folders=["Images"],
        )

    monkeypatch.setattr(
        ZipValidationService,
        "validate_and_analyze",
        staticmethod(
            lambda **kwargs: (
                entries,
                {"images": 1, "videos": 0, "csv": 1, "other": 1},
                UploadSelection(csv_entry_path="recording.csv"),
                AcquisitionSummary(),
                [],
            )
        ),
    )
    monkeypatch.setattr(
        ZipExtractionService,
        "extract_to_temp",
        staticmethod(lambda zip_path, entries_to_extract: fake_extraction(entries_to_extract)),
    )
    monkeypatch.setattr(
        CsvProcessingService,
        "process",
        staticmethod(
            lambda *args, **kwargs: ProcessingResult(
                detected_sensors=["EyeTracker"],
                participants=[ParticipantInfo(participant_code="P01", user_index=1)],
                user_parquet_paths=[(1, str(user_parquet))],
                scenario_parquet_paths=scenario_parquets,
            )
        ),
    )
    monkeypatch.setattr(settings, "gdrive_upload_concurrency", 3)
    # The browser-built ZIP duplicates the uploaded files, so it is off by default.
    assert type(settings).model_fields["ingestion_save_original_zip"].default is False
    monkeypatch.setattr(settings, "ingestion_save_original_zip", False)

    probe = _ConcurrencyProbe()
    uploaded = []
    upload_lock = threading.Lock()

    def fake_upload_file(filename, mime_type, parent_id, local_path):
        with probe.running():
            with upload_lock:
                uploaded.append((filename, parent_id))
                return {
                    "drive_file_id": f"file-{len(uploaded)}",
                    "checksum_sha256": "0" * 64,
                    "drive_web_view_link": None,
                    "drive_download_link": None,
                }

    monkeypatch.setattr(
        upload_module.gdrive_client,
        "create_folder",
        lambda name, parent_id=None: {"drive_file_id": f"folder:{name}", "name": name},
    )
    monkeypatch.setattr(upload_module.gdrive_client, "upload_file", fake_upload_file)
    for name in ("start", "mark_uploaded_bytes", "complete"):
        monkeypatch.setattr(
            upload_module.drive_upload_progress_registry, name, lambda *args: None
        )
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry, "is_cancel_requested", lambda *args: False
    )
    monkeypatch.setattr(
        upload_module.ParquetCacheService, "prune_stale_generations", lambda *a, **k: 0
    )
    monkeypatch.setattr(
        upload_module.AnalyticsRedisCache, "invalidate_stale_generations", lambda *a, **k: 0
    )
    monkeypatch.setattr(upload_module, "prune_media_caches", lambda: [])
    monkeypatch.setattr(
        UploadExperimentZipUseCase, "_build_scenary_from_file", lambda self, *a, **k: None
    )

    repository = SimpleNamespace(
        get_by_id=AsyncMock(
            return_value=SimpleNamespace(id=project_id, name="Experiment", drive_root_folder_id=None)
        ),
        update_project_ingestion=AsyncMock(),
        bump_ingestion_generation=AsyncMock(return_value=1),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        soft_delete_active_files=AsyncMock(),
        purge_files_by_kind=AsyncMock(),
        clear_project_scenaries=AsyncMock(),
        add_files=AsyncMock(),
        add_scenaries=AsyncMock(),
        reconcile_ingestion_metadata=AsyncMock(),
    )
    use_case = UploadExperimentZipUseCase(repository)
    use_case._create_new_drive_root_folder = AsyncMock(
        return_value={"drive_file_id": "root", "name": "Experiment", "drive_web_view_link": None}
    )

    summary = await use_case.execute(
        project_id=project_id,
        owner_id=uuid4(),
        zip_path=str(csv_path),
        filename="experiment.zip",
        mime_type="application/zip",
    )

    assert "Images/notes.txt" not in extracted_entries
    assert summary["zip_saved"] is False
    assert summary["zip_file"] is None
    assert sorted(uploaded) == sorted(
        [("scene.png", "folder:Images"), ("user1.parquet", "folder:user1")]
        + [(f"Scene {index}.parquet", "folder:escenarios") for index in range(4)]
    )
    assert probe.peak == 3

    inserted = repository.add_files.await_args.args[0]
    assert [file.filename for file in inserted] == (
        ["scene.png", "user1.parquet"] + [f"Scene {index}.parquet" for index in range(4)]
    )
    assert [file.drive_parent_external_id for file in inserted[:2]] == [
        "folder:Images",
        "folder:user1",
    ]
    assert inserted[1].source_entry_path == "processed/user1/user1.parquet"
    assert inserted[2].source_entry_path == "processed/user1/escenarios/Scene 0.parquet"
    assert summary["counts"]["other"] == 0
    assert summary["manifest"]["other"] == 1

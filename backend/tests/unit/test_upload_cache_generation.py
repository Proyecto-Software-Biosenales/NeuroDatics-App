"""A re-upload has to publish its data and its cache generation together.

The generation is what makes every entry written by the previous ingestion
unreachable, so it must land in the same transaction as the READY status: a
bump that commits on its own would strand readers on a generation that has no
data, and a bump that never happens leaves them reading the old numbers. The
sweeps that follow only reclaim space, so nothing they do - including failing -
may touch the committed upload.
"""

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

import neurodatics.modules.projects.application.use_cases.upload_experiment_zip as upload_module
from neurodatics.config.settings import settings
from neurodatics.modules.participants.domain.entities import Participant  # noqa: F401
from neurodatics.modules.projects.application.services.csv_processing_service import (
    BlockMetadata,
    CsvProcessingError,
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

NEW_GENERATION = 7


@pytest.fixture
def upload(tmp_path, monkeypatch):
    """One-CSV ingestion, wired like test_upload_csv_processing_metadata's.

    Everything the use case reaches for is faked; the pieces that matter here
    (the status updates, the bump, the commit and the three sweeps) append to
    one shared list so the order they ran in can be asserted directly.
    """

    project_id = uuid4()
    owner_id = uuid4()
    zip_path = tmp_path / "experiment.zip"
    zip_path.write_bytes(b"zip")
    raw_csv_path = tmp_path / "recording.csv"
    raw_csv_path.write_text("placeholder", encoding="utf-8")
    user_parquet = tmp_path / "user1.parquet"
    scenario_parquet = tmp_path / "scene.parquet"
    user_parquet.write_bytes(b"user parquet")
    scenario_parquet.write_bytes(b"scenario parquet")
    extraction_dir = tmp_path / "extraction"
    extraction_dir.mkdir()

    project = SimpleNamespace(id=project_id, name="Experiment", drive_root_folder_id=None)

    state = SimpleNamespace(
        calls=[],
        sweep_calls=[],
        drive_failure=None,
        sweep_failure=None,
        csv_failure=None,
        delete_result=True,
        project_id=project_id,
        project=project,
    )

    processing_result = ProcessingResult(
        detected_sensors=["EyeTracker"],
        participants=[ParticipantInfo(participant_code="P01", user_index=1)],
        user_parquet_paths=[(1, str(user_parquet))],
        scenario_parquet_paths=[(1, "Scene 1", str(scenario_parquet))],
        encoding="utf-16",
        block_metadata=[
            BlockMetadata(
                user_index=1,
                participant_code="P01",
                sample_count=120,
                declared_file_rate_hz=60.0,
                observed_grid_rate_hz=60.0,
                fixation_available=True,
                fixation_method="idt",
                fixation_detector_version="fixation-v2",
                fixation_source="recomputed",
                channels=[],
                warnings=[],
            )
        ],
        warnings=[],
    )

    entry = ZipManifestEntry(
        source_entry_path="recording.csv",
        filename="recording.csv",
        extension=".csv",
        mime_type="text/csv",
        size_bytes=raw_csv_path.stat().st_size,
        kind="raw_csv",
    )
    resolved_selection = UploadSelection(csv_entry_path="recording.csv")
    extracted = ExtractedZipContext(
        temp_dir=str(extraction_dir),
        extracted_root=str(extraction_dir),
        files_by_entry_path={"recording.csv": str(raw_csv_path)},
        folders=[],
    )

    @contextmanager
    def fake_extraction():
        yield extracted

    monkeypatch.setattr(
        ZipValidationService,
        "validate_and_analyze",
        staticmethod(
            lambda **kwargs: (
                [entry],
                {"images": 0, "videos": 0, "csv": 1, "other": 0},
                resolved_selection,
                AcquisitionSummary(),
                [],
            )
        ),
    )
    monkeypatch.setattr(
        ZipExtractionService,
        "extract_to_temp",
        staticmethod(lambda zip_path, entries: fake_extraction()),
    )
    def fake_process(*args, **kwargs):
        if state.csv_failure is not None:
            raise state.csv_failure
        return processing_result

    monkeypatch.setattr(CsvProcessingService, "process", staticmethod(fake_process))
    monkeypatch.setattr(settings, "ingestion_save_original_zip", False)

    counter = iter(range(1000))

    def fake_upload_file(filename, mime_type, parent_id, local_path):
        if state.drive_failure is not None:
            raise state.drive_failure
        return {
            "drive_file_id": f"file-{next(counter)}",
            "checksum_sha256": "0" * 64,
            "drive_web_view_link": None,
            "drive_download_link": None,
        }

    monkeypatch.setattr(
        upload_module.gdrive_client, "find_child_folder_by_name", lambda **kwargs: None
    )
    monkeypatch.setattr(
        upload_module.gdrive_client,
        "create_folder",
        lambda name, parent_id=None: {
            "drive_file_id": f"folder-{next(counter)}",
            "name": name,
        },
    )
    monkeypatch.setattr(upload_module.gdrive_client, "upload_file", fake_upload_file)
    def fake_delete_file(drive_id):
        state.calls.append(("delete_drive_root", drive_id))
        if isinstance(state.delete_result, Exception):
            raise state.delete_result
        return state.delete_result

    monkeypatch.setattr(upload_module.gdrive_client, "delete_file", fake_delete_file)
    for hook in ("start", "mark_uploaded_bytes", "complete", "fail"):
        monkeypatch.setattr(
            upload_module.drive_upload_progress_registry, hook, lambda *args: None
        )
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry,
        "is_cancel_requested",
        lambda *args: False,
    )

    def fake_prune_parquet(
        _self,
        swept_project_id,
        keep_generation,
        *,
        keep_previous=1,
        max_removals=32,
    ):
        state.calls.append("prune_parquet")
        state.sweep_calls.append(
            ("parquet", swept_project_id, keep_generation, keep_previous, max_removals)
        )
        if state.sweep_failure is not None:
            raise state.sweep_failure
        return 0

    def fake_invalidate_redis(
        _self,
        swept_project_id,
        keep_generation,
        *,
        keep_previous=1,
        max_deletions=5000,
    ):
        state.calls.append("invalidate_redis")
        state.sweep_calls.append(
            ("redis", swept_project_id, keep_generation, keep_previous, max_deletions)
        )
        if state.sweep_failure is not None:
            raise state.sweep_failure
        return 0

    def fake_prune_media():
        state.calls.append("prune_media")
        state.sweep_calls.append(("media",))
        if state.sweep_failure is not None:
            raise state.sweep_failure
        return []

    monkeypatch.setattr(
        upload_module.ParquetCacheService, "prune_stale_generations", fake_prune_parquet
    )
    monkeypatch.setattr(
        upload_module.AnalyticsRedisCache,
        "invalidate_stale_generations",
        fake_invalidate_redis,
    )
    monkeypatch.setattr(upload_module, "prune_media_caches", fake_prune_media)

    async def record_update(project_id, updates):
        state.calls.append(("update", updates["ingestion_status"]))

    async def record_bump(_project_id):
        state.calls.append("bump")
        return NEW_GENERATION

    async def record_commit():
        state.calls.append("commit")

    repository = SimpleNamespace(
        get_by_id=AsyncMock(return_value=project),
        update_project_ingestion=AsyncMock(side_effect=record_update),
        bump_ingestion_generation=AsyncMock(side_effect=record_bump),
        commit=AsyncMock(side_effect=record_commit),
        rollback=AsyncMock(),
        soft_delete_active_files=AsyncMock(),
        purge_files_by_kind=AsyncMock(),
        clear_project_scenaries=AsyncMock(),
        add_files=AsyncMock(),
        add_scenaries=AsyncMock(),
    )
    use_case = UploadExperimentZipUseCase(repository)
    use_case._create_new_drive_root_folder = AsyncMock(
        return_value={
            "drive_file_id": "root-folder",
            "name": "Experiment",
            "drive_web_view_link": None,
        }
    )

    async def run():
        return await use_case.execute(
            project_id=project_id,
            owner_id=owner_id,
            zip_path=str(zip_path),
            filename="experiment.zip",
            mime_type="application/zip",
            selection=resolved_selection,
            screen_geometry=None,
        )

    state.repository = repository
    state.run = run
    return state


@pytest.mark.asyncio
async def test_a_completed_upload_bumps_the_generation_before_it_commits(upload):
    summary = await upload.run()

    assert summary["ingestion_status"] == "READY"
    assert upload.repository.bump_ingestion_generation.await_count == 1
    # The bump sits between the READY update and the commit, so the new data and
    # the generation that names it become visible in one step; the sweeps only
    # start once that transaction is durable.
    assert upload.calls == [
        ("update", "PROCESSING"),
        "commit",
        ("update", "READY"),
        "bump",
        "commit",
        "prune_parquet",
        "invalidate_redis",
        "prune_media",
    ]


@pytest.mark.asyncio
async def test_each_sweep_runs_once_against_the_new_generation(upload):
    await upload.run()

    assert upload.sweep_calls == [
        (
            "parquet",
            upload.project_id,
            NEW_GENERATION,
            settings.parquet_cache_keep_previous_generations,
            settings.parquet_cache_prune_max_removals,
        ),
        (
            "redis",
            upload.project_id,
            NEW_GENERATION,
            settings.parquet_cache_keep_previous_generations,
            settings.analytics_redis_stale_generation_max_deletions,
        ),
        ("media",),
    ]


@pytest.mark.asyncio
async def test_a_broken_cache_sweep_cannot_fail_a_committed_upload(upload):
    upload.sweep_failure = RuntimeError("cache volume offline")

    summary = await upload.run()

    assert summary["ingestion_status"] == "READY"
    assert upload.repository.bump_ingestion_generation.await_count == 1
    assert upload.calls.count("commit") == 2
    assert upload.sweep_calls[0][0] == "parquet"


@pytest.mark.asyncio
async def test_a_failed_ingestion_never_advances_the_generation(upload):
    upload.drive_failure = RuntimeError("drive upload exploded")

    with pytest.raises(RuntimeError):
        await upload.run()

    # Nothing advanced, so every reader keeps resolving the previous generation
    # and the entries written under it stay valid.
    upload.repository.bump_ingestion_generation.assert_not_awaited()
    assert upload.sweep_calls == []
    assert ("update", "FAILED") in upload.calls
    assert ("update", "READY") not in upload.calls


@pytest.mark.asyncio
async def test_the_superseded_drive_root_is_deleted_only_after_the_commit(upload):
    upload.project.drive_root_folder_id = "root-previous"

    await upload.run()

    # Deleting it before the commit destroyed the content the un-bumped
    # generation still pointed at, so a failure in that window left the project
    # with neither ingestion. It is reclamation now, not part of the swap.
    assert ("delete_drive_root", "root-previous") in upload.calls
    assert upload.calls.index(("delete_drive_root", "root-previous")) > upload.calls.index(
        "bump"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "delete_result",
    [False, RuntimeError("drive delete exploded")],
    ids=["reports_failure", "raises"],
)
async def test_a_superseded_drive_root_that_cannot_be_deleted_only_leaks(
    upload, delete_result
):
    upload.project.drive_root_folder_id = "root-previous"
    upload.delete_result = delete_result

    summary = await upload.run()

    # No committed row references the old root, so failing to reclaim it leaks a
    # folder rather than invalidating an upload that already succeeded.
    assert summary["ingestion_status"] == "READY"
    assert upload.repository.bump_ingestion_generation.await_count == 1
    assert upload.sweep_calls[0][0] == "parquet"


@pytest.mark.asyncio
async def test_an_ingestion_whose_every_csv_failed_never_advances_the_generation(upload):
    upload.csv_failure = CsvProcessingError("unparseable")

    with pytest.raises(upload_module.CsvIngestionError):
        await upload.run()

    # Swapping onto an ingestion that produced no Parquet would retire a
    # generation whose cached results are still the only valid ones.
    upload.repository.bump_ingestion_generation.assert_not_awaited()
    assert upload.sweep_calls == []
    assert ("update", "READY") not in upload.calls
    assert ("delete_drive_root", "root-previous") not in upload.calls


@pytest.mark.asyncio
async def test_a_media_only_upload_still_swaps(upload, monkeypatch):
    """A ZIP with no CSV at all is not a failed ingestion, so it must still swap."""

    monkeypatch.setattr(
        ZipValidationService,
        "validate_and_analyze",
        staticmethod(
            lambda **kwargs: (
                [],
                {"images": 0, "videos": 0, "csv": 0, "other": 0},
                UploadSelection(csv_entry_path=None),
                AcquisitionSummary(),
                [],
            )
        ),
    )

    summary = await upload.run()

    assert summary["ingestion_status"] == "READY"
    assert upload.repository.bump_ingestion_generation.await_count == 1

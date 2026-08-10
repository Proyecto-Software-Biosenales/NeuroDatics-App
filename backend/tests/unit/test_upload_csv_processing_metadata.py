import io
import json
from contextlib import contextmanager
from dataclasses import asdict
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

import neurodatics.modules.projects.api.routes as project_routes
import neurodatics.modules.projects.application.use_cases.upload_experiment_zip as upload_module
from neurodatics.config.settings import settings
from neurodatics.modules.participants.domain.entities import Participant  # noqa: F401
from neurodatics.modules.projects.api.schemas import (
    UploadedProjectCsvProcessingResponse,
)
from neurodatics.modules.projects.application.services.csv_processing_service import (
    BlockMetadata,
    ChannelMetadata,
    CsvProcessingService,
    ParticipantInfo,
    ProcessingResult,
)
from neurodatics.modules.projects.application.services.fixation_detection_service import (
    ScreenGeometry,
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


def _summary(project_id):
    return {
        "project_id": project_id,
        "ingestion_status": "READY",
        "drive_root_folder_id": None,
        "drive_root_folder_name": None,
        "drive_root_folder_url": None,
        "zip_saved": False,
        "zip_file": None,
        "counts": {
            "folders_created": 0,
            "files_uploaded": 0,
            "images": 0,
            "videos": 0,
            "csv": 1,
            "other": 0,
            "scenaries_created": 0,
        },
        "files": [],
        "csv_processing": {
            "detected": 1,
            "processed": 1,
            "failed": 0,
            "block_metadata": [],
            "warnings": [],
        },
        "manifest": {
            "total_detected": 1,
            "images": 0,
            "videos": 0,
            "csv": 1,
            "other": 0,
        },
    }


def test_screen_geometry_requires_all_fields_and_positive_values():
    assert project_routes._build_screen_geometry(None, None, None, None, None) is None

    geometry = project_routes._build_screen_geometry(1920, 1080, 530.0, 300.0, 650.0)
    assert geometry == ScreenGeometry(
        width_px=1920,
        height_px=1080,
        width_mm=530.0,
        height_mm=300.0,
        viewing_distance_mm=650.0,
    )

    with pytest.raises(HTTPException) as partial:
        project_routes._build_screen_geometry(1920, None, 530.0, 300.0, 650.0)
    assert partial.value.status_code == 422

    with pytest.raises(HTTPException) as non_positive:
        project_routes._build_screen_geometry(0, 1080, 530.0, 300.0, 650.0)
    assert non_positive.value.status_code == 422


def test_csv_processing_response_remains_compatible_with_count_only_payloads():
    response = UploadedProjectCsvProcessingResponse(detected=1, processed=1, failed=0)

    assert response.block_metadata == []
    assert response.warnings == []


def test_stimulus_placement_multipart_parser_keeps_separate_screen_contract():
    payload = [
        {
            "source_entry_path": r"Images\centered-square.png",
            "placement": {
                "geometry_stability": "static",
                "contract_version": "screen-stimulus-v1",
                "screen_width_px": 1920,
                "screen_height_px": 1080,
                "stimulus_left_px": 420,
                "stimulus_top_px": 0,
                "stimulus_width_px": 1080,
                "stimulus_height_px": 1080,
                "display_mode": "contain",
            },
        }
    ]

    parsed = project_routes._parse_stimulus_placements_json(json.dumps(payload))

    assert parsed[0]["source_entry_path"] == "Images/centered-square.png"
    assert parsed[0]["placement"]["screen_width_px"] == 1920


@pytest.mark.parametrize(
    "payload",
    [
        {"source_entry_path": "Images/a.png", "placement": {}},
        [
            {"source_entry_path": "Images/a.png", "placement": {}},
            {"source_entry_path": "images/A.png", "placement": {}},
        ],
        [
            {
                "source_entry_path": "Images/a.png",
                "placement": {"source": "acquisition_metadata"},
            }
        ],
    ],
)
def test_stimulus_placement_multipart_parser_rejects_invalid_envelopes(payload):
    with pytest.raises(HTTPException) as exc:
        project_routes._parse_stimulus_placements_json(json.dumps(payload))

    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_upload_route_builds_and_forwards_screen_geometry(monkeypatch):
    captured = {}

    class FakeUseCase:
        def __init__(self, repository, db=None):
            pass

        async def execute(self, **kwargs):
            captured.update(kwargs)
            return _summary(kwargs["project_id"])

    async def fake_spool(file, destination):
        return 4

    monkeypatch.setattr(project_routes, "SQLProjectRepository", lambda db: object())
    monkeypatch.setattr(project_routes, "UploadExperimentZipUseCase", FakeUseCase)
    monkeypatch.setattr(project_routes, "_spool_upload_to_disk", fake_spool)

    project_id = uuid4()
    owner_id = uuid4()
    upload = UploadFile(
        io.BytesIO(b"test"),
        filename="experiment.zip",
        headers=Headers({"content-type": "application/zip"}),
    )
    response = await project_routes.upload_experiment_zip(
        project_id=project_id,
        file=upload,
        selected_csv_path=None,
        selected_images_folder=None,
        selected_videos_folder=None,
        selected_acquisition_folder=None,
        allow_missing_images=False,
        allow_missing_videos=False,
        stimulus_placements_json=None,
        screen_width_px=1920,
        screen_height_px=1080,
        screen_width_mm=530.0,
        screen_height_mm=300.0,
        viewing_distance_mm=650.0,
        current_user=str(owner_id),
        db=object(),
    )

    assert response.project_id == project_id
    assert captured["screen_geometry"] == ScreenGeometry(
        width_px=1920,
        height_px=1080,
        width_mm=530.0,
        height_mm=300.0,
        viewing_distance_mm=650.0,
    )
    assert captured["stimulus_placements"] == []


@pytest.mark.asyncio
async def test_use_case_forwards_geometry_and_persists_json_safe_block_metadata(
    tmp_path,
    monkeypatch,
):
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

    geometry = ScreenGeometry(
        width_px=1920,
        height_px=1080,
        width_mm=530.0,
        height_mm=300.0,
        viewing_distance_mm=650.0,
    )
    block = BlockMetadata(
        user_index=1,
        participant_code="P01",
        sample_count=120,
        declared_file_rate_hz=60.0,
        observed_grid_rate_hz=60.0,
        fixation_available=True,
        fixation_method="idt",
        fixation_detector_version="fixation-v2",
        fixation_source="recomputed",
        channels=[
            ChannelMetadata(
                raw_name="Gaze X",
                canonical_name="gx",
                declared_frequency_hz=60.0,
            )
        ],
        warnings=["block warning"],
    )
    processing_result = ProcessingResult(
        detected_sensors=["EyeTracker"],
        participants=[ParticipantInfo(participant_code="P01", user_index=1)],
        user_parquet_paths=[(1, str(user_parquet))],
        scenario_parquet_paths=[(1, "Scene 1", str(scenario_parquet))],
        encoding="utf-16",
        block_metadata=[block],
        warnings=["block 1: block warning"],
    )
    captured_process = {}

    def fake_process(
        csv_path,
        output_dir,
        screen_geometry=None,
        *,
        stimulus_placements_by_scenario=None,
    ):
        captured_process.update(
            csv_path=csv_path,
            output_dir=output_dir,
            screen_geometry=screen_geometry,
            stimulus_placements_by_scenario=stimulus_placements_by_scenario,
        )
        return processing_result

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
    monkeypatch.setattr(CsvProcessingService, "process", staticmethod(fake_process))
    monkeypatch.setattr(settings, "ingestion_save_original_zip", False)

    upload_counter = iter(range(100))

    def fake_create_folder(name, parent_id=None):
        return {"drive_file_id": f"folder-{next(upload_counter)}", "name": name}

    def fake_upload_file(filename, mime_type, parent_id, local_path):
        return {
            "drive_file_id": f"file-{next(upload_counter)}",
            "checksum_sha256": "0" * 64,
            "drive_web_view_link": None,
            "drive_download_link": None,
        }

    monkeypatch.setattr(
        upload_module.gdrive_client, "find_child_folder_by_name", lambda **kwargs: None
    )
    monkeypatch.setattr(
        upload_module.gdrive_client, "create_folder", fake_create_folder
    )
    monkeypatch.setattr(upload_module.gdrive_client, "upload_file", fake_upload_file)
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry, "start", lambda *args: None
    )
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry,
        "mark_uploaded_bytes",
        lambda *args: None,
    )
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry, "complete", lambda *args: None
    )
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry,
        "is_cancel_requested",
        lambda *args: False,
    )
    monkeypatch.setattr(
        upload_module.ParquetCacheService,
        "prune_stale_generations",
        lambda *args, **kwargs: 0,
    )
    monkeypatch.setattr(
        upload_module.AnalyticsRedisCache,
        "invalidate_stale_generations",
        lambda *args, **kwargs: 0,
    )
    monkeypatch.setattr(upload_module, "prune_media_caches", lambda: [])

    project = SimpleNamespace(
        id=project_id,
        name="Experiment",
        drive_root_folder_id=None,
    )
    repository = SimpleNamespace(
        get_by_id=AsyncMock(return_value=project),
        update_project_ingestion=AsyncMock(),
        bump_ingestion_generation=AsyncMock(return_value=1),
        commit=AsyncMock(),
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

    summary = await use_case.execute(
        project_id=project_id,
        owner_id=owner_id,
        zip_path=str(zip_path),
        filename="experiment.zip",
        mime_type="application/zip",
        selection=resolved_selection,
        screen_geometry=geometry,
    )

    serialized_block = asdict(block)
    assert captured_process["screen_geometry"] == geometry
    assert captured_process["stimulus_placements_by_scenario"] == {}
    assert summary["csv_processing"] == {
        "detected": 1,
        "processed": 1,
        "failed": 0,
        "block_metadata": [serialized_block],
        "warnings": ["block 1: block warning"],
    }

    inserted_files = repository.add_files.await_args.args[0]
    processed_files = [
        item for item in inserted_files if item.kind == "processed_parquet"
    ]
    assert len(processed_files) == 2
    assert all(
        item.file_metadata["block_metadata"] == serialized_block
        for item in processed_files
    )

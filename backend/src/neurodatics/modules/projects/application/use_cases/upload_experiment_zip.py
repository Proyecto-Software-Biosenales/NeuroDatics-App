import asyncio
import logging
import pathlib
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from .....config.settings import settings
from .....infra.storage.gdrive_client import gdrive_client
from ....integrations.google_drive.infrastructure.configure_client import configure_gdrive_client_with_oauth
from ....analytics.domain.scenario_identity import scenario_key
from ....analytics.infrastructure.parquet_cache import ParquetCacheService
from ....analytics.infrastructure.redis_cache import AnalyticsRedisCache
from ....scenaries.domain.entities import Scenaries, StimulusPlacement
from ....scenaries.domain.stimulus_placement import (
    StimulusPlacementContract,
    StimulusPlacementValidationError,
)
from ...domain.entities import ProjectFile
from ...domain.repository import ProjectRepository
from ...infrastructure.media_cache_janitor import prune_media_caches
from ..services.csv_processing_service import CsvProcessingService, CsvProcessingError, ParticipantInfo, ProcessingResult
from ..services.drive_upload_progress_registry import drive_upload_progress_registry
from ..services.fixation_detection_service import ScreenGeometry
from ..services.stimulus_probe_service import StimulusDimensions, probe_stimulus
from ..services.zip_extraction_service import ZipExtractionService
from ..services.zip_validation_service import UploadSelection, ZipManifestEntry, ZipValidationService

logger = logging.getLogger(__name__)


class UploadCanceledError(Exception):
    pass


class GoogleDriveConfigurationError(RuntimeError):
    pass


class GoogleDriveReconnectRequiredError(RuntimeError):
    pass


class CsvIngestionError(RuntimeError):
    """No CSV in the ZIP could be processed, so the ingestion produced no data.

    Committing this would swap the project onto an empty ingestion and advance
    the cache generation, retiring a previous generation that still holds valid
    results. Raising keeps that generation authoritative.
    """


class ParticipantIdentityError(RuntimeError):
    """A processed Parquet could not be stamped with one participant code.

    Analytics resolves Parquets by participant identity, so an upload that
    cannot record an unambiguous code would produce files that can never be
    matched back to a participant. Failing here keeps that out of the project.
    """


class StimulusPlacementUploadError(ValueError):
    """An upload placement envelope cannot be resolved to selected media."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class ResolvedStimulusPlacements:
    by_source_entry_path: Dict[str, StimulusPlacementContract] = field(default_factory=dict)
    by_scenario_name: Dict[str, StimulusPlacementContract] = field(default_factory=dict)


GOOGLE_DRIVE_NOT_CONNECTED_MESSAGE = (
    "Google Drive no esta conectado. Reconecta Google Drive antes de subir proyectos."
)
GOOGLE_DRIVE_RECONNECT_MESSAGE = (
    "La conexion de Google Drive expiro o fue revocada. "
    "Reconecta Google Drive para generar un refresh token nuevo."
)


def _is_invalid_google_grant_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "invalid_grant" in message or "expired or revoked" in message


def _user_facing_ingestion_error(exc: Exception) -> str:
    if _is_invalid_google_grant_error(exc):
        return GOOGLE_DRIVE_RECONNECT_MESSAGE
    return str(exc)


class UploadExperimentZipUseCase:
    """End-to-end project ZIP ingestion use case."""

    def __init__(self, repository: ProjectRepository, db: Optional[AsyncSession] = None):
        self.repository = repository
        self.db = db

    async def execute(
        self,
        project_id: UUID,
        owner_id: UUID,
        zip_path: str,
        filename: str,
        mime_type: str,
        selection: Optional[UploadSelection] = None,
        screen_geometry: Optional[ScreenGeometry] = None,
        stimulus_placements: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        project = await self.repository.get_by_id(project_id, owner_id)
        if not project:
            raise ValueError("Project not found or access denied")

        # Configure Google Drive client with OAuth credentials from system integrations
        if self.db:
            configured = await configure_gdrive_client_with_oauth(
                self.db,
                silent=True,
                force_refresh=True,
            )
            if not configured:
                raise GoogleDriveConfigurationError(GOOGLE_DRIVE_NOT_CONNECTED_MESSAGE)

        uploaded_drive_ids: List[str] = []
        previous_root_folder_id = project.drive_root_folder_id

        try:
            # Validate the ZIP structure FIRST, before any uploads or project updates.
            # This ensures that if the structure is invalid, nothing gets uploaded to Drive
            # and the project state is not modified.
            (
                manifest_entries,
                manifest_counts,
                resolved_selection,
                acquisition,
                excluded_entries,
            ) = ZipValidationService.validate_and_analyze(
                filename=filename,
                mime_type=mime_type,
                zip_path=zip_path,
                selection=selection,
            )

            zip_size_bytes = pathlib.Path(zip_path).stat().st_size

            # Extraction is part of validation: it is the pass that actually
            # decompresses (CRC-checking every member and enforcing the byte
            # budget), so it has to happen before the project state changes too.
            with ZipExtractionService.extract_to_temp(zip_path, manifest_entries) as extracted:
                resolved_stimulus_placements = self._resolve_stimulus_placements(
                    stimulus_placements or [],
                    manifest_entries=manifest_entries,
                    extracted_files=extracted.files_by_entry_path,
                    screen_geometry=screen_geometry,
                )
                stimulus_snapshots_by_source = {
                    path: contract.to_snapshot()
                    for path, contract in resolved_stimulus_placements.by_source_entry_path.items()
                }
                stimulus_snapshots_by_scenario = {
                    name: contract.to_snapshot()
                    for name, contract in resolved_stimulus_placements.by_scenario_name.items()
                }
                physical_screen_geometry = self._screen_geometry_snapshot(screen_geometry)
                zip_saved = bool(settings.ingestion_save_original_zip)

                # Structure validation passed, now update project status and proceed with ingestion
                await self.repository.update_project_ingestion(
                    project_id=project_id,
                    updates={
                        "ingestion_status": "PROCESSING",
                        "ingestion_error": None,
                        "storage_provider": "gdrive",
                    },
                )
                await self.repository.commit()
                self._raise_if_canceled(project_id)

                # Always ingest into a fresh root folder when uploading a new ZIP.
                # This allows us to safely replace previous Drive content for edits.
                root_folder_info = await self._create_new_drive_root_folder(project)
                root_folder_id = root_folder_info.get("drive_file_id")
                root_folder_name = root_folder_info.get("name") or project.name
                root_folder_url = root_folder_info.get("drive_web_view_link")

                if root_folder_id:
                    uploaded_drive_ids.append(root_folder_id)

                folder_cache: Dict[str, str] = {"": root_folder_id}

                files_to_insert: List[ProjectFile] = []
                scenaries_to_insert: List[Scenaries] = []
                response_files: List[Dict[str, Any]] = []
                csv_summary = {
                    "detected": 0,
                    "processed": 0,
                    "failed": 0,
                    "block_metadata": [],
                    "warnings": [],
                }
                counts = {
                    "folders_created": 0,
                    "files_uploaded": 0,
                    "images": 0,
                    "videos": 0,
                    "csv": 0,
                    "other": 0,
                    "scenaries_created": 0,
                }

                if root_folder_id:
                    counts["folders_created"] += 1

                source_zip_file_id: Optional[UUID] = None
                zip_file_response: Optional[Dict[str, Any]] = None
                all_detected_sensors: List[str] = []
                all_participants: List[ParticipantInfo] = []
                processing_result: Optional[ProcessingResult] = None
                all_user_parquet_paths: List[tuple[int, str]] = []
                all_scenario_parquet_paths: List[tuple[int, str, str]] = []
                parquet_block_metadata: Dict[str, Dict[str, Any]] = {}
                parquet_participant_codes: Dict[str, str] = {}
                processed_stimulus_snapshots_by_scenario: Dict[str, Dict[str, Any]] = {}
                drive_uploaded_bytes = 0

                processed_output_dir = pathlib.Path(extracted.temp_dir) / "processed"
                processed_output_dir.mkdir(parents=True, exist_ok=True)

                raw_csv_entry_count = sum(
                    1 for entry in manifest_entries if entry.kind == "raw_csv"
                )

                for csv_entry in (entry for entry in manifest_entries if entry.kind == "raw_csv"):
                    self._raise_if_canceled(project_id)
                    local_csv_path = extracted.files_by_entry_path.get(csv_entry.source_entry_path)
                    if not local_csv_path:
                        csv_summary["failed"] += 1
                        logger.warning("CSV file not found in extraction map: %s", csv_entry.source_entry_path)
                        continue

                    try:
                        processing_result = await asyncio.to_thread(
                            CsvProcessingService.process,
                            local_csv_path,
                            str(processed_output_dir),
                            screen_geometry=screen_geometry,
                            stimulus_placements_by_scenario=(
                                resolved_stimulus_placements.by_scenario_name
                            ),
                        )
                    except CsvProcessingError as exc:
                        csv_summary["failed"] += 1
                        logger.warning("CSV processing failed for %s: %s", csv_entry.source_entry_path, exc)
                        continue

                    csv_summary["processed"] += 1
                    all_detected_sensors.extend(processing_result.detected_sensors)
                    all_participants.extend(processing_result.participants)
                    all_user_parquet_paths.extend(processing_result.user_parquet_paths)
                    all_scenario_parquet_paths.extend(processing_result.scenario_parquet_paths)
                    processed_stimulus_snapshots_by_scenario.update(
                        processing_result.stimulus_placements_by_scenario
                    )

                    serialized_blocks = [
                        asdict(block_metadata)
                        for block_metadata in processing_result.block_metadata
                    ]
                    csv_summary["block_metadata"].extend(serialized_blocks)
                    csv_summary["warnings"].extend(processing_result.warnings)

                    metadata_by_user = {
                        block_metadata.user_index: serialized
                        for block_metadata, serialized in zip(
                            processing_result.block_metadata,
                            serialized_blocks,
                        )
                    }
                    code_by_user = self._participant_codes_by_user_index(processing_result)
                    for user_index, parquet_path in processing_result.user_parquet_paths:
                        block_metadata = metadata_by_user.get(user_index)
                        if block_metadata is not None:
                            parquet_block_metadata[parquet_path] = block_metadata
                        participant_code = code_by_user.get(user_index)
                        if participant_code:
                            parquet_participant_codes[parquet_path] = participant_code
                    for user_index, _, parquet_path in processing_result.scenario_parquet_paths:
                        block_metadata = metadata_by_user.get(user_index)
                        if block_metadata is not None:
                            parquet_block_metadata[parquet_path] = block_metadata
                        participant_code = code_by_user.get(user_index)
                        if participant_code:
                            parquet_participant_codes[parquet_path] = participant_code

                # Every CSV failing is not a successful swap: the ingestion would
                # replace the project's files with none, advance the generation, and
                # leave analytics answering 404 under the new identity while the
                # previous generation's perfectly good cache sits unreachable. Raise
                # so the transaction rolls back and readers keep the old generation.
                if raw_csv_entry_count and not csv_summary["processed"]:
                    raise CsvIngestionError(
                        f"Ninguno de los {raw_csv_entry_count} CSV del ZIP pudo procesarse; "
                        "no se reemplazaron los datos previos del proyecto."
                    )

                all_detected_sensors = list(dict.fromkeys(all_detected_sensors))
                all_user_parquet_paths = self._dedupe_user_parquet_paths(all_user_parquet_paths)
                all_scenario_parquet_paths = self._dedupe_scenario_parquet_paths(all_scenario_parquet_paths)
                self._assert_participant_identity(
                    user_parquet_paths=all_user_parquet_paths,
                    scenario_parquet_paths=all_scenario_parquet_paths,
                    participant_codes=parquet_participant_codes,
                )

                total_drive_bytes = sum(
                    max(0, int(entry.size_bytes or 0))
                    for entry in manifest_entries
                    if entry.kind != "raw_csv"
                )
                total_drive_bytes += sum(pathlib.Path(path).stat().st_size for _, path in all_user_parquet_paths)
                total_drive_bytes += sum(
                    pathlib.Path(path).stat().st_size for _, _, path in all_scenario_parquet_paths
                )
                if zip_saved:
                    total_drive_bytes += zip_size_bytes

                drive_upload_progress_registry.start(project_id, total_drive_bytes)
                self._raise_if_canceled(project_id)

                if zip_saved:
                    self._raise_if_canceled(project_id)
                    zip_upload = await asyncio.to_thread(
                        gdrive_client.upload_file,
                        filename=filename,
                        mime_type=mime_type,
                        parent_id=root_folder_id,
                        local_path=zip_path,
                    )
                    uploaded_drive_ids.append(zip_upload["drive_file_id"])
                    drive_uploaded_bytes += zip_size_bytes
                    drive_upload_progress_registry.mark_uploaded_bytes(project_id, drive_uploaded_bytes)

                    source_zip_file_id = uuid.uuid4()
                    checksum = zip_upload["checksum_sha256"]
                    zip_project_file = ProjectFile(
                        id=source_zip_file_id,
                        project_id=project_id,
                        source_zip_id=None,
                        kind="experiment_zip",
                        storage_provider="gdrive",
                        external_id=zip_upload["drive_file_id"],
                        drive_parent_external_id=root_folder_id,
                        filename=filename,
                        original_filename=filename,
                        source_entry_path=None,
                        mime_type=mime_type,
                        extension=".zip",
                        size_bytes=zip_size_bytes,
                        checksum_sha256=checksum,
                        drive_web_view_link=zip_upload.get("drive_web_view_link"),
                        drive_download_link=zip_upload.get("drive_download_link"),
                        validation_status="valid",
                        validation_errors=None,
                        processing_status="processed",
                        processing_errors=None,
                        processed_at=datetime.now(timezone.utc),
                        file_metadata={
                            "entry_count": len(manifest_entries),
                            "stimulus_placements_by_source_entry_path": stimulus_snapshots_by_source,
                            "physical_screen_geometry": physical_screen_geometry,
                        },
                        zip_manifest={
                            "entries": [
                                {
                                    "source_entry_path": entry.source_entry_path,
                                    "kind": entry.kind,
                                    "size_bytes": entry.size_bytes,
                                }
                                for entry in manifest_entries
                            ]
                        },
                        entry_count=len(manifest_entries),
                        root_folder_name=root_folder_name,
                        deleted_at=None,
                    )
                    files_to_insert.append(zip_project_file)
                    zip_file_response = self._to_response_file(zip_project_file)

                for folder_path in extracted.folders:
                    self._raise_if_canceled(project_id)
                    await self._ensure_folder_path(
                        folder_path=folder_path,
                        root_folder_id=root_folder_id,
                        folder_cache=folder_cache,
                        uploaded_drive_ids=uploaded_drive_ids,
                        counters=counts,
                    )

                for entry in manifest_entries:
                    self._raise_if_canceled(project_id)

                    if entry.kind == "raw_csv":
                        csv_summary["detected"] += 1
                        counts["csv"] += 1
                        continue

                    local_path = extracted.files_by_entry_path.get(entry.source_entry_path)
                    if not local_path:
                        continue

                    parent_path = str(PurePosixPath(entry.source_entry_path).parent)
                    if parent_path == ".":
                        parent_path = ""

                    parent_folder_id = await self._ensure_folder_path(
                        folder_path=parent_path,
                        root_folder_id=root_folder_id,
                        folder_cache=folder_cache,
                        uploaded_drive_ids=uploaded_drive_ids,
                        counters=counts,
                    )

                    upload_info = await asyncio.to_thread(
                        gdrive_client.upload_file,
                        filename=entry.filename,
                        mime_type=entry.mime_type,
                        parent_id=parent_folder_id,
                        local_path=local_path,
                    )
                    uploaded_drive_ids.append(upload_info["drive_file_id"])
                    drive_uploaded_bytes += max(0, int(entry.size_bytes or 0))
                    drive_upload_progress_registry.mark_uploaded_bytes(project_id, drive_uploaded_bytes)

                    if entry.kind == "scenario_image":
                        counts["images"] += 1
                    elif entry.kind == "scenario_video":
                        counts["videos"] += 1
                    else:
                        counts["other"] += 1

                    # The Drive client already hashed the file while streaming it,
                    # so reuse that instead of reading every file a second time.
                    checksum_sha256 = upload_info["checksum_sha256"]
                    file_metadata: Dict[str, Any] = {
                        "source_entry_path": entry.source_entry_path,
                    }
                    placement_contract = resolved_stimulus_placements.by_source_entry_path.get(
                        entry.source_entry_path
                    )
                    if placement_contract is not None:
                        file_metadata["stimulus_placement"] = placement_contract.to_snapshot()

                    file_id = uuid.uuid4()
                    project_file = ProjectFile(
                        id=file_id,
                        project_id=project_id,
                        source_zip_id=source_zip_file_id,
                        kind=entry.kind,
                        storage_provider="gdrive",
                        external_id=upload_info["drive_file_id"],
                        drive_parent_external_id=parent_folder_id,
                        filename=entry.filename,
                        original_filename=entry.filename,
                        source_entry_path=entry.source_entry_path,
                        mime_type=entry.mime_type,
                        extension=entry.extension,
                        size_bytes=entry.size_bytes,
                        checksum_sha256=checksum_sha256,
                        drive_web_view_link=upload_info.get("drive_web_view_link"),
                        drive_download_link=upload_info.get("drive_download_link"),
                        validation_status="valid",
                        validation_errors=None,
                        processing_status="processed",
                        processing_errors=None,
                        processed_at=datetime.now(timezone.utc),
                        file_metadata=file_metadata,
                        deleted_at=None,
                    )
                    files_to_insert.append(project_file)
                    response_files.append(self._to_response_file(project_file))
                    counts["files_uploaded"] += 1

                    maybe_scenary = self._build_scenary_from_file(
                        project_file,
                        local_path,
                        placement_contract=placement_contract,
                    )
                    if maybe_scenary:
                        scenaries_to_insert.append(maybe_scenary)

                if processing_result is not None:
                    await self._ensure_folder_path(
                        "processed",
                        root_folder_id,
                        folder_cache,
                        uploaded_drive_ids,
                        counts,
                    )

                    for user_index, parquet_path in all_user_parquet_paths:
                        self._raise_if_canceled(project_id)
                        parquet_size = pathlib.Path(parquet_path).stat().st_size

                        user_folder_id = await self._ensure_folder_path(
                            f"processed/user{user_index}",
                            root_folder_id,
                            folder_cache,
                            uploaded_drive_ids,
                            counts,
                        )

                        upload_info = await asyncio.to_thread(
                            gdrive_client.upload_file,
                            filename=f"user{user_index}.parquet",
                            mime_type="application/octet-stream",
                            parent_id=user_folder_id,
                            local_path=parquet_path,
                        )
                        uploaded_drive_ids.append(upload_info["drive_file_id"])
                        drive_uploaded_bytes += parquet_size
                        drive_upload_progress_registry.mark_uploaded_bytes(project_id, drive_uploaded_bytes)

                        file_id = uuid.uuid4()
                        user_file_metadata: Dict[str, Any] = {
                            "user_index": user_index,
                            "type": "user_parquet",
                            # Top-level identity: analytics matches on this and
                            # never on the position of a participant row.
                            "participant_code": parquet_participant_codes[parquet_path],
                        }
                        block_metadata = parquet_block_metadata.get(parquet_path)
                        if block_metadata is not None:
                            user_file_metadata["block_metadata"] = block_metadata
                        user_file_metadata["stimulus_placements_by_scenario"] = (
                            processed_stimulus_snapshots_by_scenario
                            or stimulus_snapshots_by_scenario
                        )
                        if physical_screen_geometry is not None:
                            user_file_metadata["physical_screen_geometry"] = physical_screen_geometry

                        project_file = ProjectFile(
                            id=file_id,
                            project_id=project_id,
                            source_zip_id=source_zip_file_id,
                            kind="processed_parquet",
                            storage_provider="gdrive",
                            external_id=upload_info["drive_file_id"],
                            drive_parent_external_id=user_folder_id,
                            filename=f"user{user_index}.parquet",
                            original_filename=f"user{user_index}.parquet",
                            source_entry_path=f"processed/user{user_index}/user{user_index}.parquet",
                            mime_type="application/octet-stream",
                            extension=".parquet",
                            size_bytes=parquet_size,
                            checksum_sha256=upload_info["checksum_sha256"],
                            drive_web_view_link=upload_info.get("drive_web_view_link"),
                            drive_download_link=upload_info.get("drive_download_link"),
                            validation_status="valid",
                            validation_errors=None,
                            processing_status="processed",
                            processing_errors=None,
                            processed_at=datetime.now(timezone.utc),
                            file_metadata=user_file_metadata,
                            deleted_at=None,
                        )
                        files_to_insert.append(project_file)
                        response_files.append(self._to_response_file(project_file))
                        counts["files_uploaded"] += 1

                    for user_index, scenario_name, parquet_path in all_scenario_parquet_paths:
                        self._raise_if_canceled(project_id)
                        parquet_size = pathlib.Path(parquet_path).stat().st_size

                        esc_folder_id = await self._ensure_folder_path(
                            f"processed/user{user_index}/escenarios",
                            root_folder_id,
                            folder_cache,
                            uploaded_drive_ids,
                            counts,
                        )

                        clean_name = CsvProcessingService._clean_scenario_name(scenario_name)
                        upload_info = await asyncio.to_thread(
                            gdrive_client.upload_file,
                            filename=f"{clean_name}.parquet",
                            mime_type="application/octet-stream",
                            parent_id=esc_folder_id,
                            local_path=parquet_path,
                        )
                        uploaded_drive_ids.append(upload_info["drive_file_id"])
                        drive_uploaded_bytes += parquet_size
                        drive_upload_progress_registry.mark_uploaded_bytes(project_id, drive_uploaded_bytes)

                        file_id = uuid.uuid4()
                        scenario_file_metadata: Dict[str, Any] = {
                            "user_index": user_index,
                            "scenario": scenario_name,
                            "type": "scenario_parquet",
                            "participant_code": parquet_participant_codes[parquet_path],
                        }
                        block_metadata = parquet_block_metadata.get(parquet_path)
                        if block_metadata is not None:
                            scenario_file_metadata["block_metadata"] = block_metadata
                        scenario_contract = self._placement_for_scenario(
                            resolved_stimulus_placements,
                            scenario_name,
                        )
                        if scenario_contract is not None:
                            scenario_file_metadata["stimulus_placement"] = (
                                scenario_contract.to_snapshot()
                            )
                        if physical_screen_geometry is not None:
                            scenario_file_metadata["physical_screen_geometry"] = physical_screen_geometry

                        project_file = ProjectFile(
                            id=file_id,
                            project_id=project_id,
                            source_zip_id=source_zip_file_id,
                            kind="processed_parquet",
                            storage_provider="gdrive",
                            external_id=upload_info["drive_file_id"],
                            drive_parent_external_id=esc_folder_id,
                            filename=f"{clean_name}.parquet",
                            original_filename=f"{clean_name}.parquet",
                            source_entry_path=f"processed/user{user_index}/escenarios/{clean_name}.parquet",
                            mime_type="application/octet-stream",
                            extension=".parquet",
                            size_bytes=parquet_size,
                            checksum_sha256=upload_info["checksum_sha256"],
                            drive_web_view_link=upload_info.get("drive_web_view_link"),
                            drive_download_link=upload_info.get("drive_download_link"),
                            validation_status="valid",
                            validation_errors=None,
                            processing_status="processed",
                            processing_errors=None,
                            processed_at=datetime.now(timezone.utc),
                            file_metadata=scenario_file_metadata,
                            deleted_at=None,
                        )
                        files_to_insert.append(project_file)
                        response_files.append(self._to_response_file(project_file))
                        counts["files_uploaded"] += 1

            self._raise_if_canceled(project_id)
            await self.repository.soft_delete_active_files(project_id)
            # DB has a unique constraint for one experiment ZIP per project.
            # Remove any historical experiment_zip rows before inserting the new one.
            await self.repository.purge_files_by_kind(project_id, "experiment_zip")
            await self.repository.clear_project_scenaries(project_id)
            await self.repository.add_files(files_to_insert)
            await self.repository.add_scenaries(scenaries_to_insert)

            counts["scenaries_created"] = len(scenaries_to_insert)

            self._raise_if_canceled(project_id)
            await self.repository.update_project_ingestion(
                project_id=project_id,
                updates={
                    "ingestion_status": "READY",
                    "ingestion_error": None,
                    "last_ingested_at": datetime.now(timezone.utc),
                    "storage_provider": "gdrive",
                    "drive_root_folder_id": root_folder_id,
                    "drive_root_folder_name": root_folder_name,
                    "drive_root_folder_url": root_folder_url,
                },
            )
            # The bump has to sit between the READY update and the commit: both
            # flush into the same transaction, so the generation and the data it
            # names become visible in one step. If anything raises before the
            # commit, the generation never advances, every reader keeps resolving
            # the previous one, and the caches written under it stay valid.
            new_generation = await self.repository.bump_ingestion_generation(project_id)
            await self.repository.commit()
            drive_upload_progress_registry.complete(project_id)

            # Reclaimed only after the commit. Deleting it earlier destroyed the
            # content the un-bumped generation still pointed at, so a cancel or a DB
            # error in that window left the project with neither the old ingestion
            # nor the new one. Failing to delete it now merely leaks a superseded
            # folder that no committed row references.
            if previous_root_folder_id and previous_root_folder_id != root_folder_id:
                try:
                    deleted = await asyncio.to_thread(
                        gdrive_client.delete_file, previous_root_folder_id
                    )
                except Exception:
                    deleted = False
                    logger.warning(
                        "Could not delete superseded Drive root %s for project %s",
                        previous_root_folder_id,
                        project_id,
                        exc_info=True,
                    )
                if not deleted:
                    logger.warning(
                        "Superseded Drive root %s for project %s is orphaned but unreferenced",
                        previous_root_folder_id,
                        project_id,
                    )

            # Space reclamation only, never the freshness mechanism: readers already
            # resolve the new generation from the committed row, so nothing below can
            # serve the previous upload's numbers even if the whole sweep fails.
            try:
                await asyncio.to_thread(
                    ParquetCacheService().prune_stale_generations,
                    project_id,
                    new_generation,
                    keep_previous=settings.parquet_cache_keep_previous_generations,
                    max_removals=settings.parquet_cache_prune_max_removals,
                )
                await asyncio.to_thread(
                    AnalyticsRedisCache().invalidate_stale_generations,
                    project_id,
                    new_generation,
                    keep_previous=settings.parquet_cache_keep_previous_generations,
                    max_deletions=settings.analytics_redis_stale_generation_max_deletions,
                )
                await asyncio.to_thread(prune_media_caches)
            except Exception:
                logger.warning(
                    "Post-ingestion cache sweep failed for project %s; the upload is committed "
                    "and generation %s is already serving fresh data",
                    project_id,
                    new_generation,
                    exc_info=True,
                )

            return {
                "project_id": project_id,
                "drive_root_folder_id": root_folder_id,
                "drive_root_folder_name": root_folder_name,
                "drive_root_folder_url": root_folder_url,
                "ingestion_status": "READY",
                "zip_saved": zip_saved,
                "zip_file": zip_file_response,
                "counts": counts,
                "files": response_files,
                "csv_processing": csv_summary,
                "manifest": {
                    "total_detected": len(manifest_entries),
                    "images": manifest_counts["images"],
                    "videos": manifest_counts["videos"],
                    "csv": manifest_counts["csv"],
                    "other": manifest_counts["other"],
                },
                "detected_sensors": all_detected_sensors,
                "participants": [
                    {
                        "participant_code": participant.participant_code,
                        "user_index": participant.user_index,
                    }
                    for participant in all_participants
                ],
                "selection": {
                    "csv_entry_path": resolved_selection.csv_entry_path,
                    "images_folder": resolved_selection.images_folder,
                    "videos_folder": resolved_selection.videos_folder,
                    "acquisition_folder": resolved_selection.acquisition_folder,
                },
                "acquisition": acquisition.to_dict(),
                "excluded_entries": excluded_entries,
                "stimulus_placements": stimulus_snapshots_by_source,
            }
        except Exception as exc:
            user_error = _user_facing_ingestion_error(exc)
            logger.exception("Project ingestion failed for project %s", project_id)
            drive_upload_progress_registry.fail(project_id, user_error)
            await self.repository.rollback()

            for drive_id in reversed(uploaded_drive_ids):
                try:
                    await asyncio.to_thread(gdrive_client.delete_file, drive_id)
                except Exception:
                    logger.warning("Could not delete drive object during compensation: %s", drive_id)

            # If the error was a ZIP structure validation error or a pending
            # clarification, it was raised before any project update or Drive
            # upload, so we re-raise it as-is and leave the project untouched.
            if isinstance(
                exc,
                (
                    ZipValidationService.ValidationError,
                    ZipValidationService.ClarificationRequired,
                    StimulusPlacementUploadError,
                ),
            ):
                raise

            if isinstance(exc, UploadCanceledError):
                failure_updates = {
                    "ingestion_status": "FAILED",
                    "ingestion_error": "Upload canceled by user",
                    "storage_provider": "gdrive",
                }
                try:
                    await self.repository.update_project_ingestion(project_id=project_id, updates=failure_updates)
                    await self.repository.commit()
                except Exception:
                    await self.repository.rollback()
                    logger.exception("Could not update project ingestion status after cancellation")
                raise

            # For other errors that occur after project updates (e.g., during Drive operations),
            # mark the project as FAILED so the user can retry or see what went wrong.
            failure_updates = {
                "ingestion_status": "FAILED",
                "ingestion_error": user_error,
                "storage_provider": "gdrive",
            }
            try:
                await self.repository.update_project_ingestion(project_id=project_id, updates=failure_updates)
                await self.repository.commit()
            except Exception:
                await self.repository.rollback()
                logger.exception("Could not update project ingestion status to FAILED")

            if _is_invalid_google_grant_error(exc):
                raise GoogleDriveReconnectRequiredError(user_error) from exc

            raise

    def _raise_if_canceled(self, project_id: UUID) -> None:
        if drive_upload_progress_registry.is_cancel_requested(project_id):
            raise UploadCanceledError("Upload canceled by user")

    async def _create_new_drive_root_folder(self, project: Any) -> Dict[str, Any]:
        folder_name = f"{project.name}-{str(project.id)[:8]}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        return await asyncio.to_thread(gdrive_client.create_folder, name=folder_name, parent_id=None)

    async def _ensure_folder_path(
        self,
        folder_path: str,
        root_folder_id: Optional[str],
        folder_cache: Dict[str, str],
        uploaded_drive_ids: List[str],
        counters: Dict[str, int],
    ) -> Optional[str]:
        normalized = folder_path.strip("/") if folder_path else ""
        if normalized in folder_cache:
            return folder_cache[normalized]

        parts = [part for part in normalized.split("/") if part]
        current_path = ""
        current_parent = root_folder_id

        for part in parts:
            current_path = f"{current_path}/{part}".strip("/")
            if current_path in folder_cache:
                current_parent = folder_cache[current_path]
                continue

            existing = (
                await asyncio.to_thread(gdrive_client.find_child_folder_by_name, name=part, parent_id=current_parent)
                if current_parent
                else None
            )
            if existing:
                folder_id = existing["drive_file_id"]
            else:
                created = await asyncio.to_thread(gdrive_client.create_folder, name=part, parent_id=current_parent)
                folder_id = created["drive_file_id"]
                uploaded_drive_ids.append(folder_id)
                counters["folders_created"] += 1

            folder_cache[current_path] = folder_id
            current_parent = folder_id

        return current_parent

    def _resolve_stimulus_placements(
        self,
        envelopes: List[Dict[str, Any]],
        *,
        manifest_entries: List[ZipManifestEntry],
        extracted_files: Dict[str, str],
        screen_geometry: Optional[ScreenGeometry],
    ) -> ResolvedStimulusPlacements:
        """Validate placement contracts before CSV processing or remote writes."""

        resolved = ResolvedStimulusPlacements()
        if not envelopes:
            return resolved

        media_entries = [
            entry
            for entry in manifest_entries
            if entry.kind in {"scenario_image", "scenario_video"}
        ]
        media_by_path = {entry.source_entry_path: entry for entry in media_entries}

        media_paths_by_key: Dict[str, List[str]] = {}
        for entry in media_entries:
            key = scenario_key(PurePosixPath(entry.source_entry_path).stem)
            if key:
                media_paths_by_key.setdefault(key, []).append(entry.source_entry_path)
        collisions = {
            key: paths for key, paths in media_paths_by_key.items() if len(paths) > 1
        }
        if collisions:
            rendered = "; ".join(
                f"{key}: {', '.join(sorted(paths))}"
                for key, paths in sorted(collisions.items())
            )
            raise StimulusPlacementUploadError(
                "ambiguous_stimulus_identity",
                "Selected stimulus paths collide after scenario normalization: " + rendered,
            )

        seen_paths: set[str] = set()
        for index, envelope in enumerate(envelopes):
            if not isinstance(envelope, dict):
                raise StimulusPlacementUploadError(
                    "invalid_stimulus_placements",
                    f"placement entry {index} must be an object",
                )
            raw_path = envelope.get("source_entry_path")
            payload = envelope.get("placement")
            if not isinstance(raw_path, str) or not isinstance(payload, dict):
                raise StimulusPlacementUploadError(
                    "invalid_stimulus_placements",
                    f"placement entry {index} requires source_entry_path and placement",
                )
            source_entry_path = ZipValidationService.normalize_entry_path(raw_path)
            if source_entry_path in seen_paths:
                raise StimulusPlacementUploadError(
                    "duplicate_stimulus_placement",
                    f"Duplicate stimulus placement for {source_entry_path}",
                )
            seen_paths.add(source_entry_path)

            entry = media_by_path.get(source_entry_path)
            if entry is None:
                raise StimulusPlacementUploadError(
                    "unknown_stimulus_path",
                    f"No selected image or video matches {source_entry_path}",
                )
            local_path = extracted_files.get(source_entry_path)
            if not local_path:
                raise StimulusPlacementUploadError(
                    "unknown_stimulus_path",
                    f"Selected stimulus was not extracted: {source_entry_path}",
                )

            dimensions = probe_stimulus(local_path, entry.kind)
            try:
                contract = StimulusPlacementContract.from_dict(
                    payload,
                    intrinsic_width=dimensions.width,
                    intrinsic_height=dimensions.height,
                    source="user_config",
                )
            except StimulusPlacementValidationError as exc:
                raise StimulusPlacementUploadError(exc.code, str(exc)) from exc

            if screen_geometry is not None and (
                float(screen_geometry.width_px) != float(contract.screen_width_px)
                or float(screen_geometry.height_px) != float(contract.screen_height_px)
            ):
                raise StimulusPlacementUploadError(
                    "screen_geometry_mismatch",
                    "Stimulus placement screen pixels must match physical screen geometry",
                )

            scenario_name = PurePosixPath(source_entry_path).stem
            resolved.by_source_entry_path[source_entry_path] = contract
            resolved.by_scenario_name[scenario_name] = contract

        return resolved

    @staticmethod
    def _placement_for_scenario(
        placements: ResolvedStimulusPlacements,
        scenario_name: str,
    ) -> Optional[StimulusPlacementContract]:
        requested_key = scenario_key(scenario_name)
        matches = [
            contract
            for stored_name, contract in placements.by_scenario_name.items()
            if scenario_key(stored_name) == requested_key
        ]
        if not matches:
            return None
        if len(matches) > 1:
            raise StimulusPlacementUploadError(
                "ambiguous_stimulus_identity",
                f"Scenario {scenario_name!r} matches multiple stimulus placements",
            )
        return matches[0]

    @staticmethod
    def _screen_geometry_snapshot(
        screen_geometry: Optional[ScreenGeometry],
    ) -> Optional[Dict[str, Any]]:
        if screen_geometry is None:
            return None
        return {
            "width_px": screen_geometry.width_px,
            "height_px": screen_geometry.height_px,
            "width_mm": screen_geometry.width_mm,
            "height_mm": screen_geometry.height_mm,
            "viewing_distance_mm": screen_geometry.viewing_distance_mm,
        }

    def _participant_codes_by_user_index(
        self,
        processing_result: ProcessingResult,
    ) -> Dict[int, str]:
        """Participant code for each CSV block, keyed by its block position.

        The block position is only used to join the code to the Parquet the same
        pass produced; it never reaches the stored metadata.
        """

        codes: Dict[int, str] = {}
        for participant in processing_result.participants:
            code = (participant.participant_code or "").strip()
            if code:
                codes.setdefault(participant.user_index, code)
        for block_metadata in processing_result.block_metadata:
            code = (block_metadata.participant_code or "").strip()
            if code:
                codes.setdefault(block_metadata.user_index, code)
        return codes

    def _assert_participant_identity(
        self,
        user_parquet_paths: List[tuple[int, str]],
        scenario_parquet_paths: List[tuple[int, str, str]],
        participant_codes: Dict[str, str],
    ) -> None:
        """Refuse to store Parquets that analytics could not resolve later."""

        missing = [
            f"user{user_index}.parquet"
            for user_index, parquet_path in user_parquet_paths
            if not participant_codes.get(parquet_path)
        ]
        missing.extend(
            f"user{user_index}/{scenario_name}.parquet"
            for user_index, scenario_name, parquet_path in scenario_parquet_paths
            if not participant_codes.get(parquet_path)
        )
        if missing:
            raise ParticipantIdentityError(
                "No se pudo determinar el codigo de participante para: "
                + ", ".join(missing)
            )

        seen: Dict[str, int] = {}
        for user_index, parquet_path in user_parquet_paths:
            code = participant_codes[parquet_path]
            if code in seen:
                raise ParticipantIdentityError(
                    f"El codigo de participante '{code}' aparece en los bloques "
                    f"{seen[code]} y {user_index} del CSV; cada participante debe "
                    "tener un unico bloque para poder identificar su Parquet."
                )
            seen[code] = user_index

    def _dedupe_user_parquet_paths(self, paths: List[tuple[int, str]]) -> List[tuple[int, str]]:
        deduped: Dict[int, str] = {}
        for user_index, parquet_path in paths:
            deduped[user_index] = parquet_path

        if len(deduped) != len(paths):
            logger.info("Deduplicated user parquet outputs: %d -> %d", len(paths), len(deduped))

        return list(deduped.items())

    def _dedupe_scenario_parquet_paths(
        self,
        paths: List[tuple[int, str, str]],
    ) -> List[tuple[int, str, str]]:
        deduped: Dict[tuple[int, str], tuple[int, str, str]] = {}
        for user_index, scenario_name, parquet_path in paths:
            clean_name = CsvProcessingService._clean_scenario_name(scenario_name)
            deduped[(user_index, clean_name)] = (user_index, scenario_name, parquet_path)

        if len(deduped) != len(paths):
            logger.info("Deduplicated scenario parquet outputs: %d -> %d", len(paths), len(deduped))

        return list(deduped.values())

    def _build_scenary_from_file(
        self,
        project_file: ProjectFile,
        local_path: Optional[str] = None,
        placement_contract: Optional[StimulusPlacementContract] = None,
    ) -> Optional[Scenaries]:
        if project_file.kind not in {"scenario_image", "scenario_video"}:
            return None

        scenary_type = "image" if project_file.kind == "scenario_image" else "video"
        scenary_name = PurePosixPath(project_file.source_entry_path or project_file.filename).stem

        # Analytics renders heatmaps at the stimulus' own pixel size, and this
        # extraction is the only moment the bytes are local. A file we cannot
        # read yields no dimensions and the scenario keeps the 1920x1080
        # fallback rather than failing the upload.
        dimensions = (
            probe_stimulus(local_path, project_file.kind)
            if local_path
            else StimulusDimensions()
        )
        if not dimensions.has_size:
            logger.info(
                "No intrinsic dimensions for stimulus %s; analytics will use the reference size",
                project_file.source_entry_path or project_file.filename,
            )

        scenary = Scenaries(
            id=uuid.uuid4(),
            project_id=project_file.project_id,
            name=scenary_name,
            type=scenary_type,
            file_id=project_file.id,
            source_entry_path=project_file.source_entry_path,
            width=dimensions.width,
            height=dimensions.height,
            fps=dimensions.fps,
            duration_ms=dimensions.duration_ms,
        )
        if placement_contract is not None:
            scenary.stimulus_placement = StimulusPlacement.from_contract(placement_contract)
        return scenary

    def _to_response_file(self, project_file: ProjectFile) -> Dict[str, Any]:
        return {
            "id": project_file.id,
            "kind": project_file.kind,
            "filename": project_file.filename,
            "source_entry_path": project_file.source_entry_path,
            "external_id": project_file.external_id,
            "drive_web_view_link": project_file.drive_web_view_link,
            "mime_type": project_file.mime_type,
        }

import asyncio
import hashlib
import logging
import pathlib
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from .....config.settings import settings
from .....infra.storage.gdrive_client import gdrive_client
from ....integrations.google_drive.infrastructure.configure_client import configure_gdrive_client_with_oauth
from ....scenaries.domain.entities import Scenaries
from ...domain.entities import ProjectFile
from ...domain.repository import ProjectRepository
from ..services.csv_processing_service import CsvProcessingService, CsvProcessingError, ParticipantInfo, ProcessingResult
from ..services.drive_upload_progress_registry import drive_upload_progress_registry
from ..services.zip_extraction_service import ZipExtractionService
from ..services.zip_validation_service import ZipManifestEntry, ZipValidationService

logger = logging.getLogger(__name__)


class UploadCanceledError(Exception):
    pass


class GoogleDriveConfigurationError(RuntimeError):
    pass


class GoogleDriveReconnectRequiredError(RuntimeError):
    pass


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
        file_content: bytes,
        filename: str,
        mime_type: str,
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
            manifest_entries, manifest_counts = ZipValidationService.validate_and_analyze(
                filename=filename,
                mime_type=mime_type,
                file_content=file_content,
            )

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
            csv_summary = {"detected": 0, "processed": 0, "failed": 0}
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
            drive_uploaded_bytes = 0

            with ZipExtractionService.extract_to_temp(file_content, manifest_entries) as extracted:
                processed_output_dir = pathlib.Path(extracted.temp_dir) / "processed"
                processed_output_dir.mkdir(parents=True, exist_ok=True)

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

                all_detected_sensors = list(dict.fromkeys(all_detected_sensors))
                all_user_parquet_paths = self._dedupe_user_parquet_paths(all_user_parquet_paths)
                all_scenario_parquet_paths = self._dedupe_scenario_parquet_paths(all_scenario_parquet_paths)

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
                    total_drive_bytes += len(file_content)

                drive_upload_progress_registry.start(project_id, total_drive_bytes)
                self._raise_if_canceled(project_id)

                if zip_saved:
                    self._raise_if_canceled(project_id)
                    zip_upload = await asyncio.to_thread(
                        gdrive_client.upload_file,
                        filename=filename,
                        mime_type=mime_type,
                        parent_id=root_folder_id,
                        file_content=file_content,
                    )
                    uploaded_drive_ids.append(zip_upload["drive_file_id"])
                    drive_uploaded_bytes += len(file_content)
                    drive_upload_progress_registry.mark_uploaded_bytes(project_id, drive_uploaded_bytes)

                    source_zip_file_id = uuid.uuid4()
                    checksum = hashlib.sha256(file_content).hexdigest()
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
                        size_bytes=len(file_content),
                        checksum_sha256=checksum,
                        drive_web_view_link=zip_upload.get("drive_web_view_link"),
                        drive_download_link=zip_upload.get("drive_download_link"),
                        validation_status="valid",
                        validation_errors=None,
                        processing_status="processed",
                        processing_errors=None,
                        processed_at=datetime.now(timezone.utc),
                        file_metadata={"entry_count": len(manifest_entries)},
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

                    checksum_sha256 = self._compute_checksum(local_path)
                    file_metadata: Dict[str, Any] = {
                        "source_entry_path": entry.source_entry_path,
                    }

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

                    maybe_scenary = self._build_scenary_from_file(project_file)
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
                            checksum_sha256=self._compute_checksum(parquet_path),
                            drive_web_view_link=upload_info.get("drive_web_view_link"),
                            drive_download_link=upload_info.get("drive_download_link"),
                            validation_status="valid",
                            validation_errors=None,
                            processing_status="processed",
                            processing_errors=None,
                            processed_at=datetime.now(timezone.utc),
                            file_metadata={"user_index": user_index, "type": "user_parquet"},
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
                            checksum_sha256=self._compute_checksum(parquet_path),
                            drive_web_view_link=upload_info.get("drive_web_view_link"),
                            drive_download_link=upload_info.get("drive_download_link"),
                            validation_status="valid",
                            validation_errors=None,
                            processing_status="processed",
                            processing_errors=None,
                            processed_at=datetime.now(timezone.utc),
                            file_metadata={
                                "user_index": user_index,
                                "scenario": scenario_name,
                                "type": "scenario_parquet",
                            },
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

            # If this upload replaces a previous ingestion, remove old Drive root first.
            # If deletion fails, abort to avoid reporting success with stale remote content.
            if previous_root_folder_id and previous_root_folder_id != root_folder_id:
                self._raise_if_canceled(project_id)
                deleted = await asyncio.to_thread(gdrive_client.delete_file, previous_root_folder_id)
                if not deleted:
                    raise RuntimeError("Failed to delete previous Drive root folder")

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
            await self.repository.commit()
            drive_upload_progress_registry.complete(project_id)

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

            # If the error was a ZIP structure validation error, it was caught before any
            # project updates or Drive uploads, so we just re-raise it as-is.
            if isinstance(exc, ZipValidationService.ValidationError):
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

    def _compute_checksum(self, local_path: str) -> str:
        hasher = hashlib.sha256()
        with open(local_path, "rb") as fp:
            for chunk in iter(lambda: fp.read(65536), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

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

    def _build_scenary_from_file(self, project_file: ProjectFile) -> Optional[Scenaries]:
        if project_file.kind not in {"scenario_image", "scenario_video"}:
            return None

        scenary_type = "image" if project_file.kind == "scenario_image" else "video"
        scenary_name = PurePosixPath(project_file.source_entry_path or project_file.filename).stem

        return Scenaries(
            id=uuid.uuid4(),
            project_id=project_file.project_id,
            name=scenary_name,
            type=scenary_type,
            file_id=project_file.id,
            source_entry_path=project_file.source_entry_path,
            width=None,
            height=None,
            fps=None,
            duration_ms=None,
        )

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

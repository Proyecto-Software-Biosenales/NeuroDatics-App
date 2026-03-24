import csv
import hashlib
import logging
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
from ..services.zip_extraction_service import ZipExtractionService
from ..services.zip_validation_service import ZipManifestEntry, ZipValidationService

logger = logging.getLogger(__name__)


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
            await configure_gdrive_client_with_oauth(self.db, silent=True)

        uploaded_drive_ids: List[str] = []

        try:
            await self.repository.update_project_ingestion(
                project_id=project_id,
                updates={
                    "ingestion_status": "PROCESSING",
                    "ingestion_error": None,
                    "storage_provider": "gdrive",
                },
            )
            await self.repository.commit()

            manifest_entries, manifest_counts = ZipValidationService.validate_and_analyze(
                filename=filename,
                mime_type=mime_type,
                file_content=file_content,
            )

            root_folder_info = self._ensure_drive_root_folder(project)
            root_folder_id = root_folder_info.get("drive_file_id")
            root_folder_name = root_folder_info.get("name") or project.name
            root_folder_url = root_folder_info.get("drive_web_view_link")

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

            if not project.drive_root_folder_id and root_folder_id:
                uploaded_drive_ids.append(root_folder_id)
                counts["folders_created"] += 1

            source_zip_file_id: Optional[UUID] = None
            zip_file_response: Optional[Dict[str, Any]] = None
            zip_saved = bool(settings.ingestion_save_original_zip)

            if zip_saved:
                zip_upload = gdrive_client.upload_file(
                    filename=filename,
                    mime_type=mime_type,
                    parent_id=root_folder_id,
                    file_content=file_content,
                )
                uploaded_drive_ids.append(zip_upload["drive_file_id"])

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

            with ZipExtractionService.extract_to_temp(file_content, manifest_entries) as extracted:
                for folder_path in extracted.folders:
                    self._ensure_folder_path(
                        folder_path=folder_path,
                        root_folder_id=root_folder_id,
                        folder_cache=folder_cache,
                        uploaded_drive_ids=uploaded_drive_ids,
                        counters=counts,
                    )

                for entry in manifest_entries:
                    local_path = extracted.files_by_entry_path.get(entry.source_entry_path)
                    if not local_path:
                        continue

                    parent_path = str(PurePosixPath(entry.source_entry_path).parent)
                    if parent_path == ".":
                        parent_path = ""

                    parent_folder_id = self._ensure_folder_path(
                        folder_path=parent_path,
                        root_folder_id=root_folder_id,
                        folder_cache=folder_cache,
                        uploaded_drive_ids=uploaded_drive_ids,
                        counters=counts,
                    )

                    upload_info = gdrive_client.upload_file(
                        filename=entry.filename,
                        mime_type=entry.mime_type,
                        parent_id=parent_folder_id,
                        local_path=local_path,
                    )
                    uploaded_drive_ids.append(upload_info["drive_file_id"])

                    if entry.kind == "scenario_image":
                        counts["images"] += 1
                    elif entry.kind == "scenario_video":
                        counts["videos"] += 1
                    elif entry.kind == "raw_csv":
                        counts["csv"] += 1
                    else:
                        counts["other"] += 1

                    checksum_sha256 = self._compute_checksum(local_path)

                    processing_status = "processed"
                    processing_errors = None
                    file_metadata: Dict[str, Any] = {
                        "source_entry_path": entry.source_entry_path,
                    }

                    if entry.kind == "raw_csv":
                        csv_summary["detected"] += 1
                        csv_result = self._process_csv(local_path)
                        file_metadata["csv_processing"] = csv_result
                        if csv_result.get("status") == "processed":
                            csv_summary["processed"] += 1
                        else:
                            csv_summary["failed"] += 1
                            processing_status = "failed"
                            processing_errors = [csv_result.get("error", "CSV processing failed")]

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
                        processing_status=processing_status,
                        processing_errors=processing_errors,
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

            await self.repository.soft_delete_active_files(project_id)
            await self.repository.clear_project_scenaries(project_id)
            await self.repository.add_files(files_to_insert)
            await self.repository.add_scenaries(scenaries_to_insert)

            counts["scenaries_created"] = len(scenaries_to_insert)

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
            }
        except Exception as exc:
            logger.exception("Project ingestion failed for project %s", project_id)
            await self.repository.rollback()

            for drive_id in reversed(uploaded_drive_ids):
                try:
                    gdrive_client.delete_file(drive_id)
                except Exception:
                    logger.warning("Could not delete drive object during compensation: %s", drive_id)

            failure_updates = {
                "ingestion_status": "FAILED",
                "ingestion_error": str(exc),
                "storage_provider": "gdrive",
            }
            try:
                await self.repository.update_project_ingestion(project_id=project_id, updates=failure_updates)
                await self.repository.commit()
            except Exception:
                await self.repository.rollback()
                logger.exception("Could not persist ingestion failure status")

            raise

    def _ensure_drive_root_folder(self, project: Any) -> Dict[str, Any]:
        if project.drive_root_folder_id:
            return {
                "drive_file_id": project.drive_root_folder_id,
                "name": project.drive_root_folder_name or project.name,
                "drive_web_view_link": project.drive_root_folder_url,
            }

        folder_name = f"{project.name}-{str(project.id)[:8]}"
        return gdrive_client.create_folder(name=folder_name, parent_id=None)

    def _ensure_folder_path(
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

            existing = gdrive_client.find_child_folder_by_name(name=part, parent_id=current_parent) if current_parent else None
            if existing:
                folder_id = existing["drive_file_id"]
            else:
                created = gdrive_client.create_folder(name=part, parent_id=current_parent)
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

    def _process_csv(self, local_path: str) -> Dict[str, Any]:
        try:
            with open(local_path, "r", encoding="utf-8", newline="") as fp:
                reader = csv.reader(fp)
                rows = 0
                columns = 0
                for row in reader:
                    if rows == 0:
                        columns = len(row)
                    rows += 1

            return {
                "status": "processed",
                "rows": rows,
                "columns": columns,
            }
        except UnicodeDecodeError:
            try:
                with open(local_path, "r", encoding="latin-1", newline="") as fp:
                    reader = csv.reader(fp)
                    rows = 0
                    columns = 0
                    for row in reader:
                        if rows == 0:
                            columns = len(row)
                        rows += 1

                return {
                    "status": "processed",
                    "rows": rows,
                    "columns": columns,
                    "encoding": "latin-1",
                }
            except Exception as exc:
                return {
                    "status": "failed",
                    "error": str(exc),
                }
        except Exception as exc:
            return {
                "status": "failed",
                "error": str(exc),
            }

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

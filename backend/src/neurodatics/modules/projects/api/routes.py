from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime, timezone
from collections import OrderedDict
import asyncio
import hashlib
import io
import logging
import os
import time

import anyio

from ....api.deps import get_db, get_current_user
from ....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from ....infra.storage.gdrive_client import gdrive_client
from ...integrations.google_drive.infrastructure.configure_client import configure_gdrive_client_with_oauth
from ...integrations.google_drive.infrastructure.repository import SystemIntegrationRepository
from ....infra.storage.gdrive_client import GoogleDriveClient
from ..infrastructure.repository_impl import SQLProjectRepository
from ..application.use_cases.create_project import CreateProjectUseCase
from ..application.use_cases.list_projects import ListProjectsUseCase
from ..application.use_cases.delete_project import DeleteProjectUseCase
from ..application.use_cases.upload_experiment_zip import UploadExperimentZipUseCase, UploadCanceledError
from ..application.services.drive_upload_progress_registry import drive_upload_progress_registry
from ..domain.entities import Project, ProjectFile, ProjectStatus
from .schemas import (
    CreateProjectRequest, UpdateProjectRequest, UpdateSensorsRequest,
    ProjectResponse, ProjectDetailResponse, ProjectFileResponse, UploadedProjectZipSummaryResponse,
    DeleteProjectResponse, DriveUploadProgressResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


_IMAGE_CACHE_TTL_SECONDS = 300
_IMAGE_CACHE_MAX_ITEMS = 256
_IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024
_image_cache_lock = asyncio.Lock()
_image_cache_total_bytes = 0
_image_cache_store: "OrderedDict[str, Tuple[float, bytes, str, str]]" = OrderedDict()
_image_cache_download_locks: dict[str, asyncio.Lock] = {}

# Persistent disk cache for images - survives in-memory eviction, cleared on container restart
_IMAGE_DISK_CACHE_DIR = os.environ.get("IMAGE_CACHE_DIR", "/data/image_cache")


def _disk_cache_path(file_id: UUID) -> "Path":
    """Return the path for the disk-cached image file."""
    from pathlib import Path
    base = Path(_IMAGE_DISK_CACHE_DIR)
    base.mkdir(parents=True, exist_ok=True)
    return base / str(file_id)


def _disk_cache_mime_path(file_id: UUID) -> "Path":
    """Return the path for the disk-cached mime type file."""
    from pathlib import Path
    base = Path(_IMAGE_DISK_CACHE_DIR)
    return base / f"{file_id}.mime"


def _read_disk_cache(file_id: UUID) -> "Optional[Tuple[bytes, str]]":
    """Read image bytes + mime type from disk. Returns None on miss."""
    try:
        img_path = _disk_cache_path(file_id)
        mime_path = _disk_cache_mime_path(file_id)
        if img_path.exists() and mime_path.exists():
            content = img_path.read_bytes()
            mime_type = mime_path.read_text(encoding="utf-8").strip()
            return content, mime_type
    except OSError:
        pass
    return None


def _write_disk_cache(file_id: UUID, content: bytes, mime_type: str) -> None:
    """Write image bytes + mime type to disk cache. Silently ignores errors."""
    try:
        img_path = _disk_cache_path(file_id)
        mime_path = _disk_cache_mime_path(file_id)
        img_path.write_bytes(content)
        mime_path.write_text(mime_type, encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed to write image disk cache for %s: %s", file_id, exc)


def _build_image_etag(cache_key: str) -> str:
    return f'"{hashlib.sha1(cache_key.encode("utf-8")).hexdigest()}"'


async def _get_cached_image(cache_key: str) -> Optional[Tuple[bytes, str, str]]:
    global _image_cache_total_bytes

    now = time.time()
    async with _image_cache_lock:
        cached = _image_cache_store.get(cache_key)
        if not cached:
            return None

        expires_at, content, mime_type, etag = cached
        if expires_at <= now:
            _image_cache_total_bytes -= len(content)
            _image_cache_store.pop(cache_key, None)
            return None

        _image_cache_store.move_to_end(cache_key)
        return content, mime_type, etag


async def _set_cached_image(cache_key: str, content: bytes, mime_type: str, etag: str) -> None:
    global _image_cache_total_bytes

    if len(content) > (_IMAGE_CACHE_MAX_BYTES // 2):
        return

    expires_at = time.time() + _IMAGE_CACHE_TTL_SECONDS

    async with _image_cache_lock:
        previous = _image_cache_store.pop(cache_key, None)
        if previous:
            _image_cache_total_bytes -= len(previous[1])

        _image_cache_store[cache_key] = (expires_at, content, mime_type, etag)
        _image_cache_total_bytes += len(content)

        while _image_cache_store and (
            len(_image_cache_store) > _IMAGE_CACHE_MAX_ITEMS
            or _image_cache_total_bytes > _IMAGE_CACHE_MAX_BYTES
        ):
            _, evicted = _image_cache_store.popitem(last=False)
            _image_cache_total_bytes -= len(evicted[1])


async def _get_image_download_lock(cache_key: str) -> asyncio.Lock:
    async with _image_cache_lock:
        lock = _image_cache_download_locks.get(cache_key)
        if lock is None:
            lock = asyncio.Lock()
            _image_cache_download_locks[cache_key] = lock
        return lock


async def _cleanup_image_download_lock(cache_key: str, lock: asyncio.Lock) -> None:
    async with _image_cache_lock:
        existing = _image_cache_download_locks.get(cache_key)
        if existing is lock and not lock.locked():
            _image_cache_download_locks.pop(cache_key, None)


async def _build_isolated_drive_client(db: AsyncSession) -> Optional["GoogleDriveClient"]:
    """Create a fresh GoogleDriveClient without touching the global singleton."""
    repository = SystemIntegrationRepository(db)
    integration = await repository.get_by_provider("google_drive")
    if not integration:
        return None
    refresh_token = integration.get("refresh_token")
    if not refresh_token:
        return None
    credentials = build_google_drive_oauth_credentials(
        refresh_token=refresh_token,
        scope=integration.get("scope"),
    )
    client = GoogleDriveClient()
    client.set_oauth_credentials(credentials)
    return client


@router.get("/{project_id}/files/{file_id}/image")
async def get_project_file_image(
    project_id: UUID,
    file_id: UUID,
    request: Request,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Serve an image file from Google Drive through an authenticated backend proxy."""
    stmt = (
        select(ProjectFile)
        .join(Project, ProjectFile.project_id == Project.id)
        .where(
            Project.id == project_id,
            Project.owner_id == UUID(current_user),
            ProjectFile.id == file_id,
            ProjectFile.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    project_file = result.scalar_one_or_none()

    if not project_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )

    if not project_file.mime_type or not project_file.mime_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested file is not an image"
        )

    if not project_file.external_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File storage reference not found"
        )

    updated_at_part = int(project_file.updated_at.timestamp()) if project_file.updated_at else 0
    cache_key = f"{project_file.id}:{project_file.external_id}:{updated_at_part}"
    etag = _build_image_etag(cache_key)

    response_headers = {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        "ETag": etag,
    }

    # Tier 0: disk cache (session-persistent, no TTL)
    disk_cached = await anyio.to_thread.run_sync(
        lambda: _read_disk_cache(project_file.id)
    )
    if disk_cached:
        disk_content, disk_mime = disk_cached
        # Also populate in-memory cache for hot path
        await _set_cached_image(cache_key, disk_content, disk_mime, etag)
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)
        return Response(
            content=disk_content,
            media_type=disk_mime,
            headers={**response_headers, "X-Image-Cache": "DISK"},
        )

    cached_image = await _get_cached_image(cache_key)
    if cached_image:
        cached_content, cached_mime_type, cached_etag = cached_image
        if request.headers.get("if-none-match") == cached_etag:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)

        return Response(
            content=cached_content,
            media_type=cached_mime_type,
            headers={**response_headers, "X-Image-Cache": "HIT"},
        )

    download_lock = await _get_image_download_lock(cache_key)
    try:
        async with download_lock:
            cached_after_lock = await _get_cached_image(cache_key)
            if cached_after_lock:
                cached_content, cached_mime_type, cached_etag = cached_after_lock
                if request.headers.get("if-none-match") == cached_etag:
                    return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)

                return Response(
                    content=cached_content,
                    media_type=cached_mime_type,
                    headers={**response_headers, "X-Image-Cache": "HIT"},
                )

            drive_client = await _build_isolated_drive_client(db)
            if not drive_client:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="No se pudo configurar Google Drive para servir la imagen"
                )

            try:
                # Drive client is synchronous; offload to worker thread to avoid blocking event loop.
                content = await anyio.to_thread.run_sync(drive_client.download_file_content, project_file.external_id)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="No se pudo descargar la imagen desde Google Drive"
                ) from exc

            # Persist to disk for session-level caching
            await anyio.to_thread.run_sync(
                lambda: _write_disk_cache(project_file.id, content, project_file.mime_type)
            )

            await _set_cached_image(cache_key, content, project_file.mime_type, etag)
    finally:
        await _cleanup_image_download_lock(cache_key, download_lock)

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)

    return Response(
        content=content,
        media_type=project_file.mime_type,
        headers={**response_headers, "X-Image-Cache": "MISS"},
    )


@router.post("/", response_model=ProjectResponse)
async def create_project(
    request: CreateProjectRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    repository = SQLProjectRepository(db)
    use_case = CreateProjectUseCase(repository)

    existing = await repository.get_by_owner_and_name(UUID(current_user), request.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un proyecto con ese nombre"
        )
    
    project = await use_case.execute(
        owner_id=UUID(current_user),
        name=request.name,
        description=request.description,
        status=request.status or ProjectStatus.DRAFT,
    )
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        ingestion_status=project.ingestion_status,
        ingestion_error=project.ingestion_error,
        drive_root_folder_id=project.drive_root_folder_id,
        drive_root_folder_name=project.drive_root_folder_name,
        drive_root_folder_url=project.drive_root_folder_url,
        sensors=[],
        participants_count=0
    )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all projects for current user"""
    repository = SQLProjectRepository(db)
    use_case = ListProjectsUseCase(repository)
    
    projects = await use_case.execute(owner_id=UUID(current_user))
    
    return [
        ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            status=project.status,
            created_at=project.created_at,
            ingestion_status=project.ingestion_status,
            ingestion_error=project.ingestion_error,
            drive_root_folder_id=project.drive_root_folder_id,
            drive_root_folder_name=project.drive_root_folder_name,
            drive_root_folder_url=project.drive_root_folder_url,
            sensors=[{"id": s.id, "sensor_type": s.sensor_type} for s in project.sensors],
            participants_count=len(project.participants)
        )
        for project in projects
    ]


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get project details"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return ProjectDetailResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        ingestion_status=project.ingestion_status,
        ingestion_error=project.ingestion_error,
        drive_root_folder_id=project.drive_root_folder_id,
        drive_root_folder_name=project.drive_root_folder_name,
        drive_root_folder_url=project.drive_root_folder_url,
        files=[
            ProjectFileResponse(
                id=f.id,
                kind=f.kind,
                filename=f.filename,
                external_id=f.external_id,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                created_at=f.created_at,
                drive_web_view_link=f.drive_web_view_link,
                drive_download_link=f.drive_download_link,
            )
            for f in project.files
        ],
        sensors=[{"id": s.id, "sensor_type": s.sensor_type} for s in project.sensors],
        participants=[
            {
                "id": p.id,
                "participant_code": p.participant_code,
                "age": p.age,
                "sex": p.sex.value if p.sex else None
            }
            for p in project.participants
        ],
        scenaries=[
            {
                "id": s.id,
                "name": s.name,
                "type": s.type,
                "file_id": s.file_id,
                "source_entry_path": s.source_entry_path,
                "width": s.width,
                "height": s.height,
                "fps": s.fps,
                "duration_ms": s.duration_ms,
                "aois": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "color": a.color,
                        "shape_type": a.shape_type,
                        "shape": a.shape,
                    }
                    for a in s.aois
                ],
            }
            for s in project.scenaries
        ],
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    request: UpdateProjectRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project"""
    repository = SQLProjectRepository(db)
    project = await repository.get_basic_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if request.name is not None:
        existing = await repository.get_by_owner_and_name(UUID(current_user), request.name)
        if existing and existing.id != project.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un proyecto con ese nombre"
            )

        # Keep Google Drive root folder name aligned with project name when possible.
        if project.drive_root_folder_id:
            configured = await configure_gdrive_client_with_oauth(db, silent=True)
            if not configured:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="No se pudo configurar Google Drive para sincronizar el nombre de la carpeta"
                )

            drive_folder_name = (
                f"{request.name}-{str(project.id)[:8]}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            )
            renamed = gdrive_client.rename_file(project.drive_root_folder_id, drive_folder_name)
            if not renamed or not renamed.get("name"):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="No se pudo renombrar la carpeta del proyecto en Google Drive"
                )

            project.drive_root_folder_name = renamed["name"]

        project.name = request.name
    if request.description is not None:
        project.description = request.description
    if request.status is not None:
        project.status = request.status
    
    await repository.update(project)

    # Re-load only lightweight relationships needed by ProjectResponse.
    updated_project = await repository.get_summary_by_id(project_id, UUID(current_user))
    if not updated_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found after update"
        )

    return ProjectResponse(
        id=updated_project.id,
        name=updated_project.name,
        description=updated_project.description,
        status=updated_project.status,
        created_at=updated_project.created_at,
        ingestion_status=updated_project.ingestion_status,
        ingestion_error=updated_project.ingestion_error,
        drive_root_folder_id=updated_project.drive_root_folder_id,
        drive_root_folder_name=updated_project.drive_root_folder_name,
        drive_root_folder_url=updated_project.drive_root_folder_url,
        sensors=[{"id": s.id, "sensor_type": s.sensor_type} for s in updated_project.sensors],
        participants_count=len(updated_project.participants)
    )


@router.delete("/{project_id}", response_model=DeleteProjectResponse)
async def delete_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete project"""
    repository = SQLProjectRepository(db)
    use_case = DeleteProjectUseCase(repository, db=db)
    
    try:
        result = await use_case.execute(project_id, UUID(current_user))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo eliminar el proyecto en base de datos"
        ) from exc
    
    if not result.get("deleted"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    return DeleteProjectResponse(
        message="Project deleted successfully",
        drive_folder_found=bool(result.get("drive_folder_found")),
        drive_folder_deleted=bool(result.get("drive_folder_deleted")),
    )


@router.post("/{project_id}/files/experiment-zip", response_model=UploadedProjectZipSummaryResponse)
async def upload_experiment_zip(
    project_id: UUID,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload experiment ZIP and execute full project ingestion flow."""
    
    file_content = await file.read()
    owner_id = UUID(current_user)
    mime_type = file.content_type or "application/zip"
    filename = file.filename or "experiment.zip"
    logger.info("Processing ZIP upload for project %s, file: %s", project_id, filename)
    
    # Execute upload use case
    repository = SQLProjectRepository(db)
    use_case = UploadExperimentZipUseCase(repository, db=db)

    try:
        summary = await use_case.execute(
            project_id=project_id,
            owner_id=owner_id,
            file_content=file_content,
            filename=filename,
            mime_type=mime_type
        )
    except ValueError as e:
        logger.error(f"Project access denied: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )
    except UploadCanceledError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload canceled by user"
        )
    except Exception as e:
        from ..application.services.zip_validation_service import ZipValidationService
        
        logger.exception("ZIP upload failed")
        
        # Return user-friendly error messages for validation errors
        if isinstance(e, ZipValidationService.ValidationError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Generic error message for other exceptions
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error procesando el archivo: {e}"
        )

    return UploadedProjectZipSummaryResponse(
        project_id=summary["project_id"],
        ingestion_status=summary["ingestion_status"],
        drive_root_folder_id=summary.get("drive_root_folder_id"),
        drive_root_folder_name=summary.get("drive_root_folder_name"),
        drive_root_folder_url=summary.get("drive_root_folder_url"),
        zip_saved=summary["zip_saved"],
        zip_file=summary.get("zip_file"),
        counts=summary["counts"],
        files=summary["files"],
        csv_processing=summary["csv_processing"],
        detected_sensors=summary.get("detected_sensors", []),
        participants=summary.get("participants", []),
        manifest=summary["manifest"],
    )


@router.post("/{project_id}/files/experiment-zip/cancel")
async def cancel_experiment_zip_upload(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repository = SQLProjectRepository(db)
    project = await repository.get_basic_by_id(project_id, UUID(current_user))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    drive_upload_progress_registry.request_cancel(project_id)
    return {"message": "Cancel requested"}


@router.get("/{project_id}/files/experiment-zip/progress", response_model=DriveUploadProgressResponse)
async def get_experiment_zip_upload_progress(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repository = SQLProjectRepository(db)
    project = await repository.get_basic_by_id(project_id, UUID(current_user))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    progress = drive_upload_progress_registry.get(project_id)
    if progress:
        return DriveUploadProgressResponse(
            phase=str(progress.get("phase") or "idle"),
            uploaded_bytes=int(progress.get("uploaded_bytes") or 0),
            total_bytes=int(progress.get("total_bytes") or 0),
            percent=int(progress.get("percent") or 0),
            speed_mbps=float(progress["speed_mbps"]) if progress.get("speed_mbps") is not None else None,
            eta_seconds=int(progress["eta_seconds"]) if progress.get("eta_seconds") is not None else None,
            elapsed_seconds=int(progress.get("elapsed_seconds") or 0),
            error=str(progress["error"]) if progress.get("error") else None,
        )

    # If there is no active snapshot, avoid inferring "completed" from historical READY.
    # READY can come from previous ingestions and would show a false 100% during a new upload.
    if project.ingestion_status and str(project.ingestion_status).upper() == "READY":
        return DriveUploadProgressResponse(
            phase="idle",
            uploaded_bytes=0,
            total_bytes=0,
            percent=0,
            speed_mbps=None,
            eta_seconds=None,
            elapsed_seconds=0,
            error=None,
        )

    if project.ingestion_status and str(project.ingestion_status).upper() == "FAILED":
        return DriveUploadProgressResponse(
            phase="failed",
            uploaded_bytes=0,
            total_bytes=0,
            percent=0,
            speed_mbps=None,
            eta_seconds=None,
            elapsed_seconds=0,
            error=project.ingestion_error,
        )

    return DriveUploadProgressResponse(
        phase="idle",
        uploaded_bytes=0,
        total_bytes=0,
        percent=0,
        speed_mbps=None,
        eta_seconds=None,
        elapsed_seconds=0,
        error=None,
    )


@router.delete("/{project_id}/files/experiment-zip")
async def delete_experiment_zip(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete experiment zip file"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Delete from database
    deleted = await repository.delete_file_by_kind(project_id, "experiment_zip")
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment zip file not found"
        )
    
    return {"message": "Experiment zip file deleted successfully"}


@router.put("/{project_id}/sensors", response_model=List[dict])
async def update_sensors(
    project_id: UUID,
    request: UpdateSensorsRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project sensors"""
    repository = SQLProjectRepository(db)
    project = await repository.get_basic_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    sensors = await repository.update_sensors(project_id, request.sensors)
    
    return [{"id": s.id, "sensor_type": s.sensor_type} for s in sensors]


@router.post("/{project_id}/finalize")
async def finalize_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize project (validate and set to active)"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Validate project
    if not project.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name is required"
        )
    
    has_active_files = any(f.deleted_at is None for f in project.files)
    has_ready_ingestion = (project.ingestion_status or "").upper() == "READY"
    if not has_active_files and not has_ready_ingestion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes cargar y procesar un ZIP del experimento antes de finalizar"
        )
    
    if not project.sensors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one csv file is required"
        )
    
    # Update status to active
    project.status = ProjectStatus.ACTIVE
    updated_project = await repository.update(project)
    
    return {"message": "Project finalized successfully", "status": updated_project.status}
def register_project_routes(app):
    pass

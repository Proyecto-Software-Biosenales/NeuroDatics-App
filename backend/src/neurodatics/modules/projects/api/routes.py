from fastapi import APIRouter, Depends, Form, HTTPException, status, UploadFile, File, Request, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import asyncio
import hashlib
import json
import logging
import subprocess
import tempfile

import anyio

from ....api.deps import get_db, get_current_user
from neurodatics.shared.scenario_identity import is_all_scenarios
from ...analytics.application.services.parquet_reader_service import ParquetReaderService
from ...analytics.domain.parquet_projection import ParquetProjection
from ...analytics.infrastructure.singleflight import settled_thread
from ....config.settings import settings
from ...integrations.storage_provider import (
    build_isolated_drive_client,
    configure_gdrive_client_with_oauth,
    gdrive_client,
)
from ..infrastructure.repository_impl import SQLProjectRepository
from ..application.use_cases.create_project import CreateProjectUseCase
from ..application.use_cases.list_projects import ListProjectsUseCase
from ..application.use_cases.delete_project import DeleteProjectUseCase
from ..application.use_cases.upload_experiment_zip import (
    GoogleDriveConfigurationError,
    GoogleDriveReconnectRequiredError,
    ProjectUploadNotFoundError,
    CsvIngestionError,
    ParticipantIdentityError,
    StimulusPlacementUploadError,
    UploadCanceledError,
    UploadExperimentZipUseCase,
)
from ..application.services.drive_upload_progress_registry import drive_upload_progress_registry
from ..application.services.fixation_detection_service import ScreenGeometry
from ..application.use_cases.ingestion_lifecycle import finish_upload_on_disconnect, progress_key
from ..infrastructure.upload_attempt_store import UploadAttemptStore, UploadAttemptConflict
from ..infrastructure.image_cache import (
    build_image_etag as _build_image_etag,
    get_cached_project_image,
    load_project_image,
    project_file_cache_key as _project_file_cache_key,
    project_image_ref,
)
from ..infrastructure.video_preview_metadata import (
    cache_preview_onset,
    compute_preview_scenario_onset_s,
    get_cached_preview_onset,
    get_video_duration_s,
    invalidate_project_video_metadata,
    observe_project_generation,
)
from ..application.services.zip_extraction_service import ZipExtractionService
from ..application.services.zip_validation_service import UploadSelection, ZipValidationService
from ..domain.entities import Project, ProjectFile, ProjectStatus
from .dependencies import lock_project_for_write
from .upload_route import ProjectUploadRoute
from .schemas import (
    CreateProjectRequest, UpdateProjectRequest, UpdateSensorsRequest,
    ProjectResponse, ProjectDetailResponse, ProjectFileResponse, UploadedProjectZipSummaryResponse,
    DeleteProjectResponse, DriveUploadProgressResponse, UploadClarificationResponse,
)

from .pre_experiment_routes import router as pre_experiment_router, planning_summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"], route_class=ProjectUploadRoute)
router.include_router(pre_experiment_router)


_VIDEO_FRAME_MIME_TYPE = "image/jpeg"
_VIDEO_FRAME_TIME_DECIMALS = 1
_FFMPEG_TIMEOUT_SECONDS = 45
_VIDEO_PREVIEW_TIMING_PROJECTION = ParquetProjection(
    "video-preview-timing", optional=("time", "scenario")
)


@dataclass
class _VideoPreviewLockEntry:
    lock: asyncio.Lock
    users: int = 0


_video_preview_lock_guard = asyncio.Lock()
_video_preview_locks: dict[str, _VideoPreviewLockEntry] = {}

_UPLOAD_SPOOL_CHUNK_SIZE = 1024 * 1024


def _clean_form_value(value: Optional[str]) -> Optional[str]:
    """Normalise an optional multipart field to `None` when it carries no answer."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _build_screen_geometry(
    screen_width_px: Optional[int],
    screen_height_px: Optional[int],
    screen_width_mm: Optional[float],
    screen_height_mm: Optional[float],
    viewing_distance_mm: Optional[float],
) -> Optional[ScreenGeometry]:
    """Build physical screen geometry only when the screen tuple is supplied.

    The viewing distance is optional: the CSV's per-sample distance is the
    measured one, so a typed distance only backs it up.
    """

    screen = (
        screen_width_px,
        screen_height_px,
        screen_width_mm,
        screen_height_mm,
    )
    supplied = tuple(value is not None for value in screen)
    if not any(supplied) and viewing_distance_mm is None:
        return None
    if not all(supplied):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Screen geometry requires screen_width_px, screen_height_px, "
                "screen_width_mm and screen_height_mm together"
            ),
        )
    if any(value <= 0 for value in (*screen, viewing_distance_mm) if value is not None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="All screen geometry values must be greater than zero",
        )

    return ScreenGeometry(
        width_px=screen_width_px,
        height_px=screen_height_px,
        width_mm=screen_width_mm,
        height_mm=screen_height_mm,
        viewing_distance_mm=viewing_distance_mm,
    )


def _parse_stimulus_placements_json(value: Optional[str]) -> List[dict]:
    """Parse the versioned per-media placement envelope from multipart input."""

    if value is None or (isinstance(value, str) and not value.strip()):
        return []
    if not isinstance(value, str):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "invalid_stimulus_placements",
                "message": "stimulus_placements_json must be a JSON array",
            },
        )

    try:
        payload = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "invalid_stimulus_placements",
                "message": f"stimulus_placements_json is not valid JSON: {exc.msg}",
            },
        ) from exc

    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "invalid_stimulus_placements",
                "message": "stimulus_placements_json must be a JSON array",
            },
        )

    parsed: List[dict] = []
    seen_paths: set[str] = set()
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_stimulus_placements",
                    "message": f"placement entry {index} must be an object",
                },
            )
        source_entry_path = item.get("source_entry_path")
        placement = item.get("placement")
        if not isinstance(source_entry_path, str) or not source_entry_path.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_stimulus_placements",
                    "message": f"placement entry {index} requires source_entry_path",
                },
            )
        if not isinstance(placement, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_stimulus_placements",
                    "message": f"placement entry {index} requires a placement object",
                },
            )
        if "source" in placement or "contract_fingerprint" in placement:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_stimulus_placements",
                    "message": "source and contract_fingerprint are backend-assigned",
                },
            )

        normalized_path = ZipValidationService.normalize_entry_path(source_entry_path)
        if not normalized_path or any(part == ".." for part in PurePosixPath(normalized_path).parts):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_stimulus_placements",
                    "message": f"placement entry {index} has an invalid source_entry_path",
                },
            )
        path_key = normalized_path.casefold()
        if path_key in seen_paths:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_stimulus_placements",
                    "message": f"duplicate stimulus placement path: {normalized_path}",
                },
            )
        seen_paths.add(path_key)
        parsed.append({"source_entry_path": normalized_path, "placement": placement})

    return parsed


def _hashed_cache_id(cache_key: str) -> str:
    return hashlib.sha1(cache_key.encode("utf-8")).hexdigest()


def _video_source_cache_path(project_file: ProjectFile, cache_key: str) -> Path:
    suffix = Path(project_file.filename or "").suffix.lower() or ".video"
    # Read at call time from settings: local mode keeps it under the data folder, where the
    # media cache janitor prunes it.
    base = Path(settings.video_cache_dir)
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{_hashed_cache_id(cache_key)}{suffix}"


def _video_frame_cache_path(cache_key: str, frame_time_s: float) -> Path:
    base = Path(settings.video_frame_cache_dir)
    base.mkdir(parents=True, exist_ok=True)
    frame_key = f"{cache_key}:{frame_time_s:.{_VIDEO_FRAME_TIME_DECIMALS}f}"
    return base / f"{_hashed_cache_id(frame_key)}.jpg"


def _read_video_frame_cache(frame_path: Path) -> Optional[bytes]:
    try:
        if frame_path.exists() and frame_path.stat().st_size > 0:
            return frame_path.read_bytes()
    except OSError:
        pass
    return None


def _video_frame_cache_exists(frame_path: Path) -> bool:
    try:
        return frame_path.is_file() and frame_path.stat().st_size > 0
    except OSError:
        return False


async def _get_video_preview_lock(cache_key: str) -> _VideoPreviewLockEntry:
    async with _video_preview_lock_guard:
        entry = _video_preview_locks.get(cache_key)
        if entry is None:
            entry = _VideoPreviewLockEntry(lock=asyncio.Lock())
            _video_preview_locks[cache_key] = entry
        entry.users += 1
        return entry


async def _cleanup_video_preview_lock(
    cache_key: str, entry: _VideoPreviewLockEntry
) -> None:
    async with _video_preview_lock_guard:
        existing = _video_preview_locks.get(cache_key)
        if existing is not entry:
            return
        entry.users = max(0, entry.users - 1)
        if entry.users == 0 and not entry.lock.locked():
            _video_preview_locks.pop(cache_key, None)


async def _load_project_file(
    project_id: UUID,
    file_id: UUID,
    current_user: str,
    db: AsyncSession,
) -> ProjectFile:
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
    return project_file


def _is_image_file(project_file: ProjectFile) -> bool:
    return bool(project_file.mime_type and project_file.mime_type.startswith("image/"))


def _is_video_file(project_file: ProjectFile) -> bool:
    return bool(
        (project_file.mime_type and project_file.mime_type.startswith("video/"))
        or project_file.kind == "scenario_video"
    )


async def _serve_project_file_image(
    project_file: ProjectFile,
    request: Request,
    db: AsyncSession,
) -> Response:
    """Serve an image ProjectFile through the existing authenticated cache path."""

    try:
        image_ref = project_image_ref(project_file)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested file is not an image"
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File storage reference not found"
        )

    cache_key = image_ref.cache_key
    etag = _build_image_etag(cache_key)

    response_headers = {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        "ETag": etag,
    }

    # The ETag derives from file identity, not content, so a revalidation is
    # answered before any cache tier reads bytes it would never send.
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)

    cached = await get_cached_project_image(image_ref)
    if cached is not None:
        return Response(
            content=cached.content,
            media_type=cached.mime_type,
            headers={**response_headers, "X-Image-Cache": cached.cache_status},
        )

    drive_client = await build_isolated_drive_client(db)
    if not drive_client:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo configurar Google Drive para servir la imagen"
        )
    try:
        loaded = await load_project_image(image_ref, drive_client)
    except Exception as exc:
        logger.exception("Image download from Drive failed for file_id=%s", project_file.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo descargar la imagen desde Google Drive"
        ) from exc

    return Response(
        content=loaded.content,
        media_type=loaded.mime_type,
        headers={**response_headers, "X-Image-Cache": loaded.cache_status},
    )


async def _compute_video_frame_time_s(
    db: AsyncSession,
    project_id: UUID,
    participant_code: Optional[str],
    scenario: Optional[str],
    absolute_time_s: float,
) -> float:
    if not participant_code or is_all_scenarios(scenario):
        return max(0.0, absolute_time_s)

    try:
        reader = ParquetReaderService(db)
        # Resolved once and passed to both reads: a re-ingestion landing between
        # them would otherwise have the miss fall back onto a different generation
        # than the lookup that missed.
        generation = await reader.resolve_cache_generation(project_id)
        cacheable = observe_project_generation(project_id, generation)
        hit, onset_s = get_cached_preview_onset(
            project_id, generation, participant_code, str(scenario)
        )
        if not hit:
            df = await reader.read_from_cache_only(
                project_id,
                participant_code,
                generation,
                projection=_VIDEO_PREVIEW_TIMING_PROJECTION,
            )
            if df is None:
                df = await reader.read(
                    project_id,
                    participant_code,
                    generation,
                    projection=_VIDEO_PREVIEW_TIMING_PROJECTION,
                )
            onset_s = await settled_thread(
                lambda: compute_preview_scenario_onset_s(df, scenario)
            )
            if cacheable:
                cache_preview_onset(
                    project_id,
                    generation,
                    participant_code,
                    str(scenario),
                    onset_s,
                )
        if onset_s is not None:
            return round(max(0.0, float(absolute_time_s) - onset_s), 4)
    except Exception as exc:
        logger.warning(
            "Falling back to absolute video preview time for project_id=%s scenario=%r: %s",
            project_id,
            scenario,
            exc,
        )

    return max(0.0, absolute_time_s)


async def _ensure_video_source_cached(
    project_file: ProjectFile,
    db: AsyncSession,
    cache_key: str,
) -> Path:
    video_path = _video_source_cache_path(project_file, cache_key)
    try:
        if video_path.exists() and video_path.stat().st_size > 0:
            return video_path
    except OSError:
        pass

    drive_client = await build_isolated_drive_client(db)
    if not drive_client:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo configurar Google Drive para servir el video"
        )

    try:
        await settled_thread(
            lambda: drive_client.download_file_to_path(
                project_file.external_id,
                str(video_path),
            )
        )
    except Exception as exc:
        logger.exception("Video download from Drive failed for file_id=%s", project_file.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo descargar el video desde Google Drive"
        ) from exc

    return video_path


def _probe_video_duration_s(video_path: Path) -> Optional[float]:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0:
        return None

    try:
        duration = float(result.stdout.strip())
    except (TypeError, ValueError):
        return None

    if duration <= 0:
        return None
    return duration


def _run_ffmpeg_frame_extract(video_path: Path, frame_path: Path, time_s: float) -> None:
    temp_frame_path = frame_path.with_name(f"{frame_path.stem}.tmp{frame_path.suffix}")
    try:
        temp_frame_path.unlink(missing_ok=True)
    except OSError:
        pass

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{time_s:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-vf",
                "scale='min(1920,iw)':-2",
                "-q:v",
                "3",
                "-y",
                str(temp_frame_path),
            ],
            capture_output=True,
            text=True,
            timeout=_FFMPEG_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg is not installed in the backend container") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("FFmpeg timed out while generating the video frame") from exc

    if result.returncode != 0:
        message = result.stderr.strip() or "FFmpeg failed without stderr output"
        raise RuntimeError(message)

    if not temp_frame_path.exists() or temp_frame_path.stat().st_size == 0:
        raise RuntimeError("FFmpeg did not produce a video frame")

    temp_frame_path.replace(frame_path)


def _extract_video_frame(
    video_path: Path,
    frame_path: Path,
    frame_time_s: float,
    video_identity: str,
) -> None:
    duration_s = get_video_duration_s(
        video_identity, video_path, _probe_video_duration_s
    )
    safe_time_s = max(0.0, frame_time_s)
    if duration_s is not None:
        safe_time_s = min(safe_time_s, max(0.0, duration_s - 0.05))

    try:
        _run_ffmpeg_frame_extract(video_path, frame_path, safe_time_s)
    except RuntimeError:
        if safe_time_s <= 0:
            raise
        _run_ffmpeg_frame_extract(video_path, frame_path, 0.0)


@router.get("/{project_id}/files/{file_id}/preview")
async def get_project_file_preview(
    project_id: UUID,
    file_id: UUID,
    request: Request,
    time_s: float = Query(default=0.0, ge=0.0, le=86400.0),
    scenario: Optional[str] = Query(default=None),
    participant_code: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Serve an image preview for image files or a time-specific frame for videos."""
    project_file = await _load_project_file(project_id, file_id, current_user, db)

    if _is_image_file(project_file):
        return await _serve_project_file_image(project_file, request, db)

    if not _is_video_file(project_file):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested file is neither an image nor a video"
        )

    if not project_file.external_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File storage reference not found"
        )

    cache_key = _project_file_cache_key(project_file)
    relative_time_s = await _compute_video_frame_time_s(
        db,
        project_id,
        participant_code,
        scenario,
        time_s,
    )
    frame_time_s = round(max(0.0, relative_time_s), _VIDEO_FRAME_TIME_DECIMALS)
    frame_path = _video_frame_cache_path(cache_key, frame_time_s)
    frame_cache_key = f"{cache_key}:frame:{frame_time_s:.{_VIDEO_FRAME_TIME_DECIMALS}f}"
    etag = _build_image_etag(frame_cache_key)
    response_headers = {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        "ETag": etag,
    }

    frame_exists = await settled_thread(lambda: _video_frame_cache_exists(frame_path))
    if frame_exists:
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)
        cached_frame = await settled_thread(lambda: _read_video_frame_cache(frame_path))
        if cached_frame is not None:
            return Response(
                content=cached_frame,
                media_type=_VIDEO_FRAME_MIME_TYPE,
                headers={
                    **response_headers,
                    "X-Video-Frame-Cache": "DISK",
                    "X-Video-Frame-Time": f"{frame_time_s:.{_VIDEO_FRAME_TIME_DECIMALS}f}",
                },
            )

    preview_entry = await _get_video_preview_lock(cache_key)
    try:
        async with preview_entry.lock:
            exists_after_lock = await settled_thread(
                lambda: _video_frame_cache_exists(frame_path)
            )
            if exists_after_lock:
                if request.headers.get("if-none-match") == etag:
                    return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)
                cached_after_lock = await settled_thread(
                    lambda: _read_video_frame_cache(frame_path)
                )
                if cached_after_lock is not None:
                    return Response(
                        content=cached_after_lock,
                        media_type=_VIDEO_FRAME_MIME_TYPE,
                        headers={
                            **response_headers,
                            "X-Video-Frame-Cache": "DISK",
                            "X-Video-Frame-Time": f"{frame_time_s:.{_VIDEO_FRAME_TIME_DECIMALS}f}",
                        },
                    )

            video_path = await _ensure_video_source_cached(project_file, db, cache_key)
            try:
                await settled_thread(
                    lambda: _extract_video_frame(
                        video_path,
                        frame_path,
                        frame_time_s,
                        cache_key,
                    )
                )
            except RuntimeError as exc:
                logger.warning(
                    "Failed generating video preview for file_id=%s at %.3fs: %s",
                    project_file.id,
                    frame_time_s,
                    exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="No se pudo generar el frame del video"
                ) from exc
    finally:
        await _cleanup_video_preview_lock(cache_key, preview_entry)

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=response_headers)

    frame_content = await settled_thread(lambda: _read_video_frame_cache(frame_path))
    if frame_content is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo leer el frame del video",
        )

    return Response(
        content=frame_content,
        media_type=_VIDEO_FRAME_MIME_TYPE,
        headers={
            **response_headers,
            "X-Video-Frame-Cache": "MISS",
            "X-Video-Frame-Time": f"{frame_time_s:.{_VIDEO_FRAME_TIME_DECIMALS}f}",
        },
    )


@router.get("/{project_id}/files/{file_id}/image")
async def get_project_file_image(
    project_id: UUID,
    file_id: UUID,
    request: Request,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Serve an image file from Google Drive through an authenticated backend proxy."""
    project_file = await _load_project_file(project_id, file_id, current_user, db)
    return await _serve_project_file_image(project_file, request, db)


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
        status=ProjectStatus.DRAFT if request.pre_experiment is not None else request.status or ProjectStatus.DRAFT,
        pre_experiment=request.pre_experiment.model_dump(mode="json") if request.pre_experiment is not None else None,
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
        participants_count=0,
        **planning_summary(project),
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
    needing_update = await repository.projects_needing_update([project.id for project in projects])

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
            participants_count=len(project.participants),
            **planning_summary(project),
            needs_update=project.id in needing_update,
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
        source_folder_name=project.source_folder_name,
        **planning_summary(project),
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
                "sex": p.sex.value if p.sex else None,
                "name": p.name,
                "document": p.effective_document,
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
                "stimulus_placement": (
                    s.stimulus_placement.to_contract().to_snapshot()
                    if s.stimulus_placement is not None
                    else None
                ),
                "aois": [
                    {
                        "id": a.id,
                        "scenaries_id": a.scenaries_id,
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


@router.patch("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(lock_project_for_write)])
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
        participants_count=len(updated_project.participants),
        **planning_summary(updated_project),
    )


@router.delete("/{project_id}", response_model=DeleteProjectResponse, dependencies=[Depends(lock_project_for_write)])
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
        logger.exception("Project deletion failed for project_id=%s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo eliminar el proyecto en base de datos"
        ) from exc

    if not result.get("deleted"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    invalidate_project_video_metadata(project_id)

    return DeleteProjectResponse(
        message="Project deleted successfully",
        drive_folder_found=bool(result.get("drive_folder_found")),
        drive_folder_deleted=bool(result.get("drive_folder_deleted")),
    )


async def _spool_upload_to_disk(file: UploadFile, destination: Path) -> int:
    """Stream the multipart part to disk, refusing to exceed the configured cap.

    `await file.read()` would materialise the whole archive as one `bytes`
    object and keep it alive for the entire ingestion. Streaming keeps peak
    memory at one chunk and lets an oversized body be cut off mid-transfer
    instead of after it has already been buffered.
    """
    max_bytes = ZipValidationService.get_max_file_size_bytes()
    total = 0

    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(_UPLOAD_SPOOL_CHUNK_SIZE)
            if not chunk:
                break

            total += len(chunk)
            if total > max_bytes:
                raise ZipValidationService.ValidationError(
                    f"ZIP excede el máximo permitido de {settings.project_zip_max_size_mb}MB"
                )

            await anyio.to_thread.run_sync(buffer.write, chunk)

    return total


@router.post(
    "/{project_id}/files/experiment-zip",
    dependencies=[Depends(lock_project_for_write)],
    response_model=UploadedProjectZipSummaryResponse,
    responses={
        409: {
            "model": UploadClarificationResponse,
            "description": (
                "The archive is ambiguous and needs a decision from the user, or the "
                "upload was canceled. Clarifications carry "
                "`detail.error == 'structure_clarification_required'`."
            ),
        }
    },
)
async def upload_experiment_zip(
    project_id: UUID,
    file: UploadFile = File(...),
    selected_csv_path: Optional[str] = Form(default=None),
    selected_images_folder: Optional[str] = Form(default=None),
    selected_videos_folder: Optional[str] = Form(default=None),
    selected_acquisition_folder: Optional[str] = Form(default=None),
    allow_missing_images: bool = Form(default=False),
    allow_missing_videos: bool = Form(default=False),
    stimulus_placements_json: Optional[str] = Form(default=None),
    screen_width_px: Optional[int] = Form(default=None, gt=0),
    screen_height_px: Optional[int] = Form(default=None, gt=0),
    screen_width_mm: Optional[float] = Form(default=None, gt=0),
    screen_height_mm: Optional[float] = Form(default=None, gt=0),
    viewing_distance_mm: Optional[float] = Form(default=None, gt=0),
    upload_id: Optional[UUID] = Form(default=None),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload experiment ZIP and execute full project ingestion flow.

    When the archive is structurally ambiguous — several `.csv` files, several
    or zero `Images`/`Videos` folders — the request is answered with **409** and
    a machine-readable list of questions. The client re-sends the same archive
    with the matching `selected_*` / `allow_missing_*` fields filled in.
    """

    owner_id = UUID(current_user)
    upload_id = upload_id or uuid4()
    mime_type = file.content_type or "application/zip"
    filename = file.filename or "experiment.zip"
    selection = UploadSelection(
        csv_entry_path=_clean_form_value(selected_csv_path),
        images_folder=_clean_form_value(selected_images_folder),
        videos_folder=_clean_form_value(selected_videos_folder),
        acquisition_folder=_clean_form_value(selected_acquisition_folder),
        allow_missing_images=bool(allow_missing_images),
        allow_missing_videos=bool(allow_missing_videos),
    )
    screen_geometry = _build_screen_geometry(
        screen_width_px=screen_width_px,
        screen_height_px=screen_height_px,
        screen_width_mm=screen_width_mm,
        screen_height_mm=screen_height_mm,
        viewing_distance_mm=viewing_distance_mm,
    )
    stimulus_placements = _parse_stimulus_placements_json(stimulus_placements_json)

    logger.info("Processing ZIP upload for project %s, file: %s", project_id, filename)

    repository = SQLProjectRepository(db)
    use_case = UploadExperimentZipUseCase(repository, db=db)

    try:
        with tempfile.TemporaryDirectory(prefix="neurodatics-upload-") as spool_dir:
            zip_path = Path(spool_dir) / "experiment.zip"

            try:
                await _spool_upload_to_disk(file, zip_path)
            except ZipValidationService.ValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=str(exc),
                ) from exc

            summary = await finish_upload_on_disconnect(use_case.execute(
                project_id=project_id,
                owner_id=owner_id,
                zip_path=str(zip_path),
                filename=filename,
                mime_type=mime_type,
                selection=selection,
                screen_geometry=screen_geometry,
                stimulus_placements=stimulus_placements,
                upload_id=upload_id,
            ), project_id, upload_id)
    except HTTPException:
        raise
    except ZipValidationService.ClarificationRequired as exc:
        # 409: the archive is fine, the user just has to disambiguate it.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.to_dict(),
        ) from exc
    except ZipValidationService.ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ZipExtractionService.ExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except StimulusPlacementUploadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": exc.code, "message": str(exc)},
        ) from exc
    except ProjectUploadNotFoundError as e:
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
    except UploadAttemptConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except (CsvIngestionError, ParticipantIdentityError) as exc:
        raise HTTPException(422, str(exc)) from exc
    except (GoogleDriveConfigurationError, GoogleDriveReconnectRequiredError) as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except Exception:
        logger.exception("ZIP upload failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo completar la carga. Consulta el estado del proyecto antes de reintentar."
        )

    return UploadedProjectZipSummaryResponse(
        upload_id=summary.get("upload_id", upload_id),
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
        selection=summary.get("selection", {}),
        acquisition=summary.get("acquisition", {}),
        excluded_entries=summary.get("excluded_entries", []),
        stimulus_placements=summary.get("stimulus_placements", {}),
    )


@router.post("/{project_id}/files/experiment-zip/cancel")
async def cancel_experiment_zip_upload(
    project_id: UUID,
    upload_id: Optional[UUID] = None,
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

    await UploadAttemptStore(db).request_cancel(project_id, upload_id)
    drive_upload_progress_registry.request_cancel(progress_key(project_id, upload_id))
    return {"message": "Cancel requested"}


@router.get("/{project_id}/files/experiment-zip/progress", response_model=DriveUploadProgressResponse)
async def get_experiment_zip_upload_progress(
    project_id: UUID,
    upload_id: Optional[UUID] = None,
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

    attempt = await UploadAttemptStore(db).get(project_id, upload_id)
    scoped_id = upload_id or (attempt.id if attempt is not None else None)
    progress = drive_upload_progress_registry.get(progress_key(project_id, scoped_id))
    if attempt is not None:
        progress = dict(progress or attempt.progress or {})
        progress["phase"] = "canceling" if attempt.cancel_requested and attempt.phase not in {"completed", "failed"} else attempt.phase
        progress["error"] = attempt.error
        if attempt.phase == "completed":
            progress["percent"] = 100
    if progress:
        return DriveUploadProgressResponse(
            upload_id=scoped_id,
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

    if upload_id is None and project.ingestion_status and str(project.ingestion_status).upper() == "FAILED":
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


@router.put("/{project_id}/sensors", response_model=List[dict], dependencies=[Depends(lock_project_for_write)])
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


@router.post("/{project_id}/finalize", dependencies=[Depends(lock_project_for_write)])
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

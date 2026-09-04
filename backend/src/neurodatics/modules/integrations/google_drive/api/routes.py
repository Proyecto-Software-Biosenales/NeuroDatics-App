from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from .....api.deps import get_db, get_current_user
from .....config.settings import settings
from .....config.logging import tombstone
from ..application.service import GoogleDriveIntegrationService
from ..application.sync_tasks import (
    create_sync_task,
    get_sync_task,
    list_sync_tasks,
    start_sync_task,
)
from ..infrastructure.repository import SystemIntegrationRepository
from .schemas import (
    GoogleDriveAuthorizeResponse,
    GoogleDriveCallbackResponse,
    GoogleDriveDisconnectResponse,
    GoogleDriveStatusResponse,
    GoogleDriveFolderCreateResponse,
    GoogleDriveSyncResponse,
)


# Every route in this router is authenticated at the router level. The only
# exception is the OAuth callback, which Google redirects the browser to and
# therefore cannot carry a bearer token; it is registered on a separate,
# unauthenticated router below and is protected instead by the HMAC-signed,
# TTL-bounded `state` parameter it validates.
router = APIRouter(
    prefix="/integrations/google-drive",
    tags=["integrations"],
    dependencies=[Depends(get_current_user)],
)

public_router = APIRouter(prefix="/integrations/google-drive", tags=["integrations"])


def _service_from_db(db: AsyncSession) -> GoogleDriveIntegrationService:
    repository = SystemIntegrationRepository(db)
    return GoogleDriveIntegrationService(repository)


def _require_sync_enabled() -> None:
    """The folder-sync endpoints read the server's own filesystem.

    They stay off unless an operator explicitly nominates a root directory, so
    the default deployment has no server-side read primitive at all.
    """
    if not (settings.gdrive_sync_allowed_root or "").strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La sincronizacion de carpetas locales esta deshabilitada. "
                "Define GDRIVE_SYNC_ALLOWED_ROOT para habilitarla."
            ),
        )


@router.get("/authorize", response_model=GoogleDriveAuthorizeResponse)
async def authorize_google_drive(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    tombstone("gdrive.authorize_google_drive")
    service = _service_from_db(db)
    authorization_url = service.build_authorization_url()
    return GoogleDriveAuthorizeResponse(authorization_url=authorization_url)


@public_router.get("/callback", response_model=GoogleDriveCallbackResponse)
async def google_drive_callback(
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Google's OAuth redirect target.

    Unauthenticated by necessity — the browser arrives here straight from
    Google with no Authorization header. `service.connect_from_callback`
    verifies the HMAC signature and TTL of `state` before doing anything, so
    this cannot be driven by a caller who does not hold `AUTH_JWT_SECRET`.
    """
    tombstone("gdrive.google_drive_callback")
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google Drive OAuth error: {error}",
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing code in Google Drive OAuth callback.",
        )

    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing state in Google Drive OAuth callback.",
        )

    service = _service_from_db(db)
    payload = await service.connect_from_callback(code=code, state=state)
    return GoogleDriveCallbackResponse(**payload)


async def google_drive_status(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    tombstone("gdrive.google_drive_status")
    service = _service_from_db(db)
    payload = await service.get_status()
    return GoogleDriveStatusResponse(**payload)


async def disconnect_google_drive(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    tombstone("gdrive.disconnect_google_drive")
    service = _service_from_db(db)
    payload = await service.disconnect()
    return GoogleDriveDisconnectResponse(**payload)


async def create_google_drive_folder(
    folder_name: str = Query(..., description="Name for the new folder"),
    parent_id: Optional[str] = Query(None, description="Parent folder ID (optional, uses GDRIVE_FOLDER_ID if not provided)"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Create a new folder in Google Drive."""
    tombstone("gdrive.create_google_drive_folder")
    service = _service_from_db(db)
    payload = await service.create_folder(folder_name=folder_name, parent_id=parent_id)
    return GoogleDriveFolderCreateResponse(**payload)


async def sync_local_folder_to_drive(
    local_folder_path: str = Query(..., description="Path to a local folder inside GDRIVE_SYNC_ALLOWED_ROOT"),
    target_folder_id: Optional[str] = Query(None, description="Target Google Drive folder ID"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """
    Sync a local folder structure to Google Drive.
    Recreates all subdirectories and uploads all files while maintaining folder structure.

    The path is confined to `GDRIVE_SYNC_ALLOWED_ROOT`; the endpoint is disabled
    entirely when that setting is empty.
    """
    tombstone("gdrive.sync_local_folder_to_drive")
    _require_sync_enabled()
    service = _service_from_db(db)
    payload = await service.sync_folder_to_drive(
        local_folder_path=local_folder_path,
        target_folder_id=target_folder_id,
    )
    return GoogleDriveSyncResponse(**payload)


async def schedule_folder_sync(
    local_folder_path: str = Query(..., description="Path to a local folder inside GDRIVE_SYNC_ALLOWED_ROOT"),
    target_folder_id: Optional[str] = Query(None, description="Target Google Drive folder ID"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """
    Schedule a folder sync task to run asynchronously.
    Returns immediately with task ID. Use /sync-status/{task_id} to check progress.

    Subject to the same `GDRIVE_SYNC_ALLOWED_ROOT` confinement as `/sync-folder`;
    the path is re-validated inside the task before anything is read.
    """
    tombstone("gdrive.schedule_folder_sync")
    _require_sync_enabled()
    service = _service_from_db(db)

    # Reject a path outside the allowed root now, so the caller gets a 400
    # instead of a task that fails asynchronously.
    service.resolve_syncable_folder(local_folder_path)

    task_id = create_sync_task(local_folder_path, target_folder_id)
    task = get_sync_task(task_id)

    # Start the sync task asynchronously
    start_sync_task(task, service.sync_folder_to_drive)

    return {
        "task_id": task_id,
        "status": "accepted",
        "message": f"Sync task scheduled with ID: {task_id}",
        "check_status_url": f"/api/integrations/google-drive/sync-status/{task_id}",
    }


async def get_sync_task_status(
    task_id: str,
    current_user: str = Depends(get_current_user),
):
    """
    Get the status of a scheduled sync task.

    Returns task details including:
    - status: pending, running, completed, or failed
    - result: sync results (if completed)
    - error: error message (if failed)
    """
    tombstone("gdrive.get_sync_task_status")
    task = get_sync_task(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task not found: {task_id}",
        )

    return task.to_dict()


async def list_all_sync_tasks(
    current_user: str = Depends(get_current_user),
):
    """
    List all scheduled sync tasks.
    Shows pending, running, completed, and failed tasks.
    """
    tombstone("gdrive.list_all_sync_tasks")
    tasks = list_sync_tasks()
    return {
        "total_tasks": len(tasks),
        "tasks": [task.to_dict() for task in tasks],
    }

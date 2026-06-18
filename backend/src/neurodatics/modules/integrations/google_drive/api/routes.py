from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession

from .....api.deps import get_db
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
    GoogleDriveUploadResponse,
    GoogleDriveFolderCreateResponse,
    GoogleDriveSyncResponse,
)


router = APIRouter(prefix="/integrations/google-drive", tags=["integrations"])


def _service_from_db(db: AsyncSession) -> GoogleDriveIntegrationService:
    repository = SystemIntegrationRepository(db)
    return GoogleDriveIntegrationService(repository)


@router.get("/authorize", response_model=GoogleDriveAuthorizeResponse)
async def authorize_google_drive(
    db: AsyncSession = Depends(get_db),
):
    service = _service_from_db(db)
    authorization_url = service.build_authorization_url()
    return GoogleDriveAuthorizeResponse(authorization_url=authorization_url)


@router.get("/callback", response_model=GoogleDriveCallbackResponse)
async def google_drive_callback(
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
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


@router.get("/status", response_model=GoogleDriveStatusResponse)
async def google_drive_status(
    db: AsyncSession = Depends(get_db),
):
    service = _service_from_db(db)
    payload = await service.get_status()
    return GoogleDriveStatusResponse(**payload)


@router.delete("", response_model=GoogleDriveDisconnectResponse)
async def disconnect_google_drive(
    db: AsyncSession = Depends(get_db),
):
    service = _service_from_db(db)
    payload = await service.disconnect()
    return GoogleDriveDisconnectResponse(**payload)


@router.post("/create-folder", response_model=GoogleDriveFolderCreateResponse)
async def create_google_drive_folder(
    folder_name: str = Query(..., description="Name for the new folder"),
    parent_id: Optional[str] = Query(None, description="Parent folder ID (optional, uses GDRIVE_FOLDER_ID if not provided)"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new folder in Google Drive."""
    service = _service_from_db(db)
    payload = await service.create_folder(folder_name=folder_name, parent_id=parent_id)
    return GoogleDriveFolderCreateResponse(**payload)


@router.post("/sync-folder", response_model=GoogleDriveSyncResponse)
async def sync_local_folder_to_drive(
    local_folder_path: str = Query(..., description="Absolute path to local folder to sync"),
    target_folder_id: Optional[str] = Query(None, description="Target Google Drive folder ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync a local folder structure to Google Drive.
    Recreates all subdirectories and uploads all files while maintaining folder structure.
    
    Example:
        GET /api/integrations/google-drive/sync-folder?local_folder_path=/path/to/folder
    """
    service = _service_from_db(db)
    payload = await service.sync_folder_to_drive(
        local_folder_path=local_folder_path,
        target_folder_id=target_folder_id,
    )
    return GoogleDriveSyncResponse(**payload)


@router.post("/sync-folder-scheduled", status_code=202)
async def schedule_folder_sync(
    local_folder_path: str = Query(..., description="Absolute path to local folder to sync"),
    target_folder_id: Optional[str] = Query(None, description="Target Google Drive folder ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Schedule a folder sync task to run asynchronously.
    Returns immediately with task ID. Use /sync-status/{task_id} to check progress.
    
    Response: 202 Accepted
    Example:
        POST /api/integrations/google-drive/sync-folder-scheduled?local_folder_path=/path/to/folder
    """
    task_id = create_sync_task(local_folder_path, target_folder_id)
    task = get_sync_task(task_id)

    service = _service_from_db(db)

    # Start the sync task asynchronously
    start_sync_task(task, service.sync_folder_to_drive)

    return {
        "task_id": task_id,
        "status": "accepted",
        "message": f"Sync task scheduled with ID: {task_id}",
        "check_status_url": f"/api/integrations/google-drive/sync-status/{task_id}",
    }


@router.get("/sync-status/{task_id}")
async def get_sync_task_status(
    task_id: str,
):
    """
    Get the status of a scheduled sync task.
    
    Returns task details including:
    - status: pending, running, completed, or failed
    - result: sync results (if completed)
    - error: error message (if failed)
    """
    task = get_sync_task(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task not found: {task_id}",
        )

    return task.to_dict()


@router.get("/sync-tasks")
async def list_all_sync_tasks():
    """
    List all scheduled sync tasks.
    Shows pending, running, completed, and failed tasks.
    """
    tasks = list_sync_tasks()
    return {
        "total_tasks": len(tasks),
        "tasks": [task.to_dict() for task in tasks],
    }

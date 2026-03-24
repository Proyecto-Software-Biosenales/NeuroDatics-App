"""Scheduled sync tasks for Google Drive integration."""

import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# In-memory task registry (in production, use a real task queue like Celery)
_scheduled_syncs: dict[str, dict] = {}
_sync_counter = 0


class SyncTask:
    """Represents a scheduled sync task."""

    def __init__(
        self,
        task_id: str,
        local_folder_path: str,
        target_folder_id: Optional[str],
        created_at: datetime,
    ):
        self.task_id = task_id
        self.local_folder_path = local_folder_path
        self.target_folder_id = target_folder_id
        self.created_at = created_at
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.status = "pending"  # pending, running, completed, failed
        self.result: Optional[dict] = None
        self.error: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dict for API response."""
        return {
            "task_id": self.task_id,
            "status": self.status,
            "local_folder_path": self.local_folder_path,
            "target_folder_id": self.target_folder_id,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "result": self.result,
            "error": self.error,
        }


def create_sync_task(
    local_folder_path: str,
    target_folder_id: Optional[str] = None,
) -> str:
    """Create a new sync task and return its ID."""
    global _sync_counter
    _sync_counter += 1
    task_id = f"sync_{_sync_counter}"

    task = SyncTask(
        task_id=task_id,
        local_folder_path=local_folder_path,
        target_folder_id=target_folder_id,
        created_at=datetime.now(),
    )

    _scheduled_syncs[task_id] = task
    logger.info(f"📋 Created sync task: {task_id}")
    return task_id


def get_sync_task(task_id: str) -> Optional[SyncTask]:
    """Get a sync task by ID."""
    return _scheduled_syncs.get(task_id)


def list_sync_tasks() -> list[SyncTask]:
    """List all sync tasks."""
    return list(_scheduled_syncs.values())


def start_sync_task(task: SyncTask, service_sync_fn):
    """Start executing a sync task asynchronously."""
    logger.info(f"🚀 Starting sync task: {task.task_id}")
    task.status = "running"
    task.started_at = datetime.now()

    # Create async task
    asyncio.create_task(_execute_sync(task, service_sync_fn))


async def _execute_sync(task: SyncTask, service_sync_fn) -> None:
    """Execute the sync operation."""
    try:
        result = await service_sync_fn(
            local_folder_path=task.local_folder_path,
            target_folder_id=task.target_folder_id,
        )
        task.result = result
        task.status = "completed"
        task.completed_at = datetime.now()
        logger.info(f"✅ Sync task {task.task_id} completed successfully")
    except Exception as e:
        task.error = str(e)
        task.status = "failed"
        task.completed_at = datetime.now()
        logger.error(f"❌ Sync task {task.task_id} failed: {e}")

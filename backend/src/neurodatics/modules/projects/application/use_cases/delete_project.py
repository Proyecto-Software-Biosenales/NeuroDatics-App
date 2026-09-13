from typing import Optional
from uuid import UUID
import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from .....infra.storage.gdrive_client import gdrive_client
from ....integrations.google_drive.infrastructure.configure_client import (
    configure_gdrive_client_with_oauth,
)
from ...domain.repository import ProjectRepository
from ...infrastructure.drive_cleanup import enqueue_drive_cleanup, drain_drive_cleanup
from ...infrastructure.upload_attempt_store import UploadAttemptStore

logger = logging.getLogger(__name__)


class DeleteProjectUseCase:
    """Delete project use case."""

    def __init__(self, repository: ProjectRepository, db: Optional[AsyncSession] = None):
        self.repository = repository
        self.db = db

    async def execute(self, project_id: UUID, owner_id: UUID) -> dict:
        """Delete a project and its root Drive folder when present."""
        project = await self.repository.get_by_id(project_id, owner_id)
        if not project:
            return {
                "deleted": False,
                "drive_folder_found": False,
                "drive_folder_deleted": False,
            }

        drive_root_folder_id = getattr(project, "drive_root_folder_id", None)
        drive_folder_found = bool(drive_root_folder_id)
        drive_folder_deleted = False
        cleanup_ids = [drive_root_folder_id] if drive_root_folder_id else []
        if self.db is not None:
            for attempt in await UploadAttemptStore(self.db).unfinished(project_id, None):
                cleanup_ids.extend([attempt.root_folder_id, attempt.cleanup_root_id])
            await enqueue_drive_cleanup(self.db, project_id, cleanup_ids)
        # Publish deletion and its cleanup intent first. A DB failure can no
        # longer leave a surviving project pointing at a deleted Drive root.
        deleted = await self.repository.delete(project_id, owner_id)
        if deleted and cleanup_ids:
            try:
                if self.db is not None:
                    if await configure_gdrive_client_with_oauth(self.db, silent=True):
                        removed = await drain_drive_cleanup(self.db, external_ids=cleanup_ids)
                        drive_folder_deleted = drive_root_folder_id in removed
                elif drive_root_folder_id:
                    drive_folder_deleted = await asyncio.to_thread(gdrive_client.delete_file, drive_root_folder_id)
            except Exception:
                logger.warning("Project deleted; Drive cleanup remains queued", exc_info=True)
        return {
            "deleted": deleted,
            "drive_folder_found": drive_folder_found,
            "drive_folder_deleted": drive_folder_deleted,
        }

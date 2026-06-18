from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from .....infra.storage.gdrive_client import gdrive_client
from ....integrations.google_drive.infrastructure.configure_client import (
    configure_gdrive_client_with_oauth,
)
from ...domain.repository import ProjectRepository


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
        if drive_root_folder_id:
            if self.db:
                await configure_gdrive_client_with_oauth(self.db, silent=True)

            deleted = gdrive_client.delete_file(drive_root_folder_id)
            if not deleted:
                raise RuntimeError(
                    "No se pudo eliminar la carpeta del proyecto en Google Drive. "
                    "Cancela la eliminacion para evitar inconsistencia."
                )
            drive_folder_deleted = True

        deleted = await self.repository.delete(project_id, owner_id)
        return {
            "deleted": deleted,
            "drive_folder_found": drive_folder_found,
            "drive_folder_deleted": drive_folder_deleted,
        }

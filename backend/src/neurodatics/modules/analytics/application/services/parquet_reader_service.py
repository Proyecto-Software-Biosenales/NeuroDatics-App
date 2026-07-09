import logging
from typing import Optional
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .....infra.storage.gdrive_client import GoogleDriveClient
from .....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from ....integrations.google_drive.infrastructure.repository import SystemIntegrationRepository
from ....participants.domain.entities import Participant
from ....projects.domain.entities import ProjectFile
from ...infrastructure.parquet_cache import ParquetCacheService

logger = logging.getLogger(__name__)

GOOGLE_DRIVE_RECONNECT_MESSAGE = (
    "La conexion de Google Drive expiro o fue revocada. "
    "Reconecta Google Drive para generar un refresh token nuevo."
)


def _is_invalid_google_grant_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "invalid_grant" in message or "expired or revoked" in message


class ParquetReaderService:
    def __init__(self, db: AsyncSession):
        self._db = db
        self._cache = ParquetCacheService()

    async def read(self, project_id: UUID, participant_code: str) -> pd.DataFrame:
        """Load participant Parquet from cache or Drive."""
        cached = self._cache.read_dataframe(project_id, participant_code)
        if cached is not None:
            return cached

        user_index = await self._resolve_user_index(project_id, participant_code)
        if user_index is None:
            raise ValueError(f"Participant '{participant_code}' not found in project")

        parquet_file = await self._find_parquet_file(project_id, user_index)
        if parquet_file is None:
            raise FileNotFoundError(f"No processed Parquet file for user_index={user_index}")

        client = await self._build_drive_client()
        if client is None:
            raise RuntimeError("Google Drive integration not configured")

        import anyio

        try:
            content = await anyio.to_thread.run_sync(
                lambda: client.download_file_content(parquet_file.external_id)
            )
        except Exception as exc:
            if _is_invalid_google_grant_error(exc):
                logger.warning("Google Drive OAuth token expired or revoked while reading parquet")
                raise RuntimeError(GOOGLE_DRIVE_RECONNECT_MESSAGE) from exc
            raise RuntimeError("No se pudo descargar el parquet desde Google Drive") from exc

        path = self._cache.put(project_id, participant_code, content)
        return pd.read_parquet(path)

    async def read_from_cache_only(self, project_id: UUID, participant_code: str) -> Optional[pd.DataFrame]:
        """Read only from disk cache - no Drive download. Returns None if not cached."""
        return self._cache.read_dataframe(project_id, participant_code)

    async def _resolve_user_index(self, project_id: UUID, participant_code: str) -> Optional[int]:
        result = await self._db.execute(
            select(Participant)
            .where(Participant.project_id == project_id)
            .order_by(Participant.id)
        )
        participants = result.scalars().all()
        for idx, participant in enumerate(participants, start=1):
            if participant.participant_code == participant_code:
                return idx
        return None

    async def _find_parquet_file(self, project_id: UUID, user_index: int) -> Optional[ProjectFile]:
        target_filename = f"user{user_index}.parquet"
        result = await self._db.execute(
            select(ProjectFile).where(
                ProjectFile.project_id == project_id,
                ProjectFile.kind == "processed_parquet",
                ProjectFile.deleted_at.is_(None),
            )
        )
        for project_file in result.scalars().all():
            if target_filename in project_file.filename:
                return project_file
        return None

    async def _build_drive_client(self) -> Optional[GoogleDriveClient]:
        """Create isolated Drive client (same pattern as projects module)."""
        repository = SystemIntegrationRepository(self._db)
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

"""Which object store this process reads and writes: Google Drive (server) or a local folder.

Every caller that used to import the Drive client directly imports it from here instead, so
local mode never loads the Google libraries. ``gdrive_client`` keeps its historical name
because that is the attribute existing code and tests already patch; in local mode it is the
local store, with the same methods and the same return shapes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ...config.settings import settings

if TYPE_CHECKING:
    from ...infra.storage.gdrive_client import GoogleDriveClient

__all__ = [
    "STORAGE_PROVIDER",
    "build_isolated_drive_client",
    "configure_gdrive_client_with_oauth",
    "gdrive_client",
]

# What projects.storage_provider records for files written by this process.
STORAGE_PROVIDER = "local" if settings.is_local else "gdrive"

if settings.is_local:
    from ...infra.storage.local_client import LocalStorageClient

    gdrive_client: Any = LocalStorageClient(settings.local_storage_dir)
else:
    from ...infra.storage.gdrive_client import gdrive_client


async def configure_gdrive_client_with_oauth(
    db: AsyncSession,
    silent: bool = True,
    force_refresh: bool = False,
) -> bool:
    """Make the shared store usable; local storage needs no credentials, so it always is."""
    if settings.is_local:
        return True

    from .google_drive.infrastructure.configure_client import (
        configure_gdrive_client_with_oauth as configure,
    )

    return await configure(db, silent=silent, force_refresh=force_refresh)


async def build_isolated_drive_client(db: AsyncSession) -> Optional["GoogleDriveClient"]:
    """A store handle for one request, or None when the store is not connected.

    Server mode builds a fresh Drive client so a request never touches the shared singleton;
    the local store keeps no per-request state, so it is shared.
    """
    if settings.is_local:
        return gdrive_client

    from ...infra.storage.gdrive_client import GoogleDriveClient
    from ...infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
    from .google_drive.infrastructure.repository import SystemIntegrationRepository

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

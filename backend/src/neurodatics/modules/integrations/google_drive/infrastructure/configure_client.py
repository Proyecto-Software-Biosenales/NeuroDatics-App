"""Helper to configure Google Drive client with OAuth credentials from system integrations."""

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from .....infra.storage.gdrive_client import gdrive_client
from .....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from .repository import SystemIntegrationRepository

logger = logging.getLogger(__name__)


async def configure_gdrive_client_with_oauth(
    db: AsyncSession,
    silent: bool = True,
) -> bool:
    """
    Configure the global Google Drive client with OAuth credentials from system integrations.
    
    This function:
    1. Queries system_integrations table for Google Drive provider
    2. Builds OAuth credentials from the stored refresh token
    3. Injects them into the global gdrive_client
    
    Args:
        db: AsyncSession for database access
        silent: If True, log warnings instead of raising exceptions for missing integration
    
    Returns:
        True if credentials were successfully configured, False otherwise
    """
    try:
        repository = SystemIntegrationRepository(db)
        integration = await repository.get_by_provider("google_drive")
        
        if not integration:
            if not silent:
                logger.warning("⚠️  Google Drive integration not configured in system_integrations")
            return False
        
        refresh_token = integration.get("refresh_token")
        if not refresh_token:
            if not silent:
                logger.warning("⚠️  Google Drive integration missing refresh_token")
            return False
        
        scope = integration.get("scope")
        
        # Build OAuth credentials
        oauth_credentials = build_google_drive_oauth_credentials(
            refresh_token=refresh_token,
            scope=scope,
        )
        
        # Inject into global client
        gdrive_client.set_oauth_credentials(oauth_credentials)
        logger.info("✅ Google Drive client configured with OAuth credentials")
        return True
        
    except Exception as exc:
        if not silent:
            logger.error(f"❌ Failed to configure Google Drive client: {exc}")
        return False

"""Helper to configure Google Drive client with OAuth credentials from system integrations."""

import hashlib
import logging
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from .....infra.storage.gdrive_client import gdrive_client
from .....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from .repository import SystemIntegrationRepository

logger = logging.getLogger(__name__)

_CONFIG_CACHE_TTL_SECONDS = 45.0
_last_config_check_at: float = 0.0
_last_config_result: Optional[bool] = None
_last_credentials_signature: Optional[str] = None


def _build_credentials_signature(refresh_token: str, scope: Optional[str], updated_at: Optional[object]) -> str:
    token_hash = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
    return f"{token_hash}:{scope or ''}:{updated_at or ''}"


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
    global _last_config_check_at, _last_config_result, _last_credentials_signature

    now = time.monotonic()
    if _last_config_result is not None and (now - _last_config_check_at) < _CONFIG_CACHE_TTL_SECONDS:
        return _last_config_result

    try:
        repository = SystemIntegrationRepository(db)
        integration = await repository.get_by_provider("google_drive")
        
        if not integration:
            if not silent:
                logger.warning("⚠️  Google Drive integration not configured in system_integrations")
            _last_config_result = False
            _last_config_check_at = now
            return False
        
        refresh_token = integration.get("refresh_token")
        if not refresh_token:
            if not silent:
                logger.warning("⚠️  Google Drive integration missing refresh_token")
            _last_config_result = False
            _last_config_check_at = now
            return False
        
        scope = integration.get("scope")
        
        signature = _build_credentials_signature(
            refresh_token=refresh_token,
            scope=scope,
            updated_at=integration.get("updated_at"),
        )

        # Reconfigure client only when credentials/settings changed.
        if signature != _last_credentials_signature:
            oauth_credentials = build_google_drive_oauth_credentials(
                refresh_token=refresh_token,
                scope=scope,
            )
            gdrive_client.set_oauth_credentials(oauth_credentials)
            _last_credentials_signature = signature
            logger.info("✅ Google Drive client configured with OAuth credentials")

        _last_config_result = True
        _last_config_check_at = now
        return True
        
    except Exception as exc:
        if not silent:
            logger.error(f"❌ Failed to configure Google Drive client: {exc}")
        _last_config_result = False
        _last_config_check_at = now
        return False

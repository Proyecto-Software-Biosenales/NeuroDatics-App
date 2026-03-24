from typing import Optional

from ...config.settings import settings


def build_google_drive_oauth_credentials(*, refresh_token: str, scope: Optional[str] = None):
    """Build Google OAuth credentials for Drive using a persisted global refresh token."""
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise RuntimeError(
            "Google OAuth client credentials are not configured. "
            "Define GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
        )

    if not refresh_token:
        raise RuntimeError("Google Drive refresh token is missing")

    from google.oauth2.credentials import Credentials

    if scope:
        normalized_scope = scope.replace(",", " ").strip()
        resolved_scopes = [item for item in normalized_scope.split() if item]
        if not resolved_scopes:
            resolved_scopes = ["https://www.googleapis.com/auth/drive"]
    else:
        resolved_scopes = ["https://www.googleapis.com/auth/drive"]

    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=settings.google_oauth_token_url,
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        scopes=resolved_scopes,
    )

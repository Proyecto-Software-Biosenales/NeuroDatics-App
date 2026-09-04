import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from .....config.settings import settings
from ..infrastructure.configure_client import reset_gdrive_oauth_configuration_cache
from ..infrastructure.repository import SystemIntegrationRepository


GOOGLE_DRIVE_PROVIDER = "google_drive"
GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"


class GoogleDriveIntegrationService:
    def __init__(self, repository: SystemIntegrationRepository):
        self._repository = repository

    def build_authorization_url(self) -> str:
        redirect_uri = self._resolve_redirect_uri()
        state = self._create_signed_state()

        query = {
            "client_id": settings.google_oauth_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_DRIVE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{settings.google_oauth_authorize_url}?{urlencode(query)}"

    async def connect_from_callback(self, *, code: str, state: str) -> dict[str, Any]:
        self._verify_state(state)
        self._ensure_google_oauth_base_configured()

        redirect_uri = self._resolve_redirect_uri()
        token_payload = {
            "code": code,
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                token_response = await client.post(
                    settings.google_oauth_token_url,
                    data=token_payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="No se pudo contactar a Google para intercambiar el codigo de Drive.",
            ) from exc

        if token_response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google token exchange failed: {token_response.text}",
            )

        token_json = token_response.json()
        access_token = token_json.get("access_token")
        refresh_token_from_google = token_json.get("refresh_token")
        scope = token_json.get("scope")
        token_type = token_json.get("token_type")
        expires_in = token_json.get("expires_in")
        id_token = token_json.get("id_token")

        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google no retorno access_token para Google Drive.",
            )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                userinfo_response = await client.get(
                    settings.google_oauth_userinfo_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="No se pudo obtener userinfo de la cuenta de Google Drive.",
            ) from exc

        if userinfo_response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google userinfo failed: {userinfo_response.text}",
            )

        userinfo = userinfo_response.json()
        account_email = userinfo.get("email")

        existing = await self._repository.get_by_provider(GOOGLE_DRIVE_PROVIDER)
        persisted_refresh_token = (
            refresh_token_from_google
            or (existing or {}).get("refresh_token")
        )

        if not persisted_refresh_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Google no retorno refresh_token y no existe una conexion previa. "
                    "Asegura prompt=consent y access_type=offline."
                ),
            )

        expires_at = _build_expires_at(expires_in)

        saved = await self._repository.upsert_provider_connection(
            provider=GOOGLE_DRIVE_PROVIDER,
            account_email=account_email,
            refresh_token=persisted_refresh_token,
            access_token=access_token,
            scope=scope,
            token_type=token_type,
            expires_at=expires_at,
            metadata={"id_token_present": bool(id_token)},
        )
        reset_gdrive_oauth_configuration_cache()

        return {
            "connected": True,
            "provider": GOOGLE_DRIVE_PROVIDER,
            "account_email": saved.get("account_email"),
            "scope": saved.get("scope"),
            "refresh_token_received": bool(refresh_token_from_google),
        }








    def _resolve_redirect_uri(self) -> str:
        redirect_uri = settings.google_drive_oauth_redirect_uri or settings.google_oauth_redirect_uri
        if not redirect_uri:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing redirect_uri for Google Drive OAuth. Define GOOGLE_DRIVE_OAUTH_REDIRECT_URI.",
            )
        return redirect_uri

    def _ensure_google_oauth_base_configured(self) -> None:
        if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google OAuth no configurado en backend. Define GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET.",
            )

    def _create_signed_state(self) -> str:
        payload = {
            "provider": GOOGLE_DRIVE_PROVIDER,
            "nonce": secrets.token_urlsafe(16),
            "iat": int(time.time()),
        }
        encoded_payload = _urlsafe_b64encode(json.dumps(payload).encode("utf-8"))
        signature = self._sign_state(encoded_payload)
        return f"{encoded_payload}.{signature}"

    def _verify_state(self, state: str) -> None:
        if not state:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing state in Google Drive OAuth callback.",
            )

        try:
            encoded_payload, signature = state.split(".", 1)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OAuth state format.",
            ) from exc

        expected_signature = self._sign_state(encoded_payload)
        if not hmac.compare_digest(signature, expected_signature):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OAuth state signature.",
            )

        try:
            payload_raw = _urlsafe_b64decode(encoded_payload)
            payload = json.loads(payload_raw.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OAuth state payload.",
            ) from exc

        if payload.get("provider") != GOOGLE_DRIVE_PROVIDER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth state provider mismatch.",
            )

        issued_at = payload.get("iat")
        if not isinstance(issued_at, int):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth state missing iat.",
            )

        ttl_seconds = max(60, int(settings.google_drive_oauth_state_ttl_seconds))
        if int(time.time()) - issued_at > ttl_seconds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth state expired.",
            )

    def _sign_state(self, encoded_payload: str) -> str:
        secret = settings.auth_jwt_secret.encode("utf-8")
        return hmac.new(secret, encoded_payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _build_expires_at(expires_in: Any) -> Optional[datetime]:
    if expires_in is None:
        return None

    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None

    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def _urlsafe_b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _urlsafe_b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)

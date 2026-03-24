import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from .....config.settings import settings
from .....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from .....infra.storage.gdrive_file_service import create_gdrive_file_service
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

        return {
            "connected": True,
            "provider": GOOGLE_DRIVE_PROVIDER,
            "account_email": saved.get("account_email"),
            "scope": saved.get("scope"),
            "refresh_token_received": bool(refresh_token_from_google),
        }

    async def get_status(self) -> dict[str, Any]:
        integration = await self._repository.get_by_provider(GOOGLE_DRIVE_PROVIDER)
        if not integration:
            return {
                "connected": False,
                "provider": GOOGLE_DRIVE_PROVIDER,
                "account_email": None,
                "scope": None,
                "updated_at": None,
                "folder_id": settings.gdrive_folder_id,
            }

        return {
            "connected": bool(integration.get("refresh_token")),
            "provider": GOOGLE_DRIVE_PROVIDER,
            "account_email": integration.get("account_email"),
            "scope": integration.get("scope"),
            "updated_at": integration.get("updated_at"),
            "folder_id": settings.gdrive_folder_id,
        }

    async def disconnect(self) -> dict[str, Any]:
        await self._repository.delete_by_provider(GOOGLE_DRIVE_PROVIDER)
        return {
            "connected": False,
            "provider": GOOGLE_DRIVE_PROVIDER,
            "message": "Google Drive integration disconnected",
        }

    async def build_google_drive_credentials(self):
        """Build OAuth credentials from global system integration state."""
        integration = await self._repository.get_by_provider(GOOGLE_DRIVE_PROVIDER)
        if not integration or not integration.get("refresh_token"):
            raise RuntimeError("Google Drive global integration is not connected")

        return build_google_drive_oauth_credentials(
            refresh_token=integration["refresh_token"],
            scope=integration.get("scope"),
        )

    async def upload_file(self, *, file_path: str, folder_id: Optional[str] = None) -> dict[str, Any]:
        """
        Upload a file to Google Drive.
        
        Args:
            file_path: Path to the file to upload
            folder_id: Google Drive folder ID (uses GDRIVE_FOLDER_ID if not provided)
        
        Returns:
            Dict with file_id, file_name, and success status
        """
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File not found: {file_path}",
            )

        try:
            credentials = await self.build_google_drive_credentials()
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google Drive integration not connected",
            ) from exc

        target_folder = folder_id or settings.gdrive_folder_id
        if not target_folder:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No target folder specified. Configure GDRIVE_FOLDER_ID.",
            )

        try:
            file_service = create_gdrive_file_service(lambda: self.build_google_drive_credentials())
            file_id = await file_service.upload_file(
                file_path=file_path,
                parent_id=target_folder,
            )

            return {
                "success": True,
                "file_id": file_id,
                "file_name": os.path.basename(file_path),
                "message": f"File uploaded successfully to Google Drive",
            }
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file: {str(exc)}",
            ) from exc

    async def create_folder(self, *, folder_name: str, parent_id: Optional[str] = None) -> dict[str, Any]:
        """
        Create a folder in Google Drive.
        
        Args:
            folder_name: Name for the new folder
            parent_id: Parent folder ID (uses GDRIVE_FOLDER_ID if not provided)
        
        Returns:
            Dict with folder_id and folder_name
        """
        try:
            credentials = await self.build_google_drive_credentials()
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google Drive integration not connected",
            ) from exc

        parent = parent_id or settings.gdrive_folder_id
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No parent folder specified. Configure GDRIVE_FOLDER_ID.",
            )

        try:
            file_service = create_gdrive_file_service(lambda: self.build_google_drive_credentials())
            folder_id = await file_service.create_folder(
                folder_name=folder_name,
                parent_id=parent,
            )

            return {
                "success": True,
                "folder_id": folder_id,
                "folder_name": folder_name,
                "parent_id": parent,
            }
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create folder: {str(exc)}",
            ) from exc

    async def sync_folder_to_drive(
        self,
        *,
        local_folder_path: str,
        target_folder_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Sync a local folder structure and files to Google Drive.
        Recreates the entire folder structure and uploads all files.
        
        Args:
            local_folder_path: Path to local folder to sync
            target_folder_id: Google Drive folder ID (uses GDRIVE_FOLDER_ID if not provided)
        
        Returns:
            Dict with sync results (folders_created, files_uploaded, etc)
        """
        import logging
        logger = logging.getLogger(__name__)
        
        folder_path = Path(local_folder_path)
        if not folder_path.exists() or not folder_path.is_dir():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Folder not found or not a directory: {local_folder_path}",
            )

        try:
            credentials = await self.build_google_drive_credentials()
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google Drive integration not connected",
            ) from exc

        target_folder = target_folder_id or settings.gdrive_folder_id
        if not target_folder:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No target folder specified. Configure GDRIVE_FOLDER_ID.",
            )

        try:
            logger.info(f"🔄 Starting folder sync: {local_folder_path} → Google Drive")
            file_service = create_gdrive_file_service(lambda: self.build_google_drive_credentials())
            
            folders_created = 0
            files_uploaded = 0
            uploaded_files = []
            created_folders = []
            
            # Walk through all subdirectories and files
            for root, dirs, files in os.walk(folder_path):
                rel_path = Path(root).relative_to(folder_path)
                
                # Create folder structure in Drive
                current_parent = target_folder
                if rel_path != Path("."):
                    parts = rel_path.parts
                    for part in parts:
                        # Create folder in Drive
                        logger.info(f"  📁 Creating subfolder: {part}")
                        folder_id = await file_service.create_folder(
                            folder_name=part,
                            parent_id=current_parent,
                        )
                        folders_created += 1
                        created_folders.append({"name": part, "id": folder_id})
                        current_parent = folder_id
                
                # Upload files in current directory
                for file_name in files:
                    file_path = Path(root) / file_name
                    logger.info(f"  📤 Uploading file: {file_name}")
                    file_id = await file_service.upload_file(
                        file_path=str(file_path),
                        parent_id=current_parent,
                    )
                    files_uploaded += 1
                    uploaded_files.append({"name": file_name, "id": file_id})

            logger.info(f"✅ Folder sync completed: {folders_created} folders, {files_uploaded} files")
            return {
                "success": True,
                "folder_path": local_folder_path,
                "folders_created": folders_created,
                "files_uploaded": files_uploaded,
                "target_folder_id": target_folder,
                "created_folders": created_folders,
                "uploaded_files": uploaded_files,
                "message": f"Synced {folders_created} folders and {files_uploaded} files to Google Drive",
            }
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to sync folder: {str(exc)}",
            ) from exc

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

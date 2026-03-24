import hashlib
import json
import logging
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

import google_auth_httplib2
import httplib2
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ...config.settings import settings

logger = logging.getLogger(__name__)

FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"


class GoogleDriveClient:
    """Google Drive client for file and folder operations."""

    def __init__(self):
        self._service = None
        self._initialization_error: Optional[Exception] = None
        self._oauth_credentials = None  # For OAuth-based credentials

    def set_oauth_credentials(self, credentials) -> None:
        """Set OAuth credentials for the client.
        
        Args:
            credentials: google.oauth2.credentials.Credentials object
        """
        try:
            self._oauth_credentials = credentials
            self._service = None  # Reset service to rebuild with new credentials
            self._initialization_error = None
            logger.info("✅ OAuth credentials set for Google Drive client")
        except Exception as exc:
            logger.error(f"❌ Failed to set OAuth credentials: {exc}")
            self._initialization_error = exc

    def _initialize_service(self) -> None:
        try:
            base_http = httplib2.Http(timeout=max(30, int(settings.gdrive_http_timeout_seconds)))

            # Try OAuth credentials first
            if self._oauth_credentials is not None:
                logger.info("📝 Initializing Google Drive service with OAuth credentials")
                authed_http = google_auth_httplib2.AuthorizedHttp(self._oauth_credentials, http=base_http)
                self._service = build("drive", "v3", http=authed_http, cache_discovery=False)
                self._initialization_error = None
                return

            # Fallback to service account
            logger.info("⚙️ Initializing Google Drive service with service account credentials")
            from google.oauth2 import service_account

            if settings.google_application_credentials:
                credentials = service_account.Credentials.from_service_account_file(
                    settings.google_application_credentials,
                    scopes=["https://www.googleapis.com/auth/drive.file"],
                )
            elif settings.gdrive_service_account_json:
                service_account_info = json.loads(settings.gdrive_service_account_json)
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info,
                    scopes=["https://www.googleapis.com/auth/drive.file"],
                )
            else:
                raise ValueError("No Google Drive credentials configured (OAuth or service account)")

            authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=base_http)
            self._service = build("drive", "v3", http=authed_http, cache_discovery=False)
            self._initialization_error = None
        except Exception as exc:
            self._service = None
            self._initialization_error = exc

    def _require_service(self):
        if self._service is None:
            self._initialize_service()

        if self._service is None:
            detail = (
                f"Could not initialize Google Drive service: {self._initialization_error}"
                if self._initialization_error
                else "Google Drive service is not initialized"
            )
            raise RuntimeError(detail)
        return self._service

    def create_folder(self, name: str, parent_id: Optional[str] = None) -> Dict[str, Any]:
        service = self._require_service()

        metadata = {
            "name": name,
            "mimeType": FOLDER_MIME_TYPE,
        }
        resolved_parent = parent_id or settings.gdrive_folder_id
        if resolved_parent:
            metadata["parents"] = [resolved_parent]

        folder = service.files().create(
            body=metadata,
            fields="id,name,webViewLink,parents",
        ).execute(num_retries=max(0, int(settings.gdrive_request_retries)))

        return {
            "drive_file_id": folder["id"],
            "name": folder.get("name", name),
            "drive_web_view_link": folder.get("webViewLink"),
            "parents": folder.get("parents", []),
        }

    def find_child_folder_by_name(self, name: str, parent_id: str) -> Optional[Dict[str, Any]]:
        service = self._require_service()

        safe_name = name.replace("'", "\\'")
        query = (
            "mimeType = 'application/vnd.google-apps.folder' "
            "and trashed = false "
            f"and name = '{safe_name}' "
            f"and '{parent_id}' in parents"
        )

        response = service.files().list(
            q=query,
            pageSize=1,
            fields="files(id,name,webViewLink,parents)",
        ).execute(num_retries=max(0, int(settings.gdrive_request_retries)))

        files = response.get("files", [])
        if not files:
            return None

        folder = files[0]
        return {
            "drive_file_id": folder["id"],
            "name": folder.get("name", name),
            "drive_web_view_link": folder.get("webViewLink"),
            "parents": folder.get("parents", []),
        }

    def upload_file(
        self,
        filename: str,
        mime_type: str,
        parent_id: Optional[str] = None,
        file_content: Optional[bytes] = None,
        local_path: Optional[str] = None,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if file_content is None and local_path is None:
            raise ValueError("Either file_content or local_path must be provided")

        resolved_parent = parent_id or folder_id or settings.gdrive_folder_id

        if local_path:
            local_file = Path(local_path)
            payload = local_file.read_bytes()
            filename = filename or local_file.name
        else:
            payload = file_content or b""

        service = self._require_service()

        from googleapiclient.http import MediaIoBaseUpload

        metadata = {"name": filename}
        if resolved_parent:
            metadata["parents"] = [resolved_parent]

        media = MediaIoBaseUpload(BytesIO(payload), mimetype=mime_type, resumable=True)

        uploaded = service.files().create(
            body=metadata,
            media_body=media,
            fields="id,name,size,mimeType,webViewLink,webContentLink,parents",
        ).execute(num_retries=max(0, int(settings.gdrive_request_retries)))

        return {
            "drive_file_id": uploaded["id"],
            "filename": uploaded.get("name", filename),
            "size_bytes": int(uploaded.get("size", 0)),
            "mime_type": uploaded.get("mimeType", mime_type),
            "checksum_sha256": hashlib.sha256(payload).hexdigest(),
            "drive_web_view_link": uploaded.get("webViewLink"),
            "drive_download_link": uploaded.get("webContentLink"),
            "parents": uploaded.get("parents", []),
        }

    def delete_file(self, file_id: str) -> bool:
        service = self._require_service()

        try:
            service.files().delete(fileId=file_id).execute(
                num_retries=max(0, int(settings.gdrive_request_retries))
            )
            return True
        except HttpError as exc:
            if getattr(exc, "resp", None) is not None and exc.resp.status == 404:
                logger.info("Drive object already deleted or missing: %s", file_id)
                return True
            logger.warning("Failed deleting Drive object %s: %s", file_id, exc)
            return False
        except Exception as exc:
            logger.warning("Failed deleting Drive object %s: %s", file_id, exc)
            return False

    def rename_file(self, file_id: str, new_name: str) -> Optional[Dict[str, Any]]:
        """Rename a file/folder in Google Drive and return updated metadata."""
        service = self._require_service()

        try:
            updated = service.files().update(
                fileId=file_id,
                body={"name": new_name},
                fields="id,name,webViewLink,parents",
            ).execute(num_retries=max(0, int(settings.gdrive_request_retries)))

            return {
                "drive_file_id": updated["id"],
                "name": updated.get("name", new_name),
                "drive_web_view_link": updated.get("webViewLink"),
                "parents": updated.get("parents", []),
            }
        except HttpError as exc:
            if getattr(exc, "resp", None) is not None and exc.resp.status == 404:
                logger.warning("Drive object not found for rename: %s", file_id)
                return None
            logger.warning("Failed renaming Drive object %s: %s", file_id, exc)
            return None
        except Exception as exc:
            logger.warning("Failed renaming Drive object %s: %s", file_id, exc)
            return None


# Global instance
gdrive_client = GoogleDriveClient()

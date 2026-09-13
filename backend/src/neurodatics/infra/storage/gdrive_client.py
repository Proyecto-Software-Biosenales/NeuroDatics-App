import copy
import hashlib
import json
import logging
import random
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

import google_auth_httplib2
import httplib2
from google.auth.exceptions import TransportError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ...config.settings import settings

logger = logging.getLogger(__name__)

FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"


class GoogleDriveOperationError(RuntimeError):
    """A failed creation with a known ID, available for later compensation."""

    def __init__(self, message: str, drive_file_id: str):
        super().__init__(message)
        self.drive_file_id = drive_file_id


class GoogleDriveClient:
    """Google Drive operations with a separate transport for each worker thread."""

    UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024
    _UPLOAD_FIELDS = (
        "id,name,size,mimeType,webViewLink,webContentLink,parents,"
        "sha256Checksum,md5Checksum,trashed"
    )

    def __init__(self):
        self._thread_state = threading.local()
        self._credentials_lock = threading.Lock()
        self._credentials_generation = 0
        self._oauth_credentials = None

    @property
    def _service(self):
        state = self._thread_state
        if getattr(state, "generation", None) != self._credentials_generation:
            return None
        return getattr(state, "service", None)

    @_service.setter
    def _service(self, service):
        # Also preserves the existing injection point for isolated client tests.
        self._thread_state.service = service
        self._thread_state.generation = self._credentials_generation

    @property
    def _initialization_error(self):
        return getattr(self._thread_state, "initialization_error", None)

    def set_oauth_credentials(self, credentials) -> None:
        """Invalidate every thread's service when credentials change."""
        with self._credentials_lock:
            self._oauth_credentials = copy.copy(credentials)
            self._credentials_generation += 1
        logger.info("OAuth credentials set for Google Drive client")

    def clear_oauth_credentials(self) -> None:
        """Invalidate every thread's service and restore service-account fallback."""
        self.set_oauth_credentials(None)
        logger.info("Google Drive OAuth credentials cleared")

    @staticmethod
    def _close_service(service) -> None:
        if service is not None:
            try:
                service.close()
            except Exception as exc:
                logger.warning("Drive transport cleanup failed (%s)", type(exc).__name__)

    def _initialize_service(self) -> None:
        # httplib2.Http is not thread-safe. Build/reuse only on its owning thread.
        # Do not hold the credentials lock during SDK initialization or requests:
        # configuration can run on the event loop while workers are uploading.
        state = self._thread_state
        self._close_service(getattr(state, "service", None))
        state.service = None
        while True:
            with self._credentials_lock:
                generation = self._credentials_generation
                credentials = copy.copy(self._oauth_credentials)
            service = None
            initialization_error = None
            base_http = None
            try:
                timeout = max(30, int(settings.gdrive_http_timeout_seconds))
                base_http = httplib2.Http(timeout=timeout)
                # Drive's 308 means Resume Incomplete, not a redirect.
                base_http.redirect_codes = base_http.redirect_codes - {308}
                if credentials is None:
                    from google.oauth2 import service_account

                    if settings.google_application_credentials:
                        credentials = service_account.Credentials.from_service_account_file(
                            settings.google_application_credentials,
                            scopes=["https://www.googleapis.com/auth/drive.file"],
                        )
                    elif settings.gdrive_service_account_json:
                        credentials = service_account.Credentials.from_service_account_info(
                            json.loads(settings.gdrive_service_account_json),
                            scopes=["https://www.googleapis.com/auth/drive.file"],
                        )
                    else:
                        raise ValueError("No Google Drive credentials configured")
                authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=base_http)
                service = build("drive", "v3", http=authed_http, cache_discovery=False)
            except Exception as exc:
                initialization_error = exc
                self._close_service(base_http)
            with self._credentials_lock:
                current = generation == self._credentials_generation
                if current:
                    state.service = service
                    state.generation = generation
                    state.initialization_error = initialization_error
            if current:
                return
            # Credentials changed while building. Never publish that old service.
            self._close_service(service)

    def _require_service(self):
        if self._service is None:
            self._initialize_service()
        service = self._service
        if service is None:
            raise RuntimeError("Could not initialize Google Drive service") from self._initialization_error
        return service

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        if isinstance(exc, (OSError, httplib2.HttpLib2Error, TransportError)):
            return True
        if not isinstance(exc, HttpError):
            return False
        if exc.resp.status >= 500 or exc.resp.status in (408, 429):
            return True
        if exc.resp.status == 403:
            try:
                details = json.loads(exc.content).get("error", {}).get("errors", [])
                return any(
                    detail.get("reason") in ("rateLimitExceeded", "userRateLimitExceeded")
                    for detail in details
                )
            except (ValueError, AttributeError, TypeError):
                return False
        return False

    def _execute_upload(self, request):
        retries = max(0, int(settings.gdrive_request_retries))
        failures = 0
        uploaded = None
        while uploaded is None:
            try:
                # Retry through next_chunk so the SDK queries the acknowledged
                # offset after an error, instead of reusing a consumed stream slice.
                _, uploaded = request.next_chunk(num_retries=0)
                failures = 0
            except Exception as exc:
                if failures >= retries or not self._is_retryable(exc):
                    raise
                failures += 1
                time.sleep(random.uniform(0, min(2 ** failures, 32)))
        return uploaded

    def reserve_file_id(self) -> str:
        return self._reserve_file_id(self._require_service())

    @staticmethod
    def _reserve_file_id(service) -> str:
        retries = max(0, int(settings.gdrive_request_retries))
        generated = service.files().generateIds(count=1, space="drive").execute(num_retries=retries)
        ids = generated.get("ids", [])
        if len(ids) != 1 or not isinstance(ids[0], str) or not ids[0]:
            raise RuntimeError("Google Drive did not provide a file ID")
        return ids[0]

    def _create_file(self, service, metadata, *, fields, media=None, file_id=None):
        retries = max(0, int(settings.gdrive_request_retries))
        file_id = file_id or self._reserve_file_id(service)
        body = dict(metadata, id=file_id)
        try:
            kwargs = {"body": body, "fields": fields}
            if media is not None:
                kwargs["media_body"] = media
            request = service.files().create(**kwargs)
            try:
                created = (
                    self._execute_upload(request)
                    if media is not None
                    else request.execute(num_retries=retries)
                )
            except Exception as exc:
                # A timeout/409 may mean the creation succeeded but its response
                # was lost. Pre-generated IDs make both retries and recovery exact.
                if not self._is_retryable(exc) and not (
                    isinstance(exc, HttpError) and exc.resp.status == 409
                ):
                    raise
                created = service.files().get(fileId=file_id, fields=fields).execute(
                    num_retries=retries
                )
            if created.get("id") != file_id or created.get("trashed", False):
                raise ValueError("Invalid Google Drive creation metadata")
            return created
        except Exception as exc:
            self._delete_file(service, file_id)
            raise GoogleDriveOperationError(
                "Google Drive creation failed", drive_file_id=file_id
            ) from exc

    def create_folder(self, name: str, parent_id: Optional[str] = None, *, file_id: Optional[str] = None) -> Dict[str, Any]:
        service = self._require_service()

        metadata = {
            "name": name,
            "mimeType": FOLDER_MIME_TYPE,
        }
        resolved_parent = parent_id or settings.gdrive_folder_id
        if resolved_parent:
            metadata["parents"] = [resolved_parent]

        folder = self._create_file(
            service, metadata, fields="id,name,webViewLink,parents,trashed", file_id=file_id,
        )

        return {
            "drive_file_id": folder["id"],
            "name": folder.get("name", name),
            "drive_web_view_link": folder.get("webViewLink"),
            "parents": folder.get("parents", []),
        }

    def find_child_folder_by_name(self, name: str, parent_id: str) -> Optional[Dict[str, Any]]:
        service = self._require_service()

        # Folder names come from ZIP entry paths, so they are user controlled.
        # The backslash has to be escaped first, otherwise a name ending in `\`
        # escapes the escape and lets the string literal run into query syntax.
        safe_name = name.replace("\\", "\\\\").replace("'", "\\'")
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
        if (file_content is None) == (local_path is None):
            raise ValueError("Provide exactly one of file_content or local_path")

        from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload

        resolved_parent = parent_id or folder_id or settings.gdrive_folder_id
        service = self._require_service()
        metadata = {"name": filename}
        if resolved_parent:
            metadata["parents"] = [resolved_parent]

        if local_path is not None:
            local_file = Path(local_path)
            metadata["name"] = filename or local_file.name
            media = MediaFileUpload(
                str(local_file), mimetype=mime_type,
                chunksize=self.UPLOAD_CHUNK_SIZE, resumable=True,
            )
        else:
            media = MediaIoBaseUpload(
                BytesIO(file_content), mimetype=mime_type,
                chunksize=self.UPLOAD_CHUNK_SIZE, resumable=True,
            )

        try:
            # Hash the same open stream that is uploaded, with bounded memory.
            stream = media.stream()
            stream.seek(0)
            sha256 = hashlib.sha256()
            md5 = hashlib.md5()  # Drive's fallback integrity checksum for binary files.
            size = 0
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                sha256.update(chunk)
                md5.update(chunk)
                size += len(chunk)
            stream.seek(0)
            if size != media.size():
                raise OSError("Upload source changed while being read")
            checksum = sha256.hexdigest()
            uploaded = self._create_file(
                service, metadata, fields=self._UPLOAD_FIELDS, media=media
            )
            try:
                remote_size = int(uploaded["size"])
                remote_sha256 = uploaded.get("sha256Checksum")
                remote_md5 = uploaded.get("md5Checksum")
                if remote_size != size:
                    raise ValueError("Google Drive upload size verification failed")
                if remote_sha256:
                    verified = remote_sha256.lower() == checksum
                else:
                    verified = bool(remote_md5) and remote_md5.lower() == md5.hexdigest()
                if not verified:
                    raise ValueError("Google Drive upload checksum verification failed")
            except Exception as exc:
                self._delete_file(service, uploaded["id"])
                raise GoogleDriveOperationError(
                    "Google Drive upload integrity verification failed",
                    drive_file_id=uploaded["id"],
                ) from exc
        finally:
            try:
                media.stream().close()
            except Exception as exc:
                logger.warning("Drive upload file-handle cleanup failed (%s)", type(exc).__name__)

        return {
            "drive_file_id": uploaded["id"],
            "filename": uploaded.get("name", metadata["name"]),
            "size_bytes": size,
            "mime_type": uploaded.get("mimeType", mime_type),
            "checksum_sha256": checksum,
            "drive_web_view_link": uploaded.get("webViewLink"),
            "drive_download_link": uploaded.get("webContentLink"),
            "parents": uploaded.get("parents", []),
        }

    def delete_file(self, file_id: str) -> bool:
        return self._delete_file(self._require_service(), file_id)

    @staticmethod
    def _delete_file(service, file_id: str) -> bool:
        try:
            service.files().delete(fileId=file_id).execute(
                num_retries=max(0, int(settings.gdrive_request_retries))
            )
            return True
        except HttpError as exc:
            if getattr(exc, "resp", None) is not None and exc.resp.status == 404:
                logger.info("Drive object already deleted or missing: %s", file_id)
                return True
            logger.warning("Failed deleting Drive object %s (%s)", file_id, type(exc).__name__)
            return False
        except Exception as exc:
            logger.warning("Failed deleting Drive object %s (%s)", file_id, type(exc).__name__)
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

    def download_file_content(self, file_id: str) -> bytes:
        """Download file content bytes from Google Drive by file id."""
        service = self._require_service()

        request = service.files().get_media(fileId=file_id)
        return request.execute(num_retries=max(0, int(settings.gdrive_request_retries)))

    def download_file_to_path(
        self,
        file_id: str,
        destination_path: str,
        chunk_size: int = 8 * 1024 * 1024,
    ) -> str:
        """Stream file content from Google Drive into a local path."""
        from googleapiclient.http import MediaIoBaseDownload

        service = self._require_service()
        destination = Path(destination_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_destination = destination.with_name(f"{destination.name}.part")

        request = service.files().get_media(fileId=file_id)
        try:
            with temp_destination.open("wb") as fp:
                downloader = MediaIoBaseDownload(fp, request, chunksize=chunk_size)
                done = False
                while not done:
                    _, done = downloader.next_chunk(
                        num_retries=max(0, int(settings.gdrive_request_retries))
                    )
            temp_destination.replace(destination)
        except Exception:
            try:
                temp_destination.unlink(missing_ok=True)
            except OSError:
                pass
            raise

        return str(destination)


# Global instance
gdrive_client = GoogleDriveClient()

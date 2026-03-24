"""Google Drive file operations service.

Provides high-level operations for creating folders, uploading files,
and managing folder structures in Google Drive.
"""

import os
from typing import Optional
from io import BytesIO
import logging

from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload

from .gdrive_client import gdrive_client

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class GoogleDriveFileService:
    """Service for Google Drive file and folder operations."""

    # MIME types
    MIME_FOLDER = "application/vnd.google-apps.folder"

    def __init__(self, gdrive_credentials_getter):
        """
        Initialize the service.

        Args:
            gdrive_credentials_getter: Async callable that returns google.oauth2.credentials.Credentials
        """
        self._get_credentials = gdrive_credentials_getter

    async def create_folder(
        self, 
        folder_name: str, 
        parent_id: Optional[str] = None
    ) -> str:
        """
        Create a folder in Google Drive.

        Args:
            folder_name: Name of the folder to create
            parent_id: Parent folder ID (if None, uses GDRIVE_FOLDER_ID from settings)

        Returns:
            Folder ID of the created folder
        """
        try:
            logger.info(f"📁 Creating folder: '{folder_name}'")
            credentials = await self._get_credentials()
            service = gdrive_client.get_service(credentials)

            file_metadata = {
                "name": folder_name,
                "mimeType": self.MIME_FOLDER,
            }

            if parent_id:
                file_metadata["parents"] = [parent_id]

            folder = service.files().create(body=file_metadata, fields="id").execute()
            folder_id = folder.get("id")

            logger.info(f"✅ Created folder '{folder_name}' (ID: {folder_id})")
            return folder_id

        except Exception as e:
            logger.error(f"❌ Failed to create folder '{folder_name}': {e}")
            raise

    async def upload_file(
        self,
        file_path: str,
        parent_id: str,
        file_name: Optional[str] = None,
    ) -> str:
        """
        Upload a file to Google Drive.

        Args:
            file_path: Local file path to upload
            parent_id: Parent folder ID in Google Drive
            file_name: Name for the file in Drive (defaults to basename of file_path)

        Returns:
            File ID of the uploaded file
        """
        if not os.path.exists(file_path):
            logger.error(f"❌ File not found: {file_path}")
            raise FileNotFoundError(f"File not found: {file_path}")

        file_name = file_name or os.path.basename(file_path)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        try:
            logger.info(f"📤 Starting upload: {file_name} ({file_size_mb:.2f} MB) to folder {parent_id}")
            credentials = await self._get_credentials()
            service = gdrive_client.get_service(credentials)

            file_metadata = {
                "name": file_name,
                "parents": [parent_id],
            }

            media = MediaFileUpload(file_path, resumable=True)
            file_obj = service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id",
            ).execute()

            file_id = file_obj.get("id")
            logger.info(f"✅ Successfully uploaded '{file_name}' (ID: {file_id})")
            return file_id

        except Exception as e:
            logger.error(f"❌ Failed to upload file '{file_path}': {e}")
            raise

    async def upload_bytes(
        self,
        file_bytes: bytes,
        file_name: str,
        parent_id: str,
    ) -> str:
        """
        Upload bytes to Google Drive as a file.

        Args:
            file_bytes: Bytes to upload
            file_name: Name for the file in Drive
            parent_id: Parent folder ID in Google Drive

        Returns:
            File ID of the uploaded file
        """
        try:
            credentials = await self._get_credentials()
            service = gdrive_client.get_service(credentials)

            file_metadata = {
                "name": file_name,
                "parents": [parent_id],
            }

            file_stream = BytesIO(file_bytes)
            media = MediaIoBaseUpload(file_stream, mimetype="application/octet-stream", resumable=True)

            file_obj = service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id",
            ).execute()

            file_id = file_obj.get("id")
            logger.info(f"Uploaded file '{file_name}' ({len(file_bytes)} bytes) to Drive with ID: {file_id}")
            return file_id

        except Exception as e:
            logger.error(f"Failed to upload bytes for '{file_name}': {e}")
            raise

    async def create_folder_structure(
        self,
        folder_structure: dict,
        parent_id: str,
    ) -> dict:
        """
        Create a nested folder structure in Google Drive.

        Args:
            folder_structure: Dict where keys are folder names and values are:
                - dict (nested structure) or
                - list of filenames to create in that folder (empty to just create folder)
            parent_id: Parent folder ID

        Returns:
            Dict mapping folder names to their Drive IDs
        """
        folder_ids = {}

        for folder_name, contents in folder_structure.items():
            folder_id = await self.create_folder(folder_name, parent_id)
            folder_ids[folder_name] = folder_id

            # If contents is a dict, it's a nested structure
            if isinstance(contents, dict):
                nested_ids = await self.create_folder_structure(contents, folder_id)
                folder_ids.update(nested_ids)

        return folder_ids

    async def list_files_in_folder(
        self,
        folder_id: str,
        query_filter: Optional[str] = None,
    ) -> list[dict]:
        """
        List files in a Google Drive folder.

        Args:
            folder_id: Folder ID to list
            query_filter: Additional query filter (e.g., "mimeType != 'application/vnd.google-apps.folder'")

        Returns:
            List of file dicts with id, name, mimeType
        """
        try:
            credentials = await self._get_credentials()
            service = gdrive_client.get_service(credentials)

            query = f"'{folder_id}' in parents and trashed=false"
            if query_filter:
                query += f" and {query_filter}"

            results = service.files().list(
                q=query,
                spaces="drive",
                fields="files(id, name, mimeType, createdTime, modifiedTime)",
                pageSize=100,
            ).execute()

            files = results.get("files", [])
            logger.info(f"Listed {len(files)} items in folder {folder_id}")
            return files

        except Exception as e:
            logger.error(f"Failed to list files in folder {folder_id}: {e}")
            raise

    async def delete_file(self, file_id: str) -> None:
        """
        Delete a file or folder from Google Drive.

        Args:
            file_id: File/Folder ID to delete
        """
        try:
            credentials = await self._get_credentials()
            service = gdrive_client.get_service(credentials)
            service.files().delete(fileId=file_id).execute()
            logger.info(f"Deleted file/folder with ID: {file_id}")
        except Exception as e:
            logger.error(f"Failed to delete file {file_id}: {e}")
            raise


def create_gdrive_file_service(gdrive_credentials_getter) -> GoogleDriveFileService:
    """Factory to create GoogleDriveFileService instance."""
    return GoogleDriveFileService(gdrive_credentials_getter)

import json
import hashlib
from typing import Optional, Dict, Any
from ...config.settings import settings

# Import mock client for development
from .mock_gdrive_client import mock_gdrive_client


class GoogleDriveClient:
    """Google Drive client for file operations"""
    
    def __init__(self):
        self._service = None
        if not settings.debug:
            self._initialize_service()
    
    def _initialize_service(self):
        """Initialize Google Drive service"""
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            
            if settings.google_application_credentials:
                # Use service account file
                credentials = service_account.Credentials.from_service_account_file(
                    settings.google_application_credentials,
                    scopes=['https://www.googleapis.com/auth/drive.file']
                )
            elif settings.gdrive_service_account_json:
                # Use service account JSON string
                service_account_info = json.loads(settings.gdrive_service_account_json)
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info,
                    scopes=['https://www.googleapis.com/auth/drive.file']
                )
            else:
                raise ValueError("No Google Drive credentials configured")
            
            self._service = build('drive', 'v3', credentials=credentials)
        except Exception as e:
            print(f"Warning: Could not initialize Google Drive service: {e}")
            print("Using mock client for development")
    
    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        mime_type: str,
        folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload file to Google Drive"""
        
        # Use mock client in debug mode or if service is not available
        if settings.debug or self._service is None:
            return mock_gdrive_client.upload_file(file_content, filename, mime_type, folder_id)
        
        # Real Google Drive implementation
        from googleapiclient.http import MediaIoBaseUpload
        from io import BytesIO
        
        # Calculate checksum
        checksum_sha256 = hashlib.sha256(file_content).hexdigest()
        
        # Prepare file metadata
        file_metadata = {
            'name': filename,
            'parents': [folder_id or settings.gdrive_folder_id]
        }
        
        # Create media upload
        media = MediaIoBaseUpload(
            BytesIO(file_content),
            mimetype=mime_type,
            resumable=True
        )
        
        # Upload file
        file = self._service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id,name,size,mimeType'
        ).execute()
        
        return {
            'drive_file_id': file['id'],
            'filename': file['name'],
            'size_bytes': int(file.get('size', 0)),
            'mime_type': file['mimeType'],
            'checksum_sha256': checksum_sha256
        }
    
    def delete_file(self, file_id: str) -> bool:
        """Delete file from Google Drive"""
        # Use mock client in debug mode or if service is not available
        if settings.debug or self._service is None:
            return mock_gdrive_client.delete_file(file_id)
        
        try:
            self._service.files().delete(fileId=file_id).execute()
            return True
        except Exception:
            return False


# Global instance
gdrive_client = GoogleDriveClient()
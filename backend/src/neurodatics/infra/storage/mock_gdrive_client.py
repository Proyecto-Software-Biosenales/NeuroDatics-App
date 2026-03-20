import hashlib
import uuid
from typing import Dict, Any


class MockGoogleDriveClient:
    """Mock Google Drive client for development"""
    
    def __init__(self):
        self._files = {}  # In-memory storage for development
    
    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        mime_type: str,
        folder_id: str = None
    ) -> Dict[str, Any]:
        """Mock upload file to Google Drive"""
        
        # Generate mock file ID
        file_id = str(uuid.uuid4())
        
        # Calculate checksum
        checksum_sha256 = hashlib.sha256(file_content).hexdigest()
        
        # Store file info (in production this would be in Drive)
        self._files[file_id] = {
            'content': file_content,
            'filename': filename,
            'mime_type': mime_type,
            'size_bytes': len(file_content)
        }
        
        return {
            'drive_file_id': file_id,
            'filename': filename,
            'size_bytes': len(file_content),
            'mime_type': mime_type,
            'checksum_sha256': checksum_sha256
        }
    
    def delete_file(self, file_id: str) -> bool:
        """Mock delete file from Google Drive"""
        if file_id in self._files:
            del self._files[file_id]
            return True
        return False


# Global mock instance for development
mock_gdrive_client = MockGoogleDriveClient()
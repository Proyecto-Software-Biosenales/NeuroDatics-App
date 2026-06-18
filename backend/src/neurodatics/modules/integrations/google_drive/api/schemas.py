from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class GoogleDriveAuthorizeResponse(BaseModel):
    authorization_url: str


class GoogleDriveCallbackResponse(BaseModel):
    connected: bool
    provider: str
    account_email: Optional[str] = None
    scope: Optional[str] = None
    refresh_token_received: bool


class GoogleDriveStatusResponse(BaseModel):
    connected: bool
    provider: str
    account_email: Optional[str] = None
    scope: Optional[str] = None
    updated_at: Optional[datetime] = None
    folder_id: Optional[str] = None


class GoogleDriveDisconnectResponse(BaseModel):
    connected: bool
    provider: str
    message: str


class GoogleDriveFileResponse(BaseModel):
    id: str
    name: str
    mime_type: str


class GoogleDriveFolderResponse(BaseModel):
    id: str
    name: str


class GoogleDriveUploadResponse(BaseModel):
    success: bool
    file_id: Optional[str] = None
    file_name: str
    message: str


class GoogleDriveFolderCreateResponse(BaseModel):
    success: bool
    folder_id: str
    folder_name: str
    parent_id: Optional[str] = None


class GoogleDriveListFilesResponse(BaseModel):
    folder_id: str
    total_items: int
    files: list[GoogleDriveFileResponse]


class FileUploadDetail(BaseModel):
    name: str
    id: str


class FolderCreateDetail(BaseModel):
    name: str
    id: str


class GoogleDriveSyncResponse(BaseModel):
    success: bool
    folder_path: str
    folders_created: int
    files_uploaded: int
    target_folder_id: str
    created_folders: Optional[list[FolderCreateDetail]] = None
    uploaded_files: Optional[list[FileUploadDetail]] = None
    message: str

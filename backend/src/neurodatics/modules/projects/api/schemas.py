from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from enum import Enum


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[ProjectStatus] = ProjectStatus.DRAFT

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        next_value = value.strip()
        if not next_value:
            raise ValueError("Project name is required")
        return next_value


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        next_value = value.strip()
        if not next_value:
            raise ValueError("Project name is required")
        return next_value


class UpdateSensorsRequest(BaseModel):
    sensors: List[str]


class ProjectFileResponse(BaseModel):
    id: UUID
    kind: str
    filename: str
    external_id: Optional[str] = None
    mime_type: Optional[str]
    size_bytes: Optional[int]
    drive_web_view_link: Optional[str] = None
    drive_download_link: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class UploadedProjectZipResponse(BaseModel):
    id: UUID
    kind: str
    filename: str
    source_entry_path: Optional[str] = None
    external_id: str
    drive_web_view_link: Optional[str] = None
    mime_type: Optional[str] = None


class UploadedProjectCountsResponse(BaseModel):
    folders_created: int
    files_uploaded: int
    images: int
    videos: int
    csv: int
    other: int
    scenaries_created: int


class UploadedProjectCsvProcessingResponse(BaseModel):
    detected: int
    processed: int
    failed: int


class UploadedProjectZipSummaryResponse(BaseModel):
    project_id: UUID
    ingestion_status: str
    drive_root_folder_id: Optional[str] = None
    drive_root_folder_name: Optional[str] = None
    drive_root_folder_url: Optional[str] = None
    zip_saved: bool
    zip_file: Optional[UploadedProjectZipResponse] = None
    counts: UploadedProjectCountsResponse
    files: List[UploadedProjectZipResponse]
    csv_processing: UploadedProjectCsvProcessingResponse
    manifest: Dict[str, int]


class DriveUploadProgressResponse(BaseModel):
    phase: str
    uploaded_bytes: int
    total_bytes: int
    percent: int
    speed_mbps: Optional[float] = None
    eta_seconds: Optional[int] = None
    elapsed_seconds: int = 0
    error: Optional[str] = None


class ProjectSensorResponse(BaseModel):
    id: UUID
    sensor_type: str
    
    class Config:
        from_attributes = True


class ParticipantResponse(BaseModel):
    id: UUID
    participant_code: str
    age: Optional[int]
    sex: Optional[str]
    
    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    status: ProjectStatus
    created_at: datetime
    sensors: List[ProjectSensorResponse] = []
    participants_count: int = 0
    
    class Config:
        from_attributes = True


class ProjectDetailResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    status: ProjectStatus
    created_at: datetime
    files: List[ProjectFileResponse] = []
    sensors: List[ProjectSensorResponse] = []
    participants: List[ParticipantResponse] = []
    scenaries: List[dict] = []
    
    class Config:
        from_attributes = True


class DeleteProjectResponse(BaseModel):
    message: str
    drive_folder_found: bool
    drive_folder_deleted: bool


def ProjectSchema():
    return {}

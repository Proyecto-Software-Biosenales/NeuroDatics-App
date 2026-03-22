from pydantic import BaseModel, field_validator
from typing import Optional, List
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
    mime_type: Optional[str]
    size_bytes: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


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
def ProjectSchema():
    return {}

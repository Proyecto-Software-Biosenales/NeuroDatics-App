from sqlalchemy import Column, String, Text, Enum, ForeignKey, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from ....infra.db.base import BaseModel


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class Project(BaseModel):
    """Project entity"""
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), nullable=False)  # FK to auth.users(id)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.DRAFT, nullable=False)
    
    # Relationships
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")
    sensors = relationship("ProjectSensor", back_populates="project", cascade="all, delete-orphan")
    participants = relationship("Participant", back_populates="project", cascade="all, delete-orphan")
    scenaries = relationship("Scenaries", back_populates="project", cascade="all, delete-orphan")


class ProjectFile(BaseModel):
    """Project files entity"""
    __tablename__ = "project_files"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    kind = Column(String(50), nullable=False)  # 'experiment_zip', etc.
    storage_provider = Column(String(20), nullable=False)  # 'gdrive', 'r2', etc.
    external_id = Column(String(255), nullable=False)  # Drive file ID, R2 key, etc.
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(100))
    size_bytes = Column(Integer)
    checksum_sha256 = Column(String(64))
    
    # Relationships
    project = relationship("Project", back_populates="files")


class ProjectSensor(BaseModel):
    """Project sensors entity"""
    __tablename__ = "project_sensors"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    sensor_type = Column(String(50), nullable=False)  # 'EEG', 'GSR', 'EyeTracker', etc.
    
    # Relationships
    project = relationship("Project", back_populates="sensors")

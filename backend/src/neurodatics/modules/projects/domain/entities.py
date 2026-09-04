from sqlalchemy import Column, String, Text, Enum, ForeignKey, Integer, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from ....infra.db.base import BaseModel


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class JobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class Project(BaseModel):
    """Project entity"""
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), nullable=False)  # FK to auth.users(id)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.ACTIVE, nullable=False)
    ingestion_status = Column(String(20), nullable=False, default="PENDING")
    # Analytics cache identity: bumped only when an ingestion commits successfully, so a crashed
    # re-ingest leaves the old generation (and therefore every cached artifact) still valid.
    ingestion_generation = Column(Integer, nullable=False, default=0, server_default="0")
    ingestion_error = Column(Text, nullable=True)
    last_ingested_at = Column(DateTime, nullable=True)
    storage_provider = Column(String(20), nullable=False, default="gdrive")
    drive_root_folder_id = Column(String(255), nullable=True)
    drive_root_folder_name = Column(String(255), nullable=True)
    drive_root_folder_url = Column(String(500), nullable=True)

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
    source_zip_id = Column(UUID(as_uuid=True), ForeignKey("project_files.id"), nullable=True)
    kind = Column(String(50), nullable=False)  # 'experiment_zip', etc.
    storage_provider = Column(String(20), nullable=False)  # 'gdrive', 'r2', etc.
    external_id = Column(String(255), nullable=False)  # Drive file ID, R2 key, etc.
    drive_parent_external_id = Column(String(255), nullable=True)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)  # Original filename provided by user
    source_entry_path = Column(String(1024), nullable=True)
    mime_type = Column(String(100))
    extension = Column(String(20), nullable=True)
    size_bytes = Column(Integer)
    checksum_sha256 = Column(String(64))

    # Storage URLs and metadata
    drive_web_view_link = Column(String(500), nullable=True)  # Link to view in Drive
    drive_download_link = Column(String(500), nullable=True)  # Direct download link

    # ZIP validation and processing
    validation_status = Column(String(20), nullable=True)  # 'valid', 'invalid'
    validation_errors = Column(JSON, nullable=True)  # Array of error messages
    processing_status = Column(String(20), nullable=True)  # 'processing', 'processed', 'failed'
    processing_errors = Column(JSON, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    file_metadata = Column(JSON, nullable=True)

    # ZIP manifest and metadata
    zip_manifest = Column(JSON, nullable=True)  # Structured info about ZIP contents
    entry_count = Column(Integer, nullable=True)  # Total entries in ZIP
    root_folder_name = Column(String(255), nullable=True)  # Root folder name if exists

    # Soft delete for handling ZIP replacement
    deleted_at = Column(DateTime, nullable=True)

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


class ProcessingJob(BaseModel):
    """Tracks background processing jobs for projects."""
    __tablename__ = "processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(String(255), unique=True, nullable=True)  # RQ job ID
    job_type = Column(String(100), nullable=False)  # e.g. "process_experiment_zip"
    status = Column(Enum(JobStatus, native_enum=False), default=JobStatus.QUEUED, nullable=False)
    progress_percent = Column(Integer, default=0)
    message = Column(Text, nullable=True)
    error_detail = Column(Text, nullable=True)
    result_metadata = Column(JSON, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", backref="processing_jobs")

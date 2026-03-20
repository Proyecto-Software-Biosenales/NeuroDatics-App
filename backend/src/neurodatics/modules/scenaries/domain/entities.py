from sqlalchemy import Column, String, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from ....infra.db.base import BaseModel


class Scenaries(BaseModel):
    """scenaries entity"""
    __tablename__ = "scenaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # 'image', 'video', etc.
    file_id = Column(UUID(as_uuid=True), ForeignKey("project_files.id"), nullable=True)
    width = Column(Integer)
    height = Column(Integer)
    
    # Relationships
    project = relationship("Project", back_populates="scenaries")
    file = relationship("ProjectFile")
    aois = relationship("AOI", back_populates="scenaries", cascade="all, delete-orphan")


class AOI(BaseModel):
    """Area of Interest entity"""
    __tablename__ = "aois"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scenaries_id = Column(UUID(as_uuid=True), ForeignKey("scenaries.id"), nullable=False)
    name = Column(String(255), nullable=False)
    color = Column(String(7), nullable=False)  # Hex color
    shape_type = Column(String(20), nullable=False)  # 'rect', 'circle', 'polygon'
    shape = Column(JSON, nullable=False)  # Shape coordinates/properties
    
    # Relationships
    scenaries = relationship("Scenaries", back_populates="aois")
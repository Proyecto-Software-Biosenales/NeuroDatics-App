from sqlalchemy import Column, String, Integer, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from ....infra.db.base import BaseModel


class Sex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Participant(BaseModel):
    """Participant entity - simplified without PII"""
    __tablename__ = "participants"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    participant_code = Column(String(50), nullable=False)  # Can store document ID directly for now
    age = Column(Integer)
    sex = Column(Enum(Sex))
    
    # Relationships
    project = relationship("Project", back_populates="participants")

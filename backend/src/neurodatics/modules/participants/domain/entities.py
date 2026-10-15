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
    """Participant entity.

    ``participant_code`` is the identifier extracted from the recording ("Grabación:")
    and keys the parquet files and caches, so it never changes after ingestion.
    ``document`` and ``name`` are user-entered corrections shown in the interface.
    """
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    participant_code = Column(String(50), nullable=False)
    age = Column(Integer)
    sex = Column(Enum(Sex))
    # Optional display name. When set, the dashboard shows it instead of the document.
    name = Column(String(120))
    # Corrected document; NULL means the extracted participant_code is the document.
    document = Column(String(50))

    @property
    def effective_document(self) -> str:
        return self.document or self.participant_code

    # Relationships
    project = relationship("Project", back_populates="participants")

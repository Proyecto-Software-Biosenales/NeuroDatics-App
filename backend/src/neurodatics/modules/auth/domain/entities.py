from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from ....infra.db.base import BaseModel


class LocalProfile(BaseModel):
    """A person using the local edition. Each one owns its projects (``projects.owner_id``)."""
    __tablename__ = "local_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    name = Column(String(60), nullable=False)
    # The browser may forget its session (a new port, cleared data): the app then reopens this one.
    last_used_at = Column(DateTime(timezone=True), nullable=True)

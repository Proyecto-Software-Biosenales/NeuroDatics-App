from sqlalchemy import Column, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID

from ....infra.db.base import BaseModel


class UserSettings(BaseModel):
    """Settings that apply to every project of one person, such as the acquisition screen."""
    __tablename__ = "user_settings"

    owner_id = Column(UUID(as_uuid=True), primary_key=True)
    screen = Column(JSON, nullable=True)
    # Null until the person reviews the screen in Configuración; the app reminds them until then.
    screen_confirmed_at = Column(DateTime(timezone=True), nullable=True)

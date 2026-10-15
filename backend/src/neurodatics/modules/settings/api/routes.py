"""Owner-scoped global settings: today only the acquisition screen."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....api.deps import get_current_user, get_db
from ..domain.entities import UserSettings
from .schemas import RETIRED_SCREEN_FIELDS, ScreenSettings, ScreenSettingsEnvelope

router = APIRouter(prefix="/settings", tags=["settings"])


async def owned_settings(db: AsyncSession, owner_id: str) -> UserSettings | None:
    statement = select(UserSettings).where(UserSettings.owner_id == UUID(owner_id))
    return (await db.execute(statement.execution_options(populate_existing=True))).scalar_one_or_none()


def screen_envelope(row: UserSettings | None) -> ScreenSettingsEnvelope:
    # A stored screen that no longer validates (or none at all) falls back to the laboratory one.
    stored = row.screen if row and isinstance(row.screen, dict) else {}
    stored = {key: value for key, value in stored.items() if key not in RETIRED_SCREEN_FIELDS}
    try:
        screen = ScreenSettings.model_validate(stored)
    except ValueError:
        screen = ScreenSettings()
    return ScreenSettingsEnvelope(screen=screen, confirmed=bool(row and row.screen_confirmed_at))


@router.get("/screen", response_model=ScreenSettingsEnvelope)
async def get_screen_settings(current_user: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return screen_envelope(await owned_settings(db, current_user))


@router.put("/screen", response_model=ScreenSettingsEnvelope)
async def update_screen_settings(
    request: ScreenSettings,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save the screen and mark it as reviewed, even when the defaults were kept unchanged."""
    row = await owned_settings(db, current_user)
    if row is None:
        row = UserSettings(owner_id=UUID(current_user))
        db.add(row)
    row.screen = request.model_dump(mode="json")
    row.screen_confirmed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return screen_envelope(row)

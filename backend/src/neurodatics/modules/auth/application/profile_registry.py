"""Which local profiles exist, asked by every request in local mode.

Kept apart from ``local_profiles`` so the identity check does not import project deletion. The backend
is one process, so the answer is kept here and updated when a profile is created or deleted instead of
being read from the database each time.
"""

from uuid import UUID

from sqlalchemy import select

from ....infra.db.session import AsyncSessionLocal
from ..domain.entities import LocalProfile

_known_ids: set[str] | None = None


async def is_profile(profile_id: str) -> bool:
    global _known_ids
    if _known_ids is None:
        async with AsyncSessionLocal() as db:
            _known_ids = {str(value) for value in (await db.scalars(select(LocalProfile.id))).all()}
    return profile_id in _known_ids


def remember(profile_id: UUID) -> None:
    if _known_ids is not None:
        _known_ids.add(str(profile_id))


def forget(profile_id: UUID) -> None:
    if _known_ids is not None:
        _known_ids.discard(str(profile_id))

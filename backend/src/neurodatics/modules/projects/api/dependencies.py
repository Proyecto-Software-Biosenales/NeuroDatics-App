from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from ....api.deps import get_current_user, get_db
from ..infrastructure.mutation_lock import (
    ProjectMutationConflict,
    project_mutation_lock,
)


async def lock_project_for_write(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ownership before the lock: someone who only knows the id must not be able to hold the
    # owner's project busy (the owner would get 409) while a 500 MB upload is copied.
    owned = await db.scalar(
        text("SELECT 1 FROM projects WHERE id = :id AND owner_id = :owner"),
        {"id": project_id, "owner": UUID(current_user)},
    )
    # End the read transaction so the session does not sit idle in it during a long upload.
    await db.rollback()
    if owned is None:
        raise HTTPException(404, "Project not found")
    try:
        async with project_mutation_lock(db, project_id):
            yield
    except ProjectMutationConflict as exc:
        raise HTTPException(409, str(exc)) from exc

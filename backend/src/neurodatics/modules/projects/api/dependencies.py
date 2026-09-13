from fastapi import Depends, HTTPException
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
    try:
        async with project_mutation_lock(db, project_id):
            yield
    except ProjectMutationConflict as exc:
        raise HTTPException(409, str(exc)) from exc

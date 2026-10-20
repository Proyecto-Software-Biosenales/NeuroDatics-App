from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from ....api.deps import get_db, get_current_user
from ...projects.api.dependencies import lock_project_for_write
from ....modules.projects.infrastructure.repository_impl import SQLProjectRepository
from ..infrastructure.repository_impl import SQLscenariesRepository
from .schemas import (
    AOIResponse,
    UpdateAOIsRequest,
)

router = APIRouter(prefix="/projects", tags=["scenaries"])


@router.put("/{project_id}/aois", response_model=List[AOIResponse], dependencies=[Depends(lock_project_for_write)])
async def update_aois(
    project_id: UUID,
    request: UpdateAOIsRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update project AOIs"""
    # Verify project ownership
    project_repo = SQLProjectRepository(db)
    project = await project_repo.get_by_id(project_id, UUID(current_user))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    # Update AOIs
    scenaries_repo = SQLscenariesRepository(db)
    aois_data = [a.dict() for a in request.aois]
    aois = await scenaries_repo.upsert_aois(project_id, aois_data)

    return [
        AOIResponse(
            id=a.id,
            scenaries_id=a.scenaries_id,
            name=a.name,
            color=a.color,
            shape_type=a.shape_type,
            shape=a.shape,
        )
        for a in aois
    ]

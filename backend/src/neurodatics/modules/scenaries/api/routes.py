from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from ....api.deps import get_db, get_current_user
from ....modules.projects.infrastructure.repository_impl import SQLProjectRepository
from ..domain.stimulus_placement import (
    StimulusPlacementRequiresReprocessing,
    StimulusPlacementValidationError,
)
from ..infrastructure.repository_impl import SQLscenariesRepository
from .schemas import (
    AOIResponse,
    StimulusPlacementResponse,
    UpdateAOIsRequest,
    UpdatescenariesRequest,
    scenariesResponse,
)

router = APIRouter(prefix="/projects", tags=["scenaries"])


@router.put("/{project_id}/scenaries", response_model=List[scenariesResponse])
async def update_scenaries(
    project_id: UUID,
    request: UpdatescenariesRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update project scenaries"""
    # Verify project ownership
    project_repo = SQLProjectRepository(db)
    project = await project_repo.get_by_id(project_id, UUID(current_user))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    # Update scenaries
    scenaries_repo = SQLscenariesRepository(db)
    # ``exclude_unset`` is required for the placement tri-state: omitted,
    # explicit null, and an object have different persistence semantics.
    scenaries_data = [s.model_dump(exclude_unset=True) for s in request.scenaries]
    try:
        scenaries = await scenaries_repo.upsert_scenaries(project_id, scenaries_data)
    except StimulusPlacementValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    except StimulusPlacementRequiresReprocessing as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc

    return [
        scenariesResponse(
            id=s.id,
            name=s.name,
            type=s.type,
            file_id=s.file_id,
            source_entry_path=s.source_entry_path,
            width=s.width,
            height=s.height,
            fps=s.fps,
            duration_ms=s.duration_ms,
            stimulus_placement=(
                StimulusPlacementResponse.model_validate(s.stimulus_placement)
                if s.stimulus_placement is not None
                else None
            ),
            aois=[],
        )
        for s in scenaries
    ]


@router.put("/{project_id}/aois", response_model=List[AOIResponse])
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

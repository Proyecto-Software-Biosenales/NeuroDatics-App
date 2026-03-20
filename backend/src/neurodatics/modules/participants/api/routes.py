from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from ....api.deps import get_db, get_current_user
from ....modules.projects.infrastructure.repository_impl import SQLProjectRepository
from ..infrastructure.repository_impl import SQLParticipantRepository
from .schemas import UpdateParticipantsRequest, ParticipantResponse

router = APIRouter(prefix="/projects", tags=["participants"])


@router.put("/{project_id}/participants", response_model=List[ParticipantResponse])
async def update_participants(
    project_id: UUID,
    request: UpdateParticipantsRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project participants - simplified without PII"""
    # Verify project ownership
    project_repo = SQLProjectRepository(db)
    project = await project_repo.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update participants
    participant_repo = SQLParticipantRepository(db)
    participants_data = [p.dict() for p in request.participants]
    participants = await participant_repo.upsert_participants(project_id, participants_data)
    
    return [
        ParticipantResponse(
            participant_code=p.participant_code,
            age=p.age,
            sex=p.sex.value if p.sex else None
        )
        for p in participants
    ]

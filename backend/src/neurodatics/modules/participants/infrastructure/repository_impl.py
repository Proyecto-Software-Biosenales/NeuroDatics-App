from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..domain.repository import ParticipantRepository
from ..domain.entities import Participant, Sex


class SQLParticipantRepository(ParticipantRepository):
    """SQLAlchemy implementation of ParticipantRepository - simplified without PII"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def upsert_participants(
        self, 
        project_id: UUID, 
        participants_data: List[dict]
    ) -> List[Participant]:
        """Upsert participants without PII handling"""
        
        participants = []
        
        for data in participants_data:
            participant_code = data['participant_code']
            age = data.get('age')
            sex = Sex(data['sex']) if data.get('sex') else None
            
            # Check if participant exists
            stmt = select(Participant).where(
                Participant.project_id == project_id,
                Participant.participant_code == participant_code
            )
            result = await self.session.execute(stmt)
            participant = result.scalar_one_or_none()
            
            if participant:
                # Update existing participant
                participant.age = age
                participant.sex = sex
            else:
                # Create new participant
                participant = Participant(
                    project_id=project_id,
                    participant_code=participant_code,
                    age=age,
                    sex=sex
                )
                self.session.add(participant)
                await self.session.flush()  # Get participant ID
            
            participants.append(participant)
        
        await self.session.commit()
        
        # Refresh participants
        for participant in participants:
            await self.session.refresh(participant)
        
        return participants
    
    async def get_by_project(self, project_id: UUID) -> List[Participant]:
        """Get participants by project"""
        stmt = (
            select(Participant)
            .where(Participant.project_id == project_id)
            .order_by(Participant.participant_code)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

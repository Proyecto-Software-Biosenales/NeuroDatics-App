from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import MultipleResultsFound
from ..domain.repository import ParticipantRepository
from ..domain.entities import Participant, Sex


class SQLParticipantRepository(ParticipantRepository):
    """SQLAlchemy implementation of ParticipantRepository - simplified without PII"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_participants(
        self, project_id: UUID, participants_data: List[dict]
    ) -> List[Participant]:
        """Upsert participants without PII handling"""

        participant_codes = [data["participant_code"] for data in participants_data]
        existing_by_code = {}
        if participant_codes:
            stmt = select(Participant).where(
                Participant.project_id == project_id,
                Participant.participant_code.in_(participant_codes),
            )
            result = await self.session.execute(stmt)
            for participant in result.scalars().all():
                if participant.participant_code in existing_by_code:
                    raise MultipleResultsFound(
                        "Multiple participant rows match the same project and code"
                    )
                existing_by_code[participant.participant_code] = participant

        for data in participants_data:
            participant_code = data["participant_code"]
            age = data.get("age")
            sex = Sex(data["sex"]) if data.get("sex") else None

            participant = existing_by_code.get(participant_code)

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
                    sex=sex,
                )
                self.session.add(participant)
                existing_by_code[participant_code] = participant

            # Older clients omit these keys: keep what is stored instead of clearing it.
            if "name" in data:
                participant.name = data["name"] or None
            if "document" in data:
                # The extracted code is already the default document; store only corrections.
                document = data["document"] or None
                participant.document = None if document == participant_code else document

        if not participant_codes:
            await self.session.commit()
            return []

        # One flush materializes every generated PK/default without a per-item
        # round trip. Capture identities before commit for expire_on_commit=True.
        await self.session.flush()
        participant_ids = [existing_by_code[code].id for code in participant_codes]
        await self.session.commit()

        # Re-read once so response serialization sees committed values without
        # one refresh/SELECT per item. Loading by PK avoids adopting a concurrent
        # natural-key duplicate in a schema that intentionally has no uniqueness.
        loaded_stmt = select(Participant).where(
            Participant.project_id == project_id,
            Participant.id.in_(participant_ids),
        )
        loaded_result = await self.session.execute(loaded_stmt)
        loaded_by_id = {
            participant.id: participant for participant in loaded_result.scalars().all()
        }
        return [loaded_by_id[participant_id] for participant_id in participant_ids]

    async def get_by_project(self, project_id: UUID) -> List[Participant]:
        """Get participants by project"""
        stmt = (
            select(Participant)
            .where(Participant.project_id == project_id)
            .order_by(Participant.participant_code)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

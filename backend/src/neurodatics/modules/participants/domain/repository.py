from abc import ABC, abstractmethod
from typing import List
from uuid import UUID
from .entities import Participant


class ParticipantRepository(ABC):
    """Participant repository interface"""

    @abstractmethod
    async def upsert_participants(
        self,
        project_id: UUID,
        participants_data: List[dict]
    ) -> List[Participant]:
        pass

    @abstractmethod
    async def get_by_project(self, project_id: UUID) -> List[Participant]:
        pass

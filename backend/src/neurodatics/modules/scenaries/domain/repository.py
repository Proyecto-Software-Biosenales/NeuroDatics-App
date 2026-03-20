from abc import ABC, abstractmethod
from typing import List
from uuid import UUID
from .entities import Scenaries, AOI


class scenariesRepository(ABC):
    """scenaries repository interface"""
    
    @abstractmethod
    async def upsert_scenaries(self, project_id: UUID, scenaries_data: List[dict]) -> List[Scenaries]:
        pass
    
    @abstractmethod
    async def upsert_aois(self, project_id: UUID, aois_data: List[dict]) -> List[AOI]:
        pass
    
    @abstractmethod
    async def get_by_project(self, project_id: UUID) -> List[Scenaries]:
        pass
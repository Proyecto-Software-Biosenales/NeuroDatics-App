from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID
from .entities import Project, ProjectFile, ProjectSensor


class ProjectRepository(ABC):
    """Project repository interface"""
    
    @abstractmethod
    async def create(self, project: Project) -> Project:
        pass
    
    @abstractmethod
    async def get_by_id(self, project_id: UUID, owner_id: UUID) -> Optional[Project]:
        pass
    
    @abstractmethod
    async def get_by_owner(self, owner_id: UUID) -> List[Project]:
        pass
    
    @abstractmethod
    async def update(self, project: Project) -> Project:
        pass
    
    @abstractmethod
    async def delete(self, project_id: UUID, owner_id: UUID) -> bool:
        pass
    
    @abstractmethod
    async def add_file(self, project_file: ProjectFile) -> ProjectFile:
        pass
    
    @abstractmethod
    async def update_sensors(self, project_id: UUID, sensors: List[str]) -> List[ProjectSensor]:
        pass
class ProjectRepository:
    pass

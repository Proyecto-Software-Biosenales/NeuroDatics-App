from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from uuid import UUID

from ...scenaries.domain.entities import Scenaries
from .entities import Project, ProjectFile, ProjectSensor


class ProjectRepository(ABC):
    """Project repository interface."""

    @abstractmethod
    async def create(self, project: Project) -> Project:
        raise NotImplementedError

    @abstractmethod
    async def get_by_id(self, project_id: UUID, owner_id: UUID) -> Optional[Project]:
        raise NotImplementedError

    @abstractmethod
    async def get_by_owner(self, owner_id: UUID) -> List[Project]:
        raise NotImplementedError

    @abstractmethod
    async def get_by_owner_and_name(self, owner_id: UUID, name: str) -> Optional[Project]:
        raise NotImplementedError

    @abstractmethod
    async def update(self, project: Project) -> Project:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, project_id: UUID, owner_id: UUID) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def add_file(self, project_file: ProjectFile) -> ProjectFile:
        raise NotImplementedError

    @abstractmethod
    async def delete_file_by_kind(self, project_id: UUID, kind: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def update_sensors(self, project_id: UUID, sensors: List[str]) -> List[ProjectSensor]:
        raise NotImplementedError

    @abstractmethod
    async def soft_delete_active_zip(self, project_id: UUID) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def soft_delete_active_files(self, project_id: UUID) -> int:
        raise NotImplementedError

    @abstractmethod
    async def clear_project_scenaries(self, project_id: UUID) -> int:
        raise NotImplementedError

    @abstractmethod
    async def add_files(self, files: List[ProjectFile]) -> List[ProjectFile]:
        raise NotImplementedError

    @abstractmethod
    async def add_scenaries(self, scenaries: List[Scenaries]) -> List[Scenaries]:
        raise NotImplementedError

    @abstractmethod
    async def update_project_ingestion(
        self,
        project_id: UUID,
        updates: Dict[str, Any],
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    async def commit(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def rollback(self) -> None:
        raise NotImplementedError

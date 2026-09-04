from typing import Optional
from uuid import UUID
from ...domain.entities import Project, ProjectStatus
from ...domain.repository import ProjectRepository


class CreateProjectUseCase:
    """Create project use case"""

    def __init__(self, repository: ProjectRepository):
        self.repository = repository

    async def execute(
        self,
        owner_id: UUID,
        name: str,
        description: Optional[str] = None,
        status: ProjectStatus = ProjectStatus.DRAFT,
    ) -> Project:
        """Create a new project"""
        project = Project(
            owner_id=owner_id,
            name=name,
            description=description,
            status=status,
        )

        return await self.repository.create(project)
def create_project(data):
    return {"id": "project-placeholder"}

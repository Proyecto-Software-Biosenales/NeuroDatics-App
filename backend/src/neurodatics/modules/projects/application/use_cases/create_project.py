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
        pre_experiment: Optional[dict] = None,
    ) -> Project:
        """Create a new project"""
        project = Project(
            owner_id=owner_id,
            name=name,
            description=description,
            status=status,
            pre_experiment=pre_experiment,
            pre_experiment_revision=1 if pre_experiment is not None else 0,
        )

        return await self.repository.create(project)
def create_project(data):
    return {"id": "project-placeholder"}

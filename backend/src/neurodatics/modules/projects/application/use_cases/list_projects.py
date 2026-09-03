from typing import List
from uuid import UUID
from ...domain.entities import Project
from ...domain.repository import ProjectRepository


class ListProjectsUseCase:
    """List projects use case"""
    
    def __init__(self, repository: ProjectRepository):
        self.repository = repository
    
    async def execute(self, owner_id: UUID) -> List[Project]:
        """List all projects for owner"""
        return await self.repository.get_by_owner(owner_id)
def list_projects():
    return []

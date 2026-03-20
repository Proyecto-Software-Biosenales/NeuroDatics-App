from uuid import UUID
from ...domain.repository import ProjectRepository


class DeleteProjectUseCase:
    """Delete project use case"""
    
    def __init__(self, repository: ProjectRepository):
        self.repository = repository
    
    async def execute(self, project_id: UUID, owner_id: UUID) -> bool:
        """Delete a project"""
        return await self.repository.delete(project_id, owner_id)
def delete_project(project_id):
    return True
def execute(project_id: str):
    return True

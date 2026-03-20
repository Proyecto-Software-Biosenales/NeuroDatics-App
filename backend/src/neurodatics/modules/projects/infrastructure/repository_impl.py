from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
from ..domain.repository import ProjectRepository
from ..domain.entities import Project, ProjectFile, ProjectSensor


class SQLProjectRepository(ProjectRepository):
    """SQLAlchemy implementation of ProjectRepository"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, project: Project) -> Project:
        """Create a new project"""
        self.session.add(project)
        await self.session.commit()
        await self.session.refresh(project)
        return project
    
    async def get_by_id(self, project_id: UUID, owner_id: UUID) -> Optional[Project]:
        """Get project by ID and owner"""
        stmt = (
            select(Project)
            .options(
                selectinload(Project.files),
                selectinload(Project.sensors),
                selectinload(Project.participants),
                selectinload(Project.scenaries)
            )
            .where(Project.id == project_id, Project.owner_id == owner_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_by_owner(self, owner_id: UUID) -> List[Project]:
        """Get all projects by owner"""
        stmt = (
            select(Project)
            .options(
                selectinload(Project.sensors),
                selectinload(Project.participants)
            )
            .where(Project.owner_id == owner_id)
            .order_by(Project.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_owner_and_name(self, owner_id: UUID, name: str) -> Optional[Project]:
        """Get a project by owner and case-insensitive name"""
        stmt = select(Project).where(
            Project.owner_id == owner_id,
            func.lower(Project.name) == name.strip().lower(),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def update(self, project: Project) -> Project:
        """Update project"""
        await self.session.commit()
        await self.session.refresh(project)
        return project
    
    async def delete(self, project_id: UUID, owner_id: UUID) -> bool:
        """Delete project - loads object first to trigger cascades"""
        try:
            # Load the project to verify ownership and trigger cascade deletes
            project = await self.get_by_id(project_id, owner_id)
            if not project:
                return False
            
            # Delete the project (cascades will delete related objects)
            await self.session.delete(project)
            await self.session.commit()
            return True
        except Exception:
            await self.session.rollback()
            raise
    
    async def add_file(self, project_file: ProjectFile) -> ProjectFile:
        """Add file to project"""
        self.session.add(project_file)
        await self.session.commit()
        await self.session.refresh(project_file)
        return project_file
    
    async def update_sensors(self, project_id: UUID, sensors: List[str]) -> List[ProjectSensor]:
        """Update project sensors"""
        # Delete existing sensors
        await self.session.execute(
            delete(ProjectSensor).where(ProjectSensor.project_id == project_id)
        )
        
        # Add new sensors
        new_sensors = []
        for sensor_type in sensors:
            sensor = ProjectSensor(project_id=project_id, sensor_type=sensor_type)
            self.session.add(sensor)
            new_sensors.append(sensor)
        
        await self.session.commit()
        
        # Refresh all sensors
        for sensor in new_sensors:
            await self.session.refresh(sensor)
        
        return new_sensors
class ProjectRepositoryImpl(ProjectRepository):
    pass

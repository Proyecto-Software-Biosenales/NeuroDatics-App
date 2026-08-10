from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...scenaries.domain.entities import AOI, Scenaries
from ..domain.entities import Project, ProjectFile, ProjectSensor
from ..domain.repository import ProjectRepository


class ProjectIngestionGenerationError(RuntimeError):
    """The ingestion generation could not be advanced for a project row."""


class SQLProjectRepository(ProjectRepository):
    """SQLAlchemy implementation of ProjectRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, project: Project) -> Project:
        self.session.add(project)
        await self.session.commit()
        await self.session.refresh(project)
        return project

    async def get_by_id(self, project_id: UUID, owner_id: UUID) -> Optional[Project]:
        stmt = (
            select(Project)
            .options(
                selectinload(Project.files),
                selectinload(Project.sensors),
                selectinload(Project.participants),
                selectinload(Project.scenaries).selectinload(Scenaries.aois),
                selectinload(Project.scenaries).selectinload(Scenaries.stimulus_placement),
            )
            .where(Project.id == project_id, Project.owner_id == owner_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_basic_by_id(self, project_id: UUID, owner_id: UUID) -> Optional[Project]:
        """Fetch project without eager-loading heavy relationships (fast path for metadata updates)."""
        stmt = select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_summary_by_id(self, project_id: UUID, owner_id: UUID) -> Optional[Project]:
        """Fetch project with only lightweight relationships needed by ProjectResponse."""
        stmt = (
            select(Project)
            .options(
                selectinload(Project.sensors),
                selectinload(Project.participants),
            )
            .where(Project.id == project_id, Project.owner_id == owner_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_owner(self, owner_id: UUID) -> List[Project]:
        stmt = (
            select(Project)
            .options(
                selectinload(Project.sensors),
                selectinload(Project.participants),
            )
            .where(Project.owner_id == owner_id)
            .order_by(Project.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_owner_and_name(self, owner_id: UUID, name: str) -> Optional[Project]:
        stmt = select(Project).where(
            Project.owner_id == owner_id,
            func.lower(Project.name) == name.strip().lower(),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update(self, project: Project) -> Project:
        await self.session.commit()
        await self.session.refresh(project)
        return project

    async def delete(self, project_id: UUID, owner_id: UUID) -> bool:
        project = await self.get_by_id(project_id, owner_id)
        if not project:
            return False

        await self.session.delete(project)
        await self.session.commit()
        return True

    async def add_file(self, project_file: ProjectFile) -> ProjectFile:
        self.session.add(project_file)
        await self.session.commit()
        await self.session.refresh(project_file)
        return project_file

    async def purge_files_by_kind(self, project_id: UUID, kind: str) -> int:
        result = await self.session.execute(
            delete(ProjectFile).where(
                ProjectFile.project_id == project_id,
                ProjectFile.kind == kind,
            )
        )
        await self.session.flush()
        return result.rowcount or 0

    async def add_files(self, files: List[ProjectFile]) -> List[ProjectFile]:
        self.session.add_all(files)
        await self.session.flush()
        for file_obj in files:
            await self.session.refresh(file_obj)
        return files

    async def delete_file_by_kind(self, project_id: UUID, kind: str) -> bool:
        result = await self.session.execute(
            delete(ProjectFile).where(
                ProjectFile.project_id == project_id,
                ProjectFile.kind == kind,
            )
        )
        await self.session.commit()
        return (result.rowcount or 0) > 0

    async def update_sensors(self, project_id: UUID, sensors: List[str]) -> List[ProjectSensor]:
        await self.session.execute(delete(ProjectSensor).where(ProjectSensor.project_id == project_id))

        new_sensors: List[ProjectSensor] = []
        for sensor_type in sensors:
            sensor = ProjectSensor(project_id=project_id, sensor_type=sensor_type)
            self.session.add(sensor)
            new_sensors.append(sensor)

        await self.session.commit()
        for sensor in new_sensors:
            await self.session.refresh(sensor)
        return new_sensors

    async def get_active_zip(self, project_id: UUID) -> Optional[ProjectFile]:
        stmt = select(ProjectFile).where(
            ProjectFile.project_id == project_id,
            ProjectFile.kind == "experiment_zip",
            ProjectFile.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def soft_delete_active_zip(self, project_id: UUID) -> bool:
        stmt = (
            update(ProjectFile)
            .where(
                ProjectFile.project_id == project_id,
                ProjectFile.kind == "experiment_zip",
                ProjectFile.deleted_at.is_(None),
            )
            .values(deleted_at=datetime.now(timezone.utc))
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return (result.rowcount or 0) > 0

    async def soft_delete_active_files(self, project_id: UUID) -> int:
        stmt = (
            update(ProjectFile)
            .where(
                ProjectFile.project_id == project_id,
                ProjectFile.deleted_at.is_(None),
            )
            .values(deleted_at=datetime.now(timezone.utc))
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount or 0

    async def clear_project_scenaries(self, project_id: UUID) -> int:
        scenary_ids_stmt = select(Scenaries.id).where(Scenaries.project_id == project_id)
        scenary_ids_result = await self.session.execute(scenary_ids_stmt)
        scenary_ids = list(scenary_ids_result.scalars().all())

        if scenary_ids:
            await self.session.execute(delete(AOI).where(AOI.scenaries_id.in_(scenary_ids)))

        result = await self.session.execute(delete(Scenaries).where(Scenaries.project_id == project_id))
        await self.session.flush()
        return result.rowcount or 0

    async def add_scenaries(self, scenaries: List[Scenaries]) -> List[Scenaries]:
        if not scenaries:
            return []

        self.session.add_all(scenaries)
        await self.session.flush()
        for scenary in scenaries:
            await self.session.refresh(scenary)
        return scenaries

    async def update_project_ingestion(self, project_id: UUID, updates: Dict[str, Any]) -> None:
        if not updates:
            return

        stmt = update(Project).where(Project.id == project_id).values(**updates)
        await self.session.execute(stmt)
        await self.session.flush()

    # Flush without commit so the bump lands in the caller's transaction alongside the READY
    # status update: cache identity may only change on a successful atomic swap.
    async def bump_ingestion_generation(self, project_id: UUID) -> int:
        stmt = (
            update(Project)
            .where(Project.id == project_id)
            .values(ingestion_generation=Project.ingestion_generation + 1)
            .returning(Project.ingestion_generation)
        )
        result = await self.session.execute(stmt)
        generation = result.scalar_one_or_none()
        if generation is None:
            # No row matched, so the project was deleted under us. Returning 0
            # would let the caller commit READY and then sweep against
            # generation 0, wiping the caches of whatever still holds that id.
            raise ProjectIngestionGenerationError(
                f"Project {project_id} disappeared before its ingestion generation could advance"
            )
        await self.session.flush()
        return int(generation)

    async def get_ingestion_generation(self, project_id: UUID) -> int:
        stmt = select(Project.ingestion_generation).where(Project.id == project_id)
        result = await self.session.execute(stmt)
        return int(result.scalar_one_or_none() or 0)

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain.entities import JobStatus, ProcessingJob
from ..domain.repository import ProcessingJobRepository


class SQLProcessingJobRepository(ProcessingJobRepository):
    """SQLAlchemy implementation of ProcessingJobRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, job: ProcessingJob) -> ProcessingJob:
        self.session.add(job)
        await self.session.flush()
        await self.session.refresh(job)
        return job

    async def get_by_id(self, job_id: UUID) -> Optional[ProcessingJob]:
        stmt = select(ProcessingJob).where(ProcessingJob.id == job_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_rq_job_id(self, rq_job_id: str) -> Optional[ProcessingJob]:
        stmt = select(ProcessingJob).where(ProcessingJob.job_id == rq_job_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_project_id(
        self,
        project_id: UUID,
        status: Optional[str] = None,
        limit: int = 10,
    ) -> List[ProcessingJob]:
        stmt = select(ProcessingJob).where(ProcessingJob.project_id == project_id)
        if status is not None:
            stmt = stmt.where(ProcessingJob.status == status)

        stmt = stmt.order_by(ProcessingJob.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_status(self, job_id: UUID, status: str, message: Optional[str] = None) -> bool:
        now_utc = datetime.now(timezone.utc)
        values = {"status": status}

        if message is not None:
            values["message"] = message

        if status == JobStatus.PROCESSING.value:
            values["started_at"] = now_utc

        if status in {
            JobStatus.SUCCESS.value,
            JobStatus.FAILED.value,
            JobStatus.CANCELED.value,
        }:
            values["completed_at"] = now_utc

        result = await self.session.execute(
            update(ProcessingJob).where(ProcessingJob.id == job_id).values(**values)
        )
        await self.session.flush()
        return (result.rowcount or 0) > 0

    async def update_progress(
        self,
        job_id: UUID,
        progress_percent: int,
        message: Optional[str] = None,
    ) -> bool:
        values = {"progress_percent": progress_percent}
        if message is not None:
            values["message"] = message

        result = await self.session.execute(
            update(ProcessingJob).where(ProcessingJob.id == job_id).values(**values)
        )
        await self.session.flush()
        return (result.rowcount or 0) > 0

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

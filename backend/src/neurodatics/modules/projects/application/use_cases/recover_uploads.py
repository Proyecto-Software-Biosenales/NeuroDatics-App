"""Bounded restart recovery; active workers are excluded by the project lock."""

import asyncio
import logging
from uuid import uuid4

from sqlalchemy import select, func

from .....infra.db.session import AsyncSessionLocal
from ....integrations.google_drive.infrastructure.configure_client import (
    configure_gdrive_client_with_oauth,
)
from ...domain.entities import Project, UploadAttempt
from ...infrastructure.drive_cleanup import drain_drive_cleanup
from ...infrastructure.mutation_lock import (
    ProjectMutationConflict,
    project_mutation_lock,
)
from ...infrastructure.repository_impl import SQLProjectRepository
from .ingestion_lifecycle import IngestionLifecycle

logger = logging.getLogger(__name__)


async def recover_uploads_once():
    async with AsyncSessionLocal() as db:
        if not await configure_gdrive_client_with_oauth(db, silent=True):
            return
        pending = UploadAttempt.phase.in_(
            ["processing", "uploading", "canceling"]
        ) | UploadAttempt.cleanup_root_id.is_not(None)
        projects = list(
            (
                await db.execute(
                    select(Project.id, Project.owner_id)
                    .join(UploadAttempt, UploadAttempt.project_id == Project.id)
                    .where(pending)
                    .group_by(Project.id, Project.owner_id)
                    .order_by(func.min(UploadAttempt.updated_at))
                    .limit(32)
                )
            ).all()
        )
        for project_id, owner_id in projects:
            try:
                async with project_mutation_lock(db, project_id):
                    repository = SQLProjectRepository(db)
                    project = await repository.get_by_id(project_id, owner_id)
                    if project is not None:
                        await IngestionLifecycle(
                            repository, db, project, uuid4()
                        ).recover()
            except ProjectMutationConflict:
                continue
        await drain_drive_cleanup(db)


async def upload_recovery_loop():
    while True:
        await asyncio.sleep(60)
        try:
            await recover_uploads_once()
        except Exception:
            logger.warning(
                "Upload recovery deferred until the next sweep", exc_info=True
            )


if __name__ == "__main__":
    asyncio.run(recover_uploads_once())

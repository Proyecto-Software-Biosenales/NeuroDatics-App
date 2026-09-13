"""A small transactional outbox for deletion of unreferenced Drive objects."""

import asyncio
import logging

from sqlalchemy import delete, select, update, func
from sqlalchemy.dialects.postgresql import insert

from ....infra.storage.gdrive_client import gdrive_client
from ..domain.entities import DriveCleanupTask, Project, ProjectFile

logger = logging.getLogger(__name__)


async def enqueue_drive_cleanup(db, project_id, external_ids):
    for external_id in set(filter(None, external_ids)):
        await db.execute(
            insert(DriveCleanupTask)
            .values(
                external_id=external_id,
                project_id=project_id,
            )
            .on_conflict_do_nothing(index_elements=[DriveCleanupTask.external_id])
        )


async def drain_drive_cleanup(db, *, external_ids=None, limit=32):
    stmt = (
        select(DriveCleanupTask.external_id)
        .order_by(DriveCleanupTask.updated_at)
        .limit(limit)
    )
    if external_ids is not None:
        stmt = stmt.where(DriveCleanupTask.external_id.in_(external_ids))
    pending = list((await db.execute(stmt)).scalars().all())
    removed = set()
    for external_id in pending:
        # Protect active references even if a malformed/manual outbox entry was
        # created. Historical tombstones do not keep retired storage alive.
        project = await db.scalar(
            select(Project.id)
            .where(Project.drive_root_folder_id == external_id)
            .limit(1)
        )
        file = await db.scalar(
            select(ProjectFile.id)
            .where(
                ProjectFile.external_id == external_id,
                ProjectFile.deleted_at.is_(None),
            )
            .limit(1)
        )
        if project is not None or file is not None:
            logger.warning(
                "Refusing Drive cleanup for referenced object %s", external_id
            )
            await db.execute(
                update(DriveCleanupTask)
                .where(DriveCleanupTask.external_id == external_id)
                .values(updated_at=func.now())
            )
            await db.commit()
            continue
        try:
            deleted = await asyncio.to_thread(gdrive_client.delete_file, external_id)
        except Exception:
            deleted = False
            logger.warning("Deferred Drive cleanup failed", exc_info=True)
        if deleted:
            await db.execute(
                delete(DriveCleanupTask).where(
                    DriveCleanupTask.external_id == external_id
                )
            )
            await db.commit()
            removed.add(external_id)
        else:
            await db.execute(
                update(DriveCleanupTask)
                .where(DriveCleanupTask.external_id == external_id)
                .values(updated_at=func.now())
            )
            await db.commit()
    return removed

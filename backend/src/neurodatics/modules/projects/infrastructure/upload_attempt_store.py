"""Attempt records share publication's transaction but never store upload bytes."""

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from ..domain.entities import UploadAttempt


class UploadAttemptConflict(RuntimeError):
    pass


class UploadAttemptStore:
    ACTIVE_PHASES = ("processing", "uploading", "canceling")

    def __init__(self, session):
        self.session = session

    async def get(self, project_id, upload_id=None):
        stmt = select(UploadAttempt).where(UploadAttempt.project_id == project_id)
        if upload_id is not None:
            stmt = stmt.where(UploadAttempt.id == upload_id)
        stmt = (
            stmt.order_by(UploadAttempt.created_at.desc())
            .limit(1)
            .execution_options(populate_existing=True)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def begin(self, project_id, upload_id):
        await self.session.execute(
            insert(UploadAttempt)
            .values(
                id=upload_id,
                project_id=project_id,
                phase="receiving",
                cancel_requested=False,
            )
            .on_conflict_do_nothing(index_elements=[UploadAttempt.id])
        )
        attempt = await self.get(project_id, upload_id)
        if attempt is None or attempt.phase != "receiving":
            raise UploadAttemptConflict(
                "Este intento ya se recibio. Consulta su progreso o inicia otro intento."
            )
        await self.update(upload_id, phase="processing", error=None)
        await self.session.commit()

    async def update(self, upload_id, **values):
        values["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.session.execute(
            update(UploadAttempt).where(UploadAttempt.id == upload_id).values(**values)
        )

    async def update_active(self, upload_id, *, require_not_canceled=False, **values):
        values["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
        stmt = update(UploadAttempt).where(
            UploadAttempt.id == upload_id,
            UploadAttempt.phase.in_(self.ACTIVE_PHASES),
        )
        if require_not_canceled:
            stmt = stmt.where(UploadAttempt.cancel_requested.is_(False))
        result = await self.session.execute(
            stmt.values(**values).returning(UploadAttempt.id)
        )
        if result.scalar_one_or_none() is None:
            raise UploadAttemptConflict(
                "La carga fue cancelada o recuperada por otro proceso. Consulta su estado."
            )

    async def interrupt(self, upload_id, error, cleanup_root_id):
        result = await self.session.execute(
            update(UploadAttempt)
            .where(
                UploadAttempt.id == upload_id,
                UploadAttempt.phase.in_(self.ACTIVE_PHASES),
            )
            .values(
                phase="failed",
                error=error,
                cleanup_root_id=cleanup_root_id,
                updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            .returning(UploadAttempt.id)
        )
        return result.scalar_one_or_none() is not None

    async def request_cancel(self, project_id, upload_id):
        # A cancel can arrive while the browser is still transferring the ZIP.
        # Keep it scoped to this ID so a later retry starts cleanly.
        if upload_id is not None:
            await self.session.execute(
                insert(UploadAttempt)
                .values(
                    id=upload_id,
                    project_id=project_id,
                    phase="receiving",
                    cancel_requested=True,
                )
                .on_conflict_do_nothing(index_elements=[UploadAttempt.id])
            )
        attempt = await self.get(project_id, upload_id)
        if attempt is not None and attempt.phase in {
            "receiving",
            "processing",
            "uploading",
            "canceling",
        }:
            await self.session.execute(
                update(UploadAttempt)
                .where(
                    UploadAttempt.id == attempt.id,
                    UploadAttempt.phase.in_(["receiving", *self.ACTIVE_PHASES]),
                )
                .values(cancel_requested=True)
            )
        await self.session.commit()

    async def is_canceled(self, project_id, upload_id):
        result = await self.session.execute(
            select(UploadAttempt.cancel_requested).where(
                UploadAttempt.project_id == project_id,
                UploadAttempt.id == upload_id,
            )
        )
        return bool(result.scalar_one_or_none())

    async def unfinished(self, project_id, exclude_id):
        result = await self.session.execute(
            select(UploadAttempt)
            .where(
                UploadAttempt.project_id == project_id,
                UploadAttempt.id != exclude_id,
                (UploadAttempt.phase.in_(["processing", "uploading", "canceling"]))
                | UploadAttempt.cleanup_root_id.is_not(None),
            )
            .order_by(UploadAttempt.updated_at)
            .limit(100)
        )
        return list(result.scalars().all())

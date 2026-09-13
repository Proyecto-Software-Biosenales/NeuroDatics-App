"""Attempt state, cancellation and compensation, separate from artifact building."""

import asyncio
import logging
from uuid import uuid4

from .....infra.storage.gdrive_client import gdrive_client
from ...infrastructure.upload_attempt_store import UploadAttemptStore
from ...infrastructure.mutation_lock import assert_project_mutation_lock
from ..services.drive_upload_progress_registry import drive_upload_progress_registry

logger = logging.getLogger(__name__)


class UploadCanceledError(Exception):
    pass


def progress_key(project_id, upload_id=None):
    return f"{project_id}:{upload_id}" if upload_id is not None else str(project_id)


class IngestionLifecycle:
    def __init__(self, repository, db, project, upload_id=None):
        self.repository = repository
        self.store = UploadAttemptStore(db) if db is not None else None
        self.project_id = project.id
        self.project = project
        self.upload_id = upload_id or uuid4()
        self.progress_key = progress_key(project.id, self.upload_id)
        self.previous_root = project.drive_root_folder_id
        self.previous_ready = bool(self.previous_root) or bool(
            getattr(project, "ingestion_generation", 0)
        )
        self.root_id = None
        self.processing = False
        self.publishing = False
        self.published = False
        self.begun = False

    async def begin(self):
        if self.store:
            await assert_project_mutation_lock(self.store.session)
            # The caller holds the project mutation lock. Any older unfinished
            # worker has therefore disconnected; no timeout guess is needed.
            if await self.recover() is True:
                self.project = await self.repository.get_by_id(
                    self.project_id, self.project.owner_id
                )
                self.previous_root = self.project.drive_root_folder_id
                self.previous_ready = bool(self.previous_root) or bool(
                    self.project.ingestion_generation
                )
            await self.store.begin(self.project_id, self.upload_id)
        self.begun = True
        drive_upload_progress_registry.begin(self.progress_key)
        await self.check_canceled()

    async def recover(self):
        pending = await self.store.unfinished(self.project_id, self.upload_id)
        for attempt in pending:
            root = attempt.cleanup_root_id
            if attempt.phase in {"processing", "uploading", "canceling"}:
                root = root or attempt.root_folder_id
                # Conditional transition serializes with publication's first
                # write, even if that worker just lost its advisory connection.
                if not await self.store.interrupt(
                    attempt.id, "La carga anterior se interrumpio.", root
                ):
                    continue
                await self.repository.update_project_ingestion(
                    self.project_id,
                    {
                        "ingestion_status": "READY"
                        if self.previous_ready
                        else "FAILED",
                        "ingestion_error": "La carga anterior se interrumpio. Puedes reintentar.",
                    },
                )
                # The failed receipt must be durable before removing storage.
                # A crash here can leave an orphan, never a publishable missing root.
                await self.repository.commit()
            # Never reclaim the currently published root, even when an old
            # attempt's status was interrupted or its response was lost.
            if root and root != self.previous_root:
                try:
                    deleted = await asyncio.to_thread(gdrive_client.delete_file, root)
                except Exception:
                    deleted = False
                    logger.warning("Deferred upload cleanup failed", exc_info=True)
                if deleted:
                    await self.store.update(attempt.id, cleanup_root_id=None)
                else:
                    await self.store.update(attempt.id, cleanup_root_id=root)
            await self.repository.commit()
        return bool(pending)

    async def check_canceled(self):
        canceled = drive_upload_progress_registry.is_cancel_requested(self.progress_key)
        if self.store:
            await assert_project_mutation_lock(self.store.session)
            canceled = canceled or await self.store.is_canceled(
                self.project_id, self.upload_id
            )
        if canceled:
            raise UploadCanceledError("Upload canceled by user")

    async def record_root(self, root_id):
        self.root_id = root_id
        if self.store:
            await self.store.update_active(self.upload_id, root_folder_id=root_id)
            await self.repository.commit()

    async def progress(self):
        if self.store:
            await assert_project_mutation_lock(self.store.session)
            snapshot = drive_upload_progress_registry.get(self.progress_key)
            if snapshot:
                await self.store.update_active(
                    self.upload_id, phase=snapshot["phase"], progress=snapshot
                )
                await self.repository.commit()

    async def prepare_publication(self):
        self.publishing = True
        if self.store:
            # This update commits with the new data and generation. It is also
            # the durable receipt when the HTTP success response is lost.
            await self.store.update_active(
                self.upload_id,
                require_not_canceled=True,
                phase="completed",
                error=None,
                cleanup_root_id=self.previous_root,
            )

    async def cleanup_completed(self):
        if self.store:
            try:
                await self.store.update(self.upload_id, cleanup_root_id=None)
                await self.repository.commit()
            except Exception:
                await self.repository.rollback()
                logger.warning(
                    "Could not acknowledge completed cleanup; retry is safe",
                    exc_info=True,
                )

    async def fail(self, exc, error, uploaded_ids):
        if not self.begun:
            await self.repository.rollback()
            return
        if self.published:
            logger.warning(
                "Upload committed; post-publication error cannot undo it", exc_info=True
            )
            return
        try:
            await self.repository.rollback()
        except Exception:
            # A lost database connection cannot prove that COMMIT failed.
            logger.exception(
                "Cannot establish upload outcome; retaining Drive data for reconciliation"
            )
            return
        if self.publishing and self.store:
            try:
                receipt = await self.store.get(self.project_id, self.upload_id)
            except Exception:
                logger.exception(
                    "Cannot read publication receipt; retaining Drive data for reconciliation"
                )
                return
            if receipt and receipt.phase == "completed":
                self.published = True
                drive_upload_progress_registry.complete(self.progress_key)
                return

        drive_upload_progress_registry.fail(self.progress_key, error)
        unknown_id = getattr(exc, "drive_file_id", None)
        root = self.root_id or unknown_id
        if self.store:
            await self.store.update(
                self.upload_id, phase="failed", error=error, cleanup_root_id=root
            )
            await self.repository.commit()

        # Every child is inside the new root. One recursive Drive deletion
        # avoids thousands of calls and covers partially completed uploads.
        cleanup_ids = [root] if root else list(dict.fromkeys(reversed(uploaded_ids)))
        cleaned = True
        for drive_id in cleanup_ids:
            try:
                deleted = await asyncio.to_thread(gdrive_client.delete_file, drive_id)
                cleaned = bool(deleted) and cleaned
            except Exception:
                cleaned = False
                logger.warning(
                    "Could not compensate Drive object %s", drive_id, exc_info=True
                )
        if self.store and cleaned:
            await self.store.update(self.upload_id, cleanup_root_id=None)
        if self.store:
            try:
                await assert_project_mutation_lock(self.store.session)
            except Exception:
                self.store.session.info["project_mutation_lock_lost"] = True
        lock_lost = self.store and self.store.session.info.get(
            "project_mutation_lock_lost"
        )
        if self.processing and not lock_lost:
            await self.repository.update_project_ingestion(
                self.project_id,
                {
                    "ingestion_status": "READY" if self.previous_ready else "FAILED",
                    "ingestion_error": error,
                },
            )
        if self.store or self.processing:
            await self.repository.commit()


async def finish_upload_on_disconnect(coroutine, project_id, upload_id):
    """Keep the DB session and temporary files alive until worker threads finish."""
    task = asyncio.create_task(coroutine)
    disconnected = False
    while True:
        try:
            result = await asyncio.shield(task)
            if disconnected:
                raise asyncio.CancelledError()
            return result
        except asyncio.CancelledError:
            if task.done():
                # Retrieve failures so shutdown does not leave an unobserved task.
                if not task.cancelled():
                    task.exception()
                raise
            disconnected = True
            drive_upload_progress_registry.request_cancel(
                progress_key(project_id, upload_id)
            )

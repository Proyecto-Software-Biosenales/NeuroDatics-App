"""Cross-process exclusion for project publication and destructive mutations."""

import hashlib
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ProjectMutationConflict(RuntimeError):
    pass


class ProjectMutationLockLost(RuntimeError):
    pass


async def assert_project_mutation_lock(db):
    connection = db.info.get("project_mutation_connection")
    if connection is None:
        raise ProjectMutationLockLost("Project mutation lock is not held")
    try:
        await connection.scalar(text("SELECT 1"))
    except Exception as exc:
        db.info["project_mutation_lock_lost"] = True
        raise ProjectMutationLockLost(
            "Project mutation lock connection was lost"
        ) from exc


@asynccontextmanager
async def project_mutation_lock(db: AsyncSession, project_id: UUID):
    # Use a dedicated transaction: ordinary repository commits must not release
    # this lock partway through an upload. Transaction locks also work through
    # transaction-pooling proxies and are released if the worker disconnects.
    key = int.from_bytes(
        hashlib.sha256(f"project-mutation:{project_id}".encode()).digest()[:8],
        "big",
        signed=True,
    )
    async with db.bind.connect() as connection:
        async with connection.begin():
            acquired = await connection.scalar(
                text("SELECT pg_try_advisory_xact_lock(:key)"),
                {"key": key},
            )
            if not acquired:
                raise ProjectMutationConflict(
                    "El proyecto tiene una operacion en curso. Intenta cuando termine."
                )
            db.info["project_mutation_connection"] = connection
            db.info["project_mutation_lock_lost"] = False
            try:
                yield
            finally:
                db.info.pop("project_mutation_connection", None)

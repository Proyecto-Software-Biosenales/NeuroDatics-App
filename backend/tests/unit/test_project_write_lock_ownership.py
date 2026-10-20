"""A project's write lock is only requested for its owner (E10)."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from neurodatics.config.security import LOCAL_USER_ID
from neurodatics.modules.projects.api import dependencies


@pytest.fixture
def lock_requests(monkeypatch):
    requested = []

    @asynccontextmanager
    async def spy(db, project_id):
        requested.append(project_id)
        yield

    monkeypatch.setattr(dependencies, "project_mutation_lock", spy)
    return requested


async def hold_lock(project_id, user, db):
    dependency = dependencies.lock_project_for_write(project_id, user, db)
    await dependency.__anext__()
    await dependency.aclose()


@pytest.mark.asyncio
async def test_another_users_project_answers_404_without_asking_for_the_lock(lock_requests):
    db = AsyncMock()
    db.scalar.return_value = None

    with pytest.raises(HTTPException) as refused:
        await hold_lock(uuid4(), str(uuid4()), db)

    assert refused.value.status_code == 404
    assert lock_requests == []


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [str(uuid4()), LOCAL_USER_ID], ids=["server-owner", "local-user"])
async def test_the_owner_gets_the_lock_after_the_ownership_check(lock_requests, user):
    project_id = uuid4()
    db = AsyncMock()
    db.scalar.return_value = 1

    await hold_lock(project_id, user, db)

    assert lock_requests == [project_id]
    statement, params = db.scalar.await_args.args
    assert "owner_id" in str(statement)
    assert params == {"id": project_id, "owner": UUID(user)}

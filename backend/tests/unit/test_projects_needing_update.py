"""A project whose Parquets predate the ingestion-time gaze cleaning is flagged."""

from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import create_engine

from neurodatics.modules.projects.domain.entities import ProjectFile
from neurodatics.modules.projects.infrastructure.repository_impl import SQLProjectRepository
from neurodatics.shared.gaze_contract import GAZE_CLEAN_VERSION


class _SyncSession:
    """Runs the repository's statement on a synchronous SQLite connection."""

    def __init__(self, connection):
        self._connection = connection

    async def execute(self, statement):
        return self._connection.execute(statement)


def _file(project_id, kind="processed_parquet", block_metadata=None, deleted=False):
    metadata = {"type": "user_parquet"}
    if block_metadata is not None:
        metadata["block_metadata"] = block_metadata
    return {
        "id": uuid4(),
        "project_id": project_id,
        "kind": kind,
        "storage_provider": "local",
        "external_id": str(uuid4()),
        "filename": "user1.parquet",
        "file_metadata": metadata,
        "deleted_at": datetime(2026, 10, 1) if deleted else None,
    }


@pytest.mark.asyncio
async def test_only_live_parquets_without_the_current_version_flag_a_project():
    current, outdated, replaced, other_version, media_only = (uuid4() for _ in range(5))
    rows = [
        _file(current, block_metadata={"gaze_clean_version": GAZE_CLEAN_VERSION}),
        _file(outdated, block_metadata={"user_index": 1}),
        _file(replaced, block_metadata={"user_index": 1}, deleted=True),
        _file(replaced, block_metadata={"gaze_clean_version": GAZE_CLEAN_VERSION}),
        _file(other_version, block_metadata={"gaze_clean_version": GAZE_CLEAN_VERSION + 1}),
        _file(media_only, kind="scenario_image"),
    ]
    engine = create_engine("sqlite://")
    table = ProjectFile.__table__
    with engine.begin() as connection:
        table.create(connection)
        connection.execute(table.insert(), rows)
        repository = SQLProjectRepository(_SyncSession(connection))

        flagged = await repository.projects_needing_update(
            [current, outdated, replaced, other_version, media_only]
        )

    assert flagged == {outdated, other_version}

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pandas as pd
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect
from sqlalchemy.dialects import postgresql

from neurodatics.modules.analytics.domain.coordinate_transform import transform_cache_token
from neurodatics.modules.analytics.infrastructure import transform_token_store as store


@pytest.mark.parametrize("frame", [
    pd.DataFrame({"time": [0.0], "gx": [25.0], "gy": [75.0]}),
    pd.DataFrame({
        "scenario": ["A", "B"], "stimulus_transform_status": ["applied", "applied"],
        "stimulus_transform_fingerprint": ["a" * 64, "b" * 64],
        "stimulus_transform_version": ["screen-stimulus-v1"] * 2,
    }),
])
def test_persisted_and_frame_tokens_are_identical_and_participant_scoped(frame):
    token = transform_cache_token(frame)
    project = SimpleNamespace(analytics_transform_tokens={
        "P:1": {"generation": 7, "token": token},
    })
    assert store.stored_transform_token(project, "P:1", 7) == token
    assert store.stored_transform_token(project, "P:2", 7) is None
    assert store.stored_transform_token(project, "P:1", 8) is None


@pytest.mark.parametrize("tokens", [None, [], "bad", {"P": None}, {"P": {"generation": 1, "token": ""}}])
def test_missing_and_malformed_rows_fall_back(tokens):
    assert store.stored_transform_token(SimpleNamespace(analytics_transform_tokens=tokens), "P", 1) is None


def test_update_is_atomic_generation_guarded_and_preserves_project_timestamp():
    statement = store.transform_token_update(uuid4(), 'P:"1', 9, "a" * 20)
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert " || " in sql
    assert "CASE WHEN (jsonb_typeof(" in sql
    assert "projects.ingestion_generation =" in sql
    assert "updated_at=projects.updated_at" in sql
    assert {'P:"1': {"generation": 9, "token": "a" * 20}} in compiled.params.values()


@pytest.mark.asyncio
async def test_persistence_executes_update_and_commits(monkeypatch):
    statements = []
    events = []

    class Database:
        async def execute(self, statement):
            statements.append(statement)
            events.append("update")

        async def commit(self):
            events.append("commit")

    monkeypatch.setattr(store, "inspect", lambda *args, **kwargs: SimpleNamespace(persistent=True))
    await store.persist_transform_token(Database(), SimpleNamespace(id=uuid4()), "P", 1, "a" * 20)
    assert len(statements) == 1
    assert events == ["update", "commit"]


def test_transform_token_migration_round_trip_preserves_existing_projects():
    path = Path(__file__).parents[2] / "migrations/versions/024_add_analytics_transform_tokens.py"
    spec = spec_from_file_location("transform_token_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "023"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)")
        connection.exec_driver_sql("INSERT INTO projects VALUES ('p', 'Preserved')")
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert "analytics_transform_tokens" in {c["name"] for c in inspect(connection).get_columns("projects")}
        assert connection.exec_driver_sql("SELECT analytics_transform_tokens FROM projects").scalar() is None
        migration.downgrade()
        assert "analytics_transform_tokens" not in {c["name"] for c in inspect(connection).get_columns("projects")}
        assert connection.exec_driver_sql("SELECT name FROM projects").scalar() == "Preserved"

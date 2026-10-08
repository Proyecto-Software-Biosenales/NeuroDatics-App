"""HTTP contract and durable planning history on a real SQLite database."""

import asyncio
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Column, MetaData, Table, Uuid, create_engine, event, inspect, select
from sqlalchemy.orm import Session

from neurodatics.api.deps import get_current_user, get_db
from neurodatics.infra.db.base import Base
from neurodatics.modules.projects.api.routes import router
from neurodatics.modules.projects.api.pre_experiment_routes import guard_revision, planning_summary
from neurodatics.modules.projects.domain.entities import Project, PreExperimentResponse
from neurodatics.modules.projects.infrastructure.repository_impl import SQLProjectRepository


class AsyncFacade:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    def add(self, row):
        self.session.add(row)

    def add_all(self, rows):
        self.session.add_all(rows)

    async def commit(self):
        self.session.commit()

    async def rollback(self):
        self.session.rollback()

    async def refresh(self, row):
        self.session.refresh(row)

    async def flush(self):
        self.session.flush()

    async def delete(self, row):
        self.session.delete(row)


@pytest.fixture
def storage(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'planning.sqlite'}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    # Stimulus placement has an existing PostgreSQL regex CHECK, unrelated to planning.
    Base.metadata.create_all(engine, tables=[table for table in Base.metadata.sorted_tables if table.name != "stimulus_placements"])
    owner = str(uuid4())
    app = FastAPI()
    app.include_router(router, prefix="/api")

    async def database():
        with Session(engine, expire_on_commit=False) as session:
            yield AsyncFacade(session)

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: owner
    with TestClient(app) as client:
        yield client, engine, app, owner
    engine.dispose()


def configuration():
    return {
        "participants": [{"id": str(uuid4()), "code": "P01", "name": "Participante", "identification_document": "1234", "gender": "Otro", "age": 22}],
        "screen": {"model": "Monitor", "width_px": 1920, "height_px": 1080, "width_cm": 52.5},
        "notes": "Recordar la iluminación",
        "questionnaires": {
            "before": {"enabled": True, "title": "Antes", "questions": [
                {"id": str(uuid4()), "type": "open_text", "prompt": "¿Cómo estás?", "required": True},
                {"id": str(uuid4()), "type": "true_false", "prompt": "¿Dormiste?", "required": True},
                {"id": str(uuid4()), "type": "multiple_choice", "prompt": "Elige", "required": True, "options": [
                    {"id": str(uuid4()), "label": "Uno"}, {"id": str(uuid4()), "label": "Dos"},
                ]},
                {"id": str(uuid4()), "type": "open_text", "prompt": "Opcional", "required": False},
            ]},
        },
    }


def create(client, config=None):
    payload = {"name": str(uuid4())}
    if config is not None:
        payload["pre_experiment"] = config
    response = client.post("/api/projects/", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def submission(config, revision=1):
    questions = config["questionnaires"]["before"]["questions"]
    return {"revision": revision, "participant_id": config["participants"][0]["id"], "phase": "before", "answers": {
        questions[0]["id"]: "Bien", questions[1]["id"]: False,
        questions[2]["id"]: [questions[2]["options"][0]["id"]],
    }}


def test_create_persist_capture_export_and_history_survive_edits_and_ingestion(storage):
    client, engine, _app, owner = storage
    config = configuration()
    project = create(client, config)
    project_id = project["id"]
    path = f"/api/projects/{project_id}/pre-experiment"
    assert project["is_pre_experiment"] and project["planning_participants_count"] == 1
    assert project["status"] == "draft" and project["drive_root_folder_id"] is None
    saved = client.post(path + "/responses", json=submission(config))
    assert saved.status_code == 201, saved.text
    assert saved.json()["submitted_at"].endswith("Z")
    assert saved.json()["answers"][config["questionnaires"]["before"]["questions"][1]["id"]] is False
    assert client.get(path).json()["responses"][0] == saved.json()
    changed = deepcopy(config)
    changed["participants"] = []
    changed["questionnaires"] = {}
    updated = client.put(path, json={"revision": 1, "config": changed})
    assert updated.status_code == 200 and updated.json()["revision"] == 2
    assert updated.json()["responses"][0]["participant_snapshot"]["name"] == "Participante"
    assert updated.json()["responses"][0]["questionnaire_snapshot"]["title"] == "Antes"

    async def reconcile():
        with Session(engine, expire_on_commit=False) as session:
            repository = SQLProjectRepository(AsyncFacade(session))
            await repository.reconcile_ingestion_metadata(UUID(project_id), ["ACQ-02"], ["EEG"])
            await repository.bump_ingestion_generation(UUID(project_id))
            await repository.update_project_ingestion(UUID(project_id), {"ingestion_status": "READY"})
            await repository.commit()

    asyncio.run(reconcile())
    detail = client.get(f"/api/projects/{project_id}").json()
    assert not detail["is_pre_experiment"]
    assert detail["participants"][0]["participant_code"] == "ACQ-02"
    export = client.get(path + "/export")
    assert export.status_code == 200 and "attachment" in export.headers["content-disposition"]
    assert export.json()["responses"][0] == saved.json()
    assert export.json()["project"]["id"] == project_id
    with Session(engine) as session:
        persisted = session.get(Project, UUID(project_id))
        assert persisted.pre_experiment["notes"] == config["notes"]
        assert len(session.scalars(select(PreExperimentResponse)).all()) == 1

    async def delete():
        with Session(engine, expire_on_commit=False) as session:
            assert await SQLProjectRepository(AsyncFacade(session)).delete(UUID(project_id), UUID(owner))
    asyncio.run(delete())
    with Session(engine) as session:
        assert not session.scalars(select(PreExperimentResponse)).all()


def test_existing_project_can_enable_planning_and_revision_conflicts(storage):
    client, engine, _app, _owner = storage
    project = create(client)
    path = f"/api/projects/{project['id']}/pre-experiment"
    initial = client.get(path).json()
    assert initial["revision"] == 0 and initial["responses"] == []
    assert initial["config"]["participants"] == []
    config = configuration()
    assert client.put(path, json={"revision": 0, "config": config}).status_code == 200
    assert client.put(path, json={"revision": 0, "config": config}).status_code == 409
    assert client.post(path + "/responses", json=submission(config, 0)).status_code == 409
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.put(path, json={"revision": 1, "config": config}).status_code, range(2)))
    assert sorted(results) == [200, 409]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(path + "/responses", json=submission(config, 2)).status_code, range(2)))
    assert results == [201, 201]
    assert len(client.get(path).json()["responses"]) == 2

    async def stale_loaded_row():
        with Session(engine, expire_on_commit=False) as session:
            row = session.get(Project, UUID(project["id"]))
            with pytest.raises(Exception) as raised:
                await guard_revision(AsyncFacade(session), row, 1, pre_experiment_revision=3)
            assert raised.value.status_code == 409
    asyncio.run(stale_loaded_row())


@pytest.mark.parametrize("alter", ["missing", "extra", "wrong_bool", "wrong_text", "wrong_choice", "duplicate_choice", "unknown_participant", "disabled"])
def test_response_validation(storage, alter):
    client, _engine, _app, _owner = storage
    config = configuration()
    project = create(client, config)
    payload = submission(config)
    questions = config["questionnaires"]["before"]["questions"]
    if alter == "missing":
        payload["answers"].pop(questions[0]["id"])
    elif alter == "extra":
        payload["answers"][str(uuid4())] = "Extra"
    elif alter == "wrong_bool":
        payload["answers"][questions[1]["id"]] = "false"
    elif alter == "wrong_text":
        payload["answers"][questions[0]["id"]] = False
    elif alter == "wrong_choice":
        payload["answers"][questions[2]["id"]] = ["Uno"]
    elif alter == "duplicate_choice":
        payload["answers"][questions[2]["id"]] *= 2
    elif alter == "unknown_participant":
        payload["participant_id"] = str(uuid4())
    elif alter == "disabled":
        payload["phase"] = "after"
    path = f"/api/projects/{project['id']}/pre-experiment"
    assert client.post(path + "/responses", json=payload).status_code == 422
    assert client.get(path).json()["responses"] == []


def test_owner_isolation_for_every_route(storage):
    client, _engine, app, _owner = storage
    config = configuration()
    project = create(client, config)
    path = f"/api/projects/{project['id']}/pre-experiment"
    app.dependency_overrides[get_current_user] = lambda: str(uuid4())
    assert client.get(path).status_code == 404
    assert client.get(path + "/export").status_code == 404
    assert client.put(path, json={"revision": 1, "config": config}).status_code == 404
    assert client.post(path + "/responses", json=submission(config)).status_code == 404


def test_create_empty_planning_then_capture_after_only_and_require_authentication(storage):
    client, _engine, app, _owner = storage
    project = create(client, {})
    path = f"/api/projects/{project['id']}/pre-experiment"
    assert project["is_pre_experiment"] and project["planning_participants_count"] == 0
    initial = client.get(path).json()
    assert initial["revision"] == 1
    assert not initial["config"]["questionnaires"]["before"]["enabled"]
    assert not initial["config"]["questionnaires"]["after"]["enabled"]
    config = configuration()
    config["questionnaires"] = {"after": config["questionnaires"]["before"]}
    config["questionnaires"]["after"]["title"] = "Después"
    updated = client.put(path, json={"revision": 1, "config": config})
    assert updated.status_code == 200
    payload = submission({**config, "questionnaires": {"before": config["questionnaires"]["after"]}}, 2)
    assert client.post(path + "/responses", json=payload).status_code == 422
    payload["phase"] = "after"
    captured = client.post(path + "/responses", json=payload)
    assert captured.status_code == 201
    assert captured.json()["questionnaire_snapshot"]["title"] == "Después"
    app.dependency_overrides.pop(get_current_user)
    assert client.get(path).status_code in (401, 403)


@pytest.mark.parametrize("alter", ["duplicate_participant", "duplicate_code", "blank_name", "duplicate_question", "invalid_options", "enabled_empty", "negative_screen", "invalid_age"])
def test_invalid_configuration_is_rejected_on_create(storage, alter):
    client, _engine, _app, _owner = storage
    config = configuration()
    if alter == "duplicate_participant":
        config["participants"] *= 2
    elif alter == "duplicate_code":
        duplicate = deepcopy(config["participants"][0])
        duplicate["id"] = str(uuid4())
        config["participants"].append(duplicate)
    elif alter == "blank_name":
        config["participants"][0]["name"] = " "
    elif alter == "duplicate_question":
        config["questionnaires"]["before"]["questions"] *= 2
    elif alter == "invalid_options":
        config["questionnaires"]["before"]["questions"][2]["options"] = []
    elif alter == "enabled_empty":
        config["questionnaires"]["before"]["questions"] = []
    elif alter == "negative_screen":
        config["screen"]["width_cm"] = -1
    elif alter == "invalid_age":
        config["participants"][0]["age"] = -1
    assert client.post("/api/projects/", json={"name": "Invalid", "pre_experiment": config}).status_code == 422


def test_migration_upgrade_preserves_existing_projects_and_downgrade(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'migration.sqlite'}")
    metadata = MetaData()
    projects = Table("projects", metadata, Column("id", Uuid(), primary_key=True))
    metadata.create_all(engine)
    project_id = uuid4()
    filename = Path(__file__).parents[2] / "migrations" / "versions" / "026_add_pre_experiment.py"
    spec = importlib.util.spec_from_file_location("planning_migration", filename)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        connection.execute(projects.insert().values(id=project_id))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("projects")}
        assert {"pre_experiment", "pre_experiment_revision"} <= columns
        assert connection.exec_driver_sql("SELECT pre_experiment_revision FROM projects").scalar_one() == 0
        assert "pre_experiment_responses" in inspect(connection).get_table_names()
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert [column["name"] for column in inspect(connection).get_columns("projects")] == ["id"]
        assert connection.execute(select(projects.c.id)).scalar_one() == project_id
    engine.dispose()


def test_planning_flag_preserves_acquisition_identity():
    project = Project(pre_experiment={}, ingestion_generation=0)
    assert planning_summary(project)["is_pre_experiment"]
    project.ingestion_generation = 1
    assert not planning_summary(project)["is_pre_experiment"]

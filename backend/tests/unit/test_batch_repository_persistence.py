from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError, MultipleResultsFound
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateTable

from neurodatics.infra.db.base import Base
from neurodatics.modules.participants.api import routes as participant_routes
from neurodatics.modules.participants.api.schemas import UpdateParticipantsRequest
from neurodatics.modules.participants.domain.entities import Participant, Sex
from neurodatics.modules.participants.infrastructure.repository_impl import (
    SQLParticipantRepository,
)
from neurodatics.modules.projects.domain.entities import Project, ProjectFile
from neurodatics.modules.scenaries.api import routes as scenary_routes
from neurodatics.modules.scenaries.api.schemas import UpdateAOIsRequest
from neurodatics.modules.scenaries.domain.entities import AOI, Scenaries
from neurodatics.modules.scenaries.infrastructure.repository_impl import (
    SQLscenariesRepository,
)


class SyncSessionAdapter:
    """Minimal async facade over an isolated synchronous SQLAlchemy session."""

    def __init__(self, session: Session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    def add(self, instance: object) -> None:
        self.session.add(instance)

    async def delete(self, instance: object) -> None:
        self.session.delete(instance)

    async def flush(self) -> None:
        self.session.flush()

    async def commit(self) -> None:
        self.session.commit()

    async def rollback(self) -> None:
        self.session.rollback()


@pytest.fixture
def database():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    tables = [
        Project.__table__,
        ProjectFile.__table__,
        Participant.__table__,
        Scenaries.__table__,
        AOI.__table__,
    ]
    Base.metadata.create_all(engine, tables=tables)
    factory = sessionmaker(engine, expire_on_commit=False)
    try:
        yield engine, factory
    finally:
        Base.metadata.drop_all(engine, tables=reversed(tables))
        engine.dispose()


@contextmanager
def count_selects(engine) -> Iterator[list[str]]:
    statements: list[str] = []

    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", capture)


def add_project(session: Session):
    project = Project(id=uuid4(), owner_id=uuid4(), name="Project")
    session.add(project)
    session.flush()
    return project


def add_scenario(session: Session, project: Project, name: str):
    scenario = Scenaries(id=uuid4(), project_id=project.id, name=name, type="image")
    session.add(scenario)
    session.flush()
    return scenario


def aoi_payload(scenario: str, name: str, *, color: str = "#112233"):
    return {
        "scenaries_name": scenario,
        "name": name,
        "color": color,
        "shape_type": "rect",
        "shape": {"x": 1, "y": 2, "width": 3, "height": 4},
    }


@pytest.mark.asyncio
async def test_participant_batch_preserves_order_duplicates_updates_and_project_scope(
    database,
):
    engine, factory = database
    with factory() as session:
        project = add_project(session)
        other_project = add_project(session)
        session.add_all(
            [
                Participant(
                    project_id=project.id,
                    participant_code="existing",
                    age=30,
                    sex=Sex.MALE,
                ),
                Participant(
                    project_id=other_project.id,
                    participant_code="existing",
                    age=60,
                    sex=Sex.FEMALE,
                ),
            ]
        )
        session.commit()

        payload = [
            {"participant_code": "new", "age": 20, "sex": "male"},
            {"participant_code": "existing", "age": 31, "sex": "other"},
            {"participant_code": "new", "age": 21, "sex": "female"},
        ]
        with count_selects(engine) as reads:
            result = await SQLParticipantRepository(
                SyncSessionAdapter(session)
            ).upsert_participants(project.id, payload)

        assert len(reads) == 2
        assert [item.participant_code for item in result] == [
            "new",
            "existing",
            "new",
        ]
        assert result[0] is result[2]
        assert (result[0].age, result[0].sex) == (21, Sex.FEMALE)
        assert (result[1].age, result[1].sex) == (31, Sex.OTHER)
        other = session.scalar(
            select(Participant).where(
                Participant.project_id == other_project.id,
                Participant.participant_code == "existing",
            )
        )
        assert (other.age, other.sex) == (60, Sex.FEMALE)


@pytest.mark.asyncio
async def test_participant_empty_batch_keeps_empty_response(database):
    engine, factory = database
    with factory() as session:
        project = add_project(session)
        session.commit()
        with count_selects(engine) as reads:
            result = await SQLParticipantRepository(
                SyncSessionAdapter(session)
            ).upsert_participants(project.id, [])
        assert result == []
        assert reads == []


@pytest.mark.asyncio
async def test_participant_requested_persisted_duplicate_keeps_prior_failure(database):
    _engine, factory = database
    with factory() as session:
        project = add_project(session)
        session.add_all(
            [
                Participant(project_id=project.id, participant_code="duplicate"),
                Participant(project_id=project.id, participant_code="duplicate"),
            ]
        )
        session.commit()

        with pytest.raises(MultipleResultsFound):
            await SQLParticipantRepository(
                SyncSessionAdapter(session)
            ).upsert_participants(
                project.id,
                [{"participant_code": "duplicate", "age": 22, "sex": "other"}],
            )


@pytest.mark.asyncio
async def test_aoi_batch_preserves_order_replaces_missing_and_isolates_projects(
    database,
):
    engine, factory = database
    with factory() as session:
        project = add_project(session)
        other_project = add_project(session)
        scenario = add_scenario(session, project, "A")
        other_scenario = add_scenario(session, other_project, "A")
        current = AOI(
            scenaries_id=scenario.id,
            name="current",
            color="#000000",
            shape_type="rect",
            shape={"x": 0, "y": 0, "width": 1, "height": 1},
        )
        obsolete = AOI(
            scenaries_id=scenario.id,
            name="obsolete",
            color="#000000",
            shape_type="rect",
            shape={"x": 0, "y": 0, "width": 1, "height": 1},
        )
        other = AOI(
            scenaries_id=other_scenario.id,
            name="other",
            color="#abcdef",
            shape_type="rect",
            shape={"x": 0, "y": 0, "width": 1, "height": 1},
        )
        session.add_all([current, obsolete, other])
        session.commit()

        payload = [
            aoi_payload("A", "new", color="#111111"),
            aoi_payload("A", "current", color="#222222"),
            aoi_payload("missing", "ignored"),
            aoi_payload("A", "new", color="#333333"),
        ]
        with count_selects(engine) as reads:
            result = await SQLscenariesRepository(
                SyncSessionAdapter(session)
            ).upsert_aois(project.id, payload)

        assert len(reads) == 3
        assert [item.name for item in result] == ["new", "current", "new"]
        assert result[0] is result[2]
        assert result[0].color == "#333333"
        assert result[1].color == "#222222"
        assert session.get(AOI, obsolete.id) is None
        assert session.get(AOI, other.id).color == "#abcdef"


@pytest.mark.asyncio
async def test_aoi_batch_assigns_each_new_aoi_to_its_scenario_when_last_input_is_invalid(
    database,
):
    _engine, factory = database
    with factory() as session:
        project = add_project(session)
        other_project = add_project(session)
        scenario_a = add_scenario(session, project, "A")
        scenario_b = add_scenario(session, project, "B")
        other_scenario = add_scenario(session, other_project, "A")
        other_aoi = AOI(
            scenaries_id=other_scenario.id,
            name="other-project",
            color="#abcdef",
            shape_type="rect",
            shape={},
        )
        session.add(other_aoi)
        session.commit()

        result = await SQLscenariesRepository(
            SyncSessionAdapter(session)
        ).upsert_aois(
            project.id,
            [
                aoi_payload("A", "first"),
                aoi_payload("B", "second"),
                aoi_payload("missing", "ignored"),
            ],
        )

        assert [(item.name, item.scenaries_id) for item in result] == [
            ("first", scenario_a.id),
            ("second", scenario_b.id),
        ]
        persisted = session.execute(
            select(AOI.name, AOI.scenaries_id)
            .join(Scenaries, AOI.scenaries_id == Scenaries.id)
            .where(Scenaries.project_id == project.id)
            .order_by(AOI.name)
        ).all()
        assert persisted == [
            ("first", scenario_a.id),
            ("second", scenario_b.id),
        ]
        session.expire_all()
        retained_other_aoi = session.get(AOI, other_aoi.id)
        assert (retained_other_aoi.name, retained_other_aoi.color) == (
            "other-project",
            "#abcdef",
        )


@pytest.mark.asyncio
async def test_aoi_empty_batch_deletes_project_aois_only(database):
    engine, factory = database
    with factory() as session:
        project = add_project(session)
        other_project = add_project(session)
        scenario = add_scenario(session, project, "A")
        other_scenario = add_scenario(session, other_project, "A")
        removed = AOI(
            scenaries_id=scenario.id,
            name="removed",
            color="#000000",
            shape_type="rect",
            shape={},
        )
        removed_duplicate = AOI(
            scenaries_id=scenario.id,
            name="removed",
            color="#111111",
            shape_type="rect",
            shape={},
        )
        retained = AOI(
            scenaries_id=other_scenario.id,
            name="retained",
            color="#000000",
            shape_type="rect",
            shape={},
        )
        session.add_all([removed, removed_duplicate, retained])
        session.commit()

        with count_selects(engine) as reads:
            result = await SQLscenariesRepository(
                SyncSessionAdapter(session)
            ).upsert_aois(project.id, [])

        assert len(reads) == 2
        assert result == []
        assert session.get(AOI, removed.id) is None
        assert session.get(AOI, removed_duplicate.id) is None
        assert session.get(AOI, retained.id) is retained


@pytest.mark.asyncio
async def test_aoi_requested_persisted_duplicate_keeps_prior_failure(database):
    _engine, factory = database
    with factory() as session:
        project = add_project(session)
        scenario = add_scenario(session, project, "A")
        session.add_all(
            [
                AOI(
                    scenaries_id=scenario.id,
                    name="duplicate",
                    color="#000000",
                    shape_type="rect",
                    shape={},
                ),
                AOI(
                    scenaries_id=scenario.id,
                    name="duplicate",
                    color="#111111",
                    shape_type="rect",
                    shape={},
                ),
            ]
        )
        session.commit()

        with pytest.raises(MultipleResultsFound):
            await SQLscenariesRepository(SyncSessionAdapter(session)).upsert_aois(
                project.id, [aoi_payload("A", "duplicate")]
            )


@pytest.mark.asyncio
async def test_aoi_constraint_failure_rolls_back_the_whole_replacement(database):
    _engine, factory = database
    with factory() as session:
        project = add_project(session)
        project_id = project.id
        scenario = add_scenario(session, project, "A")
        original = AOI(
            scenaries_id=scenario.id,
            name="original",
            color="#000000",
            shape_type="rect",
            shape={},
        )
        session.add(original)
        session.commit()
        adapter = SyncSessionAdapter(session)

        invalid = aoi_payload("A", "invalid")
        invalid["shape_type"] = "triangle"
        with pytest.raises(IntegrityError):
            await SQLscenariesRepository(adapter).upsert_aois(
                project.id,
                [aoi_payload("A", "valid"), invalid],
            )
        await adapter.rollback()

    with factory() as verification:
        names = verification.scalars(
            select(AOI.name)
            .join(Scenaries, AOI.scenaries_id == Scenaries.id)
            .where(Scenaries.project_id == project_id)
        ).all()
        assert names == ["original"]


@pytest.mark.asyncio
async def test_batch_reread_exposes_ids_defaults_with_expire_on_commit(database):
    engine, _factory = database
    expiring_factory = sessionmaker(engine, expire_on_commit=True)
    with expiring_factory() as session:
        project = add_project(session)
        scenario = add_scenario(session, project, "A")
        project_id = project.id
        scenario_id = scenario.id
        session.commit()
        adapter = SyncSessionAdapter(session)

        participants = await SQLParticipantRepository(adapter).upsert_participants(
            project_id,
            [{"participant_code": "P1", "age": 24, "sex": "female"}],
        )
        assert participants[0].id is not None
        assert participants[0].created_at is not None
        assert participants[0].updated_at is not None
        assert (participants[0].participant_code, participants[0].age) == ("P1", 24)

        aois = await SQLscenariesRepository(adapter).upsert_aois(
            project_id, [aoi_payload("A", "visible")]
        )
        assert aois[0].id is not None
        assert aois[0].scenaries_id == scenario_id
        assert aois[0].created_at is not None
        assert aois[0].updated_at is not None
        assert (aois[0].name, aois[0].color) == ("visible", "#112233")


def test_aoi_constraint_compiles_for_postgresql():
    ddl = str(CreateTable(AOI.__table__).compile(dialect=postgresql.dialect()))
    assert "CONSTRAINT aoi_shape_allowed" in ddl
    assert "shape_type IN ('rect', 'circle', 'polygon')" in ddl


@pytest.mark.asyncio
async def test_participant_route_keeps_response_contract_and_repository_order(
    monkeypatch,
):
    project_id = uuid4()

    class ProjectRepository:
        def __init__(self, _session):
            pass

        async def get_basic_by_id(self, requested_project_id, _owner_id):
            assert requested_project_id == project_id
            return object()

    class ParticipantRepository:
        def __init__(self, _session):
            pass

        async def upsert_participants(self, requested_project_id, payload):
            assert requested_project_id == project_id
            assert [item["participant_code"] for item in payload] == ["B", "A"]
            return [
                Participant(
                    project_id=project_id,
                    participant_code="B",
                    age=20,
                    sex=Sex.OTHER,
                ),
                Participant(
                    project_id=project_id,
                    participant_code="A",
                    age=None,
                    sex=None,
                ),
            ]

    monkeypatch.setattr(participant_routes, "SQLProjectRepository", ProjectRepository)
    monkeypatch.setattr(
        participant_routes, "SQLParticipantRepository", ParticipantRepository
    )
    request = UpdateParticipantsRequest.model_validate(
        {
            "participants": [
                {"participant_code": "B", "age": 20},
                {"participant_code": "A"},
            ]
        }
    )

    response = await participant_routes.update_participants(
        project_id, request, current_user=str(uuid4()), db=object()
    )

    # name/document were added later: unset name, and the code stands in as document.
    assert [item.model_dump() for item in response] == [
        {"participant_code": "B", "age": 20, "sex": "other", "name": None, "document": "B"},
        {"participant_code": "A", "age": None, "sex": None, "name": None, "document": "A"},
    ]


def test_participant_request_sends_labels_only_when_present():
    request = UpdateParticipantsRequest.model_validate(
        {
            "participants": [
                {"participant_code": "B", "name": "  Ana   María ", "document": " "},
                {"participant_code": "A"},
            ]
        }
    )
    first, second = request.participants
    assert (first.name, first.document) == ("Ana María", None)
    assert first.model_fields_set >= {"name", "document"}
    assert not {"name", "document"} & second.model_fields_set


@pytest.mark.asyncio
async def test_participant_upsert_stores_name_and_document_corrections(database):
    _engine, factory = database
    with factory() as session:
        project = add_project(session)
        session.add(
            Participant(
                project_id=project.id,
                participant_code="1033176186",
                name="Ana",
                document="1033176187",
            )
        )
        session.commit()
        repository = SQLParticipantRepository(SyncSessionAdapter(session))

        # A client that does not know the labels must not clear them.
        [kept] = await repository.upsert_participants(
            project.id, [{"participant_code": "1033176186", "age": 30, "sex": "female"}]
        )
        assert (kept.name, kept.document, kept.age) == ("Ana", "1033176187", 30)

        # Restoring the extracted value stores no correction; blank name clears it.
        [restored] = await repository.upsert_participants(
            project.id,
            [{"participant_code": "1033176186", "age": 30, "sex": "female",
              "name": None, "document": "1033176186"}],
        )
        assert (restored.name, restored.document) == (None, None)
        assert restored.effective_document == "1033176186"

        [created] = await repository.upsert_participants(
            project.id,
            [{"participant_code": "P2", "age": 22, "sex": "male",
              "name": "Luis", "document": "998877"}],
        )
        assert (created.name, created.document, created.effective_document) == (
            "Luis", "998877", "998877",
        )


@pytest.mark.asyncio
async def test_aoi_route_keeps_response_contract_and_repository_order(monkeypatch):
    project_id = uuid4()
    scenario_id = uuid4()

    class ProjectRepository:
        def __init__(self, _session):
            pass

        async def get_by_id(self, requested_project_id, _owner_id):
            assert requested_project_id == project_id
            return object()

    class ScenaryRepository:
        def __init__(self, _session):
            pass

        async def upsert_aois(self, requested_project_id, payload):
            assert requested_project_id == project_id
            assert [item["name"] for item in payload] == ["B", "A"]
            return [
                AOI(
                    id=uuid4(),
                    scenaries_id=scenario_id,
                    name=item["name"],
                    color=item["color"],
                    shape_type=item["shape_type"],
                    shape=item["shape"],
                )
                for item in payload
            ]

    monkeypatch.setattr(scenary_routes, "SQLProjectRepository", ProjectRepository)
    monkeypatch.setattr(scenary_routes, "SQLscenariesRepository", ScenaryRepository)
    request = UpdateAOIsRequest.model_validate(
        {"aois": [aoi_payload("Scenario", "B"), aoi_payload("Scenario", "A")]}
    )

    response = await scenary_routes.update_aois(
        project_id, request, current_user=str(uuid4()), db=object()
    )

    assert [item.name for item in response] == ["B", "A"]
    assert all(item.scenaries_id == scenario_id for item in response)

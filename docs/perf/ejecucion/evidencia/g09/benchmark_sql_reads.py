"""Count actual SQLite SELECTs for received and final G09 repositories."""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from neurodatics.infra.db.base import Base
from neurodatics.modules.participants.domain.entities import Participant
from neurodatics.modules.projects.domain.entities import Project, ProjectFile
from neurodatics.modules.scenaries.domain.entities import AOI, Scenaries
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
TABLES = [
    Project.__table__,
    ProjectFile.__table__,
    Participant.__table__,
    Scenaries.__table__,
    AOI.__table__,
]


class SyncSessionAdapter:
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

    async def refresh(self, instance: object) -> None:
        self.session.refresh(instance)


def load_received_class(relative_path: str, module_name: str, class_name: str):
    path = REPOSITORY_ROOT / "output" / "perf-g09" / "base" / relative_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load received implementation from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, class_name)


def repository_classes(implementation: str):
    if implementation == "before":
        participant_class = load_received_class(
            "backend/src/neurodatics/modules/participants/infrastructure/repository_impl.py",
            "neurodatics.modules.participants.infrastructure.repository_impl_g09_before",
            "SQLParticipantRepository",
        )
        scenary_class = load_received_class(
            "backend/src/neurodatics/modules/scenaries/infrastructure/repository_impl.py",
            "neurodatics.modules.scenaries.infrastructure.repository_impl_g09_before",
            "SQLscenariesRepository",
        )
        return participant_class, scenary_class

    from neurodatics.modules.participants.infrastructure.repository_impl import (
        SQLParticipantRepository,
    )
    from neurodatics.modules.scenaries.infrastructure.repository_impl import (
        SQLscenariesRepository,
    )

    return SQLParticipantRepository, SQLscenariesRepository


@contextmanager
def count_selects(engine):
    statements: list[str] = []

    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", capture)


def database():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=TABLES)
    return engine, sessionmaker(engine, expire_on_commit=False)


async def participant_case(repository_class, size: int) -> dict[str, object]:
    engine, factory = database()
    try:
        with factory() as session:
            project = Project(id=uuid4(), owner_id=uuid4(), name="Project")
            session.add(project)
            session.commit()
            payload = [
                {
                    "participant_code": f"P{index:04d}",
                    "age": 20 + index % 50,
                    "sex": "other",
                }
                for index in range(size)
            ]
            with count_selects(engine) as selects:
                records = await repository_class(
                    SyncSessionAdapter(session)
                ).upsert_participants(project.id, payload)
            return {
                "size": size,
                "selects": len(selects),
                "returned": len(records),
                "order_ok": [record.participant_code for record in records]
                == [item["participant_code"] for item in payload],
            }
    finally:
        engine.dispose()


async def aoi_case(repository_class, size: int) -> dict[str, object]:
    engine, factory = database()
    try:
        with factory() as session:
            project = Project(id=uuid4(), owner_id=uuid4(), name="Project")
            scenario = Scenaries(
                id=uuid4(), project_id=project.id, name="Scenario", type="image"
            )
            session.add_all([project, scenario])
            session.commit()
            payload = [
                {
                    "scenaries_name": "Scenario",
                    "name": f"AOI-{index:04d}",
                    "color": "#112233",
                    "shape_type": "rect",
                    "shape": {"x": index, "y": 0, "width": 1, "height": 1},
                }
                for index in range(size)
            ]
            with count_selects(engine) as selects:
                records = await repository_class(
                    SyncSessionAdapter(session)
                ).upsert_aois(project.id, payload)
            return {
                "size": size,
                "selects": len(selects),
                "returned": len(records),
                "order_ok": [record.name for record in records]
                == [item["name"] for item in payload],
            }
    finally:
        engine.dispose()


async def main(implementation: str) -> None:
    participant_class, scenary_class = repository_classes(implementation)
    sizes = (10, 100, 1000)
    result = {
        "implementation": implementation,
        "engine": f"SQLite {sqlite3.sqlite_version} in-memory, fresh database per case",
        "counter": "SQLAlchemy before_cursor_execute; statements beginning SELECT",
        "participants": [
            await participant_case(participant_class, size) for size in sizes
        ],
        "aois": [await aoi_case(scenary_class, size) for size in sizes],
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--implementation", choices=("before", "after"), required=True)
    arguments = parser.parse_args()
    asyncio.run(main(arguments.implementation))

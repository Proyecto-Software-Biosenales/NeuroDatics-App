"""Deterministic read-count probe for the G09 repository batch paths."""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from uuid import uuid4

from neurodatics.modules.participants.infrastructure.repository_impl import (
    SQLParticipantRepository,
)
from neurodatics.modules.projects.domain.entities import (  # noqa: F401
    Project,
    ProjectFile,
)
from neurodatics.modules.scenaries.domain.entities import Scenaries
from neurodatics.modules.scenaries.infrastructure.repository_impl import (
    SQLscenariesRepository,
)


class ProbeResult:
    def __init__(self, rows: list[object]):
        self.rows = rows

    def scalars(self) -> ProbeResult:
        return self

    def all(self) -> list[object]:
        return list(self.rows)

    def scalar_one_or_none(self) -> object | None:
        if len(self.rows) > 1:
            raise AssertionError("probe unexpectedly produced multiple scalar rows")
        return self.rows[0] if self.rows else None


@dataclass
class ProbeSession:
    scenarios: list[Scenaries]

    def __post_init__(self) -> None:
        self.added: list[object] = []
        self.deleted: list[object] = []
        self.selects = 0
        self.refreshes = 0
        self.committed = False

    async def execute(self, statement):
        self.selects += 1
        entity = statement.column_descriptions[0].get("entity")
        if entity is Scenaries:
            return ProbeResult(self.scenarios)
        rows = (
            [item for item in self.added if isinstance(item, entity)]
            if self.committed
            else []
        )
        return ProbeResult(rows)

    def add(self, instance: object) -> None:
        self.added.append(instance)

    async def delete(self, instance: object) -> None:
        self.deleted.append(instance)

    async def flush(self) -> None:
        for item in self.added:
            if getattr(item, "id", None) is None:
                item.id = uuid4()

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _instance: object) -> None:
        self.refreshes += 1

    @property
    def reads(self) -> int:
        return self.selects + self.refreshes


async def participant_case(size: int) -> dict[str, object]:
    project_id = uuid4()
    session = ProbeSession([])
    payload = [
        {"participant_code": f"P{index:04d}", "age": 20 + index % 50, "sex": "other"}
        for index in range(size)
    ]
    records = await SQLParticipantRepository(session).upsert_participants(
        project_id, payload
    )
    return {
        "size": size,
        "selects": session.selects,
        "refreshes": session.refreshes,
        "reads": session.reads,
        "returned": len(records),
        "order_ok": [record.participant_code for record in records]
        == [item["participant_code"] for item in payload],
    }


async def aoi_case(size: int) -> dict[str, object]:
    project_id = uuid4()
    scenario = Scenaries(
        id=uuid4(), project_id=project_id, name="Scenario", type="image"
    )
    session = ProbeSession([scenario])
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
    records = await SQLscenariesRepository(session).upsert_aois(project_id, payload)
    return {
        "size": size,
        "selects": session.selects,
        "refreshes": session.refreshes,
        "reads": session.reads,
        "returned": len(records),
        "deleted": len(session.deleted),
        "order_ok": [record.name for record in records]
        == [item["name"] for item in payload],
    }


async def main(label: str) -> None:
    sizes = (10, 100, 1000)
    payload = {
        "label": label,
        "method": "SQLAlchemy repository methods with a deterministic AsyncSession probe; "
        "execute(SELECT) and refresh are counted as SQL reads",
        "participants": [await participant_case(size) for size in sizes],
        "aois": [await aoi_case(size) for size in sizes],
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    args = parser.parse_args()
    asyncio.run(main(args.label))

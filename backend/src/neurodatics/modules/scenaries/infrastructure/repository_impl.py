from typing import List
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..domain.entities import AOI, Scenaries
from ..domain.repository import scenariesRepository


class SQLscenariesRepository(scenariesRepository):
    """SQLAlchemy implementation of scenariesRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_scenaries(self, project_id: UUID, scenaries_data: List[dict]) -> List[Scenaries]:
        records: List[Scenaries] = []

        for data in scenaries_data:
            name = data["name"]
            scenary_type = data["type"]

            stmt = select(Scenaries).where(
                Scenaries.project_id == project_id,
                Scenaries.name == name,
            )
            result = await self.session.execute(stmt)
            scenary = result.scalar_one_or_none()

            if scenary:
                scenary.type = scenary_type
                scenary.file_id = data.get("file_id")
                scenary.source_entry_path = data.get("source_entry_path")
                scenary.width = data.get("width")
                scenary.height = data.get("height")
                scenary.fps = data.get("fps")
                scenary.duration_ms = data.get("duration_ms")
            else:
                scenary = Scenaries(
                    project_id=project_id,
                    name=name,
                    type=scenary_type,
                    file_id=data.get("file_id"),
                    source_entry_path=data.get("source_entry_path"),
                    width=data.get("width"),
                    height=data.get("height"),
                    fps=data.get("fps"),
                    duration_ms=data.get("duration_ms"),
                )
                self.session.add(scenary)

            records.append(scenary)

        await self.session.commit()
        for scenary in records:
            await self.session.refresh(scenary)

        return records

    async def upsert_aois(self, project_id: UUID, aois_data: List[dict]) -> List[AOI]:
        records: List[AOI] = []

        stmt = select(Scenaries).where(Scenaries.project_id == project_id)
        result = await self.session.execute(stmt)
        scenaries_map = {sc.name: sc.id for sc in result.scalars().all()}
        incoming_keys = set()

        for data in aois_data:
            scenary_name = data["scenaries_name"]
            scenary_id = scenaries_map.get(scenary_name)
            if not scenary_id:
                continue

            incoming_keys.add((scenary_id, data["name"]))

            stmt = select(AOI).where(
                AOI.scenaries_id == scenary_id,
                AOI.name == data["name"],
            )
            result = await self.session.execute(stmt)
            aoi = result.scalar_one_or_none()

            if aoi:
                aoi.color = data["color"]
                aoi.shape_type = data["shape_type"]
                aoi.shape = data["shape"]
            else:
                aoi = AOI(
                    scenaries_id=scenary_id,
                    name=data["name"],
                    color=data["color"],
                    shape_type=data["shape_type"],
                    shape=data["shape"],
                )
                self.session.add(aoi)

            records.append(aoi)

        existing_stmt = (
            select(AOI)
            .join(Scenaries, AOI.scenaries_id == Scenaries.id)
            .where(Scenaries.project_id == project_id)
        )
        existing_result = await self.session.execute(existing_stmt)
        for existing_aoi in existing_result.scalars().all():
            if (existing_aoi.scenaries_id, existing_aoi.name) not in incoming_keys:
                await self.session.delete(existing_aoi)

        await self.session.commit()
        for aoi in records:
            await self.session.refresh(aoi)

        return records

    async def get_by_project(self, project_id: UUID) -> List[Scenaries]:
        stmt = (
            select(Scenaries)
            .options(selectinload(Scenaries.aois))
            .where(Scenaries.project_id == project_id)
            .order_by(Scenaries.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

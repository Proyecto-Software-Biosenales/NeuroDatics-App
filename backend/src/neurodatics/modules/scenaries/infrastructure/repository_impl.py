from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...projects.domain.entities import ProjectFile
from ..domain.entities import AOI, Scenaries, StimulusPlacement
from ..domain.repository import scenariesRepository
from ..domain.stimulus_placement import (
    StimulusPlacementContract,
    StimulusPlacementRequiresReprocessing,
)


class SQLscenariesRepository(scenariesRepository):
    """SQLAlchemy implementation of scenariesRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_scenaries(
        self, project_id: UUID, scenaries_data: List[dict]
    ) -> List[Scenaries]:
        if not scenaries_data:
            return []

        names = [data["name"] for data in scenaries_data]
        stmt = (
            select(Scenaries)
            .options(selectinload(Scenaries.stimulus_placement))
            .where(
                Scenaries.project_id == project_id,
                Scenaries.name.in_(names),
            )
        )
        result = await self.session.execute(stmt)
        existing_by_name = {scenary.name: scenary for scenary in result.scalars().all()}
        has_processed_artifacts = await self._has_processed_parquets(project_id)

        # Validate every placement and all reprocessing guards before mutating
        # ORM state. A failing item therefore cannot partially update the batch.
        prepared: List[
            Tuple[
                Dict[str, Any],
                Optional[Scenaries],
                Optional[StimulusPlacementContract],
                bool,
                bool,
            ]
        ] = []
        for raw_data in scenaries_data:
            data = dict(raw_data)
            existing = existing_by_name.get(data["name"])
            identity_changed = self._media_identity_changed(existing, data)
            if has_processed_artifacts and (existing is None or identity_changed):
                raise StimulusPlacementRequiresReprocessing(
                    "processed scenario media or placement can change only through "
                    "full reprocessing"
                )

            placement_supplied = "stimulus_placement" in data
            contract = (
                self._prepare_contract(data, existing)
                if placement_supplied and data["stimulus_placement"] is not None
                else None
            )
            placement_changed = self._placement_changed(
                existing, placement_supplied, contract
            )

            if has_processed_artifacts and placement_changed:
                raise StimulusPlacementRequiresReprocessing(
                    "processed scenario media or placement can change only through "
                    "full reprocessing"
                )

            prepared.append(
                (data, existing, contract, placement_supplied, identity_changed)
            )

        records: List[Scenaries] = []
        mutable_fields = (
            "name",
            "type",
            "file_id",
            "source_entry_path",
            "width",
            "height",
            "fps",
            "duration_ms",
        )
        for data, scenary, contract, placement_supplied, identity_changed in prepared:
            if scenary is None:
                scenary = Scenaries(project_id=project_id)
                self.session.add(scenary)

            for field in mutable_fields:
                if field in data:
                    setattr(scenary, field, data[field])

            if placement_supplied:
                if contract is None:
                    scenary.stimulus_placement = None
                elif scenary.stimulus_placement is None:
                    scenary.stimulus_placement = StimulusPlacement.from_contract(
                        contract
                    )
                else:
                    scenary.stimulus_placement.apply_contract(contract)
            elif identity_changed:
                # Geometry belongs to a concrete media identity. Never retain
                # it when that media is replaced without replacement geometry.
                scenary.stimulus_placement = None

            records.append(scenary)

        await self.session.commit()

        # Async response serialization must never trigger a lazy relationship
        # load. Re-read both children after commit and preserve request order.
        loaded_stmt = (
            select(Scenaries)
            .options(
                selectinload(Scenaries.aois),
                selectinload(Scenaries.stimulus_placement),
            )
            .where(
                Scenaries.project_id == project_id,
                Scenaries.name.in_(names),
            )
        )
        loaded_result = await self.session.execute(loaded_stmt)
        loaded_by_name = {
            scenary.name: scenary for scenary in loaded_result.scalars().all()
        }
        return [loaded_by_name[name] for name in names]

    async def _has_processed_parquets(self, project_id: UUID) -> bool:
        stmt = (
            select(ProjectFile.id)
            .where(
                ProjectFile.project_id == project_id,
                ProjectFile.kind == "processed_parquet",
                ProjectFile.deleted_at.is_(None),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    @staticmethod
    def _media_identity_changed(
        existing: Optional[Scenaries], data: Dict[str, Any]
    ) -> bool:
        if existing is None:
            return True
        next_file_id = data["file_id"] if "file_id" in data else existing.file_id
        next_source_path = (
            data["source_entry_path"]
            if "source_entry_path" in data
            else existing.source_entry_path
        )
        return (next_file_id, next_source_path) != (
            existing.file_id,
            existing.source_entry_path,
        )

    @staticmethod
    def _prepare_contract(
        data: Dict[str, Any],
        existing: Optional[Scenaries],
    ) -> StimulusPlacementContract:
        raw_placement = data["stimulus_placement"]
        if isinstance(raw_placement, StimulusPlacementContract):
            return raw_placement
        if hasattr(raw_placement, "model_dump"):
            raw_placement = raw_placement.model_dump(exclude_unset=True)

        placement_payload = dict(raw_placement)
        source = placement_payload.get("source", "user_config")
        intrinsic_width = data.get("width", existing.width if existing else None)
        intrinsic_height = data.get("height", existing.height if existing else None)
        return StimulusPlacementContract.from_dict(
            placement_payload,
            intrinsic_width=intrinsic_width,
            intrinsic_height=intrinsic_height,
            source=source,
        )

    @staticmethod
    def _placement_changed(
        existing: Optional[Scenaries],
        placement_supplied: bool,
        contract: Optional[StimulusPlacementContract],
    ) -> bool:
        if not placement_supplied:
            return False
        current = existing.stimulus_placement if existing else None
        if contract is None:
            return current is not None
        return current is None or current.contract_fingerprint != contract.fingerprint

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
            .options(
                selectinload(Scenaries.aois),
                selectinload(Scenaries.stimulus_placement),
            )
            .where(Scenaries.project_id == project_id)
            .order_by(Scenaries.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

import logging
from typing import List
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....api.deps import get_current_user, get_db
from ...participants.domain.entities import Participant
from ...projects.domain.entities import Project
from ...scenaries.domain.entities import Scenaries
from ..application.services.analytics_service import PupilAnalyticsService
from ..application.services.parquet_reader_service import ParquetReaderService
from ..infrastructure.redis_cache import AnalyticsRedisCache
from .schemas import (
    GazeAtResponse,
    ParticipantItem,
    PupilStatisticsResponse,
    PupilTimeseriesResponse,
    ScenarioItem,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects/{project_id}/analytics", tags=["analytics"])
_redis = AnalyticsRedisCache()


async def _verify_ownership(db: AsyncSession, project_id: UUID, current_user: str) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == UUID(current_user))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/participants", response_model=List[ParticipantItem])
async def list_participants(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)
    result = await db.execute(
        select(Participant).where(Participant.project_id == project_id).order_by(Participant.id)
    )
    participants = result.scalars().all()

    return [
        ParticipantItem(participant_code=participant.participant_code, user_index=index)
        for index, participant in enumerate(participants, start=1)
    ]


@router.get("/scenarios", response_model=List[ScenarioItem])
async def list_scenarios(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)
    result = await db.execute(select(Scenaries).where(Scenaries.project_id == project_id))
    scenarios = result.scalars().all()

    return [
        ScenarioItem(
            name=scenario.name,
            type=scenario.type,
            file_id=str(scenario.file_id) if scenario.file_id else None,
        )
        for scenario in scenarios
    ]


@router.get("/timeseries/pupil", response_model=PupilTimeseriesResponse)
async def pupil_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "timeseries_pupil", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return PupilTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_timeseries(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return PupilTimeseriesResponse(**result_data)


@router.get("/statistics/pupil", response_model=PupilStatisticsResponse)
async def pupil_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "statistics_pupil", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return PupilStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_statistics(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return PupilStatisticsResponse(**result_data)


@router.get("/gaze-at", response_model=GazeAtResponse)
async def gaze_at(
    project_id: UUID,
    participant_code: str = Query(...),
    t_s: float = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    rounded_t = round(t_s, 1)
    cache_key = _redis.build_key(project_id, participant_code, "gaze_at", str(rounded_t))
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeAtResponse(**cached)

    reader = ParquetReaderService(db)
    df = await reader.read_from_cache_only(project_id, participant_code)

    if df is None:
        try:
            df = await reader.read(project_id, participant_code)
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    gaze_data = await anyio.to_thread.run_sync(lambda: PupilAnalyticsService.find_gaze_at(df, t_s))

    scenario_name = gaze_data.get("scenario")
    scenario_file_id = None
    if scenario_name:
        result = await db.execute(
            select(Scenaries).where(
                Scenaries.project_id == project_id,
                Scenaries.name == scenario_name,
            )
        )
        scenary = result.scalar_one_or_none()
        if scenary and scenary.file_id:
            scenario_file_id = str(scenary.file_id)

    response_data = {
        **gaze_data,
        "scenario_file_id": scenario_file_id,
    }

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, response_data))
    return GazeAtResponse(**response_data)

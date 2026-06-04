import logging
from typing import List, Optional
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ....api.deps import get_current_user, get_db
from ...participants.domain.entities import Participant
from ...projects.domain.entities import Project
from ...scenaries.domain.entities import Scenaries
from ..application.services.analytics_service import (
    AoiAnalyticsService,
    EegAnalyticsService,
    FixationDataService,
    FixationHistogramService,
    GsrAnalyticsService,
    HeatmapAnalyticsService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
)
from ..application.services.parquet_reader_service import ParquetReaderService
from ..infrastructure.redis_cache import AnalyticsRedisCache
from .schemas import (
    AoiMetricsResponse,
    DistanceStatisticsResponse,
    DistanceTimeseriesResponse,
    EegPsdResponse,
    EegSpectrogramResponse,
    EegTopographyResponse,
    EegTimeseriesResponse,
    FixationDataResponse,
    FixationHistogramResponse,
    GazeAtResponse,
    GazeStatisticsResponse,
    GazeTimeseriesResponse,
    GsrStatisticsResponse,
    GsrTimeseriesResponse,
    ParticipantItem,
    PupilStatisticsResponse,
    PupilTimeseriesResponse,
    ScanpathResponse,
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


async def _resolve_scenary_for_analytics(
    db: AsyncSession,
    project_id: UUID,
    scenario: str,
    include_aois: bool = False,
) -> Optional[Scenaries]:
    from pathlib import Path as _Path

    options = [selectinload(Scenaries.aois)] if include_aois else []
    result = await db.execute(
        select(Scenaries)
        .options(*options)
        .where(
            Scenaries.project_id == project_id,
            Scenaries.name == scenario,
        )
    )
    scenary = result.scalar_one_or_none()
    if scenary is not None:
        return scenary

    all_result = await db.execute(
        select(Scenaries)
        .options(*options)
        .where(Scenaries.project_id == project_id)
    )
    all_scenarios = all_result.scalars().all()

    def _norm(name: str) -> str:
        return _Path(str(name).strip()).stem.lower().replace(" ", "")

    target_stem = _norm(scenario)
    for candidate in all_scenarios:
        if candidate.file_id and str(candidate.file_id) == str(scenario):
            return candidate
        if _norm(candidate.name) == target_stem:
            return candidate

    return None


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
    cache_key = _redis.build_key(project_id, participant_code, "gaze_at_v2", str(rounded_t))
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

    from pathlib import Path as _Path

    scenario_name = gaze_data.get("scenario")
    scenario_file_id = None
    scenario_type = None
    if scenario_name:
        # Tier 1: exact match
        result = await db.execute(
            select(Scenaries).where(
                Scenaries.project_id == project_id,
                Scenaries.name == scenario_name,
            )
        )
        scenary = result.scalar_one_or_none()

        # Tier 2: normalized match (case-insensitive stem, spaces removed)
        # Handles variants like "Instruction1" vs "Instruction 1"
        if scenary is None:
            all_result = await db.execute(
                select(Scenaries).where(Scenaries.project_id == project_id)
            )
            all_scenarios = all_result.scalars().all()

            def _norm(name: str) -> str:
                return _Path(str(name).strip()).stem.lower().replace(" ", "")

            target_stem = _norm(scenario_name)
            for s in all_scenarios:
                if _norm(s.name) == target_stem:
                    scenary = s
                    logger.info(
                        "Scenario name normalized: parquet=%r -> db=%r",
                        scenario_name,
                        s.name,
                    )
                    break

        if scenary:
            scenario_type = scenary.type
            if scenary.file_id:
                scenario_file_id = str(scenary.file_id)
        elif scenary is None:
            logger.warning(
                "No scenario found for name=%r in project_id=%s",
                scenario_name,
                project_id,
            )

    scenario_time_s = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_scenario_relative_time(
            df,
            scenario_name,
            gaze_data.get("nearest_time_s"),
        )
    )

    response_data = {
        **gaze_data,
        "scenario_file_id": scenario_file_id,
        "scenario_type": scenario_type,
        "scenario_time_s": scenario_time_s,
    }

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, response_data))
    return GazeAtResponse(**response_data)


@router.get("/timeseries/gaze", response_model=GazeTimeseriesResponse)
async def gaze_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "timeseries_gaze", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_gaze_timeseries(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GazeTimeseriesResponse(**result_data)


@router.get("/statistics/gaze", response_model=GazeStatisticsResponse)
async def gaze_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "statistics_gaze", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_gaze_statistics(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GazeStatisticsResponse(**result_data)


@router.get("/timeseries/distance", response_model=DistanceTimeseriesResponse)
async def distance_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "timeseries_distance", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return DistanceTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_distance_timeseries(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return DistanceTimeseriesResponse(**result_data)


@router.get("/statistics/distance", response_model=DistanceStatisticsResponse)
async def distance_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "statistics_distance", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return DistanceStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_distance_statistics(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return DistanceStatisticsResponse(**result_data)


@router.get("/timeseries/gsr", response_model=GsrTimeseriesResponse)
async def gsr_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "timeseries_gsr", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GsrTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: GsrAnalyticsService.compute_timeseries(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GsrTimeseriesResponse(**result_data)


@router.get("/statistics/gsr", response_model=GsrStatisticsResponse)
async def gsr_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "statistics_gsr", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GsrStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: GsrAnalyticsService.compute_statistics(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GsrStatisticsResponse(**result_data)


@router.get("/timeseries/eeg", response_model=EegTimeseriesResponse)
async def eeg_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    channels: str = Query(default=""),
    smooth_window_s: float = Query(default=0.2, ge=0.0, le=5.0),
    max_points: int = Query(default=5000, ge=1, le=100000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    cache_endpoint = f"timeseries_eeg:{channels_key}:{smooth_window_s}:{max_points}"
    cache_key = _redis.build_key(project_id, participant_code, cache_endpoint, scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: EegAnalyticsService.compute_timeseries(
            df,
            scenario=scenario,
            channels=requested_channels,
            smooth_window_s=smooth_window_s,
            max_points=max_points,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return EegTimeseriesResponse(**result_data)


@router.get("/psd/eeg", response_model=EegPsdResponse)
async def eeg_psd(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    channels: str = Query(default=""),
    max_freq_hz: Optional[float] = Query(default=None, gt=0.0),
    use_db: bool = Query(default=True),
    max_points: int = Query(default=5000, ge=1, le=100000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    max_freq_key = "auto" if max_freq_hz is None else f"{float(max_freq_hz):g}"
    scale_key = "db" if use_db else "linear"
    cache_endpoint = f"psd_eeg:{channels_key}:{max_freq_key}:{scale_key}:{max_points}"
    cache_key = _redis.build_key(project_id, participant_code, cache_endpoint, scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegPsdResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: EegAnalyticsService.compute_psd(
            df,
            scenario=scenario,
            channels=requested_channels,
            max_freq_hz=max_freq_hz,
            use_db=use_db,
            max_points=max_points,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return EegPsdResponse(**result_data)


@router.get("/spectrogram/eeg", response_model=EegSpectrogramResponse)
async def eeg_spectrogram(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    channels: str = Query(default=""),
    max_freq_hz: Optional[float] = Query(default=25.0, gt=0.0),
    use_db: bool = Query(default=True),
    normalize: str = Query(
        default="freq_demean",
        pattern="^(none|freq_demean|freq_zscore)$",
    ),
    window_s: float = Query(default=1.5, gt=0.0, le=10.0),
    overlap_ratio: float = Query(default=0.75, ge=0.0, lt=1.0),
    smooth_sigma: float = Query(default=0.8, ge=0.0, le=5.0),
    clip_low_percentile: float = Query(default=2.0, ge=0.0, le=100.0),
    clip_high_percentile: float = Query(default=98.0, ge=0.0, le=100.0),
    max_time_bins: int = Query(default=600, ge=1, le=5000),
    max_frequency_bins: int = Query(default=256, ge=1, le=2048),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    max_freq_key = "auto" if max_freq_hz is None else f"{float(max_freq_hz):g}"
    scale_key = "db" if use_db else "linear"
    cache_endpoint = (
        "spectrogram_eeg:"
        f"{channels_key}:{max_freq_key}:{scale_key}:{normalize}:"
        f"{window_s}:{overlap_ratio}:{smooth_sigma}:"
        f"{clip_low_percentile}:{clip_high_percentile}:"
        f"{max_time_bins}:{max_frequency_bins}"
    )
    cache_key = _redis.build_key(project_id, participant_code, cache_endpoint, scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegSpectrogramResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: EegAnalyticsService.compute_spectrogram(
            df,
            scenario=scenario,
            channels=requested_channels,
            max_freq_hz=max_freq_hz,
            use_db=use_db,
            normalize=normalize,
            window_s=window_s,
            overlap_ratio=overlap_ratio,
            smooth_sigma=smooth_sigma,
            clip_low_percentile=clip_low_percentile,
            clip_high_percentile=clip_high_percentile,
            max_time_bins=max_time_bins,
            max_frequency_bins=max_frequency_bins,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return EegSpectrogramResponse(**result_data)


@router.get("/topography/eeg", response_model=EegTopographyResponse)
async def eeg_topography(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    channels: str = Query(default=""),
    window_s: float = Query(default=2.0, gt=0.0, le=10.0),
    overlap_ratio: float = Query(default=0.5, ge=0.0, lt=1.0),
    remove_dc: bool = Query(default=True),
    max_frames: int = Query(default=600, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    dc_key = "dc_removed" if remove_dc else "raw"
    cache_endpoint = (
        "topography_eeg:"
        f"{channels_key}:{window_s}:{overlap_ratio}:{dc_key}:{max_frames}"
    )
    cache_key = _redis.build_key(project_id, participant_code, cache_endpoint, scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegTopographyResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: EegAnalyticsService.compute_topography(
            df,
            scenario=scenario,
            channels=requested_channels,
            window_s=window_s,
            overlap_ratio=overlap_ratio,
            remove_dc=remove_dc,
            max_frames=max_frames,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return EegTopographyResponse(**result_data)


@router.get("/scanpath", response_model=ScanpathResponse)
async def scanpath(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "scanpath", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return ScanpathResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: ScanpathAnalyticsService.compute_scanpath(df, scenario)
    )

    # Resolve scenario file_id (same two-tier matching as gaze_at)
    from pathlib import Path as _Path

    scenario_file_id = None
    if scenario and scenario != "all":
        result = await db.execute(
            select(Scenaries).where(
                Scenaries.project_id == project_id,
                Scenaries.name == scenario,
            )
        )
        scenary = result.scalar_one_or_none()

        if scenary is None:
            all_result = await db.execute(
                select(Scenaries).where(Scenaries.project_id == project_id)
            )
            all_scenarios = all_result.scalars().all()

            def _norm(name: str) -> str:
                return _Path(str(name).strip()).stem.lower().replace(" ", "")

            target_stem = _norm(scenario)
            for s in all_scenarios:
                if _norm(s.name) == target_stem:
                    scenary = s
                    break

        if scenary and scenary.file_id:
            scenario_file_id = str(scenary.file_id)

    response_data = {**result_data, "scenario_file_id": scenario_file_id}
    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, response_data))
    return ScanpathResponse(**response_data)


@router.get("/fixations", response_model=FixationDataResponse)
async def fixation_data(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if not scenario or scenario == "all":
        raise HTTPException(status_code=400, detail="scenario must be specified")
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "fixations", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return FixationDataResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: FixationDataService.compute_fixation_data(df, scenario)
    )

    if not result_data["fixations"]:
        raise HTTPException(status_code=404, detail="No fixation data for this scenario/participant")

    # Resolve scenario file_id (two-tier matching - same as scanpath endpoint)
    from pathlib import Path as _Path

    scenario_file_id = None
    result = await db.execute(
        select(Scenaries).where(
            Scenaries.project_id == project_id,
            Scenaries.name == scenario,
        )
    )
    scenary = result.scalar_one_or_none()

    if scenary is None:
        all_result = await db.execute(
            select(Scenaries).where(Scenaries.project_id == project_id)
        )
        all_scenarios = all_result.scalars().all()

        def _norm(name: str) -> str:
            return _Path(str(name).strip()).stem.lower().replace(" ", "")

        target_stem = _norm(scenario)
        for s in all_scenarios:
            if _norm(s.name) == target_stem:
                scenary = s
                break

    if scenary and scenary.file_id:
        scenario_file_id = str(scenary.file_id)

    response_data = {**result_data, "scenario_file_id": scenario_file_id}
    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, response_data))
    return FixationDataResponse(**response_data)


@router.get("/heatmap")
async def heatmap_overlay(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if not scenario or scenario == "all":
        raise HTTPException(status_code=400, detail="scenario must be specified")
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "heatmap", scenario)
    cached_bytes = await anyio.to_thread.run_sync(lambda: _redis.get_bytes(cache_key))
    if cached_bytes:
        return StreamingResponse(
            iter([cached_bytes]),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=900"},
        )

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    png_bytes = await anyio.to_thread.run_sync(
        lambda: HeatmapAnalyticsService.compute_heatmap_overlay(df, scenario)
    )
    if not png_bytes:
        raise HTTPException(status_code=404, detail="No gaze data for this scenario/participant")

    await anyio.to_thread.run_sync(lambda: _redis.set_bytes(cache_key, png_bytes))
    return StreamingResponse(
        iter([png_bytes]),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=900"},
    )


@router.get("/fixations/histogram", response_model=FixationHistogramResponse)
async def fixation_histogram(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    await _verify_ownership(db, project_id, current_user)

    cache_key = _redis.build_key(project_id, participant_code, "fixation_histogram", scenario)
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return FixationHistogramResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: FixationHistogramService.compute_histogram(df, scenario)
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return FixationHistogramResponse(**result_data)


@router.get("/aois", response_model=AoiMetricsResponse)
async def aoi_metrics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if not scenario or scenario == "all":
        raise HTTPException(status_code=400, detail="scenario must be specified")

    await _verify_ownership(db, project_id, current_user)

    scenary = await _resolve_scenary_for_analytics(
        db,
        project_id,
        scenario,
        include_aois=True,
    )
    if not scenary:
        raise HTTPException(status_code=404, detail="Scenario not found")

    scenario_file_id = str(scenary.file_id) if scenary.file_id else None
    aois = list(scenary.aois or [])

    if not aois:
        return AoiMetricsResponse(
            scenario=scenary.name,
            scenario_file_id=scenario_file_id,
            aois=[],
            transitions=[],
            events=[],
            total_fixations=0,
            total_dwell_time_ms=0.0,
            observed_aoi_dwell_time_ms=0.0,
            observed_aoi_dwell_time_percent=0.0,
        )

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: AoiAnalyticsService.compute_metrics(df, scenario, aois)
    )
    if scenario != scenary.name and not result_data.get("events") and result_data.get("total_fixations", 0) == 0:
        result_data = await anyio.to_thread.run_sync(
            lambda: AoiAnalyticsService.compute_metrics(df, scenary.name, aois)
        )

    return AoiMetricsResponse(
        scenario=scenary.name,
        scenario_file_id=scenario_file_id,
        **result_data,
    )

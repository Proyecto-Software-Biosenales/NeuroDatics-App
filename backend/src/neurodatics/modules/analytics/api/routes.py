import hashlib
import logging
from typing import List, Optional
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ....api.deps import get_current_user, get_db
from ...participants.domain.entities import Participant
from ...projects.domain.entities import Project
from ...projects.application.services.fixation_detection_service import (
    DEFAULT_FIXATION_MIN_DURATION_MS,
)
from ...scenaries.domain.entities import Scenaries
from ..application.services.analytics_service import (
    AoiAnalyticsService,
    EegAnalyticsService,
    FixationDataService,
    FixationDurationVariantService,
    FixationHistogramService,
    GsrAnalyticsService,
    HeatmapAnalyticsService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
)
from ..application.services.comparison_chart_config import ChartConfigBuilder
from ..application.services.correlation_service import CorrelationAnalyticsService
from ..application.services.parquet_reader_service import ParquetReaderService
from ..domain.cache_generation import project_cache_generation
from ..domain.coordinate_transform import transform_cache_token
from ..domain.scenario_identity import is_all_scenarios, resolve_scenario
from ..infrastructure.redis_cache import AnalyticsRedisCache
from .schemas import (
    AoiMetricsResponse,
    ComparisonChartsResponse,
    CorrelationsResponse,
    DistanceStatisticsResponse,
    DistanceTimeseriesResponse,
    EegPsdResponse,
    EegSpectrogramResponse,
    EegTopographyResponse,
    EegTimeseriesResponse,
    FixationDataResponse,
    FixationDurationSensitivityResponse,
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
_CORRELATIONS_CACHE_ENDPOINT = "correlations:v2"
_CORRELATIONS_CACHE_TTL_SECONDS = 900


def _fixation_metadata_headers(metadata: Optional[dict]) -> dict[str, str]:
    metadata = metadata or {}
    headers: dict[str, str] = {}
    for field, header in (
        ("algorithm_version", "X-Fixation-Algorithm-Version"),
        ("method", "X-Fixation-Method"),
        ("source", "X-Fixation-Source"),
        ("estimated", "X-Fixation-Estimated"),
        ("effective_sampling_rate_hz", "X-Fixation-Effective-Rate-Hz"),
        ("min_fixation_duration_ms", "X-Fixation-Min-Duration-Ms"),
    ):
        value = metadata.get(field)
        if value is not None:
            headers[header] = str(value)
    warnings = metadata.get("warnings") or []
    if warnings:
        value = " | ".join(str(item) for item in warnings)
        headers["X-Fixation-Warnings"] = value.encode("latin-1", "replace").decode("latin-1")[:1000]
    available = metadata.get("available_min_fixation_durations_ms") or []
    if available:
        headers["X-Fixation-Available-Min-Durations-Ms"] = ",".join(
            str(int(value)) for value in available
        )
    return headers


def _stimulus_transform_headers(metadata: Optional[dict]) -> dict[str, str]:
    metadata = metadata or {}
    transform = metadata.get("coordinate_transform") or metadata
    status = transform.get("status")
    if not status:
        return {}

    headers = {
        "X-Stimulus-Transform-Status": str(status),
        "X-Stimulus-Coordinate-Space": str(transform.get("output_space") or "unknown"),
        "X-Stimulus-Transform-Version": str(transform.get("contract_version") or "none"),
        "X-Stimulus-Transform-Fingerprint": str(
            transform.get("contract_fingerprint") or "none"
        ),
    }
    warning_codes = transform.get("warning_codes") or []
    if warning_codes:
        headers["X-Stimulus-Transform-Warnings"] = ",".join(
            str(item) for item in warning_codes
        )[:1000]
    return headers


async def _verify_ownership(db: AsyncSession, project_id: UUID, current_user: str) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == UUID(current_user))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _validate_time_window(start_time_s: Optional[float], end_time_s: Optional[float]) -> None:
    if start_time_s is not None and end_time_s is not None and end_time_s <= start_time_s:
        raise HTTPException(status_code=400, detail="end_time_s must be greater than start_time_s")


def _time_window_key(start_time_s: Optional[float], end_time_s: Optional[float]) -> str:
    start_key = "start:auto" if start_time_s is None else f"start:{float(start_time_s):g}"
    end_key = "end:auto" if end_time_s is None else f"end:{float(end_time_s):g}"
    return f"{start_key}:{end_key}"


def _cache_generation(project: Project) -> int:
    """Scope a request's cache entries to the ingestion that produced them.

    Ownership verification already loaded the project, so reading the counter
    costs no extra query, and a re-upload leaves every entry of the previous
    generation unreachable instead of letting it answer for data that the
    project no longer holds.
    """

    return project_cache_generation(project)


def _fixation_duration(value: int) -> int:
    """Validate and normalize the public minimum-duration query value."""

    try:
        return FixationDurationVariantService.validate_duration(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _fixation_duration_cache_token(value: int) -> str:
    return f"min-duration-{int(value)}ms"


async def _resolve_scenary_for_analytics(
    db: AsyncSession,
    project_id: UUID,
    scenario: str,
    include_aois: bool = False,
) -> Optional[Scenaries]:
    """Find the project scenario a request names, however it spelled the name.

    The caller may send the stored label, the media file name it came from, or
    the scenario's file id. Exact labels win outright; anything else goes
    through the shared normalizer, which refuses to guess when two scenarios
    normalize alike.
    """

    options = [selectinload(Scenaries.aois)] if include_aois else []
    result = await db.execute(
        select(Scenaries)
        .options(*options)
        .where(Scenaries.project_id == project_id)
    )
    all_scenarios = list(result.scalars().all())

    requested = str(scenario).strip()
    for candidate in all_scenarios:
        if str(candidate.name).strip() == requested:
            return candidate
    for candidate in all_scenarios:
        if candidate.file_id and str(candidate.file_id) == requested:
            return candidate

    resolution = resolve_scenario(scenario, [candidate.name for candidate in all_scenarios])
    if resolution is None:
        return None
    for candidate in all_scenarios:
        if str(candidate.name) == resolution.value:
            logger.info(
                "Scenario name normalized: requested=%r -> scenaries=%r",
                scenario,
                candidate.name,
            )
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


@router.get("/correlations", response_model=CorrelationsResponse)
async def correlations(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    requested_scenario = scenario.strip()
    if is_all_scenarios(requested_scenario):
        raise HTTPException(
            status_code=400,
            detail="Correlations require one concrete scenario; scenario=all is not supported",
        )

    scenary = await _resolve_scenary_for_analytics(
        db,
        project_id,
        requested_scenario,
    )
    if scenary is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    canonical_scenario = str(scenary.name).strip()
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        _CORRELATIONS_CACHE_ENDPOINT,
        canonical_scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return CorrelationsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: CorrelationAnalyticsService.compute(df, canonical_scenario)
    )
    response_data = {
        "participant_code": participant_code,
        "scenario": canonical_scenario,
        **result_data,
    }

    await anyio.to_thread.run_sync(
        lambda: _redis.set_json(
            cache_key,
            response_data,
            ttl=_CORRELATIONS_CACHE_TTL_SECONDS,
        )
    )
    return CorrelationsResponse(**response_data)


@router.get("/comparison/charts", response_model=ComparisonChartsResponse)
async def comparison_charts(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    visualizations: str = Query(default=""),
    max_points: int = Query(default=5000, ge=1, le=100000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    requested_visualizations = [
        item.strip()
        for item in visualizations.replace(",", " ").split()
        if item.strip()
    ] or None

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    charts = await anyio.to_thread.run_sync(
        lambda: ChartConfigBuilder.build_many(
            df,
            scenario,
            requested_visualizations,
            max_points=max_points,
        )
    )
    return ComparisonChartsResponse(charts=charts)


@router.get("/timeseries/pupil", response_model=PupilTimeseriesResponse)
async def pupil_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"timeseries_pupil:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return PupilTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return PupilTimeseriesResponse(**result_data)


@router.get("/statistics/pupil", response_model=PupilStatisticsResponse)
async def pupil_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"statistics_pupil:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return PupilStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return PupilStatisticsResponse(**result_data)


@router.get("/gaze-at", response_model=GazeAtResponse)
async def gaze_at(
    project_id: UUID,
    participant_code: str = Query(...),
    t_s: float = Query(...),
    scenario: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    requested_scenary = None
    canonical_scenario = None
    if scenario is not None:
        requested_scenario = scenario.strip()
        if is_all_scenarios(requested_scenario):
            raise HTTPException(
                status_code=400,
                detail="gaze-at requires a concrete scenario when scenario is provided",
            )
        requested_scenary = await _resolve_scenary_for_analytics(
            db,
            project_id,
            requested_scenario,
        )
        if requested_scenary is None:
            raise HTTPException(status_code=404, detail="Scenario not found")
        canonical_scenario = str(requested_scenary.name).strip()

    reader = ParquetReaderService(db)
    df = await reader.read_from_cache_only(
        project_id,
        participant_code,
        generation=generation,
    )

    if df is None:
        try:
            df = await reader.read(project_id, participant_code, generation=generation)
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    # The transform snapshot participates in every spatial cache key. Reading
    # the processed artifact first is intentional: SQL geometry may have been
    # edited later and is not authoritative for this Parquet.
    transform_token = transform_cache_token(df)
    rounded_t = round(t_s, 4)
    if canonical_scenario is None:
        cache_key = _redis.build_key(
            project_id,
            participant_code,
            f"gaze_at_v5:stimulus-v1:{transform_token}",
            str(rounded_t),
            generation=generation,
        )
    else:
        cache_key = _redis.build_key(
            project_id,
            participant_code,
            f"gaze_at_v5:stimulus-v1:{transform_token}:{rounded_t}",
            canonical_scenario,
            generation=generation,
        )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeAtResponse(**cached)

    gaze_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.find_gaze_at(
            df,
            t_s,
            scenario=canonical_scenario,
        )
    )

    if requested_scenary is not None and gaze_data.get("scenario") is not None:
        gaze_data["scenario"] = canonical_scenario

    scenario_name = gaze_data.get("scenario")
    scenario_file_id = None
    scenario_type = None
    scenary = requested_scenary
    if scenario_name:
        # An unscoped lookup reports whichever scenario the nearest sample
        # belongs to, spelled the way the Parquet spells it; the stimulus it
        # refers to still has to be found among the project's scenarios.
        if scenary is None:
            scenary = await _resolve_scenary_for_analytics(db, project_id, scenario_name)

        if scenary:
            scenario_type = scenary.type
            if scenary.file_id:
                scenario_file_id = str(scenary.file_id)
        else:
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
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"timeseries_gaze:v2:stimulus-v1:{transform_token}:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeTimeseriesResponse(**cached)

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_gaze_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GazeTimeseriesResponse(**result_data)


@router.get("/statistics/gaze", response_model=GazeStatisticsResponse)
async def gaze_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"statistics_gaze:v2:stimulus-v1:{transform_token}:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeStatisticsResponse(**cached)

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_gaze_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GazeStatisticsResponse(**result_data)


@router.get("/timeseries/distance", response_model=DistanceTimeseriesResponse)
async def distance_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"timeseries_distance:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return DistanceTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_distance_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return DistanceTimeseriesResponse(**result_data)


@router.get("/statistics/distance", response_model=DistanceStatisticsResponse)
async def distance_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"statistics_distance:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return DistanceStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: PupilAnalyticsService.compute_distance_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return DistanceStatisticsResponse(**result_data)


@router.get("/timeseries/gsr", response_model=GsrTimeseriesResponse)
async def gsr_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"timeseries_gsr:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GsrTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: GsrAnalyticsService.compute_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
    )

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return GsrTimeseriesResponse(**result_data)


@router.get("/statistics/gsr", response_model=GsrStatisticsResponse)
async def gsr_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"statistics_gsr:{_time_window_key(start_time_s, end_time_s)}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return GsrStatisticsResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result_data = await anyio.to_thread.run_sync(
        lambda: GsrAnalyticsService.compute_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        )
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
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    time_window_key = _time_window_key(start_time_s, end_time_s)
    cache_endpoint = f"timeseries_eeg:{channels_key}:{smooth_window_s}:{max_points}:{time_window_key}"
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        cache_endpoint,
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegTimeseriesResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
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
            start_time_s=start_time_s,
            end_time_s=end_time_s,
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
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    _validate_time_window(start_time_s, end_time_s)

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    max_freq_key = "auto" if max_freq_hz is None else f"{float(max_freq_hz):g}"
    scale_key = "db" if use_db else "linear"
    time_window_key = _time_window_key(start_time_s, end_time_s)
    cache_endpoint = f"psd_eeg:{channels_key}:{max_freq_key}:{scale_key}:{max_points}:{time_window_key}"
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        cache_endpoint,
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegPsdResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
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
            start_time_s=start_time_s,
            end_time_s=end_time_s,
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
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

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
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        cache_endpoint,
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegSpectrogramResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
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
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

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
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        cache_endpoint,
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return EegTopographyResponse(**cached)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
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
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        (
            f"scanpath_v3:stimulus-v1:{transform_token}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return ScanpathResponse(**cached)

    try:
        result_data = await anyio.to_thread.run_sync(
            lambda: ScanpathAnalyticsService.compute_scanpath(
                df,
                scenario,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    scenario_file_id = None
    if not is_all_scenarios(scenario):
        scenary = await _resolve_scenary_for_analytics(db, project_id, scenario)
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
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        (
            f"fixations_v3:stimulus-v1:{transform_token}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        # A hit can only belong to the current generation, since the key embeds
        # it - but the field is taken from the live value anyway, so a payload
        # written before it existed reports the real generation instead of 0 and
        # cannot leave the overlay client requesting a superseded heatmap URL.
        return FixationDataResponse(**{**cached, "cache_generation": generation})

    try:
        result_data = await anyio.to_thread.run_sync(
            lambda: FixationDataService.compute_fixation_data(
                df,
                scenario,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    scenario_file_id = None
    scenary = await _resolve_scenary_for_analytics(db, project_id, scenario)
    if scenary and scenary.file_id:
        scenario_file_id = str(scenary.file_id)

    response_data = {
        **result_data,
        "scenario_file_id": scenario_file_id,
        "cache_generation": generation,
    }
    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, response_data))
    return FixationDataResponse(**response_data)


@router.get("/heatmap")
async def heatmap_overlay(
    request: Request,
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    generation: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)
    # `generation` exists so the client's URL changes after a re-ingestion and its
    # own HTTP cache misses. It is deliberately not part of the cache key: only the
    # project's counter is, so a client holding a stale value cannot pin the
    # previous upload's overlay.
    cache_generation = _cache_generation(project)

    # The overlay is rendered at the stimulus' own dimensions, so re-ingesting a
    # scenario at a different size has to miss the cache rather than serve a PNG
    # that no longer matches the image it is laid over.
    scenary = await _resolve_scenary_for_analytics(db, project_id, scenario)
    stimulus_width = getattr(scenary, "width", None) if scenary else None
    stimulus_height = getattr(scenary, "height", None) if scenary else None
    size_key = f"{stimulus_width or 0}x{stimulus_height or 0}"

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=cache_generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        (
            f"heatmap_v4:stimulus-v1:{transform_token}:{size_key}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        scenario,
        generation=cache_generation,
    )
    # The key already pins the generation, the transform snapshot and the stimulus
    # size, so equal keys mean byte-identical PNGs and the ETag can be derived from
    # it without rendering anything.
    etag = f'"{hashlib.sha1(cache_key.encode("utf-8")).hexdigest()}"'
    # `public, max-age=900` was wrong twice over: this PNG is authenticated and
    # specific to one participant, so a shared proxy must never store it, and a
    # freshness window meant a re-ingestion kept showing the old overlay for up to
    # 15 minutes. Revalidating every time makes the ETag decide instead.
    response_headers = {
        "Cache-Control": "private, max-age=0, must-revalidate",
        "ETag": etag,
        "Vary": "Authorization",
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=response_headers)

    metadata_cache_key = f"{cache_key}:metadata"
    cached_bytes = await anyio.to_thread.run_sync(lambda: _redis.get_bytes(cache_key))
    cached_metadata = await anyio.to_thread.run_sync(
        lambda: _redis.get_json(metadata_cache_key)
    )
    if cached_bytes and cached_metadata and cached_metadata.get("coordinate_transform"):
        return StreamingResponse(
            iter([cached_bytes]),
            media_type="image/png",
            headers={
                **response_headers,
                **_fixation_metadata_headers(cached_metadata),
                **_stimulus_transform_headers(cached_metadata),
            },
        )

    try:
        png_bytes, fixation_metadata = await anyio.to_thread.run_sync(
            lambda: HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(
                df,
                scenario,
                width=stimulus_width,
                height=stimulus_height,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not png_bytes:
        raise HTTPException(status_code=404, detail="No gaze data for this scenario/participant")

    await anyio.to_thread.run_sync(lambda: _redis.set_bytes(cache_key, png_bytes))
    await anyio.to_thread.run_sync(
        lambda: _redis.set_json(metadata_cache_key, fixation_metadata)
    )
    return StreamingResponse(
        iter([png_bytes]),
        media_type="image/png",
        headers={
            **response_headers,
            **_fixation_metadata_headers(fixation_metadata),
            **_stimulus_transform_headers(fixation_metadata),
        },
    )


@router.get(
    "/fixations/sensitivity",
    response_model=FixationDurationSensitivityResponse,
)
async def fixation_duration_sensitivity(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Compare the exact persisted detector variants without duplicating gaze data."""

    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)
    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        f"fixation_sensitivity_v1:stimulus-v1:{transform_token}",
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return FixationDurationSensitivityResponse(**cached)

    try:
        result_data = await anyio.to_thread.run_sync(
            lambda: FixationDurationVariantService.compute_sensitivity(df, scenario)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return FixationDurationSensitivityResponse(**result_data)


@router.get("/fixations/histogram", response_model=FixationHistogramResponse)
async def fixation_histogram(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    transform_token = transform_cache_token(df)
    cache_key = _redis.build_key(
        project_id,
        participant_code,
        (
            f"fixation_histogram_v3:stimulus-v1:{transform_token}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        scenario,
        generation=generation,
    )
    cached = await anyio.to_thread.run_sync(lambda: _redis.get_json(cache_key))
    if cached:
        return FixationHistogramResponse(**cached)

    try:
        result_data = await anyio.to_thread.run_sync(
            lambda: FixationHistogramService.compute_histogram(
                df,
                scenario,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await anyio.to_thread.run_sync(lambda: _redis.set_json(cache_key, result_data))
    return FixationHistogramResponse(**result_data)


@router.get("/aois", response_model=AoiMetricsResponse)
async def aoi_metrics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)

    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

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

    reader = ParquetReaderService(db)
    try:
        df = await reader.read(project_id, participant_code, generation=generation)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not aois:
        try:
            fixation_metadata = await anyio.to_thread.run_sync(
                lambda: FixationDataService.compute_fixation_data(
                    df,
                    scenary.name,
                    min_fixation_duration_ms=min_fixation_duration_ms,
                )
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
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
            algorithm_version=fixation_metadata.get("algorithm_version"),
            method=fixation_metadata.get("method"),
            source=fixation_metadata.get("source"),
            estimated=bool(fixation_metadata.get("estimated", False)),
            effective_sampling_rate_hz=fixation_metadata.get(
                "effective_sampling_rate_hz"
            ),
            min_fixation_duration_ms=fixation_metadata.get(
                "min_fixation_duration_ms"
            ),
            available_min_fixation_durations_ms=fixation_metadata.get(
                "available_min_fixation_durations_ms", []
            ),
            warnings=fixation_metadata.get("warnings", []),
            coordinate_transform=fixation_metadata.get("coordinate_transform"),
        )

    # The stored label is what the AOIs were drawn against, and the service
    # resolves it onto whatever spelling the Parquet holds - so the retry that
    # used to recompute under the other spelling is no longer needed.
    try:
        result_data = await anyio.to_thread.run_sync(
            lambda: AoiAnalyticsService.compute_metrics(
                df,
                scenary.name,
                aois,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return AoiMetricsResponse(
        scenario=scenary.name,
        scenario_file_id=scenario_file_id,
        **result_data,
    )

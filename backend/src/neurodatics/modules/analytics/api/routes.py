import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import List, Optional, TypeVar
from urllib.parse import quote
from uuid import UUID

import copy
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, TypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ....api.deps import get_current_user, get_db
from ...participants.domain.entities import Participant
from ...projects.domain.entities import Project
from neurodatics.shared.fixation_contract import (
    DEFAULT_FIXATION_MIN_DURATION_MS,
)
from ...scenaries.domain.entities import Scenaries
from ..application.services.analytics_service import (
    AoiAnalyticsService,
    EegAnalyticsService,
    FixationDataService,
    FixationDurationVariantService,
    FixationEventService,
    FixationHistogramService,
    GsrAnalyticsService,
    HeatmapAnalyticsService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
)
from ..application.services.comparison_chart_config import ChartConfigBuilder
from ..application.services.correlation_service import CorrelationAnalyticsService
from ..application.services.parquet_reader_service import ParquetReaderService
from ..application.services.scenario_timing_service import ScenarioTimingService, StimulusSequenceService
from ..domain.parquet_projection import (
    ParquetProjection, GSR_PROJECTION, PUPIL_PROJECTION, DISTANCE_PROJECTION,
    TIMING_PROJECTION, SEQUENCE_PROJECTION, EEG_PROJECTION,
)
from neurodatics.shared.cache_generation import project_cache_generation
from ..domain.coordinate_transform import (
    APPLIED_STATUS,
    MIXED_STATUS,
    MIXED_WARNING_CODE,
    transform_cache_token,
)
from neurodatics.shared.scenario_identity import is_all_scenarios, resolve_scenario
from ..infrastructure.singleflight import response_flights, settled_thread, SingleFlightBusy, SingleFlightTimeout
from ..infrastructure.redis_cache import AnalyticsRedisCache
from ..infrastructure.transform_token_store import persist_transform_token, stored_transform_token
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
    ScenarioTimingResponse,
    StimulusSequenceResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects/{project_id}/analytics", tags=["analytics"])
_redis = AnalyticsRedisCache()
_live_json = TypeAdapter(dict, config=ConfigDict(ser_json_inf_nan="constants"))
_CORRELATIONS_CACHE_ENDPOINT = "correlations:v3"
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


def _eeg_processing(
    reference: str,
    bandpass_low_hz: Optional[float],
    bandpass_high_hz: Optional[float],
    notch_hz: Optional[float],
) -> tuple[dict, str]:
    """Validate the optional EEG processing and return kwargs plus a cache key.

    Every option here changes samples, so it is part of the cache identity: two
    requests that differ only in the filter must never answer for each other.
    """

    if (bandpass_low_hz is None) != (bandpass_high_hz is None):
        raise HTTPException(
            status_code=400,
            detail="bandpass_low_hz and bandpass_high_hz must be given together",
        )
    band = None
    if bandpass_low_hz is not None and bandpass_high_hz is not None:
        if bandpass_high_hz <= bandpass_low_hz:
            raise HTTPException(
                status_code=400,
                detail="bandpass_high_hz must be greater than bandpass_low_hz",
            )
        band = (bandpass_low_hz, bandpass_high_hz)
    band_key = "off" if band is None else f"{band[0]:g}-{band[1]:g}"
    notch_key = "off" if notch_hz is None else f"{float(notch_hz):g}"
    return (
        {"reference": reference, "bandpass_hz": band, "notch_hz": notch_hz},
        f"ref:{reference}:band:{band_key}:notch:{notch_key}",
    )


def _time_window_key(start_time_s: Optional[float], end_time_s: Optional[float]) -> str:
    # ``repr`` keeps every digit: ``:g`` rounded to six significant figures, so
    # 1234.567 and 1234.571 shared a key and one window answered for the other.
    start_key = "start:auto" if start_time_s is None else f"start:{float(start_time_s)!r}"
    end_key = "end:auto" if end_time_s is None else f"end:{float(end_time_s)!r}"
    return f"{start_key}:{end_key}"


DISPLAY_DECIMATION_PATTERN = "^(linspace|minmax_envelope)$"


def _decimation_key(decimation: str) -> str:
    """Cache-key suffix; the historical selection keeps its existing keys."""

    return "" if decimation == "linspace" else f":{decimation}"


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


class AnalyticsFrameReader:
    """Request-local reader, constructed only when a cache miss needs a frame."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def read(
        self, project_id, participant_code, generation, *, cache_only=False,
        projection: Optional[ParquetProjection] = None,
    ):
        reader = ParquetReaderService(self.db)
        selection = {"projection": projection} if projection is not None else {}
        try:
            if cache_only:
                df = await reader.read_from_cache_only(
                    project_id, participant_code, generation=generation, **selection,
                )
                if df is not None:
                    return df
            return await reader.read(project_id, participant_code, generation=generation, **selection)
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc


async def get_frame_reader(db: AsyncSession = Depends(get_db)) -> AnalyticsFrameReader:
    # Resolving dependencies must not construct ParquetReaderService: it has work
    # of its own, and persisted-token cache hits do not need it at all.
    return AnalyticsFrameReader(db)


async def _resolve_transform_token(
    db, project, participant_code, generation, *, cache_only=False, reader=None,
):
    """Resolve old rows lazily; a persisted token needs no reader or Parquet."""
    token = stored_transform_token(project, participant_code, generation)
    if token is not None:
        return token, None
    reader = reader or AnalyticsFrameReader(db)
    df = await reader.read(project.id, participant_code, generation, cache_only=cache_only)
    token = await settled_thread(lambda: transform_cache_token(df))
    await persist_transform_token(db, project, participant_code, generation, token)
    return token, df


ResponseModel = TypeVar("ResponseModel", bound=BaseModel)


async def cached_frame_endpoint(
    *,
    reader: AnalyticsFrameReader,
    project: Project,
    participant_code: str,
    scenario: str,
    endpoint: str | Callable[[str], str],
    compute: Callable[[pd.DataFrame], dict],
    response_model: type[ResponseModel],
    ttl: Optional[int] = None,
    computation_error_status: Optional[int] = None,
    enrich: Optional[Callable[[dict], Awaitable[dict]]] = None,
    cached_fields: Optional[dict] = None,
    projection: Optional[ParquetProjection] = None,
) -> ResponseModel:
    """Resolve provenance, check Redis, then read/compute only on a miss.

    A callable endpoint requests a transform token. Legacy rows may need one
    read to discover that token; its frame is reused on a response-cache miss.
    Read failures and computation failures intentionally have separate scopes.
    """
    generation = _cache_generation(project)
    df = None
    if callable(endpoint):
        token, df = await _resolve_transform_token(
            reader.db, project, participant_code, generation, reader=reader,
        )
        endpoint = endpoint(token)
    cache_key = _redis.build_key(
        project.id, participant_code, endpoint, scenario, generation=generation,
    )
    cached = await settled_thread(lambda: _redis.get_json(cache_key))
    if cached:
        return response_model(**{**cached, **(cached_fields or {})})
    async def calculate():
        # Redis may have been filled since initial lookup/admission.
        existing = await settled_thread(lambda: _redis.get_json(cache_key))
        if existing:
            return {**existing, **(cached_fields or {})}
        frame = df
        if frame is None:
            frame = await reader.read(project.id, participant_code, generation, projection=projection)
        try:
            response_data = await settled_thread(lambda: compute(frame))
        except ValueError as exc:
            if computation_error_status is None:
                raise
            raise HTTPException(status_code=computation_error_status, detail=str(exc)) from exc
        if enrich is not None:
            response_data = await enrich(response_data)
        await settled_thread(lambda: _redis.set_json(cache_key, response_data, ttl=ttl))
        return response_data

    # Authorized project comes from each caller's ownership query. Include
    # owner and projection even when HTTP output/Redis identity is equivalent.
    key = (str(project.owner_id), cache_key, projection, response_model)
    return await _shared_model_response(key, calculate, response_model)


async def _shared_response(key, calculate):
    try:
        return await response_flights.run(key, calculate)
    except (SingleFlightBusy, SingleFlightTimeout) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


async def _shared_model_response(key, calculate, response_model):
    async def serialized():
        data = await calculate()
        # Immutable live JSON avoids deep-copying large nested arrays once per
        # consumer. Validation/serialization happens once; each caller parses
        # its own model, including nested Any metadata, without mutable aliases.
        # Preserve non-finite values in nested metadata too. The default
        # model serializer turns these into null; the live adapter does not.
        return await settled_thread(lambda: _live_json.dump_json(response_model(**data).model_dump()))

    payload = await _shared_response(key, serialized)
    return response_model.model_validate_json(payload)



def _aoi_cache_token(scenary, aois) -> str:
    # AOIs are edited independently of ingestion; their current geometry and
    # presentation fields must invalidate cached metrics as well.
    material = [str(scenary.name), str(scenary.file_id), [
        {field: getattr(aoi, field, None) for field in (
            "id", "name", "color", "shape_type", "shape",
        )} for aoi in aois
    ]]
    return hashlib.sha256(json.dumps(material, sort_keys=True, default=str).encode()).hexdigest()[:20]


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
        ParticipantItem(
            participant_code=participant.participant_code,
            user_index=index,
            name=participant.name,
            document=participant.effective_document,
        )
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


@router.get("/scenario-timing", response_model=ScenarioTimingResponse)
async def scenario_timing(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    """Where a scenario starts in one recording, to align participants on it."""

    project = await _verify_ownership(db, project_id, current_user)
    return await cached_frame_endpoint(
        reader=reader,
        projection=TIMING_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint="scenario_timing:v1",
        compute=lambda df: ScenarioTimingService.compute(df, scenario),
        response_model=ScenarioTimingResponse,
    )


@router.get("/stimulus-sequence", response_model=StimulusSequenceResponse)
async def stimulus_sequence(
    project_id: UUID,
    participant_code: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    """The scenarios of one recording in the order shown, to line participants up on them."""

    project = await _verify_ownership(db, project_id, current_user)
    return await cached_frame_endpoint(
        reader=reader,
        projection=SEQUENCE_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario="all",
        endpoint="stimulus_sequence:v1",
        compute=StimulusSequenceService.compute,
        response_model=StimulusSequenceResponse,
    )


@router.get("/correlations", response_model=CorrelationsResponse)
async def correlations(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)

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
    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=canonical_scenario,
        endpoint=_CORRELATIONS_CACHE_ENDPOINT,
        compute=lambda df: {
            "participant_code": participant_code,
            "scenario": canonical_scenario,
            **CorrelationAnalyticsService.compute(df, canonical_scenario),
        },
        response_model=CorrelationsResponse,
        ttl=_CORRELATIONS_CACHE_TTL_SECONDS,
    )


@router.get("/comparison/charts", response_model=ComparisonChartsResponse)
async def comparison_charts(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    visualizations: str = Query(default=""),
    max_points: int = Query(default=5000, ge=1, le=100000),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)

    requested_visualizations = [
        item.strip()
        for item in visualizations.replace(",", " ").split()
        if item.strip()
    ] or None

    views_token = hashlib.sha256(json.dumps(requested_visualizations).encode()).hexdigest()[:20]
    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"comparison_charts:v3:statistics-v1:stimulus-v1:{transform_token}:{max_points}:{views_token}"
        ),
        compute=lambda df: ChartConfigBuilder.build_comparison_payload(
            df,
            scenario,
            requested_visualizations,
            max_points=max_points,
        ),
        response_model=ComparisonChartsResponse,
    )


@router.get("/timeseries/pupil", response_model=PupilTimeseriesResponse)
async def pupil_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    max_points: int = Query(default=5000, ge=1, le=100000),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    decimation: str = Query(default="linspace", pattern=DISPLAY_DECIMATION_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        projection=PUPIL_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=f"timeseries_pupil:{max_points}:{_time_window_key(start_time_s, end_time_s)}{_decimation_key(decimation)}",
        compute=lambda df: PupilAnalyticsService.compute_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            max_points=max_points,
            decimation=decimation,
        ),
        response_model=PupilTimeseriesResponse,
    )


@router.get("/statistics/pupil", response_model=PupilStatisticsResponse)
async def pupil_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        projection=PUPIL_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=f"statistics_pupil:{_time_window_key(start_time_s, end_time_s)}",
        compute=lambda df: PupilAnalyticsService.compute_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        ),
        response_model=PupilStatisticsResponse,
    )


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

    transform_token, df = await _resolve_transform_token(
        db, project, participant_code, generation, cache_only=True,
    )
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
    cached = await settled_thread(lambda: _redis.get_json(cache_key))
    if cached:
        return GazeAtResponse(**cached)

    async def calculate():
        cached = await settled_thread(lambda: _redis.get_json(cache_key))
        if cached:
            return cached
        frame = df
        scenary_request = requested_scenary
        if frame is None:
            reader = ParquetReaderService(db)
            frame = await reader.read_from_cache_only(
                project_id,
                participant_code,
                generation=generation,
            )

            if frame is None:
                try:
                    frame = await reader.read(project_id, participant_code, generation=generation)
                except (ValueError, FileNotFoundError) as exc:
                    raise HTTPException(status_code=404, detail=str(exc)) from exc
                except RuntimeError as exc:
                    raise HTTPException(status_code=503, detail=str(exc)) from exc

        gaze_data = await settled_thread(
            lambda: PupilAnalyticsService.find_gaze_at(
                frame,
                t_s,
                scenario=canonical_scenario,
            )
        )

        if requested_scenary is not None and gaze_data.get("scenario") is not None:
            gaze_data["scenario"] = canonical_scenario

        scenario_name = gaze_data.get("scenario")
        scenario_file_id = None
        scenario_type = None
        scenary = scenary_request
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

        scenario_time_s = await settled_thread(
            lambda: PupilAnalyticsService.compute_scenario_relative_time(
                frame,
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

        await settled_thread(lambda: _redis.set_json(cache_key, response_data))
        return response_data
    return await _shared_model_response(
        (str(project.owner_id), cache_key, None, GazeAtResponse), calculate, GazeAtResponse,
    )



@router.get("/timeseries/gaze", response_model=GazeTimeseriesResponse)
async def gaze_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    max_points: int = Query(default=5000, ge=1, le=100000),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    decimation: str = Query(default="linspace", pattern=DISPLAY_DECIMATION_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"timeseries_gaze:v2:stimulus-v1:{transform_token}:{max_points}:"
            f"{_time_window_key(start_time_s, end_time_s)}{_decimation_key(decimation)}"
        ),
        compute=lambda df: PupilAnalyticsService.compute_gaze_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            max_points=max_points,
            decimation=decimation,
        ),
        response_model=GazeTimeseriesResponse,
    )


@router.get("/statistics/gaze", response_model=GazeStatisticsResponse)
async def gaze_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"statistics_gaze:v2:stimulus-v1:{transform_token}:{_time_window_key(start_time_s, end_time_s)}"
        ),
        compute=lambda df: PupilAnalyticsService.compute_gaze_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        ),
        response_model=GazeStatisticsResponse,
    )


@router.get("/timeseries/distance", response_model=DistanceTimeseriesResponse)
async def distance_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    max_points: int = Query(default=5000, ge=1, le=100000),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    decimation: str = Query(default="linspace", pattern=DISPLAY_DECIMATION_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        projection=DISTANCE_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=f"timeseries_distance:{max_points}:{_time_window_key(start_time_s, end_time_s)}{_decimation_key(decimation)}",
        compute=lambda df: PupilAnalyticsService.compute_distance_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            max_points=max_points,
            decimation=decimation,
        ),
        response_model=DistanceTimeseriesResponse,
    )


@router.get("/statistics/distance", response_model=DistanceStatisticsResponse)
async def distance_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        projection=DISTANCE_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=f"statistics_distance:{_time_window_key(start_time_s, end_time_s)}",
        compute=lambda df: PupilAnalyticsService.compute_distance_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        ),
        response_model=DistanceStatisticsResponse,
    )


@router.get("/timeseries/gsr", response_model=GsrTimeseriesResponse)
async def gsr_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    max_points: int = Query(default=5000, ge=1, le=100000),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    decimation: str = Query(default="linspace", pattern=DISPLAY_DECIMATION_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        projection=GSR_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=f"timeseries_gsr:{max_points}:{_time_window_key(start_time_s, end_time_s)}{_decimation_key(decimation)}",
        compute=lambda df: GsrAnalyticsService.compute_timeseries(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            max_points=max_points,
            decimation=decimation,
        ),
        response_model=GsrTimeseriesResponse,
    )


@router.get("/statistics/gsr", response_model=GsrStatisticsResponse)
async def gsr_statistics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)

    return await cached_frame_endpoint(
        reader=reader,
        projection=GSR_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=f"statistics_gsr:{_time_window_key(start_time_s, end_time_s)}",
        compute=lambda df: GsrAnalyticsService.compute_statistics(
            df,
            scenario,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
        ),
        response_model=GsrStatisticsResponse,
    )


@router.get("/timeseries/eeg", response_model=EegTimeseriesResponse)
async def eeg_timeseries(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    channels: str = Query(default=""),
    smooth_window_s: float = Query(default=0.0, ge=0.0, le=5.0),
    max_points: int = Query(default=5000, ge=1, le=100000),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    decimation: str = Query(default="linspace", pattern="^(linspace|minmax_envelope)$"),
    reference: str = Query(default="as_exported", pattern="^(as_exported|common_average)$"),
    bandpass_low_hz: Optional[float] = Query(default=None, gt=0.0),
    bandpass_high_hz: Optional[float] = Query(default=None, gt=0.0),
    notch_hz: Optional[float] = Query(default=None, gt=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)
    processing, processing_key = _eeg_processing(
        reference, bandpass_low_hz, bandpass_high_hz, notch_hz
    )

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    time_window_key = _time_window_key(start_time_s, end_time_s)
    cache_endpoint = (
        f"timeseries_eeg:v2:{channels_key}:{smooth_window_s}:{max_points}:"
        f"{time_window_key}:{decimation}:{processing_key}"
    )
    return await cached_frame_endpoint(
        reader=reader,
        projection=EEG_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=cache_endpoint,
        compute=lambda df: EegAnalyticsService.compute_timeseries(
            df,
            scenario=scenario,
            channels=requested_channels,
            smooth_window_s=smooth_window_s,
            max_points=max_points,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            decimation=decimation,
            **processing,
        ),
        response_model=EegTimeseriesResponse,
    )


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
    exclude_artifact_windows: bool = Query(default=False),
    reference: str = Query(default="as_exported", pattern="^(as_exported|common_average)$"),
    bandpass_low_hz: Optional[float] = Query(default=None, gt=0.0),
    bandpass_high_hz: Optional[float] = Query(default=None, gt=0.0),
    notch_hz: Optional[float] = Query(default=None, gt=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)
    processing, processing_key = _eeg_processing(
        reference, bandpass_low_hz, bandpass_high_hz, notch_hz
    )

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    max_freq_key = "auto" if max_freq_hz is None else f"{float(max_freq_hz):g}"
    scale_key = "db" if use_db else "linear"
    time_window_key = _time_window_key(start_time_s, end_time_s)
    windows_key = "drop_flagged" if exclude_artifact_windows else "keep_flagged"
    cache_endpoint = (
        f"psd_eeg:v2:{channels_key}:{max_freq_key}:{scale_key}:{max_points}:"
        f"{time_window_key}:{windows_key}:{processing_key}"
    )
    return await cached_frame_endpoint(
        reader=reader,
        projection=EEG_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=cache_endpoint,
        compute=lambda df: EegAnalyticsService.compute_psd(
            df,
            scenario=scenario,
            channels=requested_channels,
            max_freq_hz=max_freq_hz,
            use_db=use_db,
            max_points=max_points,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            exclude_artifact_windows=exclude_artifact_windows,
            **processing,
        ),
        response_model=EegPsdResponse,
    )


@router.get("/spectrogram/eeg", response_model=EegSpectrogramResponse)
async def eeg_spectrogram(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    channels: str = Query(default=""),
    max_freq_hz: Optional[float] = Query(default=25.0, gt=0.0),
    use_db: bool = Query(default=True),
    normalize: str = Query(
        default="none",
        pattern="^(none|freq_demean|freq_zscore)$",
    ),
    window_s: float = Query(default=1.5, gt=0.0, le=10.0),
    overlap_ratio: float = Query(default=0.75, ge=0.0, lt=1.0),
    smooth_sigma: float = Query(default=0.0, ge=0.0, le=5.0),
    clip_low_percentile: float = Query(default=2.0, ge=0.0, le=100.0),
    clip_high_percentile: float = Query(default=98.0, ge=0.0, le=100.0),
    max_time_bins: int = Query(default=600, ge=1, le=5000),
    max_frequency_bins: int = Query(default=256, ge=1, le=2048),
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    per_channel_color_domain: bool = Query(default=False),
    min_time_bins: Optional[int] = Query(default=None, ge=1, le=600),
    reference: str = Query(default="as_exported", pattern="^(as_exported|common_average)$"),
    bandpass_low_hz: Optional[float] = Query(default=None, gt=0.0),
    bandpass_high_hz: Optional[float] = Query(default=None, gt=0.0),
    notch_hz: Optional[float] = Query(default=None, gt=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)
    processing, processing_key = _eeg_processing(
        reference, bandpass_low_hz, bandpass_high_hz, notch_hz
    )

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    max_freq_key = "auto" if max_freq_hz is None else f"{float(max_freq_hz):g}"
    scale_key = "db" if use_db else "linear"
    color_key = "per_channel" if per_channel_color_domain else "shared"
    cache_endpoint = (
        "spectrogram_eeg:v2:"
        f"{channels_key}:{max_freq_key}:{scale_key}:{normalize}:"
        f"{window_s}:{overlap_ratio}:{smooth_sigma}:"
        f"{clip_low_percentile}:{clip_high_percentile}:"
        f"{max_time_bins}:{max_frequency_bins}:"
        f"{_time_window_key(start_time_s, end_time_s)}:{color_key}:{processing_key}"
        f":{min_time_bins}"
    )
    return await cached_frame_endpoint(
        reader=reader,
        projection=EEG_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=cache_endpoint,
        compute=lambda df: EegAnalyticsService.compute_spectrogram(
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
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            per_channel_color_domain=per_channel_color_domain,
            min_time_bins=min_time_bins,
            **processing,
        ),
        response_model=EegSpectrogramResponse,
    )


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
    start_time_s: Optional[float] = Query(default=None, ge=0.0),
    end_time_s: Optional[float] = Query(default=None, ge=0.0),
    reference: str = Query(default="as_exported", pattern="^(as_exported|common_average)$"),
    bandpass_low_hz: Optional[float] = Query(default=None, gt=0.0),
    bandpass_high_hz: Optional[float] = Query(default=None, gt=0.0),
    notch_hz: Optional[float] = Query(default=None, gt=0.0),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    project = await _verify_ownership(db, project_id, current_user)
    _validate_time_window(start_time_s, end_time_s)
    processing, processing_key = _eeg_processing(
        reference, bandpass_low_hz, bandpass_high_hz, notch_hz
    )

    requested_channels = [
        channel.strip().lower()
        for channel in channels.replace(",", " ").split()
        if channel.strip()
    ] or None
    channels_key = ",".join(requested_channels) if requested_channels else "all"
    dc_key = "dc_removed" if remove_dc else "raw"
    cache_endpoint = (
        "topography_eeg:v2:"
        f"{channels_key}:{window_s}:{overlap_ratio}:{dc_key}:{max_frames}:"
        f"{_time_window_key(start_time_s, end_time_s)}:{processing_key}"
    )
    return await cached_frame_endpoint(
        reader=reader,
        projection=EEG_PROJECTION,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=cache_endpoint,
        compute=lambda df: EegAnalyticsService.compute_topography(
            df,
            scenario=scenario,
            channels=requested_channels,
            window_s=window_s,
            overlap_ratio=overlap_ratio,
            remove_dc=remove_dc,
            max_frames=max_frames,
            start_time_s=start_time_s,
            end_time_s=end_time_s,
            **processing,
        ),
        response_model=EegTopographyResponse,
    )


@router.get("/scanpath", response_model=ScanpathResponse)
async def scanpath(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)

    async def enrich(result_data):
        scenary = await _resolve_scenary_for_analytics(db, project_id, scenario)
        return {
            **result_data,
            "scenario_file_id": str(scenary.file_id) if scenary and scenary.file_id else None,
        }

    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"scanpath_v4:stimulus-v1:{transform_token}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        compute=lambda df: ScanpathAnalyticsService.compute_scanpath(
            df,
            scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        ),
        response_model=ScanpathResponse,
        computation_error_status=422,
        enrich=enrich,
    )


@router.get("/fixations", response_model=FixationDataResponse)
async def fixation_data(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)
    generation = _cache_generation(project)

    async def enrich(result_data):
        scenary = await _resolve_scenary_for_analytics(db, project_id, scenario)
        return {
            **result_data,
            "scenario_file_id": str(scenary.file_id) if scenary and scenary.file_id else None,
            "cache_generation": generation,
        }

    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"fixations_v3:stimulus-v1:{transform_token}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        compute=lambda df: FixationDataService.compute_fixation_data(
            df,
            scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        ),
        response_model=FixationDataResponse,
        computation_error_status=422,
        enrich=enrich,
        # Old cached payloads must still report the live generation.
        cached_fields={"cache_generation": generation},
    )


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

    transform_token, df = await _resolve_transform_token(
        db, project, participant_code, cache_generation,
    )
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
    cached_bytes = await settled_thread(lambda: _redis.get_bytes(cache_key))
    cached_metadata = await settled_thread(
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

    async def calculate():
        cached_bytes = await settled_thread(lambda: _redis.get_bytes(cache_key))
        cached_metadata = await settled_thread(lambda: _redis.get_json(metadata_cache_key))
        if cached_bytes and cached_metadata and cached_metadata.get("coordinate_transform"):
            return cached_bytes, cached_metadata
        frame = df
        if frame is None:
            reader = ParquetReaderService(db)
            try:
                frame = await reader.read(project_id, participant_code, generation=cache_generation)
            except (ValueError, FileNotFoundError) as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc

        try:
            png_bytes, fixation_metadata = await settled_thread(
                lambda: HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(
                    frame,
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

        await settled_thread(lambda: _redis.set_bytes(cache_key, png_bytes))
        await settled_thread(
            lambda: _redis.set_json(metadata_cache_key, fixation_metadata)
        )
        return png_bytes, fixation_metadata

    png_bytes, metadata = await _shared_response((str(project.owner_id), cache_key, "png"), calculate)
    fixation_metadata = copy.deepcopy(metadata)
    return StreamingResponse(
        iter([png_bytes]),
        media_type="image/png",
        headers={
            **response_headers,
            **_fixation_metadata_headers(fixation_metadata),
            **_stimulus_transform_headers(fixation_metadata),
        },
    )


def _group_participant_codes(participant_codes: List[str]) -> list[str]:
    """De-duplicated, sorted codes: the order a client sends must not matter."""

    codes = sorted({str(code).strip() for code in participant_codes or [] if str(code).strip()})
    if not codes:
        raise HTTPException(status_code=400, detail="participant_codes must name at least one participant")
    return codes


def _digest(material: object, length: int = 24) -> str:
    encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:length]


def _group_transform_provenance(transforms: list[dict]) -> dict:
    """One transform description for a map pooled from several recordings.

    Equal descriptions pass through. Recordings that were all placed on the
    stimulus still share its normalized space even when their screen setups
    differ, so they stay ``applied`` without a single fingerprint; anything
    else is reported as mixed, as a single recording with mixed rows is.
    """

    if not transforms:
        return {}
    first = transforms[0]
    if all(item == first for item in transforms[1:]):
        return first
    warning_codes = list(dict.fromkeys(
        str(code) for item in transforms for code in (item.get("warning_codes") or [])
    ))
    versions = {item.get("contract_version") for item in transforms}
    if all(item.get("status") == APPLIED_STATUS for item in transforms):
        return {
            "status": APPLIED_STATUS,
            "output_space": first.get("output_space"),
            "contract_version": versions.pop() if len(versions) == 1 else None,
            "contract_fingerprint": None,
            "warning_codes": warning_codes,
        }
    if MIXED_WARNING_CODE not in warning_codes:
        warning_codes.append(MIXED_WARNING_CODE)
    return {
        "status": MIXED_STATUS,
        "output_space": "mixed",
        "contract_version": None,
        "contract_fingerprint": None,
        "warning_codes": warning_codes,
    }


def _participant_list_header(codes: list[str]) -> str:
    # Codes come from user files; percent-encoding keeps the header latin-1 safe
    # and lets a code contain a comma. Plain codes such as "P01" pass unchanged.
    return ",".join(quote(code, safe="") for code in codes)


def _group_heatmap_headers(metadata: dict) -> dict[str, str]:
    return {
        **_stimulus_transform_headers(metadata),
        "X-Group-Participants": _participant_list_header(metadata.get("participants") or []),
        "X-Group-Participants-Skipped": _participant_list_header(metadata.get("skipped") or []),
    }


@router.get("/heatmap/group")
async def group_heatmap_overlay(
    request: Request,
    project_id: UUID,
    participant_codes: List[str] = Query(...),
    scenario: str = Query(...),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    generation: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """One heatmap for several participants, each of them weighing the same.

    It uses the individual overlay's events, coordinate transform and stimulus
    size, so the group map lines up exactly with each participant's own map.
    Participants without data in the scenario are skipped and reported in
    ``X-Group-Participants-Skipped``; when none has any, the answer is 404.
    """

    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    codes = _group_participant_codes(participant_codes)
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)
    # As in the individual route, `generation` only varies the client's URL; the
    # cache key uses the project's own counter.
    cache_generation = _cache_generation(project)

    scenary = await _resolve_scenary_for_analytics(db, project_id, scenario)
    stimulus_width = getattr(scenary, "width", None) if scenary else None
    stimulus_height = getattr(scenary, "height", None) if scenary else None
    size_key = f"{stimulus_width or 0}x{stimulus_height or 0}"

    # Sequential on purpose: the session is shared and may persist each token.
    tokens: dict[str, Optional[str]] = {}
    for code in codes:
        try:
            tokens[code], _ = await _resolve_transform_token(db, project, code, cache_generation)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            tokens[code] = None

    cache_key = _redis.build_key(
        project_id,
        f"group-{_digest(codes)}",
        (
            f"heatmap_group_v1:stimulus-v1:{_digest([[code, tokens[code]] for code in codes], 20)}:"
            f"{size_key}:{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        scenario,
        generation=cache_generation,
    )
    etag = f'"{hashlib.sha1(cache_key.encode("utf-8")).hexdigest()}"'
    response_headers = {
        "Cache-Control": "private, max-age=0, must-revalidate",
        "ETag": etag,
        "Vary": "Authorization",
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=response_headers)

    metadata_cache_key = f"{cache_key}:metadata"

    def usable(metadata: Optional[dict]) -> bool:
        return bool(metadata) and isinstance(metadata.get("participants"), list)

    cached_bytes = await settled_thread(lambda: _redis.get_bytes(cache_key))
    cached_metadata = await settled_thread(lambda: _redis.get_json(metadata_cache_key))
    if cached_bytes and usable(cached_metadata):
        return StreamingResponse(
            iter([cached_bytes]),
            media_type="image/png",
            headers={**response_headers, **_group_heatmap_headers(cached_metadata)},
        )

    async def calculate():
        cached_bytes = await settled_thread(lambda: _redis.get_bytes(cache_key))
        cached_metadata = await settled_thread(lambda: _redis.get_json(metadata_cache_key))
        if cached_bytes and usable(cached_metadata):
            return cached_bytes, cached_metadata

        reader = AnalyticsFrameReader(db)
        events_by_participant: dict[str, pd.DataFrame] = {}
        transforms: dict[str, dict] = {}
        for code in codes:
            if tokens[code] is None:
                continue
            try:
                frame = await reader.read(project_id, code, cache_generation)
            except HTTPException as exc:
                if exc.status_code != 404:
                    raise
                continue
            try:
                result = await settled_thread(
                    lambda frame=frame: FixationEventService.build_result(
                        frame,
                        scenario=scenario,
                        min_fixation_duration_ms=min_fixation_duration_ms,
                    )
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            del frame
            events_by_participant[code] = result.events
            transforms[code] = result.metadata.get("coordinate_transform") or {}

        png_bytes, used = await settled_thread(
            lambda: HeatmapAnalyticsService.render_group_overlay(
                events_by_participant, width=stimulus_width, height=stimulus_height,
            )
        )
        if not png_bytes:
            raise HTTPException(
                status_code=404,
                detail="Ninguno de los participantes elegidos tiene fijaciones en este escenario",
            )
        metadata = {
            "coordinate_transform": _group_transform_provenance([transforms[code] for code in used]),
            "participants": used,
            "skipped": [code for code in codes if code not in used],
        }
        await settled_thread(lambda: _redis.set_bytes(cache_key, png_bytes))
        await settled_thread(lambda: _redis.set_json(metadata_cache_key, metadata))
        return png_bytes, metadata

    png_bytes, metadata = await _shared_response(
        (str(project.owner_id), cache_key, "group-png"), calculate,
    )
    return StreamingResponse(
        iter([png_bytes]),
        media_type="image/png",
        headers={**response_headers, **_group_heatmap_headers(copy.deepcopy(metadata))},
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
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    """Compare the exact persisted detector variants without duplicating gaze data."""

    project = await _verify_ownership(db, project_id, current_user)
    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"fixation_sensitivity_v1:stimulus-v1:{transform_token}"
        ),
        compute=lambda df: FixationDurationVariantService.compute_sensitivity(
            df, scenario
        ),
        response_model=FixationDurationSensitivityResponse,
        computation_error_status=422,
    )


@router.get("/fixations/histogram", response_model=FixationHistogramResponse)
async def fixation_histogram(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(default="all"),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)
    project = await _verify_ownership(db, project_id, current_user)

    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"fixation_histogram_v3:stimulus-v1:{transform_token}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        compute=lambda df: FixationHistogramService.compute_histogram(
            df,
            scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        ),
        response_model=FixationHistogramResponse,
        computation_error_status=422,
    )


@router.get("/aois", response_model=AoiMetricsResponse)
async def aoi_metrics(
    project_id: UUID,
    participant_code: str = Query(...),
    scenario: str = Query(...),
    min_fixation_duration_ms: int = DEFAULT_FIXATION_MIN_DURATION_MS,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
    reader: AnalyticsFrameReader = Depends(get_frame_reader),
):
    if is_all_scenarios(scenario):
        raise HTTPException(status_code=400, detail="scenario must be specified")
    min_fixation_duration_ms = _fixation_duration(min_fixation_duration_ms)

    project = await _verify_ownership(db, project_id, current_user)

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

    def compute(df):
        if not aois:
            try:
                fixation_metadata = FixationDataService.compute_fixation_data(
                    df, scenary.name,
                    min_fixation_duration_ms=min_fixation_duration_ms,
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            response = AoiMetricsResponse(
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
        else:
            # Resolve the stored AOI label against the frame in the service.
            try:
                result_data = AoiAnalyticsService.compute_metrics(
                    df, scenary.name, aois,
                    min_fixation_duration_ms=min_fixation_duration_ms,
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            response = AoiMetricsResponse(
                scenario=scenary.name, scenario_file_id=scenario_file_id, **result_data,
            )
        return response.model_dump(mode="json")

    return await cached_frame_endpoint(
        reader=reader,
        project=project,
        participant_code=participant_code,
        scenario=scenario,
        endpoint=lambda transform_token: (
            f"aois:v1:stimulus-v1:{transform_token}:{_aoi_cache_token(scenary, aois)}:"
            f"{_fixation_duration_cache_token(min_fixation_duration_ms)}"
        ),
        compute=compute,
        response_model=AoiMetricsResponse,
    )

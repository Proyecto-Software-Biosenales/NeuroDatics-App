from __future__ import annotations

import asyncio
import io
import logging
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import Awaitable, Callable
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import UUID

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ....analytics.application.services.parquet_reader_service import ParquetReaderService
from ....analytics.infrastructure.singleflight import settled_thread
from .....config.settings import settings
from neurodatics.shared.cache_generation import project_cache_generation
from ....integrations.storage_provider import build_isolated_drive_client
from ....projects.domain.entities import Project
from ....projects.infrastructure.image_cache import (
    ProjectImageRef,
    get_cached_project_image,
    load_project_image,
    project_image_ref,
)
from ....scenaries.domain.entities import Scenaries
from ...api.schemas import ExecutiveReportRequest
from ...infrastructure.pdf_adapter import PDFAdapter
from ...infrastructure.io_budget import ReportIOBudget
from ..sensor_reports import common, eeg, eye_tracking, gsr

logger = logging.getLogger(__name__)

REPORT_SENSOR_ORDER = ("EyeTracker", "GSR", "EEG")
REPORT_BUILDERS = {"EyeTracker": eye_tracking.build, "GSR": gsr.build, "EEG": eeg.build}
PDF_MEDIA_TYPE = "application/pdf"
ZIP_MEDIA_TYPE = "application/zip"
report_io_budget = ReportIOBudget(
    max_running=settings.report_io_max_concurrency,
    max_waiting=settings.report_io_max_waiting,
)


@dataclass(frozen=True)
class GeneratedReport:
    content: bytes
    filename: str
    media_type: str


async def _run_ordered_io(
    operations: Sequence[Callable[[], Awaitable[Any]]],
) -> List[Any]:
    """Run with a fixed worker count; results/exceptions retain input order."""

    if not operations:
        return []
    results: List[Any] = [None] * len(operations)
    next_index = 0

    async def worker() -> None:
        nonlocal next_index
        while next_index < len(operations):
            index = next_index
            next_index += 1
            try:
                results[index] = await report_io_budget.run(operations[index])
            except Exception as exc:
                results[index] = exc

    worker_count = min(settings.report_io_max_concurrency, len(operations))
    async with asyncio.TaskGroup() as task_group:
        for _ in range(worker_count):
            task_group.create_task(worker(), name="executive-report-io")
    return results


def normalize_sensor_name(sensor: str) -> Optional[str]:
    compact = str(sensor).lower().replace(" ", "").replace("_", "").replace("-", "")
    if compact in {"eyetracker", "eye"}:
        return "EyeTracker"
    if compact == "gsr" or "galvan" in compact:
        return "GSR"
    if compact == "eeg" or "electroencef" in compact:
        return "EEG"
    return None


def resolve_report_sensors(
    project_sensors: Sequence[str],
    mode_kind: str,
    selected_sensor: Optional[str] = None,
) -> List[str]:
    available = []
    for sensor in project_sensors:
        normalized = normalize_sensor_name(sensor)
        if normalized and normalized not in available:
            available.append(normalized)

    ordered_available = [sensor for sensor in REPORT_SENSOR_ORDER if sensor in available]
    if mode_kind == "comparative":
        return ordered_available

    normalized_selected = normalize_sensor_name(selected_sensor or "")
    if normalized_selected not in ordered_available:
        return []
    return [normalized_selected]


def is_video_scenario(scenary: Any) -> bool:
    scenario_type = str(getattr(scenary, "type", "") or "").strip().lower()
    source_path = str(getattr(scenary, "source_entry_path", "") or getattr(scenary, "name", "") or "").strip().lower()
    file = getattr(scenary, "file", None)
    mime_type = str(getattr(file, "mime_type", "") or "").strip().lower()
    video_extensions = (".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v")
    return (
        "video" in scenario_type
        or scenario_type in {"mp4", "mov", "webm", "avi", "mkv", "m4v"}
        or mime_type.startswith("video/")
        or source_path.endswith(video_extensions)
    )


def select_report_scenarios(scenaries: Iterable[Any]) -> List[Any]:
    return [scenary for scenary in scenaries if not is_video_scenario(scenary)]


# Version 1 report summaries. They are no longer rendered, but the numerical
# characterization golden pins their output, so they stay importable here.
def summarize_series(
    label: str,
    unit: str,
    time_values: Sequence[float],
    values: Sequence[float],
) -> Optional[Dict[str, Any]]:
    time_arr = np.asarray(time_values, dtype=float)
    value_arr = np.asarray(values, dtype=float)
    if time_arr.size != value_arr.size or value_arr.size == 0:
        return None

    finite = np.isfinite(time_arr) & np.isfinite(value_arr)
    if not finite.any():
        return None

    clean_time = time_arr[finite]
    clean_values = value_arr[finite]
    min_index = int(np.argmin(clean_values))
    max_index = int(np.argmax(clean_values))
    return {
        "label": label,
        "unit": unit,
        "count": int(clean_values.size),
        "mean": float(np.mean(clean_values)),
        "min": float(clean_values[min_index]),
        "min_time": float(clean_time[min_index]),
        "max": float(clean_values[max_index]),
        "max_time": float(clean_time[max_index]),
    }


def aggregate_summary_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault((str(row["label"]), str(row.get("unit") or "")), []).append(row)

    output = []
    for (label, unit), group in grouped.items():
        means = np.asarray([row["mean"] for row in group], dtype=float)
        mins = np.asarray([row["min"] for row in group], dtype=float)
        maxes = np.asarray([row["max"] for row in group], dtype=float)
        counts = np.asarray([row["count"] for row in group], dtype=float)
        output.append(
            {
                "label": label,
                "unit": unit,
                "count": int(np.sum(counts)),
                "mean": float(np.nanmean(means)),
                "min": float(np.nanmin(mins)),
                "max": float(np.nanmax(maxes)),
                "participants": len(group),
            }
        )
    return output


def _safe_filename(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    safe = re.sub(r"[^a-z0-9_-]+", "-", ascii_text.strip().lower())
    return re.sub(r"-{2,}", "-", safe).strip("-") or "informe"


def build_report_scenarios(
    project: Project,
    scenario_images: Dict[str, Optional[bytes]],
) -> List[common.ReportScenario]:
    scenarios = []
    for position, scenary in enumerate(select_report_scenarios(project.scenaries or []), start=1):
        name = str(scenary.name)
        scenarios.append(
            common.ReportScenario(
                name=name,
                label=common.scenario_label(name, position),
                position=position,
                aois=list(getattr(scenary, "aois", []) or []),
                image=scenario_images.get(name),
            )
        )
    return scenarios


def render_sensor_report(context: common.ReportContext) -> bytes:
    """Build one device report and lay it out as a PDF."""

    document = REPORT_BUILDERS[context.device.key](context)
    return PDFAdapter().render(document.as_json(), document.assets, timestamp=context.generated_at)


def report_filename(context: common.ReportContext, project_name: str, extension: str, device: Optional[common.Device] = None) -> str:
    scope = "grupo" if context.group else f"participante-{context.participants[0].code}"
    prefix = f"informe-{device.slug}" if device else "informes"
    stamp = context.generated_at.strftime("%Y%m%d-%H%M")
    return f"{prefix}-{_safe_filename(project_name)}-{_safe_filename(scope)}-{stamp}.{extension}"


def build_generated_report(project_name: str, contexts: Sequence[common.ReportContext]) -> GeneratedReport:
    """One device returns its PDF; several are packaged as one PDF per device in a ZIP."""

    documents = [(context, render_sensor_report(context)) for context in contexts]
    if len(documents) == 1:
        context, pdf = documents[0]
        return GeneratedReport(pdf, report_filename(context, project_name, "pdf", context.device), PDF_MEDIA_TYPE)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for context, pdf in documents:
            archive.writestr(report_filename(context, project_name, "pdf", context.device), pdf)
    return GeneratedReport(buffer.getvalue(), report_filename(contexts[0], project_name, "zip"), ZIP_MEDIA_TYPE)


class ExecutiveReportService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def generate(self, request: ExecutiveReportRequest, current_user: str) -> GeneratedReport:
        project = await self._load_project(request.project_id, UUID(current_user))
        project_sensors = [sensor.sensor_type for sensor in project.sensors]
        selected_sensors = resolve_report_sensors(project_sensors, request.mode.kind, request.mode.sensor)
        if not selected_sensors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay sensores disponibles para el modo seleccionado",
            )

        all_scenarios = list(project.scenaries or [])
        if not select_report_scenarios(all_scenarios):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay escenarios de imagen disponibles para generar el informe",
            )

        participant_codes = self._resolve_participant_codes(project, request)
        # The already loaded project fixes one generation for every participant in
        # the report, so a re-ingestion mid-render cannot mix two ingestions into
        # the same PDF or disagree with the dashboard the report was launched from.
        frames, data_warnings = await self._read_participant_frames(
            project.id,
            participant_codes,
            project_cache_generation(project),
        )
        if not frames:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No hay datos procesados para generar el informe",
            )

        scenario_images = await self._load_scenario_images(project)
        notices = list(data_warnings)
        omitted_videos = len(all_scenarios) - len(select_report_scenarios(all_scenarios))
        if omitted_videos:
            notices.append(
                f"Se {'omitió' if omitted_videos == 1 else 'omitieron'} {omitted_videos} "
                f"escenario{'s' if omitted_videos != 1 else ''} de video: los informes analizan estímulos de imagen."
            )
        if any(image is None for image in scenario_images.values()):
            notices.append("Algunas imágenes de estímulo no se pudieron cargar; sus mapas se dibujan sobre un lienzo neutro.")

        generated_at = datetime.now(timezone.utc).replace(microsecond=0)
        participants = [
            common.ReportParticipant(code=code, alias=alias, color=color, frame=frames[code])
            for code, alias, color in common.participant_aliases([code for code in participant_codes if code in frames])
        ]
        scenarios = build_report_scenarios(project, scenario_images)
        contexts = [
            common.ReportContext(
                project_name=str(project.name),
                device=common.DEVICES[sensor],
                participants=participants,
                scenarios=scenarios,
                group=request.scope.kind == "all_participants",
                generated_at=generated_at,
                include_cover=request.include_cover,
                include_metadata=request.include_metadata,
                notices=notices,
            )
            for sensor in selected_sensors
        ]
        return await settled_thread(
            lambda: build_generated_report(str(project.name), contexts)
        )

    async def _load_project(self, project_id: UUID, owner_id: UUID) -> Project:
        result = await self._db.execute(
            select(Project)
            .options(
                selectinload(Project.sensors),
                selectinload(Project.participants),
                selectinload(Project.scenaries).selectinload(Scenaries.aois),
                selectinload(Project.scenaries).selectinload(Scenaries.file),
            )
            .where(Project.id == project_id, Project.owner_id == owner_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    def _resolve_participant_codes(self, project: Project, request: ExecutiveReportRequest) -> List[str]:
        available = [participant.participant_code for participant in project.participants]
        if request.scope.kind == "participant":
            code = str(request.scope.participant_code or "").strip()
            if code not in available:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
            return [code]
        if not available:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El proyecto no tiene participantes")
        return available

    async def _read_participant_frames(
        self,
        project_id: UUID,
        participant_codes: Sequence[str],
        generation: object = None,
    ) -> Tuple[Dict[str, pd.DataFrame], List[str]]:
        reader = ParquetReaderService(self._db)
        frames: Dict[str, pd.DataFrame] = {}
        warnings: List[str] = []
        try:
            batch = await reader.prepare_batch(
                project_id,
                list(participant_codes),
                generation,
            )
        except Exception as exc:
            logger.warning("Could not prepare executive report data batch: %s", exc)
            return {}, [
                f"No se pudieron cargar los datos del participante {code}."
                for code in participant_codes
            ]

        ordered_reads = [
            (code, batch.reads[code])
            for code in participant_codes
            if code in batch.reads
        ]
        operations = [
            (
                lambda prepared=prepared: reader.read_prepared(
                    prepared,
                    batch.storage_client,
                )
            )
            for _, prepared in ordered_reads
        ]
        outcomes = await _run_ordered_io(operations)
        outcome_by_code = {
            code: outcome
            for (code, _), outcome in zip(ordered_reads, outcomes)
        }
        for code in participant_codes:
            outcome = outcome_by_code.get(code, batch.errors.get(code))
            if isinstance(outcome, pd.DataFrame):
                frames[code] = outcome
                continue
            if outcome is None:
                outcome = RuntimeError("participant was not resolved")
            logger.warning(
                "Could not load participant %s for executive report: %s",
                code,
                outcome,
            )
            warnings.append(f"No se pudieron cargar los datos del participante {code}.")
        return frames, warnings

    async def _load_scenario_images(self, project: Project) -> Dict[str, Optional[bytes]]:
        images: Dict[str, Optional[bytes]] = {}
        refs_by_key: Dict[str, ProjectImageRef] = {}
        scenario_keys: Dict[str, str] = {}
        for scenary in select_report_scenarios(project.scenaries or []):
            name = str(scenary.name)
            images[name] = None
            project_file = getattr(scenary, "file", None)
            if not project_file or not getattr(scenary, "file_id", None):
                continue
            if (
                getattr(project_file, "id", None) != scenary.file_id
                or getattr(project_file, "project_id", None) != project.id
                or getattr(project_file, "deleted_at", None) is not None
            ):
                continue
            try:
                ref = project_image_ref(project_file)
            except (ValueError, FileNotFoundError):
                continue
            refs_by_key.setdefault(ref.cache_key, ref)
            scenario_keys[name] = ref.cache_key

        misses: List[Tuple[str, ProjectImageRef]] = []
        loaded_by_key = {}
        # Cache probing is serial and task-free.  Only if a remote miss exists do
        # we resolve OAuth on this request's DB, still before concurrent workers.
        for cache_key, ref in refs_by_key.items():
            cached = await get_cached_project_image(ref)
            if cached is None:
                misses.append((cache_key, ref))
            else:
                loaded_by_key[cache_key] = cached.content

        storage_client = await self._build_drive_client() if misses else None
        operations = [
            (
                lambda ref=ref: load_project_image(ref, storage_client)
            )
            for _, ref in misses
        ]
        outcomes = await _run_ordered_io(operations)
        for (cache_key, ref), outcome in zip(misses, outcomes):
            if not isinstance(outcome, Exception):
                loaded_by_key[cache_key] = outcome.content
            else:
                logger.info(
                    "Could not load scenario image file %s for report: %s",
                    ref.file_id,
                    outcome,
                )

        for name, cache_key in scenario_keys.items():
            images[name] = loaded_by_key.get(cache_key)
        return images

    async def _build_drive_client(self):
        return await build_isolated_drive_client(self._db)

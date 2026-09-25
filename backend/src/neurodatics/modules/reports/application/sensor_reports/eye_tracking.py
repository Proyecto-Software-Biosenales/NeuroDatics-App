"""Eye Tracking report: where participants looked and how their eyes responded."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, TypeVar

import numpy as np
import pandas as pd

from ....analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    FixationEventService,
    FixationHistogramService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
)
from . import charts, common, methodology, stimulus
from . import document as doc
from . import formatting as fmt
from .statistics import Descriptive, describe, from_service, mean_and_sd

logger = logging.getLogger(__name__)

T = TypeVar("T")

MAX_SCANPATH_THUMBNAILS = 12
HALF_CHART_MM = 101.0
TIME_AXIS = "Tiempo desde el inicio del escenario (s)"
OUTSIDE_AOI_COLOR = "#D4D4D4"

INTRO_INDIVIDUAL = (
    "Este informe muestra dónde miró el participante en cada escenario, cuánto tiempo dedicó a cada "
    "área de interés y cómo evolucionaron su pupila, su punto de mirada y su distancia a la pantalla."
)
INTRO_GROUP = (
    "Este informe agrega la atención visual de todos los participantes por escenario: mapa de calor "
    "común, recorridos individuales, áreas de interés y respuesta pupilar, con la variación entre personas."
)


def _best_effort(label: str, compute: Callable[[], T], default: T) -> T:
    try:
        return compute()
    except Exception as exc:
        logger.warning("Eye Tracking report %s unavailable (%s)", label, type(exc).__name__)
        return default


@dataclass
class EyeRecording:
    participant: common.ReportParticipant
    start_s: float
    duration_s: Optional[float]
    events: pd.DataFrame
    durations_ms: np.ndarray
    first_fixation_s: Optional[float]
    histogram: Dict[str, Any]
    scanpath: Dict[str, Any]
    aoi: Optional[Dict[str, Any]]
    pupil_time: np.ndarray
    pupil_left: np.ndarray
    pupil_right: np.ndarray
    pupil_average: np.ndarray
    pupil_stats: Dict[str, Optional[Descriptive]]
    gaze_time: np.ndarray
    gaze_x: np.ndarray
    gaze_y: np.ndarray
    gaze_stats: Dict[str, Optional[Descriptive]]
    distance_time: np.ndarray
    distance: np.ndarray
    distance_stats: Optional[Descriptive]

    @property
    def fixation_count(self) -> int:
        return int(self.durations_ms.size)

    @property
    def fixated_s(self) -> float:
        return float(self.durations_ms.sum()) / 1000.0 if self.durations_ms.size else 0.0

    def fixation_stat(self, reducer: Callable[[np.ndarray], float]) -> Optional[float]:
        return float(reducer(self.durations_ms)) if self.durations_ms.size else None


def _array(values: Any) -> np.ndarray:
    return np.asarray(values if values is not None else [], dtype=float)


def collect(participant: common.ReportParticipant, scenario: common.ReportScenario) -> Optional[EyeRecording]:
    frame = participant.frame
    scoped = common.scenario_frame(frame, scenario.name)
    start = common.scenario_start(scoped)
    if scoped.empty or start is None:
        return None
    name = scenario.name

    events = _best_effort(
        "fixation events",
        lambda: FixationEventService.build_events(frame, scenario=name)[0],
        FixationEventService.empty_events(),
    )
    durations = _array(events["duration_s"]) * 1000.0 if not events.empty else np.asarray([], dtype=float)
    durations = durations[np.isfinite(durations) & (durations > 0)]
    first_fixation = None
    if not events.empty:
        times = _array(events["time_s"])
        times = times[np.isfinite(times)]
        if times.size:
            first_fixation = max(0.0, float(times.min()) - start)

    histogram = _best_effort("histogram", lambda: FixationHistogramService.compute_histogram(frame, name), {"bins": []})
    scanpath = _best_effort("scanpath", lambda: ScanpathAnalyticsService.compute_scanpath(frame, name), {"objectives": []})
    aoi = None
    if scenario.aois:
        aoi = _best_effort("AOI metrics", lambda: AoiAnalyticsService.compute_metrics(frame, name, list(scenario.aois)), None)

    pupil = _best_effort("pupil", lambda: PupilAnalyticsService.compute_timeseries(frame, name), {})
    pupil_time = _array(pupil.get("time")) - start
    left_raw, right_raw = _array(pupil.get("left")), _array(pupil.get("right"))
    smooth_left, smooth_right = _array(pupil.get("smooth_left")), _array(pupil.get("smooth_right"))
    if not (left_raw.size == right_raw.size == smooth_left.size == smooth_right.size == pupil_time.size):
        left_raw = right_raw = smooth_left = smooth_right = pupil_time = np.asarray([], dtype=float)
    with np.errstate(invalid="ignore"):
        left_valid = (left_raw > 0) & (smooth_left > 0)
        right_valid = (right_raw > 0) & (smooth_right > 0)
    pupil_left = np.where(left_valid, smooth_left, np.nan)
    pupil_right = np.where(right_valid, smooth_right, np.nan)
    pupil_average = np.where(
        left_valid & right_valid,
        (smooth_left + smooth_right) / 2.0,
        np.where(left_valid, smooth_left, np.where(right_valid, smooth_right, np.nan)),
    )

    gaze = _best_effort("gaze", lambda: PupilAnalyticsService.compute_gaze_timeseries(frame, name), {})
    gaze_time = _array(gaze.get("time")) - start
    gaze_x, gaze_y = _array(gaze.get("gx_clean")), _array(gaze.get("gy_clean"))
    if not (gaze_x.size == gaze_y.size == gaze_time.size):
        gaze_x = gaze_y = gaze_time = np.asarray([], dtype=float)
    # The timeseries encodes an invalid sample as (0, 0); the chart shows a gap instead.
    lost = (gaze_x == 0) & (gaze_y == 0)
    gaze_stats_payload = _best_effort("gaze statistics", lambda: PupilAnalyticsService.compute_gaze_statistics(frame, name), {})

    distance_payload = _best_effort("distance", lambda: PupilAnalyticsService.compute_distance_timeseries(frame, name), {})
    distance_time = _array(distance_payload.get("time")) - start
    distance = _array(distance_payload.get("distance_cm"))
    if distance.size != distance_time.size:
        distance = distance_time = np.asarray([], dtype=float)
    distance_stats_payload = _best_effort(
        "distance statistics", lambda: PupilAnalyticsService.compute_distance_statistics(frame, name), {}
    )

    return EyeRecording(
        participant=participant,
        start_s=start,
        duration_s=common.scenario_duration(scoped),
        events=events,
        durations_ms=durations,
        first_fixation_s=first_fixation,
        histogram=histogram,
        scanpath=scanpath,
        aoi=aoi,
        pupil_time=pupil_time,
        pupil_left=pupil_left,
        pupil_right=pupil_right,
        pupil_average=pupil_average,
        pupil_stats={
            "Promedio": describe(pupil_average, pupil_time),
            "Izquierda": describe(pupil_left, pupil_time),
            "Derecha": describe(pupil_right, pupil_time),
        },
        gaze_time=gaze_time,
        gaze_x=np.where(lost, np.nan, gaze_x),
        gaze_y=np.where(lost, np.nan, gaze_y),
        gaze_stats={
            "X": from_service(gaze_stats_payload, gaze_time.size, "gx_"),
            "Y": from_service(gaze_stats_payload, gaze_time.size, "gy_"),
        },
        distance_time=distance_time,
        distance=distance,
        distance_stats=from_service(distance_stats_payload, distance.size, "", distance_time, distance),
    )


# ------------------------------------------------------------------ AOI helpers


def _aoi_rows(recording: EyeRecording) -> List[Dict[str, Any]]:
    if not recording.aoi:
        return []
    return sorted(recording.aoi.get("aois") or [], key=lambda row: str(row.get("name", "")).lower())


def _relative_ttff_s(recording: EyeRecording, row: Dict[str, Any]) -> Optional[float]:
    """TTFF from scenario onset; the metrics service reports the recording clock."""

    ttff_ms = fmt.finite(row.get("ttff_ms"))
    if ttff_ms is None:
        return None
    return max(0.0, ttff_ms / 1000.0 - recording.start_s)


@dataclass
class AoiSummary:
    id: str
    name: str
    color: str
    viewers: int
    participants: int
    fixations: Tuple[Optional[float], Optional[float]]
    dwell_percent: Tuple[Optional[float], Optional[float]]
    avg_duration_ms: Optional[float]
    ttff_s: Tuple[Optional[float], Optional[float]]


def summarize_aois(recordings: Sequence[EyeRecording]) -> List[AoiSummary]:
    by_id: Dict[str, List[Tuple[EyeRecording, Dict[str, Any]]]] = {}
    order: List[str] = []
    for recording in recordings:
        for row in _aoi_rows(recording):
            key = str(row.get("id"))
            if key not in by_id:
                order.append(key)
            by_id.setdefault(key, []).append((recording, row))
    summaries = []
    with_aoi_data = sum(1 for recording in recordings if recording.aoi)
    for key in order:
        entries = by_id[key]
        first = entries[0][1]
        viewed = [(recording, row) for recording, row in entries if (row.get("fixation_count") or 0) > 0]
        fixations = mean_and_sd(row.get("fixation_count") for _, row in entries)
        dwell = mean_and_sd(row.get("total_dwell_time_percent") for _, row in entries)
        ttff = mean_and_sd(_relative_ttff_s(recording, row) for recording, row in viewed)
        summaries.append(
            AoiSummary(
                id=key,
                name=str(first.get("name") or "AOI"),
                color=str(first.get("color") or charts.SERIES_COLORS[0]),
                viewers=len(viewed),
                participants=with_aoi_data,
                fixations=fixations[:2],
                dwell_percent=dwell[:2],
                avg_duration_ms=mean_and_sd(row.get("avg_fixation_duration_ms") for _, row in viewed)[0],
                ttff_s=ttff[:2],
            )
        )
    return summaries


def _outside_percent(recordings: Sequence[EyeRecording]) -> Tuple[Optional[float], Optional[float]]:
    values = []
    for recording in recordings:
        if not recording.aoi or not recording.fixation_count:
            continue
        observed = fmt.finite(recording.aoi.get("observed_aoi_dwell_time_percent"))
        if observed is not None:
            values.append(max(0.0, 100.0 - observed))
    mean, sd, _ = mean_and_sd(values)
    return mean, sd


def _aoi_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    scenario: common.ReportScenario,
    recordings: Sequence[EyeRecording],
) -> List[doc.Block]:
    summaries = summarize_aois(recordings)
    if not summaries:
        return []
    blocks: List[doc.Block] = [doc.heading("Áreas de interés (AOI)")]
    outside_mean, outside_sd = _outside_percent(recordings)
    labels = [summary.name for summary in summaries] + ["Fuera de AOIs"]
    values = [summary.dwell_percent[0] for summary in summaries] + [outside_mean]
    colors = [summary.color for summary in summaries] + [OUTSIDE_AOI_COLOR]
    errors = [summary.dwell_percent[1] for summary in summaries] + [outside_sd] if context.group else None
    value_labels = [
        fmt.mean_sd(value, error, 1, "%") if context.group else fmt.percent(value)
        for value, error in zip(values, errors or [None] * len(values))
    ]
    chart = charts.bar_chart(
        labels,
        values,
        value_labels=value_labels,
        axis_label="Tiempo fijado en el área (%)",
        colors=colors,
        errors=errors,
        limit=(0.0, 100.0),
    )
    blocks.append(
        doc.figure(
            report.add_asset(f"{scenario.position}-aoi-dwell", chart, "svg"),
            "Distribución del tiempo fijado",
            "Porcentaje del tiempo total de fijación que recae en cada área"
            + ("; media y desviación estándar entre participantes." if context.group else "."),
        )
    )
    if context.group:
        rows = [
            doc.row(
                [
                    summary.name,
                    fmt.count_of(summary.viewers, summary.participants),
                    fmt.mean_sd(*summary.fixations, 1),
                    fmt.mean_sd(*summary.dwell_percent, 1, "%"),
                    fmt.mean_sd(*summary.ttff_s, 2),
                    fmt.number(summary.avg_duration_ms, 0),
                ],
                swatch=summary.color,
            )
            for summary in summaries
        ]
        blocks.append(
            doc.table(
                [
                    doc.column("AOI", "left", "1fr"),
                    doc.column("Lo miraron"),
                    doc.column("Fijaciones"),
                    doc.column("Tiempo en AOI"),
                    doc.column("TTFF (s)"),
                    doc.column("Duración media (ms)"),
                ],
                rows,
                title="Métricas por AOI",
                description="Fijaciones y tiempo en AOI como media ± DE entre participantes; TTFF y duración media solo entre quienes miraron el área.",
            )
        )
        return blocks

    recording = recordings[0]
    rows = [
        doc.row(
            [
                str(row.get("name") or "AOI"),
                fmt.integer(row.get("fixation_count")),
                fmt.number(row.get("total_dwell_time_ms"), 0),
                fmt.percent(row.get("total_dwell_time_percent")),
                fmt.number(row.get("avg_fixation_duration_ms"), 0),
                fmt.number(_relative_ttff_s(recording, row), 2),
                fmt.percent(row.get("hit_rate_percent")),
                fmt.integer(row.get("fixations_to_target")) if row.get("fixations_to_target") else fmt.MISSING,
            ],
            swatch=str(row.get("color") or charts.SERIES_COLORS[0]),
        )
        for row in _aoi_rows(recording)
    ]
    blocks.append(
        doc.table(
            [
                doc.column("AOI", "left", "1fr"),
                doc.column("Fijaciones"),
                doc.column("Permanencia (ms)"),
                doc.column("Tiempo en AOI"),
                doc.column("Duración media (ms)"),
                doc.column("TTFF (s)"),
                doc.column("Tasa de acierto"),
                doc.column("Fij. hasta el AOI"),
            ],
            rows,
            title="Métricas por AOI",
            description="TTFF medido desde el inicio del escenario. «—» indica que el área no recibió fijaciones.",
        )
    )
    transitions = [item for item in (recording.aoi or {}).get("transitions") or [] if item.get("total")]
    names = [str(row.get("name") or "AOI") for row in _aoi_rows(recording)]
    if len(names) > 1 and transitions:
        by_source = {str(item.get("from_aoi")): item for item in recording.aoi.get("transitions") or []}
        matrix_rows = []
        for source in names:
            counts = (by_source.get(source) or {}).get("counts") or {}
            matrix_rows.append(
                doc.row(
                    [source]
                    + [fmt.MISSING if target == source else fmt.integer(counts.get(target, 0)) for target in names]
                    + [fmt.integer((by_source.get(source) or {}).get("total", 0))]
                )
            )
        blocks.append(
            doc.table(
                [doc.column("Desde \\ Hacia", "left", "1fr")]
                + [doc.column(name) for name in names]
                + [doc.column("Total")],
                matrix_rows,
                title="Transiciones entre AOIs",
                description="Número de veces que la mirada pasó directamente de un área (fila) a otra (columna).",
            )
        )
    return blocks


# ------------------------------------------------------------------ section blocks


def _stimulus_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    scenario: common.ReportScenario,
    recordings: Sequence[EyeRecording],
) -> List[doc.Block]:
    canvas = stimulus._open_base_image(scenario.image)
    portrait = stimulus.stimulus_aspect_ratio(canvas) < 1.0
    blocks: List[doc.Block] = [doc.heading("Mapa de calor y recorrido visual")]
    if scenario.image is None:
        blocks.append(doc.paragraph("La imagen del estímulo no está disponible; los mapas se dibujan sobre un lienzo neutro.", muted=True))
    viewed = [recording for recording in recordings if recording.fixation_count]
    if not viewed:
        blocks.append(doc.callout("Sin fijaciones", ["No se detectaron fijaciones sobre el estímulo en este escenario."]))
        return blocks

    items = []
    events = pd.concat([recording.events for recording in viewed], ignore_index=True)
    heatmap = stimulus.heatmap_figure(canvas, events, scenario.aois if context.group else ())
    if heatmap is not None:
        items.append(
            doc.image(
                report.add_asset(f"{scenario.position}-heatmap", stimulus.encode_jpeg(heatmap), "jpg"),
                heatmap.width / heatmap.height,
                "Mapa de calor del grupo" if context.group else "Mapa de calor",
                "Fijaciones de todos los participantes, ponderadas por duración."
                if context.group
                else "Zonas más cálidas: mayor tiempo de fijación.",
            )
        )
    if not context.group:
        recording = viewed[0]
        scanpath = stimulus.scanpath_figure(canvas, recording.scanpath, scenario.aois)
        if scanpath is not None:
            items.append(
                doc.image(
                    report.add_asset(f"{scenario.position}-scanpath", stimulus.encode_jpeg(scanpath), "jpg"),
                    scanpath.width / scanpath.height,
                    "Recorrido visual",
                    "Fijaciones numeradas en orden de aparición"
                    + ("; las áreas de interés aparecen delineadas." if scenario.aois else "."),
                    key=stimulus.scanpath_key(canvas, recording.scanpath),
                )
            )
    if items:
        blocks.append(doc.image_grid(items, columns=2 if portrait and len(items) > 1 else 1, max_height_mm=118 if portrait else 92))

    if context.group:
        thumbnails = []
        for recording in viewed[:MAX_SCANPATH_THUMBNAILS]:
            figure = stimulus.scanpath_figure(canvas, recording.scanpath)
            if figure is None:
                continue
            thumbnails.append(
                doc.image(
                    report.add_asset(
                        f"{scenario.position}-scanpath-{recording.participant.alias}",
                        stimulus.encode_jpeg(figure, max_edge=900, quality=82),
                        "jpg",
                    ),
                    figure.width / figure.height,
                    recording.participant.alias,
                    f"{recording.fixation_count} fijaciones · {fmt.number(recording.fixated_s, 2, 's')}",
                )
            )
        if thumbnails:
            omitted = len(viewed) - len(thumbnails)
            blocks.append(
                doc.image_grid(
                    thumbnails,
                    columns=4 if portrait else 3,
                    max_height_mm=62 if portrait else 34,
                    title="Recorridos individuales",
                    description="Mismo tamaño de círculo para la misma duración en todos los participantes."
                    + (f" Se muestran los primeros {len(thumbnails)}; {omitted} más en las tablas." if omitted > 0 else ""),
                )
            )
    elif scenario.aois and heatmap is None:
        figure = stimulus.aoi_figure(canvas, scenario.aois)
        blocks.append(
            doc.image_grid(
                [doc.image(report.add_asset(f"{scenario.position}-aois", stimulus.encode_jpeg(figure), "jpg"), figure.width / figure.height, "Áreas de interés")],
                columns=1,
                max_height_mm=92,
            )
        )
    return blocks


def _fixation_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    scenario: common.ReportScenario,
    recordings: Sequence[EyeRecording],
) -> List[doc.Block]:
    blocks: List[doc.Block] = [doc.heading("Fijaciones")]
    if context.group:
        rows = [
            doc.row(
                [
                    recording.participant.alias,
                    fmt.integer(recording.fixation_count),
                    fmt.number(recording.fixated_s, 2),
                    fmt.number(recording.fixation_stat(np.mean), 0),
                    fmt.number(recording.fixation_stat(np.median), 0),
                    fmt.number(recording.fixation_stat(np.max), 0),
                    fmt.number(recording.first_fixation_s, 2),
                ],
                swatch=recording.participant.color,
            )
            for recording in recordings
        ]
        pickers: List[Callable[[EyeRecording], Optional[float]]] = [
            lambda r: r.fixation_count,
            lambda r: r.fixated_s,
            lambda r: r.fixation_stat(np.mean),
            lambda r: r.fixation_stat(np.median),
            lambda r: r.fixation_stat(np.max),
            lambda r: r.first_fixation_s,
        ]
        decimals = (1, 2, 0, 0, 0, 2)
        summaries = [mean_and_sd(pick(recording) for recording in recordings) for pick in pickers]
        if len(recordings) > 1:
            rows.append(doc.row(["Media del grupo"] + [fmt.number(s[0], d) for s, d in zip(summaries, decimals)], emphasis=True))
            rows.append(doc.row(["DE entre participantes"] + [fmt.number(s[1], d) for s, d in zip(summaries, decimals)], emphasis=True))
        chart = charts.bar_chart(
            [recording.participant.alias for recording in recordings],
            [recording.fixated_s for recording in recordings],
            value_labels=[f"{fmt.number(recording.fixated_s, 2, 's')} · {recording.fixation_count} fij." for recording in recordings],
            axis_label="Tiempo fijado (s)",
            colors=[recording.participant.color for recording in recordings],
        )
        blocks.append(
            doc.figure(
                report.add_asset(f"{scenario.position}-fixated-time", chart, "svg"),
                "Tiempo fijado por participante",
                "Suma de la duración de las fijaciones en el escenario.",
            )
        )
        blocks.append(
            doc.table(
                [
                    doc.column("Participante", "left", "1fr"),
                    doc.column("Fijaciones"),
                    doc.column("Tiempo fijado (s)"),
                    doc.column("Media (ms)"),
                    doc.column("Mediana (ms)"),
                    doc.column("Máx. (ms)"),
                    doc.column("1.ª fijación (s)"),
                ],
                rows,
                title="Fijaciones por participante",
            )
        )
        return blocks

    recording = recordings[0]
    bins = recording.histogram.get("bins") or []
    if not bins:
        return []
    total = sum(int(item.get("conteo") or 0) for item in bins)
    chart = charts.bar_chart(
        [str(item.get("label")) for item in bins],
        [item.get("conteo") for item in bins],
        value_labels=[fmt.integer(item.get("conteo")) for item in bins],
        axis_label="Fijaciones",
        horizontal=False,
        width_mm=HALF_CHART_MM,
        height_mm=48.0,
    )
    table = doc.table(
        [doc.column("Rango (ms)", "left", "1fr"), doc.column("Fij."), doc.column("%"), doc.column("Media (ms)")],
        [
            doc.row(
                [
                    str(item.get("label")),
                    fmt.integer(item.get("conteo")),
                    fmt.number(item.get("porcentaje"), 1),
                    fmt.number(item.get("promedio_ms"), 0) if item.get("conteo") else fmt.MISSING,
                ]
            )
            for item in bins
        ]
        + [doc.row(["Total", fmt.integer(total), "100", fmt.number(recording.fixation_stat(np.mean), 0)], emphasis=True)],
    )
    blocks.append(
        doc.columns(
            [
                doc.figure(
                    report.add_asset(f"{scenario.position}-histogram", chart, "svg"),
                    "Distribución de duraciones",
                    "Número de fijaciones por intervalo de duración (regla de Sturges).",
                )
            ],
            [table],
            widths=["3fr", "2fr"],
        )
    )
    return blocks


def _signal_series(
    recordings: Sequence[EyeRecording],
    time_of: Callable[[EyeRecording], np.ndarray],
    values_of: Callable[[EyeRecording], np.ndarray],
) -> List[charts.Series]:
    return [
        charts.Series(recording.participant.alias, time_of(recording), values_of(recording), recording.participant.color, width=1.0)
        for recording in recordings
        if values_of(recording).size and np.isfinite(values_of(recording)).any()
    ]


def _pupil_blocks(context, report, scenario, recordings) -> List[doc.Block]:
    usable = [recording for recording in recordings if recording.pupil_stats.get("Promedio")]
    if not usable:
        return []
    blocks: List[doc.Block] = [doc.heading("Dilatación pupilar")]
    if context.group:
        chart = charts.line_chart(
            _signal_series(usable, lambda r: r.pupil_time, lambda r: r.pupil_average),
            x_label=TIME_AXIS,
            y_label="Diámetro (mm)",
        )
        blocks.append(
            doc.keep_together(
                [
                    doc.figure(report.add_asset(f"{scenario.position}-pupil", chart, "svg"), "Diámetro pupilar por participante", "Promedio de ambos ojos, suavizado a 0,25 s."),
                    common.stat_table(
                        [(recording.participant.alias, recording.pupil_stats["Promedio"], recording.participant.color) for recording in usable],
                        decimals=3,
                        unit="mm",
                        first_column="Participante",
                        title="Estadísticas de la pupila (promedio de ambos ojos)",
                        group_rows=True,
                    ),
                ]
            )
        )
        return blocks
    recording = usable[0]
    series = [
        charts.Series("Pupila izquierda", recording.pupil_time, recording.pupil_left, charts.SERIES_COLORS[0]),
        charts.Series("Pupila derecha", recording.pupil_time, recording.pupil_right, charts.SERIES_COLORS[1]),
    ]
    chart = charts.line_chart(series, x_label=TIME_AXIS, y_label="Diámetro (mm)")
    blocks.append(
        doc.keep_together(
            [
                doc.figure(report.add_asset(f"{scenario.position}-pupil", chart, "svg"), "Diámetro pupilar", "Señal suavizada con media móvil de 0,25 s."),
                common.stat_table(
                    [
                        ("Promedio", recording.pupil_stats["Promedio"], None),
                        ("Izquierda", recording.pupil_stats["Izquierda"], charts.SERIES_COLORS[0]),
                        ("Derecha", recording.pupil_stats["Derecha"], charts.SERIES_COLORS[1]),
                    ],
                    decimals=3,
                    unit="mm",
                    first_column="Serie",
                    title="Estadísticas de la pupila",
                ),
            ]
        )
    )
    return blocks


def _gaze_blocks(context, report, scenario, recordings) -> List[doc.Block]:
    usable = [recording for recording in recordings if recording.gaze_stats.get("X")]
    if not usable:
        return []
    blocks: List[doc.Block] = [doc.heading("Punto de mirada")]
    if context.group:
        rows = [
            doc.row(
                [
                    recording.participant.alias,
                    fmt.integer(recording.gaze_stats["X"].count),
                    fmt.number(recording.gaze_stats["X"].mean, 1),
                    fmt.number(recording.gaze_stats["X"].sd, 1),
                    fmt.number(recording.gaze_stats["Y"].mean, 1) if recording.gaze_stats.get("Y") else fmt.MISSING,
                    fmt.number(recording.gaze_stats["Y"].sd, 1) if recording.gaze_stats.get("Y") else fmt.MISSING,
                ],
                swatch=recording.participant.color,
            )
            for recording in usable
        ]
        if len(usable) > 1:
            x_mean = mean_and_sd(recording.gaze_stats["X"].mean for recording in usable)
            y_mean = mean_and_sd(recording.gaze_stats["Y"].mean for recording in usable if recording.gaze_stats.get("Y"))
            rows.append(doc.row(["Media del grupo", fmt.MISSING, fmt.number(x_mean[0], 1), fmt.number(x_mean[1], 1), fmt.number(y_mean[0], 1), fmt.number(y_mean[1], 1)], emphasis=True))
        blocks.append(
            doc.table(
                [
                    doc.column("Participante", "left", "1fr"),
                    doc.column("N"),
                    doc.column("X media (%)"),
                    doc.column("X DE"),
                    doc.column("Y media (%)"),
                    doc.column("Y DE"),
                ],
                rows,
                title="Posición media de la mirada",
                description="Posición en % del ancho (X) y del alto (Y) del estímulo, desde la esquina superior izquierda. En la fila de grupo, la DE es entre participantes.",
            )
        )
        return blocks
    recording = usable[0]
    chart = charts.line_chart(
        [
            charts.Series("Posición X", recording.gaze_time, recording.gaze_x, charts.SERIES_COLORS[0]),
            charts.Series("Posición Y", recording.gaze_time, recording.gaze_y, charts.SERIES_COLORS[1]),
        ],
        x_label=TIME_AXIS,
        y_label="Posición en el estímulo (%)",
    )
    figure = doc.figure(report.add_asset(f"{scenario.position}-gaze", chart, "svg"), "Posición de la mirada", "0 % corresponde al borde izquierdo (X) y superior (Y) del estímulo; los huecos son muestras sin mirada válida.")
    rows = []
    for label, stats, color in (("Posición X", recording.gaze_stats["X"], charts.SERIES_COLORS[0]), ("Posición Y", recording.gaze_stats.get("Y"), charts.SERIES_COLORS[1])):
        if stats is None:
            continue
        rows.append(
            doc.row(
                [label, fmt.integer(stats.count)]
                + [fmt.number(value, 1) for value in (stats.mean, stats.sd, stats.median, stats.minimum, stats.maximum)],
                swatch=color,
            )
        )
    table = doc.table(
        [doc.column("Serie", "left", "1fr"), doc.column("N"), doc.column("Media"), doc.column("DE"), doc.column("Mediana"), doc.column("Mín."), doc.column("Máx.")],
        rows,
        title="Estadísticas del punto de mirada",
        note="Valores en % del estímulo salvo N (muestras).",
    )
    blocks.append(doc.keep_together([figure, table]))
    return blocks


def _distance_blocks(context, report, scenario, recordings) -> List[doc.Block]:
    usable = [recording for recording in recordings if recording.distance_stats]
    if not usable:
        return []
    blocks: List[doc.Block] = [doc.heading("Distancia al dispositivo")]
    if context.group:
        chart = charts.line_chart(
            _signal_series(usable, lambda r: r.distance_time, lambda r: r.distance),
            x_label=TIME_AXIS,
            y_label="Distancia (cm)",
        )
        description = "Distancia de los ojos a la pantalla de cada participante."
        rows = [(recording.participant.alias, recording.distance_stats, recording.participant.color) for recording in usable]
        first_column = "Participante"
    else:
        recording = usable[0]
        chart = charts.line_chart(
            [charts.Series("Distancia", recording.distance_time, recording.distance, charts.SERIES_COLORS[0])],
            x_label=TIME_AXIS,
            y_label="Distancia (cm)",
            extremes=charts.Extremes(0, "cm", 1),
        )
        description = "Distancia de los ojos a la pantalla durante el escenario."
        rows = [("Distancia", recording.distance_stats, None)]
        first_column = "Serie"
    blocks.append(
        doc.keep_together(
            [
                doc.figure(report.add_asset(f"{scenario.position}-distance", chart, "svg"), "Distancia a la pantalla", description),
                common.stat_table(rows, decimals=1, unit="cm", first_column=first_column, title="Estadísticas de distancia", group_rows=context.group),
            ]
        )
    )
    return blocks


def _scenario_kpis(context: common.ReportContext, recordings: Sequence[EyeRecording]) -> doc.Block:
    if context.group:
        viewed = [recording for recording in recordings if recording.fixation_count]
        fixations = mean_and_sd(recording.fixation_count for recording in recordings)
        fixated = mean_and_sd(recording.fixated_s for recording in recordings)
        first = mean_and_sd(recording.first_fixation_s for recording in viewed)
        return doc.kpis(
            [
                ("Con fijaciones", fmt.count_of(len(viewed), len(recordings)), "participantes"),
                ("Fijaciones", fmt.number(fixations[0], 1), f"media · DE {fmt.number(fixations[1], 1)}"),
                ("Tiempo fijado", fmt.number(fixated[0], 2, "s"), f"media · DE {fmt.number(fixated[1], 2)}"),
                ("Primera fijación", fmt.number(first[0], 2, "s"), f"media · DE {fmt.number(first[1], 2)}"),
            ]
        )
    recording = recordings[0]
    share = recording.fixated_s / recording.duration_s * 100.0 if recording.duration_s else None
    return doc.kpis(
        [
            ("Fijaciones", fmt.integer(recording.fixation_count), f"en {fmt.number(recording.duration_s, 1, 's')}"),
            ("Tiempo fijado", fmt.number(recording.fixated_s, 2, "s"), f"{fmt.percent(share, 0)} del escenario" if share is not None else ""),
            ("Duración media", fmt.number(recording.fixation_stat(np.mean), 0, "ms"), f"máx. {fmt.number(recording.fixation_stat(np.max), 0, 'ms')}"),
            ("Primera fijación", fmt.number(recording.first_fixation_s, 2, "s"), "desde el inicio"),
        ]
    )


def _summary_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    collected: Sequence[Tuple[common.ReportScenario, List[EyeRecording]]],
) -> List[doc.Block]:
    blocks: List[doc.Block] = [doc.heading("Resultados por escenario")]
    rows = []
    labels, values, errors, value_labels = [], [], [], []
    for scenario, recordings in collected:
        if not recordings:
            rows.append(doc.row([scenario.label] + [fmt.MISSING] * 7))
            continue
        duration = mean_and_sd(recording.duration_s for recording in recordings)[0]
        fixations = mean_and_sd(recording.fixation_count for recording in recordings)
        fixated = mean_and_sd(recording.fixated_s for recording in recordings)
        mean_duration = mean_and_sd(recording.fixation_stat(np.mean) for recording in recordings)
        first = mean_and_sd(recording.first_fixation_s for recording in recordings)
        pupil = mean_and_sd(recording.pupil_stats["Promedio"].mean for recording in recordings if recording.pupil_stats.get("Promedio"))
        distance = mean_and_sd(recording.distance_stats.mean for recording in recordings if recording.distance_stats)
        rows.append(
            doc.row(
                [
                    scenario.label,
                    fmt.number(duration, 1),
                    fmt.number(fixations[0], 1 if context.group else 0),
                    fmt.number(fixated[0], 2),
                    fmt.number(mean_duration[0], 0),
                    fmt.number(first[0], 2),
                    fmt.number(pupil[0], 2),
                    fmt.number(distance[0], 1),
                ]
            )
        )
        labels.append(scenario.label)
        values.append(fixated[0])
        errors.append(fixated[1])
        value_labels.append(fmt.mean_sd(fixated[0], fixated[1], 2, "s") if context.group else fmt.number(fixated[0], 2, "s"))
    blocks.append(
        doc.table(
            [
                doc.column("Escenario", "left", "1fr"),
                doc.column("Duración (s)"),
                doc.column("Fijaciones"),
                doc.column("Tiempo fijado (s)"),
                doc.column("Duración media (ms)"),
                doc.column("1.ª fijación (s)"),
                doc.column("Pupila (mm)"),
                doc.column("Distancia (cm)"),
            ],
            rows,
            title="Indicadores de atención por escenario",
            description="Media por participante." if context.group else "",
        )
    )
    if labels:
        chart = charts.bar_chart(
            labels,
            values,
            value_labels=value_labels,
            axis_label="Tiempo fijado (s)",
            errors=errors if context.group else None,
        )
        blocks.append(
            doc.figure(
                report.add_asset("resumen-tiempo-fijado", chart, "svg"),
                "Tiempo fijado por escenario",
                "Suma de la duración de las fijaciones" + (" (media ± DE entre participantes)." if context.group else "."),
            )
        )

    leaders = []
    for scenario, recordings in collected:
        summaries = summarize_aois(recordings)
        if not summaries:
            continue
        top = max(summaries, key=lambda summary: summary.dwell_percent[0] or 0.0)
        if not top.dwell_percent[0]:
            cells = [scenario.label, "Ninguna AOI recibió fijaciones", fmt.MISSING, fmt.MISSING]
            leaders.append(doc.row(cells + ([fmt.MISSING] if context.group else [])))
            continue
        cells = [scenario.label, top.name, fmt.percent(top.dwell_percent[0]), fmt.number(top.ttff_s[0], 2)]
        if context.group:
            cells.append(fmt.count_of(top.viewers, top.participants))
        leaders.append(doc.row(cells, swatch=top.color))
    if leaders:
        columns = [
            doc.column("Escenario", "left", "1fr"),
            doc.column("AOI con más atención", "left", "1fr"),
            doc.column("Tiempo en AOI"),
            doc.column("TTFF (s)"),
        ]
        if context.group:
            columns.append(doc.column("Lo miraron"))
        blocks.append(
            doc.table(
                columns,
                leaders,
                title="Área de interés con más atención",
                description="Área con mayor porcentaje del tiempo fijado en cada escenario" + (" (media del grupo)." if context.group else "."),
            )
        )
    return blocks


def build(context: common.ReportContext) -> doc.ReportDocument:
    report = common.new_document(context)
    collected: List[Tuple[common.ReportScenario, List[EyeRecording]]] = []
    for scenario in context.scenarios:
        recordings = [recording for participant in context.participants if (recording := collect(participant, scenario))]
        collected.append((scenario, recordings))

    for scenario, recordings in collected:
        subtitle_parts = []
        durations = [recording.duration_s for recording in recordings if recording.duration_s]
        if durations:
            subtitle_parts.append(f"Duración {fmt.number(float(np.mean(durations)), 1, 's')}")
        if context.group:
            subtitle_parts.append(f"{len(recordings)} de {len(context.participants)} participantes con datos")
        if scenario.aois:
            subtitle_parts.append(f"{len(scenario.aois)} AOI")
        eyebrow = f"Escenario {scenario.position} de {len(context.scenarios)}"
        if not recordings:
            report.add_section(
                scenario.label,
                [doc.callout("Sin datos", ["No hay registros de Eye Tracking para este escenario."])],
                eyebrow=eyebrow,
            )
            continue
        blocks = [_scenario_kpis(context, recordings)]
        blocks += _stimulus_blocks(context, report, scenario, recordings)
        blocks += _aoi_blocks(context, report, scenario, recordings)
        blocks += _fixation_blocks(context, report, scenario, recordings)
        blocks += _pupil_blocks(context, report, scenario, recordings)
        blocks += _gaze_blocks(context, report, scenario, recordings)
        blocks += _distance_blocks(context, report, scenario, recordings)
        report.add_section(scenario.label, blocks, eyebrow=eyebrow, subtitle=common.scenario_subtitle(subtitle_parts))

    report.summary.extend(common.summary_header(context, INTRO_GROUP if context.group else INTRO_INDIVIDUAL))
    report.summary.extend(_summary_blocks(context, report, collected))
    report.appendix.extend(methodology.eye_tracking())
    return report

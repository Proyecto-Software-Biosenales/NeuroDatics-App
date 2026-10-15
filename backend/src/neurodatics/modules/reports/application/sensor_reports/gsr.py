"""GSR report: electrodermal activity per scenario."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import numpy as np

from ....analytics.application.services.analytics_service import GsrAnalyticsService
from . import charts, common, methodology
from . import document as doc
from . import formatting as fmt
from .statistics import Descriptive, from_service, mean_and_sd

logger = logging.getLogger(__name__)

UNIT = "µS"
DECIMALS = 3
TIME_AXIS = "Tiempo desde el inicio del escenario (s)"

INTRO_INDIVIDUAL = (
    "Este informe resume la respuesta galvánica de la piel del participante en cada escenario: "
    "nivel de conductancia, variabilidad y picos de activación respecto a su nivel basal."
)
INTRO_GROUP = (
    "Este informe compara la respuesta galvánica de la piel de todos los participantes por escenario. "
    "Para que personas con niveles distintos sean comparables, las gráficas muestran la variación de cada "
    "participante respecto a su propia base."
)


@dataclass
class GsrRecording:
    participant: common.ReportParticipant
    start_s: float
    duration_s: Optional[float]
    time: np.ndarray
    raw: np.ndarray
    smooth: np.ndarray
    stats: Optional[Descriptive]
    raw_stats: Optional[Descriptive]

    @property
    def flat_signal_notice(self) -> Optional[str]:
        """Flag a sensor that recorded no usable variation, which reads as 'no response'."""

        finite = self.raw[np.isfinite(self.raw)]
        if not finite.size:
            return None
        distinct = np.unique(np.round(finite, 6)).size
        if distinct <= 1:
            return "la señal es constante: revisar el contacto o la conexión del sensor"
        if distinct <= 3:
            return "la variación está en el límite de resolución del registro"
        return None


def collect(participant: common.ReportParticipant, scenario: common.ReportScenario) -> Optional[GsrRecording]:
    frame = participant.frame
    scoped = common.scenario_frame(frame, scenario.name)
    start = common.scenario_start(scoped)
    if scoped.empty or start is None or "gsr" not in scoped.columns:
        return None
    try:
        series = GsrAnalyticsService.compute_timeseries(frame, scenario.name)
        payload = GsrAnalyticsService.compute_statistics(frame, scenario.name)
    except Exception as exc:
        logger.warning("GSR report signal unavailable (%s)", type(exc).__name__)
        return None
    time = np.asarray(series.get("time") or [], dtype=float)
    raw = np.asarray(series.get("gsr") or [], dtype=float)
    smooth = np.asarray(series.get("gsr_smooth") or [], dtype=float)
    if not time.size or not (time.size == raw.size == smooth.size):
        return None
    return GsrRecording(
        participant=participant,
        start_s=start,
        duration_s=common.scenario_duration(scoped),
        time=time,
        raw=raw,
        smooth=smooth,
        stats=from_service(payload, time.size, "", time, smooth),
        raw_stats=from_service(payload, time.size, "raw_", time, raw),
    )


def _individual_blocks(report: doc.ReportDocument, scenario: common.ReportScenario, recording: GsrRecording) -> List[doc.Block]:
    stats = recording.stats
    blocks: List[doc.Block] = [
        doc.kpis(
            [
                ("Media", fmt.number(stats.mean, DECIMALS, UNIT), "señal suavizada"),
                ("Mínimo", fmt.number(stats.minimum, DECIMALS, UNIT), f"a los {fmt.number(stats.min_time, 1, 's')}"),
                ("Máximo", fmt.number(stats.maximum, DECIMALS, UNIT), f"a los {fmt.number(stats.max_time, 1, 's')}"),
                ("Pico sobre la base", fmt.percent(stats.peak_percent, 1, signed=True), f"base {fmt.number(stats.baseline, DECIMALS, UNIT)}"),
            ]
        ),
        doc.heading("Conductancia de la piel"),
    ]
    chart = charts.line_chart(
        [
            charts.Series("GSR suavizada", recording.time, recording.smooth, charts.SERIES_COLORS[0], width=1.4, zorder=4),
            charts.Series("GSR cruda", recording.time, recording.raw, charts.DE_EMPHASIS, width=0.7, zorder=3),
        ],
        x_label=TIME_AXIS,
        y_label=f"Conductancia ({UNIT})",
        extremes=charts.Extremes(0, UNIT, DECIMALS),
        reference=(stats.baseline, f"base {fmt.number(stats.baseline, DECIMALS, UNIT)}"),
        height_mm=60.0,
    )
    if recording.flat_signal_notice:
        blocks.append(doc.callout("Calidad de la señal", [f"En este escenario {recording.flat_signal_notice}."], tone="warning"))
    blocks.append(
        doc.keep_together(
            [
                doc.figure(
                    report.add_asset(f"{scenario.position}-gsr", chart, "svg"),
                    "Respuesta galvánica durante el escenario",
                    "Señal suavizada (media móvil de 1 s) sobre la señal cruda; la línea horizontal marca la base.",
                ),
                common.stat_table(
                    [("Suavizada", recording.stats, charts.SERIES_COLORS[0]), ("Cruda", recording.raw_stats, charts.DE_EMPHASIS)],
                    decimals=DECIMALS,
                    unit=UNIT,
                    first_column="Serie",
                    title="Estadísticas",
                ),
            ]
        )
    )
    return blocks


def _group_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    scenario: common.ReportScenario,
    recordings: Sequence[GsrRecording],
) -> List[doc.Block]:
    usable = [recording for recording in recordings if recording.stats]
    means = mean_and_sd(recording.stats.mean for recording in usable)
    peaks = mean_and_sd(recording.stats.peak_percent for recording in usable)
    amplitudes = mean_and_sd(recording.stats.amplitude for recording in usable)
    blocks: List[doc.Block] = [
        doc.kpis(
            [
                ("Con señal GSR", fmt.count_of(len(usable), len(context.participants)), "participantes"),
                ("Media del grupo", fmt.number(means[0], DECIMALS, UNIT), f"DE {fmt.number(means[1], DECIMALS)}"),
                ("Pico sobre la base", fmt.percent(peaks[0], 1, signed=True), f"media · DE {fmt.percent(peaks[1], 1)}"),
                ("Amplitud", fmt.number(amplitudes[0], DECIMALS, UNIT), "máximo − base, media"),
            ]
        ),
        doc.heading("Respuesta respecto a la base"),
    ]
    flat = [f"{recording.participant.alias}: {recording.flat_signal_notice}." for recording in usable if recording.flat_signal_notice]
    if flat:
        blocks.insert(1, doc.callout("Calidad de la señal", flat, tone="warning"))
    chart = charts.line_chart(
        [
            charts.Series(
                recording.participant.alias,
                recording.time,
                recording.smooth - recording.stats.baseline,
                recording.participant.color,
                width=1.1,
            )
            for recording in usable
        ],
        x_label=TIME_AXIS,
        y_label=f"Variación sobre la base ({UNIT})",
        zero_line=True,
        height_mm=60.0,
    )
    blocks.append(
        doc.keep_together(
            [
                doc.figure(
                    report.add_asset(f"{scenario.position}-gsr-group", chart, "svg"),
                    "Variación de la conductancia por participante",
                    "Señal suavizada de cada participante menos su propia base; valores positivos indican activación sobre su nivel de reposo en el escenario.",
                ),
                common.stat_table(
                    [(recording.participant.alias, recording.stats, recording.participant.color) for recording in usable],
                    decimals=DECIMALS,
                    unit=UNIT,
                    first_column="Participante",
                    title="Estadísticas por participante (señal suavizada)",
                    group_rows=True,
                ),
            ]
        )
    )
    peak_chart = charts.bar_chart(
        [recording.participant.alias for recording in usable],
        [recording.stats.peak_percent for recording in usable],
        value_labels=[fmt.percent(recording.stats.peak_percent, 1, signed=True) for recording in usable],
        axis_label="Pico sobre la base (%)",
        colors=[recording.participant.color for recording in usable],
        min_span=1.0,
    )
    blocks.append(
        doc.figure(
            report.add_asset(f"{scenario.position}-gsr-peaks", peak_chart, "svg"),
            "Pico sobre la base por participante",
            "Cambio del máximo respecto a la base de cada participante en el escenario.",
        )
    )
    return blocks


def _summary_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    collected: Sequence[Tuple[common.ReportScenario, List[GsrRecording]]],
) -> List[doc.Block]:
    blocks: List[doc.Block] = []
    flat = {}
    for scenario, recordings in collected:
        for recording in recordings:
            if recording.flat_signal_notice:
                flat.setdefault(recording.participant.alias if context.group else "", []).append(scenario.label)
    if flat:
        blocks.append(
            doc.callout(
                "Calidad de la señal GSR",
                [
                    (f"{alias}: señal" if alias else "Señal")
                    + f" constante o sin variación apreciable en {len(labels)} de {len(collected)} escenarios ({', '.join(labels)})."
                    + " Revisar el contacto del sensor antes de interpretar la ausencia de respuesta."
                    for alias, labels in flat.items()
                ],
                tone="warning",
            )
        )
    blocks.append(doc.heading("Resultados por escenario"))
    starts = sorted(
        (recordings[0].start_s, scenario.position)
        for scenario, recordings in collected
        if recordings and not context.group
    )
    order = {position: index for index, (_, position) in enumerate(starts, start=1)}
    rows, labels, values, errors, value_labels = [], [], [], [], []
    for scenario, recordings in collected:
        usable = [recording for recording in recordings if recording.stats]
        if not usable:
            rows.append(doc.row([scenario.label] + [fmt.MISSING] * (7 if not context.group else 6)))
            continue
        summary = {
            key: mean_and_sd(pick(recording.stats) for recording in usable)
            for key, pick in (
                ("mean", lambda s: s.mean),
                ("sd", lambda s: s.sd),
                ("min", lambda s: s.minimum),
                ("max", lambda s: s.maximum),
                ("amplitude", lambda s: s.amplitude),
                ("peak", lambda s: s.peak_percent),
            )
        }
        cells = [scenario.label]
        if not context.group:
            cells.append(str(order.get(scenario.position, fmt.MISSING)))
        cells += [
            fmt.number(summary["mean"][0], DECIMALS),
            fmt.number(summary["sd"][0], DECIMALS),
            fmt.number(summary["min"][0], DECIMALS),
            fmt.number(summary["max"][0], DECIMALS),
            fmt.number(summary["amplitude"][0], DECIMALS),
            fmt.percent(summary["peak"][0], 1, signed=True),
        ]
        rows.append(doc.row(cells))
        labels.append(scenario.label)
        values.append(summary["peak"][0])
        errors.append(summary["peak"][1])
        value_labels.append(
            fmt.mean_sd(summary["peak"][0], summary["peak"][1], 1, "%") if context.group else fmt.percent(summary["peak"][0], 1, signed=True)
        )
    columns = [doc.column("Escenario", "left", "1fr")]
    if not context.group:
        columns.append(doc.column("Orden"))
    columns += [
        doc.column(f"Media ({UNIT})"),
        doc.column("DE"),
        doc.column("Mín."),
        doc.column("Máx."),
        doc.column(f"Amplitud ({UNIT})"),
        doc.column("Pico %"),
    ]
    blocks.append(
        doc.table(
            columns,
            rows,
            title="Actividad electrodérmica por escenario",
            description=(
                "Media de los participantes; amplitud = máximo − base."
                if context.group
                else "«Orden» indica la posición del escenario en la sesión; amplitud = máximo − base."
            ),
        )
    )
    if labels:
        chart = charts.bar_chart(
            labels,
            values,
            value_labels=value_labels,
            axis_label="Pico sobre la base (%)",
            errors=errors if context.group else None,
            min_span=1.0,
        )
        blocks.append(
            doc.figure(
                report.add_asset("resumen-gsr-picos", chart, "svg"),
                "Pico de activación por escenario",
                "Cambio del máximo de conductancia respecto a la base del escenario"
                + (" (media ± DE entre participantes)." if context.group else "."),
            )
        )
    return blocks


def build(context: common.ReportContext) -> doc.ReportDocument:
    report = common.new_document(context)
    collected: List[Tuple[common.ReportScenario, List[GsrRecording]]] = []
    for scenario in context.scenarios:
        recordings = [recording for participant in context.participants if (recording := collect(participant, scenario))]
        collected.append((scenario, recordings))

    for scenario, recordings in collected:
        eyebrow = f"Escenario {scenario.position} de {len(context.scenarios)}"
        usable = [recording for recording in recordings if recording.stats]
        if not usable:
            report.add_section(scenario.label, [doc.callout("Sin datos", ["No hay señal GSR para este escenario."])], eyebrow=eyebrow)
            continue
        durations = [recording.duration_s for recording in usable if recording.duration_s]
        subtitle = [f"Duración {fmt.number(float(np.mean(durations)), 1, 's')}" if durations else ""]
        if context.group:
            subtitle.append(f"{len(usable)} de {len(context.participants)} participantes con datos")
            blocks = _group_blocks(context, report, scenario, usable)
        else:
            blocks = _individual_blocks(report, scenario, usable[0])
        report.add_section(scenario.label, blocks, eyebrow=eyebrow, subtitle=common.scenario_subtitle(subtitle))

    report.summary.extend(common.summary_header(context, INTRO_GROUP if context.group else INTRO_INDIVIDUAL))
    report.summary.extend(_summary_blocks(context, report, collected))
    report.appendix.extend(methodology.gsr())
    return report

"""EEG report: signal, spectrum and band power per scenario."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from ....analytics.application.services.analytics_service import (
    EEG_CHANNELS,
    EEG_TOPOGRAPHY_LAYOUT,
    EegAnalyticsService,
)
from . import charts, common, methodology
from . import document as doc
from . import formatting as fmt
from .statistics import mean_and_sd

logger = logging.getLogger(__name__)

UNIT = "µV"
POWER_UNIT = "µV²"
TIME_AXIS = "Tiempo desde el inicio del escenario (s)"
DENSITY_AXIS = "Densidad espectral (dB re 1 µV²/Hz)"
MAX_TRACE_POINTS = 4000
SPECTROGRAM_MAX_HZ = 30.0
# (label, analytics key, low Hz, high Hz); limits follow EegAnalyticsService.compute_psd.
BANDS: Tuple[Tuple[str, str, float, float], ...] = (
    ("Delta", "delta", 0.5, 4.0),
    ("Theta", "theta", 4.0, 8.0),
    ("Alfa", "alpha", 8.0, 13.0),
    ("Beta", "beta", 13.0, 30.0),
    ("Gamma", "gamma", 30.0, 45.0),
)
CHANNEL_COLORS = {channel: charts.series_color(index) for index, channel in enumerate(EEG_CHANNELS)}

INTRO_INDIVIDUAL = (
    "Este informe describe la actividad EEG del participante en cada escenario: la señal de cada canal, "
    "su contenido en frecuencia y la distribución de potencia entre las bandas Delta, Theta, Alfa, Beta y Gamma."
)
INTRO_GROUP = (
    "Este informe compara la actividad EEG de los participantes por escenario mediante la distribución de "
    "potencia entre bandas de frecuencia, el espectro de cada persona y la topografía media del grupo."
)


@dataclass
class EegRecording:
    participant: common.ReportParticipant
    start_s: float
    duration_s: Optional[float]
    channels: List[str]
    time: np.ndarray
    traces: Dict[str, np.ndarray]
    channel_stats: Dict[str, Dict[str, Any]]
    sampling_rate_hz: float
    frequency: np.ndarray
    density_db: Dict[str, np.ndarray]
    band_power: Dict[str, Dict[str, Optional[float]]]
    resolution_hz: Optional[float]
    spectrogram: Dict[str, Any]
    warnings: List[str] = field(default_factory=list)

    def relative_bands(self, channel: str) -> Dict[str, Optional[float]]:
        powers = self.band_power.get(channel) or {}
        values = {key: fmt.finite(powers.get(key)) for _, key, _, _ in BANDS}
        total = sum(value for value in values.values() if value is not None)
        if total <= 0:
            return {key: None for key in values}
        return {key: (value / total * 100.0 if value is not None else None) for key, value in values.items()}

    def mean_relative_bands(self) -> Dict[str, Optional[float]]:
        per_channel = [self.relative_bands(channel) for channel in self.band_power]
        return {key: mean_and_sd(bands.get(key) for bands in per_channel)[0] for _, key, _, _ in BANDS}

    def mean_sd(self) -> Optional[float]:
        """Typical amplitude variability across channels, unaffected by DC offsets."""

        return mean_and_sd((self.channel_stats.get(channel) or {}).get("std") for channel in self.channels)[0]

    def averaged_density_db(self) -> Optional[np.ndarray]:
        """Mean spectrum across channels, averaged as power and returned in dB."""

        spectra = [values for values in self.density_db.values() if values.size == self.frequency.size]
        if not spectra or not self.frequency.size:
            return None
        linear = np.power(10.0, np.vstack(spectra) / 10.0)
        with np.errstate(invalid="ignore"):
            return 10.0 * np.log10(np.nanmean(linear, axis=0))


def _array(values: Any) -> np.ndarray:
    return np.asarray([np.nan if value is None else value for value in (values or [])], dtype=float)


def collect(participant: common.ReportParticipant, scenario: common.ReportScenario) -> Optional[EegRecording]:
    frame = participant.frame
    scoped = common.scenario_frame(frame, scenario.name)
    start = common.scenario_start(scoped)
    if scoped.empty or start is None or not any(channel in scoped.columns for channel in EEG_CHANNELS):
        return None
    name = scenario.name
    try:
        timeseries = EegAnalyticsService.compute_timeseries(frame, name, smooth_window_s=0.0, max_points=MAX_TRACE_POINTS)
    except Exception as exc:
        logger.warning("EEG report timeseries unavailable (%s)", type(exc).__name__)
        return None
    channels = [channel for channel in EEG_CHANNELS if channel in (timeseries.get("channels") or [])]
    if not channels:
        return None
    warnings = list((timeseries.get("metadata") or {}).get("warnings") or [])
    try:
        psd = EegAnalyticsService.compute_psd(frame, name, max_freq_hz=45.0, use_db=True, max_points=2048)
    except Exception as exc:
        logger.warning("EEG report spectrum unavailable (%s)", type(exc).__name__)
        psd = {}
    try:
        spectrogram = EegAnalyticsService.compute_spectrogram(
            frame, name, max_freq_hz=SPECTROGRAM_MAX_HZ, use_db=True, max_time_bins=240, max_frequency_bins=160
        )
    except Exception as exc:
        logger.warning("EEG report spectrogram unavailable (%s)", type(exc).__name__)
        spectrogram = {}
    psd_metadata = psd.get("metadata") or {}
    warnings.extend(psd_metadata.get("warnings") or [])
    frequency = _array(psd.get("frequency"))
    return EegRecording(
        participant=participant,
        start_s=start,
        duration_s=common.scenario_duration(scoped),
        channels=channels,
        time=_array(timeseries.get("time")) - start,
        traces={channel: _array((timeseries.get("raw") or {}).get(channel)) for channel in channels},
        channel_stats={channel: ((timeseries.get("statistics") or {}).get("raw") or {}).get(channel) or {} for channel in channels},
        sampling_rate_hz=float(timeseries.get("sampling_rate_hz") or 0.0),
        frequency=frequency,
        density_db={channel: _array(values) for channel, values in (psd.get("power") or {}).items()},
        band_power={channel: dict(values) for channel, values in (psd.get("band_power") or {}).items()},
        resolution_hz=fmt.finite(psd_metadata.get("frequency_resolution_hz")),
        spectrogram=spectrogram,
        warnings=list(dict.fromkeys(warnings)),
    )


def _band_segments(rows: Sequence[Dict[str, Optional[float]]]) -> List[Tuple[str, List[Optional[float]], str]]:
    return [(label, [row.get(key) for row in rows], color) for (label, key, _, _), color in zip(BANDS, charts.BAND_COLORS)]


def _band_columns(first: str) -> List[Dict[str, str]]:
    return [doc.column(first, "left", "1fr")] + [doc.column(label) for label, _, _, _ in BANDS]


def _bands_for_chart() -> List[Tuple[str, float, float]]:
    return [(label, low, high) for label, _, low, high in BANDS]


def _topography(report: doc.ReportDocument, name: str, maps: Sequence[Tuple[str, Dict[str, Optional[float]]]]) -> str:
    layout_scale = 0.85 / max(float(np.hypot(*xy)) for xy in EEG_TOPOGRAPHY_LAYOUT.values())
    positions = {channel: (x * layout_scale, y * layout_scale) for channel, (x, y) in EEG_TOPOGRAPHY_LAYOUT.items()}
    return report.add_asset(name, charts.topography_grid(maps, positions), "svg")


def _individual_blocks(report: doc.ReportDocument, scenario: common.ReportScenario, recording: EegRecording) -> List[doc.Block]:
    counts = [(recording.channel_stats.get(channel) or {}).get("count") for channel in recording.channels]
    finite_counts = [count for count in counts if count]
    blocks: List[doc.Block] = [
        doc.kpis(
            [
                ("Canales", fmt.count_of(len(recording.channels), len(EEG_CHANNELS)), "con señal válida"),
                ("Muestras válidas", fmt.integer(int(np.median(finite_counts))) if finite_counts else fmt.MISSING, "mediana por canal"),
                ("Muestreo", fmt.number(recording.sampling_rate_hz, 0, "Hz"), "frecuencia estimada"),
                ("Resolución espectral", fmt.number(recording.resolution_hz, 2, "Hz"), "entre frecuencias de la PSD"),
            ]
        )
    ]
    if recording.warnings:
        blocks.append(doc.callout("Calidad de la señal", recording.warnings, tone="warning"))

    blocks.append(doc.heading("Señal por canal"))
    traces = [
        charts.Series(channel.upper(), recording.time, recording.traces[channel], CHANNEL_COLORS[channel])
        for channel in recording.channels
    ]
    stats_rows = []
    for channel in recording.channels:
        stats = recording.channel_stats.get(channel) or {}
        stats_rows.append(
            doc.row(
                [
                    channel.upper(),
                    fmt.integer(stats.get("count")),
                    fmt.number(stats.get("rms"), 1),
                    fmt.number(stats.get("mean"), 1),
                    fmt.number(stats.get("std"), 1),
                    fmt.number(stats.get("median"), 1),
                    fmt.number(stats.get("min"), 1),
                    fmt.number(stats.get("max"), 1),
                ],
                swatch=CHANNEL_COLORS[channel],
            )
        )
    blocks.append(
        doc.keep_together(
            [
                doc.figure(
                    report.add_asset(f"{scenario.position}-eeg-traces", charts.stacked_traces_chart(traces, x_label=TIME_AXIS, unit=UNIT), "svg"),
                    "Amplitud por canal",
                    "Señal tal como se exportó, sin filtrado; cada canal usa su propio rango vertical.",
                ),
                doc.table(
                    [doc.column("Canal", "left", "1fr"), doc.column("N"), doc.column("RMS"), doc.column("Media"), doc.column("DE"), doc.column("Mediana"), doc.column("Mín."), doc.column("Máx.")],
                    stats_rows,
                    title="Estadísticas por canal",
                    note=f"Valores en {UNIT} salvo N (muestras válidas).",
                ),
            ]
        )
    )

    if recording.band_power and recording.frequency.size:
        blocks.append(doc.heading("Densidad espectral y bandas"))
        spectrum = charts.spectrum_chart(
            [
                charts.Series(channel.upper(), recording.frequency, recording.density_db[channel], CHANNEL_COLORS[channel], width=1.0)
                for channel in recording.channels
                if channel in recording.density_db
            ],
            _bands_for_chart(),
            y_label=DENSITY_AXIS,
            legend_columns=len(recording.channels),
        )
        absolute_rows = []
        relative_rows = []
        for channel in recording.channels:
            powers = recording.band_power.get(channel) or {}
            relative = recording.relative_bands(channel)
            absolute_rows.append(doc.row([channel.upper()] + [fmt.significant(powers.get(key), 3) for _, key, _, _ in BANDS], swatch=CHANNEL_COLORS[channel]))
            relative_rows.append(doc.row([channel.upper()] + [fmt.number(relative.get(key), 1) for _, key, _, _ in BANDS], swatch=CHANNEL_COLORS[channel]))
        blocks.append(
            doc.keep_together(
                [
                    doc.figure(
                        report.add_asset(f"{scenario.position}-eeg-psd", spectrum, "svg"),
                        "Densidad espectral de potencia",
                        "Método de Welch por canal; las franjas marcan las bandas de frecuencia.",
                    ),
                    doc.table(_band_columns("Canal"), absolute_rows, title=f"Potencia absoluta por banda ({POWER_UNIT})"),
                ]
            )
        )
        blocks.append(
            doc.table(
                _band_columns("Canal"),
                relative_rows,
                title="Potencia relativa por banda (%)",
                description="Porcentaje de la potencia total de 0,5 a 45 Hz en cada canal.",
            )
        )
        maps = [
            (label, {channel: recording.relative_bands(channel).get(key) for channel in EEG_TOPOGRAPHY_LAYOUT})
            for label, key, _, _ in BANDS
        ]
        blocks.append(
            doc.figure(
                _topography(report, f"{scenario.position}-eeg-topography", maps),
                "Topografía esquemática de la potencia relativa",
                "Porcentaje de cada banda por electrodo; cada mapa usa su propia escala de color.",
            )
        )

    spectrogram = recording.spectrogram or {}
    panels = []
    for channel in recording.channels:
        matrix = (spectrogram.get("power") or {}).get(channel)
        if matrix:
            panels.append(
                (
                    channel.upper(),
                    _array(spectrogram.get("time")) - recording.start_s,
                    _array(spectrogram.get("frequency")),
                    np.asarray([_array(row) for row in matrix], dtype=float),
                )
            )
    domain = spectrogram.get("color_domain") or {}
    if panels and fmt.finite(domain.get("max")) is not None:
        blocks.append(doc.heading("Espectrograma"))
        blocks.append(
            doc.figure(
                report.add_asset(
                    f"{scenario.position}-eeg-spectrogram",
                    charts.spectrogram_grid(panels, color_domain=(float(domain.get("min")), float(domain.get("max"))), unit="dB"),
                    "svg",
                ),
                "Evolución de la densidad espectral",
                "Hasta 30 Hz, en ventanas de 1,5 s con 75 % de solapamiento; escala de color común a todos los canales.",
            )
        )
    return blocks


def _group_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    scenario: common.ReportScenario,
    recordings: Sequence[EegRecording],
) -> List[doc.Block]:
    with_bands = [recording for recording in recordings if recording.band_power]
    resolutions = [recording.resolution_hz for recording in with_bands if recording.resolution_hz]
    rates = [recording.sampling_rate_hz for recording in recordings if recording.sampling_rate_hz]
    blocks: List[doc.Block] = [
        doc.kpis(
            [
                ("Con señal EEG", fmt.count_of(len(recordings), len(context.participants)), "participantes"),
                ("Con espectro", fmt.count_of(len(with_bands), len(recordings)), "tramos suficientes para PSD"),
                ("Muestreo", fmt.number(float(np.median(rates)) if rates else None, 0, "Hz"), "mediana"),
                ("Resolución espectral", fmt.number(float(np.median(resolutions)) if resolutions else None, 2, "Hz"), "mediana"),
            ]
        )
    ]
    warnings = list(dict.fromkeys(warning for recording in recordings for warning in recording.warnings))
    if warnings:
        blocks.append(doc.callout("Calidad de la señal", warnings, tone="warning"))
    if not with_bands:
        blocks.append(doc.callout("Sin espectro", ["Ningún participante tiene tramos continuos suficientes para estimar la densidad espectral."]))
        return blocks

    shares = [recording.mean_relative_bands() for recording in with_bands]
    blocks.append(doc.heading("Distribución de potencia por bandas"))
    share_rows = [
        doc.row([recording.participant.alias] + [fmt.number(share.get(key), 1) for _, key, _, _ in BANDS], swatch=recording.participant.color)
        for recording, share in zip(with_bands, shares)
    ]
    if len(shares) > 1:
        summaries = [mean_and_sd(share.get(key) for share in shares) for _, key, _, _ in BANDS]
        share_rows.append(doc.row(["Media del grupo"] + [fmt.number(mean, 1) for mean, _, _ in summaries], emphasis=True))
        share_rows.append(doc.row(["DE entre participantes"] + [fmt.number(sd, 1) for _, sd, _ in summaries], emphasis=True))
    blocks.append(
        doc.keep_together(
            [
                doc.figure(
                    report.add_asset(
                        f"{scenario.position}-eeg-shares",
                        charts.stacked_share_chart([recording.participant.alias for recording in with_bands], _band_segments(shares)),
                        "svg",
                    ),
                    "Potencia relativa por participante",
                    "Porcentaje de la potencia de 0,5 a 45 Hz en cada banda, promediado entre canales.",
                ),
                doc.table(_band_columns("Participante"), share_rows, title="Potencia relativa por banda (%)"),
            ]
        )
    )

    blocks.append(doc.heading("Densidad espectral"))
    spectra = []
    for recording in with_bands:
        averaged = recording.averaged_density_db()
        if averaged is not None:
            spectra.append(charts.Series(recording.participant.alias, recording.frequency, averaged, recording.participant.color, width=1.1))
    absolute_rows = []
    for channel in EEG_CHANNELS:
        cells = [channel.upper()]
        present = False
        for _, key, _, _ in BANDS:
            mean, sd, count = mean_and_sd((recording.band_power.get(channel) or {}).get(key) for recording in with_bands)
            present = present or count > 0
            cells.append(f"{fmt.significant(mean, 3)} ± {fmt.significant(sd, 2)}" if sd is not None else fmt.significant(mean, 3))
        if present:
            absolute_rows.append(doc.row(cells, swatch=CHANNEL_COLORS[channel]))
    stack: List[doc.Block] = []
    if spectra:
        stack.append(
            doc.figure(
                report.add_asset(f"{scenario.position}-eeg-psd-group", charts.spectrum_chart(spectra, _bands_for_chart(), y_label=DENSITY_AXIS), "svg"),
                "Espectro medio de cada participante",
                "Promedio de los canales de cada participante (en potencia, expresado en dB).",
            )
        )
    stack.append(
        doc.table(
            _band_columns("Canal"),
            absolute_rows,
            title=f"Potencia absoluta por banda ({POWER_UNIT})",
            description="Media ± DE entre participantes.",
        )
    )
    blocks.append(doc.keep_together(stack))

    maps = []
    for label, key, _, _ in BANDS:
        values = {
            channel: mean_and_sd(recording.relative_bands(channel).get(key) for recording in with_bands if channel in recording.band_power)[0]
            for channel in EEG_TOPOGRAPHY_LAYOUT
        }
        maps.append((label, values))
    blocks.append(doc.heading("Topografía del grupo"))
    blocks.append(
        doc.figure(
            _topography(report, f"{scenario.position}-eeg-topography-group", maps),
            "Topografía esquemática de la potencia relativa",
            "Media del grupo por electrodo; cada mapa usa su propia escala de color.",
        )
    )
    return blocks


def _summary_blocks(
    context: common.ReportContext,
    report: doc.ReportDocument,
    collected: Sequence[Tuple[common.ReportScenario, List[EegRecording]]],
) -> List[doc.Block]:
    warnings = list(dict.fromkeys(warning for _, recordings in collected for recording in recordings for warning in recording.warnings))
    blocks: List[doc.Block] = []
    if warnings:
        blocks.append(doc.callout("Calidad de la señal EEG", warnings, tone="warning"))
    blocks.append(doc.heading("Resultados por escenario"))
    rows, labels, shares = [], [], []
    for scenario, recordings in collected:
        with_bands = [recording for recording in recordings if recording.band_power]
        if not with_bands:
            rows.append(doc.row([scenario.label] + [fmt.MISSING] * (len(BANDS) + 1)))
            continue
        per_recording = [recording.mean_relative_bands() for recording in with_bands]
        share = {key: mean_and_sd(item.get(key) for item in per_recording)[0] for _, key, _, _ in BANDS}
        variability = mean_and_sd(recording.mean_sd() for recording in recordings)[0]
        rows.append(doc.row([scenario.label] + [fmt.number(share.get(key), 1) for _, key, _, _ in BANDS] + [fmt.number(variability, 1)]))
        labels.append(scenario.label)
        shares.append(share)
    blocks.append(
        doc.table(
            _band_columns("Escenario") + [doc.column(f"DE ({UNIT})")],
            rows,
            title="Potencia relativa por banda (%) y variabilidad",
            description="Promedio de canales" + (" y participantes." if context.group else ".") + " La DE resume la variabilidad de la amplitud sin el desplazamiento de continua.",
        )
    )
    if shares:
        blocks.append(
            doc.figure(
                report.add_asset("resumen-eeg-bandas", charts.stacked_share_chart(labels, _band_segments(shares)), "svg"),
                "Distribución de potencia por escenario",
                "Porcentaje de la potencia de 0,5 a 45 Hz en cada banda.",
            )
        )
    return blocks


def build(context: common.ReportContext) -> doc.ReportDocument:
    report = common.new_document(context)
    collected: List[Tuple[common.ReportScenario, List[EegRecording]]] = []
    for scenario in context.scenarios:
        recordings = [recording for participant in context.participants if (recording := collect(participant, scenario))]
        collected.append((scenario, recordings))

    for scenario, recordings in collected:
        eyebrow = f"Escenario {scenario.position} de {len(context.scenarios)}"
        if not recordings:
            report.add_section(scenario.label, [doc.callout("Sin datos", ["No hay señal EEG para este escenario."])], eyebrow=eyebrow)
            continue
        durations = [recording.duration_s for recording in recordings if recording.duration_s]
        subtitle = [f"Duración {fmt.number(float(np.mean(durations)), 1, 's')}" if durations else ""]
        if context.group:
            subtitle.append(f"{len(recordings)} de {len(context.participants)} participantes con datos")
            blocks = _group_blocks(context, report, scenario, recordings)
        else:
            blocks = _individual_blocks(report, scenario, recordings[0])
        report.add_section(scenario.label, blocks, eyebrow=eyebrow, subtitle=common.scenario_subtitle(subtitle))

    report.summary.extend(common.summary_header(context, INTRO_GROUP if context.group else INTRO_INDIVIDUAL))
    report.summary.extend(_summary_blocks(context, report, collected))
    report.appendix.extend(methodology.eeg())
    return report

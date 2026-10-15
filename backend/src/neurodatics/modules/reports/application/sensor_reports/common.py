"""Context, document shell and shared tables for every device report."""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from matplotlib.figure import Figure

from ....analytics.application.services.numeric_helpers import scope_to_scenario
from . import charts
from . import document as doc
from . import formatting as fmt
from .statistics import Descriptive, mean_and_sd

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "brand" / "neurodatics-logo.svg"

MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


@dataclass(frozen=True)
class Device:
    key: str
    label: str
    description: str
    accent: str
    slug: str


DEVICES: Dict[str, Device] = {
    "EyeTracker": Device("EyeTracker", "Eye Tracking", "Seguimiento ocular", "#2a78d6", "eye-tracking"),
    "GSR": Device("GSR", "GSR", "Respuesta galvánica de la piel", "#1baf7a", "gsr"),
    "EEG": Device("EEG", "EEG", "Electroencefalografía", "#4a3aa7", "eeg"),
}


@dataclass
class ReportParticipant:
    code: str
    alias: str
    color: str
    frame: pd.DataFrame


@dataclass
class ReportScenario:
    name: str
    label: str
    position: int
    aois: List[Any] = field(default_factory=list)
    image: Optional[bytes] = None


@dataclass
class ReportContext:
    project_name: str
    device: Device
    participants: List[ReportParticipant]
    scenarios: List[ReportScenario]
    group: bool
    generated_at: datetime
    include_cover: bool = True
    include_metadata: bool = True
    notices: List[str] = field(default_factory=list)

    @property
    def scope_label(self) -> str:
        if self.group:
            count = len(self.participants)
            return f"Resumen de grupo · {count} participante{'s' if count != 1 else ''}"
        return f"Participante {self.participants[0].code}" if self.participants else "Participante"

    def participant_label(self, participant: ReportParticipant) -> str:
        return participant.alias if self.group else participant.code


def looks_like_identifier(value: str) -> bool:
    text = str(value or "").strip()
    if len(text) < 12:
        return False
    compact = text.replace("-", "")
    return compact.isdigit() or all(character in "0123456789abcdefABCDEF" for character in compact)


def scenario_label(name: str, position: int) -> str:
    return f"Escenario {position:02d}" if looks_like_identifier(name) else str(name)


def participant_aliases(codes: Sequence[str]) -> List[Tuple[str, str, str]]:
    """``(code, alias, colour)`` in project order; colour follows the participant."""

    width = 2 if len(codes) >= 10 else 1
    return [
        (code, f"P{index + 1:0{width}d}", charts.series_color(index))
        for index, code in enumerate(codes)
    ]


def long_date(moment: datetime) -> str:
    return f"{moment.day} de {MONTHS[moment.month - 1]} de {moment.year}"


def scenario_frame(frame: pd.DataFrame, scenario: str) -> pd.DataFrame:
    return scope_to_scenario(frame, scenario)


def scenario_start(frame: pd.DataFrame) -> Optional[float]:
    if "time" not in frame.columns or frame.empty:
        return None
    times = pd.to_numeric(frame["time"], errors="coerce").to_numpy(dtype=float)
    times = times[np.isfinite(times)]
    return float(times.min()) if times.size else None


def scenario_duration(frame: pd.DataFrame) -> Optional[float]:
    if "time" not in frame.columns or frame.empty:
        return None
    times = pd.to_numeric(frame["time"], errors="coerce").to_numpy(dtype=float)
    times = times[np.isfinite(times)]
    return float(times.max() - times.min()) if times.size > 1 else None


def new_document(context: ReportContext) -> doc.ReportDocument:
    device = context.device
    generated = context.generated_at
    cover_facts = [
        {"label": "Participantes", "value": str(len(context.participants))},
        {"label": "Escenarios", "value": str(len(context.scenarios))},
        {"label": "Alcance", "value": "Grupo" if context.group else "Individual"},
    ]
    if context.include_metadata:
        cover_facts.append({"label": "Fecha", "value": generated.strftime("%d/%m/%Y")})
    footer = (
        f"{context.project_name} · {context.scope_label} · Generado el {generated.strftime('%d/%m/%Y %H:%M')} UTC"
        if context.include_metadata
        else ""
    )
    report = doc.ReportDocument(
        meta={
            "document_title": f"Informe de {device.label} · {context.project_name}",
            "report_title": f"Informe de {device.label}",
            "device_label": device.label,
            "cover_eyebrow": device.description,
            "project": context.project_name,
            "scope_label": context.scope_label,
            "accent": device.accent,
            "keywords": ["NeuroDatics", device.label, context.project_name],
            "include_cover": bool(context.include_cover),
            "logo": "",
            "cover_art": "",
            "cover_facts": cover_facts,
            "footer_note": footer,
        }
    )
    report.meta["logo"] = report.add_asset("logo", logo_mark(), "svg")
    if context.include_cover:
        report.meta["cover_art"] = report.add_asset("portada", cover_art(device), "svg")
    return report


def summary_header(context: ReportContext, what: str) -> List[doc.Block]:
    """Opening of the summary section: what the report covers and for whom."""

    scenario_names = ", ".join(scenario.label for scenario in context.scenarios)
    blocks: List[doc.Block] = [
        doc.paragraph(what),
        doc.facts(
            [
                ("Proyecto", context.project_name),
                ("Dispositivo", f"{context.device.label} · {context.device.description}"),
                ("Alcance", context.scope_label),
                ("Generado", f"{long_date(context.generated_at)}, {context.generated_at.strftime('%H:%M')} UTC"),
                ("Escenarios", f"{len(context.scenarios)}: {scenario_names}"),
            ],
            columns=1,
        ),
    ]
    if context.group:
        blocks.append(
            doc.table(
                [doc.column("Participante", "left"), doc.column("Código", "left", "1fr")],
                [
                    doc.row([participant.alias, participant.code], swatch=participant.color)
                    for participant in context.participants
                ],
                title="Participantes",
                description="Los gráficos identifican a cada participante con su alias y el mismo color en todo el informe.",
            )
        )
    notices = list(context.notices)
    if context.group and len(context.participants) > len(charts.SERIES_COLORS):
        notices.append(
            f"Las gráficas dan un color propio a los primeros {len(charts.SERIES_COLORS)} participantes; "
            "el resto se dibuja en gris. Las tablas conservan el valor de cada persona."
        )
    if notices:
        blocks.append(doc.callout("Avisos sobre los datos", list(dict.fromkeys(notices)), tone="warning"))
    return blocks


STAT_COLUMNS = ("N", "Base", "Media", "DE", "Mediana", "Mín.", "Máx.", "Pico %")


def stat_cells(stats: Optional[Descriptive], decimals: int, unit: str) -> List[str]:
    if stats is None:
        return ["0"] + [fmt.MISSING] * 7
    return [
        fmt.integer(stats.count),
        fmt.number(stats.baseline, decimals),
        fmt.number(stats.mean, decimals),
        fmt.number(stats.sd, decimals),
        fmt.number(stats.median, decimals),
        fmt.number(stats.minimum, decimals),
        fmt.number(stats.maximum, decimals),
        fmt.percent(stats.peak_percent, 1, signed=True),
    ]


def stat_table(
    rows: Sequence[Tuple[str, Optional[Descriptive], Optional[str]]],
    *,
    decimals: int,
    unit: str,
    first_column: str,
    title: str = "",
    description: str = "",
    group_rows: bool = False,
) -> doc.Block:
    """The dashboard's statistics table; group reports add mean and SD rows."""

    table_rows = [doc.row([label, *stat_cells(stats, decimals, unit)], swatch=swatch) for label, stats, swatch in rows]
    if group_rows:
        present = [stats for _, stats, _ in rows if stats is not None]
        if len(present) > 1:
            def summary(pick: Callable[[Descriptive], Optional[float]]) -> Tuple[Optional[float], Optional[float]]:
                mean, sd, _ = mean_and_sd(pick(stats) for stats in present)
                return mean, sd

            fields: List[Callable[[Descriptive], Optional[float]]] = [
                lambda s: s.baseline, lambda s: s.mean, lambda s: s.sd, lambda s: s.median,
                lambda s: s.minimum, lambda s: s.maximum, lambda s: s.peak_percent,
            ]
            means = [summary(pick) for pick in fields]
            table_rows.append(
                doc.row(
                    ["Media del grupo", fmt.integer(np.mean([s.count for s in present]))]
                    + [fmt.number(mean, decimals) for mean, _ in means[:-1]]
                    + [fmt.percent(means[-1][0], 1, signed=True)],
                    emphasis=True,
                )
            )
            table_rows.append(
                doc.row(
                    ["DE entre participantes", fmt.MISSING]
                    + [fmt.number(sd, decimals) for _, sd in means[:-1]]
                    + [fmt.percent(means[-1][1], 1)],
                    emphasis=True,
                )
            )
    columns = [doc.column(first_column, "left", "1fr")] + [doc.column(label) for label in STAT_COLUMNS]
    return doc.table(
        columns,
        table_rows,
        title=title,
        description=description,
        note=f"Valores en {unit} salvo N (muestras) y Pico % (máximo respecto a la base).",
    )


def scenario_subtitle(parts: Sequence[str]) -> str:
    return " · ".join(part for part in parts if part)


def logo_mark() -> bytes:
    """The NeuroDatics logo, stamped on the cover and in every page header."""

    return LOGO_PATH.read_bytes()


def cover_art(device: Device) -> bytes:
    """A quiet signal motif for the cover, drawn in the device accent."""

    width_mm, height_mm = 150.0, 95.0
    fig = Figure(figsize=(width_mm * charts.MM, height_mm * charts.MM))
    fig.patch.set_alpha(0.0)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_axis_off()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    rng = np.random.default_rng(7)
    x = np.linspace(0.0, 1.0, 600)
    if device.key == "EEG":
        for row in range(5):
            y = 0.2 + row * 0.13
            signal = sum(
                amplitude * np.sin(2 * np.pi * (frequency * x + phase))
                for amplitude, frequency, phase in rng.uniform((0.004, 6, 0), (0.018, 40, 1), size=(4, 3))
            )
            ax.plot(x, y + signal, color=device.accent, linewidth=0.9, alpha=0.18 + row * 0.08)
    elif device.key == "GSR":
        for layer in range(4):
            base = 0.18 + layer * 0.05
            response = 0.28 * np.exp(-((x - (0.45 + layer * 0.08)) ** 2) / 0.012) * (1 - layer * 0.15)
            drift = 0.1 * x + 0.015 * np.sin(8 * x + layer)
            ax.plot(x, base + drift + response, color=device.accent, linewidth=1.1, alpha=0.2 + layer * 0.15)
    else:
        points = rng.uniform((0.18, 0.2), (0.95, 0.85), size=(9, 2))
        ax.plot(points[:, 0], points[:, 1], color=device.accent, linewidth=0.9, alpha=0.35)
        sizes = rng.uniform(40, 420, size=len(points))
        ax.scatter(points[:, 0], points[:, 1], s=sizes, color=device.accent, alpha=0.22, edgecolors="white", linewidths=1.2)
    buffer = io.BytesIO()
    fig.savefig(buffer, format="svg", metadata={"Date": None})
    return buffer.getvalue()

"""Print-sized SVG charts for the device reports.

Charts are drawn at their final physical size (the template places them at
100 % width), so 7 pt text in a chart is 7 pt on paper. Only the object API is
used: reports render on worker threads, where pyplot's global figure state is
not safe.

Series colours come from a categorical palette validated for colour-vision
deficiency on adjacent pairs (lines, bars). Every chart is paired with a table
in the report, which is the relief channel for the lighter slots' contrast.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional, Sequence, Tuple

import numpy as np
from matplotlib import font_manager, rcParams
from matplotlib.colors import LinearSegmentedColormap, Normalize, to_rgb
from matplotlib.figure import Figure
from matplotlib.patches import Circle, Polygon
from matplotlib.patheffects import withStroke

from . import formatting as fmt

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

MM = 1 / 25.4
CONTENT_WIDTH_MM = 174.0

INK = "#171717"
INK_SECONDARY = "#525252"
INK_MUTED = "#737373"
GRID = "#E5E5E5"
AXIS = "#D4D4D4"
BAND_TINT = "#F5F5F5"
DE_EMPHASIS = "#A3A3A3"
SERIES_COLORS: Tuple[str, ...] = (
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
    "#e34948",
)
# Ordered frequency bands use one hue, light to dark (validated as an ordinal ramp).
BAND_COLORS: Tuple[str, ...] = ("#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281")
SEQUENTIAL = LinearSegmentedColormap.from_list(
    "report_sequential_blue",
    ["#F3F8FE", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281", "#0d366b"],
)

TICK_PT = 6.8
LABEL_PT = 7.4
LEGEND_PT = 7.2


def register_fonts() -> None:
    """Make Poppins the chart face and keep SVG output deterministic."""

    for font_path in sorted(FONT_DIR.glob("Poppins-*.ttf")):
        font_manager.fontManager.addfont(str(font_path))
    rcParams.update(
        {
            "font.family": "Poppins",
            "font.sans-serif": ["Poppins", "DejaVu Sans"],
            "svg.fonttype": "none",
            "svg.hashsalt": "neurodatics-report",
            "axes.unicode_minus": True,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )


register_fonts()


def series_color(index: int) -> str:
    return SERIES_COLORS[index] if 0 <= index < len(SERIES_COLORS) else DE_EMPHASIS


@dataclass
class Series:
    label: str
    x: np.ndarray
    y: np.ndarray
    color: str
    width: float = 1.2
    alpha: float = 1.0
    zorder: int = 3
    in_legend: bool = True


@dataclass
class Extremes:
    """Mark the minimum and maximum of one series with a dot and a short label."""

    series_index: int = 0
    unit: str = ""
    decimals: int = 2


def _figure(width_mm: float, height_mm: float) -> Figure:
    fig = Figure(figsize=(width_mm * MM, height_mm * MM), layout="constrained")
    fig.patch.set_alpha(0.0)
    fig.get_layout_engine().set(w_pad=1.5 * MM, h_pad=1.5 * MM, wspace=0.02, hspace=0.02)
    return fig


def _to_svg(fig: Figure) -> bytes:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="svg", metadata={"Date": None}, dpi=200)
    return buffer.getvalue()


def _style_axes(ax, x_label: str = "", y_label: str = "", grid_axis: str = "y") -> None:
    ax.set_facecolor("none")
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_color(AXIS)
    ax.spines["bottom"].set_color(AXIS)
    ax.spines["left"].set_linewidth(0.6)
    ax.spines["bottom"].set_linewidth(0.6)
    ax.tick_params(colors=INK_MUTED, labelsize=TICK_PT, length=2.5, width=0.6, pad=2)
    if grid_axis:
        ax.grid(True, axis=grid_axis, color=GRID, linewidth=0.6, linestyle="-")
        ax.set_axisbelow(True)
    if x_label:
        ax.set_xlabel(x_label, fontsize=LABEL_PT, color=INK_SECONDARY, labelpad=3)
    if y_label:
        ax.set_ylabel(y_label, fontsize=LABEL_PT, color=INK_SECONDARY, labelpad=4)


def _legend(ax, handles_labels=None, ncols: Optional[int] = None) -> None:
    handles, labels = handles_labels or ax.get_legend_handles_labels()
    if len(handles) < 2:
        return
    ax.legend(
        handles,
        labels,
        loc="lower left",
        bbox_to_anchor=(0.0, 1.0),
        ncols=ncols or min(len(handles), 6),
        frameon=False,
        fontsize=LEGEND_PT,
        labelcolor=INK_SECONDARY,
        handlelength=1.4,
        handletextpad=0.5,
        columnspacing=1.2,
        borderaxespad=0.2,
    )


def _finite_xy(x: Sequence[float], y: Sequence[float]) -> Tuple[np.ndarray, np.ndarray]:
    x_arr = np.asarray(x, dtype=float)
    y_arr = np.asarray(y, dtype=float)
    size = min(x_arr.size, y_arr.size)
    return x_arr[:size], y_arr[:size]


def _annotate_extremes(ax, series: Series, extremes: Extremes) -> None:
    x, y = _finite_xy(series.x, series.y)
    finite = np.isfinite(x) & np.isfinite(y)
    if not finite.any():
        return
    x, y = x[finite], y[finite]
    if fmt.number(np.min(y), extremes.decimals) == fmt.number(np.max(y), extremes.decimals):
        return
    x_min, x_max = float(np.min(x)), float(np.max(x))
    span = (x_max - x_min) or 1.0
    for kind, index in (("mín", int(np.argmin(y))), ("máx", int(np.argmax(y)))):
        px, py = float(x[index]), float(y[index])
        ax.scatter([px], [py], s=16, color=series.color, edgecolors="white", linewidths=1.0, zorder=6)
        relative = (px - x_min) / span
        ha = "left" if relative < 0.2 else "right" if relative > 0.8 else "center"
        offset = (0, 6) if kind == "máx" else (0, -7)
        ax.annotate(
            f"{kind} {fmt.number(py, extremes.decimals, extremes.unit)}",
            xy=(px, py),
            xytext=offset,
            textcoords="offset points",
            ha=ha,
            va="bottom" if kind == "máx" else "top",
            fontsize=6.6,
            color=INK_SECONDARY,
            zorder=7,
            path_effects=[withStroke(linewidth=2.4, foreground="white")],
        )


def line_chart(
    series: Sequence[Series],
    *,
    x_label: str,
    y_label: str,
    width_mm: float = CONTENT_WIDTH_MM,
    height_mm: float = 50.0,
    extremes: Optional[Extremes] = None,
    reference: Optional[Tuple[float, str]] = None,
    zero_line: bool = False,
    legend_columns: Optional[int] = None,
) -> bytes:
    fig = _figure(width_mm, height_mm)
    ax = fig.add_subplot()
    _style_axes(ax, x_label, y_label)
    x_bounds = []
    for item in series:
        x, y = _finite_xy(item.x, item.y)
        if not x.size:
            continue
        ax.plot(
            x,
            y,
            color=item.color,
            linewidth=item.width,
            alpha=item.alpha,
            zorder=item.zorder,
            label=item.label if item.in_legend else "_nolegend_",
            solid_capstyle="round",
            solid_joinstyle="round",
        )
        finite_x = x[np.isfinite(x)]
        if finite_x.size:
            x_bounds.extend([float(finite_x.min()), float(finite_x.max())])
    if x_bounds and max(x_bounds) > min(x_bounds):
        ax.set_xlim(min(x_bounds), max(x_bounds))
    if zero_line:
        ax.axhline(0.0, color=AXIS, linewidth=0.8, zorder=2)
    if reference is not None and fmt.finite(reference[0]) is not None:
        ax.axhline(reference[0], color=INK_MUTED, linewidth=0.7, zorder=2)
        ax.annotate(
            reference[1],
            xy=(1.0, reference[0]),
            xycoords=("axes fraction", "data"),
            xytext=(0, 2),
            textcoords="offset points",
            ha="right",
            va="bottom",
            fontsize=6.4,
            color=INK_MUTED,
        )
    if extremes is not None and 0 <= extremes.series_index < len(series):
        _annotate_extremes(ax, series[extremes.series_index], extremes)
    ax.margins(y=0.14)
    _legend(ax, ncols=legend_columns)
    return _to_svg(fig)


def stacked_traces_chart(
    traces: Sequence[Series],
    *,
    x_label: str,
    unit: str,
    width_mm: float = CONTENT_WIDTH_MM,
    row_height_mm: float = 12.5,
) -> bytes:
    """One row per channel on a shared time axis, each with its own amplitude range."""

    rows = max(1, len(traces))
    fig = _figure(width_mm, row_height_mm * rows + 12.0)
    fig.get_layout_engine().set(hspace=0.0, h_pad=0.4 * MM)
    axes = fig.subplots(rows, 1, sharex=True, squeeze=False)[:, 0]
    x_bounds = []
    for ax, trace in zip(axes, traces):
        x, y = _finite_xy(trace.x, trace.y)
        ax.plot(x, y, color=trace.color, linewidth=0.6, solid_joinstyle="round")
        finite = np.isfinite(x) & np.isfinite(y)
        span_label = fmt.MISSING
        if finite.any():
            x_bounds.extend([float(x[finite].min()), float(x[finite].max())])
            low, high = float(np.min(y[finite])), float(np.max(y[finite]))
            pad = (high - low) * 0.08 or 1.0
            ax.set_ylim(low - pad, high + pad)
            span_label = f"{fmt.number(low, 0)} a {fmt.number(high, 0)}"
        ax.set_yticks([])
        ax.set_facecolor("none")
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(GRID)
        ax.spines["bottom"].set_linewidth(0.5)
        ax.tick_params(axis="x", colors=INK_MUTED, labelsize=TICK_PT, length=0)
        ax.text(-0.012, 0.58, trace.label, transform=ax.transAxes, ha="right", va="center", fontsize=LABEL_PT, color=INK)
        ax.text(-0.012, 0.18, span_label, transform=ax.transAxes, ha="right", va="center", fontsize=5.6, color=INK_MUTED)
    last = axes[-1]
    last.spines["bottom"].set_color(AXIS)
    last.tick_params(axis="x", length=2.5, width=0.6, pad=2)
    last.set_xlabel(x_label, fontsize=LABEL_PT, color=INK_SECONDARY, labelpad=3)
    if x_bounds and max(x_bounds) > min(x_bounds):
        last.set_xlim(min(x_bounds), max(x_bounds))
    axes[0].set_title(f"Canal · rango ({unit})", loc="left", fontsize=6.4, color=INK_MUTED, pad=3, x=-0.11)
    fig.get_layout_engine().set(w_pad=12 * MM)
    return _to_svg(fig)


def spectrum_chart(
    series: Sequence[Series],
    bands: Sequence[Tuple[str, float, float]],
    *,
    y_label: str,
    width_mm: float = CONTENT_WIDTH_MM,
    height_mm: float = 64.0,
    legend_columns: Optional[int] = None,
) -> bytes:
    fig = _figure(width_mm, height_mm)
    ax = fig.add_subplot()
    _style_axes(ax, "Frecuencia (Hz)", y_label)
    for index, (name, low, high) in enumerate(bands):
        if index % 2 == 0:
            ax.axvspan(low, high, color=BAND_TINT, zorder=0, linewidth=0)
        ax.text(
            (low + high) / 2,
            1.0,
            name,
            transform=ax.get_xaxis_transform(),
            ha="center",
            va="top",
            fontsize=6.2,
            color=INK_MUTED,
        )
    for item in series:
        frequency, values = _finite_xy(item.x, item.y)
        ax.plot(
            frequency,
            values,
            color=item.color,
            linewidth=item.width,
            alpha=item.alpha,
            zorder=item.zorder,
            label=item.label if item.in_legend else "_nolegend_",
        )
    if bands:
        ax.set_xlim(bands[0][1], bands[-1][2])
    ax.margins(y=0.16)
    _legend(ax, ncols=legend_columns)
    return _to_svg(fig)


def bar_chart(
    labels: Sequence[str],
    values: Sequence[Optional[float]],
    *,
    value_labels: Sequence[str],
    axis_label: str,
    colors: Optional[Sequence[str]] = None,
    errors: Optional[Sequence[Optional[float]]] = None,
    horizontal: bool = True,
    limit: Optional[Tuple[float, float]] = None,
    min_span: float = 0.0,
    width_mm: float = CONTENT_WIDTH_MM,
    height_mm: Optional[float] = None,
) -> bytes:
    count = max(1, len(labels))
    if height_mm is None:
        height_mm = max(28.0, 9.5 + 7.0 * count) if horizontal else 56.0
    fig = _figure(width_mm, height_mm)
    ax = fig.add_subplot()
    numeric = np.asarray([fmt.finite(value) or 0.0 for value in values], dtype=float)
    positions = np.arange(count)
    bar_colors = list(colors) if colors else [SERIES_COLORS[0]] * count
    error_values = None
    if errors is not None:
        error_values = np.asarray([fmt.finite(value) or 0.0 for value in errors], dtype=float)
    top = float(np.max(numeric + (error_values if error_values is not None else 0.0))) if count else 1.0
    if horizontal:
        _style_axes(ax, axis_label, "", grid_axis="x")
        ax.barh(positions, numeric, height=0.58, color=bar_colors, zorder=3)
        if error_values is not None:
            ax.errorbar(numeric, positions, xerr=error_values, fmt="none", ecolor=INK_MUTED, elinewidth=0.7, capsize=2, zorder=4)
        ax.set_yticks(positions, labels=list(labels))
        ax.tick_params(axis="y", length=0, labelsize=LABEL_PT, labelcolor=INK)
        ax.invert_yaxis()
        ax.spines["left"].set_visible(False)
        high = limit[1] if limit else max(top * 1.18, min_span, 1e-9 if top > 0 else 1.0)
        ax.set_xlim(limit[0] if limit else 0.0, high)
        for position, value, error, text in zip(
            positions,
            numeric,
            error_values if error_values is not None else [0.0] * count,
            value_labels,
        ):
            ax.annotate(
                text,
                xy=(value + error, position),
                xytext=(6 if error else 4, 0),
                textcoords="offset points",
                va="center",
                ha="left",
                fontsize=6.8,
                color=INK_SECONDARY,
            )
    else:
        _style_axes(ax, "", axis_label, grid_axis="y")
        ax.bar(positions, numeric, width=0.72, color=bar_colors, zorder=3)
        if error_values is not None:
            ax.errorbar(positions, numeric, yerr=error_values, fmt="none", ecolor=INK_MUTED, elinewidth=0.7, capsize=2, zorder=4)
        ax.set_xticks(positions, labels=list(labels))
        ax.tick_params(axis="x", length=0, labelsize=TICK_PT)
        high = limit[1] if limit else max(top * 1.2, min_span, 1e-9 if top > 0 else 1.0)
        ax.set_ylim(limit[0] if limit else 0.0, high)
        for position, value, error, text in zip(
            positions,
            numeric,
            error_values if error_values is not None else [0.0] * count,
            value_labels,
        ):
            ax.annotate(
                text,
                xy=(position, value + error),
                xytext=(0, 2.5),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=6.4,
                color=INK_SECONDARY,
            )
    return _to_svg(fig)


def _text_color_for(fill: str) -> str:
    red, green, blue = to_rgb(fill)
    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    return "#FFFFFF" if luminance < 0.5 else INK


def stacked_share_chart(
    labels: Sequence[str],
    segments: Sequence[Tuple[str, Sequence[Optional[float]], str]],
    *,
    axis_label: str = "Potencia relativa (%)",
    width_mm: float = CONTENT_WIDTH_MM,
    min_label_share: float = 7.0,
) -> bytes:
    """Horizontal 100 % stacked bars with a 2 px surface gap between segments."""

    count = max(1, len(labels))
    fig = _figure(width_mm, max(30.0, 14.0 + 7.2 * count))
    ax = fig.add_subplot()
    _style_axes(ax, axis_label, "", grid_axis="")
    positions = np.arange(count)
    left = np.zeros(count)
    for name, values, color in segments:
        widths = np.asarray([fmt.finite(value) or 0.0 for value in values], dtype=float)
        ax.barh(positions, widths, left=left, height=0.62, color=color, edgecolor="white", linewidth=1.0, label=name, zorder=3)
        for position, start, width in zip(positions, left, widths):
            if width >= min_label_share:
                ax.text(
                    start + width / 2,
                    position,
                    fmt.number(width, 0, "%"),
                    ha="center",
                    va="center",
                    fontsize=6.2,
                    color=_text_color_for(color),
                    zorder=4,
                )
        left = left + widths
    ax.set_yticks(positions, labels=list(labels))
    ax.tick_params(axis="y", length=0, labelsize=LABEL_PT, labelcolor=INK)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.spines["left"].set_visible(False)
    _legend(ax, ncols=len(segments))
    return _to_svg(fig)


def spectrogram_grid(
    panels: Sequence[Tuple[str, Sequence[float], Sequence[float], np.ndarray]],
    *,
    color_domain: Tuple[float, float],
    unit: str,
    columns: int = 4,
    width_mm: float = CONTENT_WIDTH_MM,
    panel_height_mm: float = 30.0,
) -> bytes:
    columns = max(1, min(columns, len(panels) or 1))
    rows = int(np.ceil(len(panels) / columns)) or 1
    fig = _figure(width_mm, rows * panel_height_mm + 10.0)
    axes = fig.subplots(rows, columns, squeeze=False, sharex=True, sharey=True)
    norm = Normalize(vmin=color_domain[0], vmax=color_domain[1])
    mesh = None
    for index, ax in enumerate(axes.flat):
        if index >= len(panels):
            ax.set_visible(False)
            continue
        label, time, frequency, matrix = panels[index]
        values = np.ma.masked_invalid(np.asarray(matrix, dtype=float))
        mesh = ax.pcolormesh(
            np.asarray(time, dtype=float),
            np.asarray(frequency, dtype=float),
            values,
            shading="nearest",
            cmap=SEQUENTIAL,
            norm=norm,
            rasterized=True,
        )
        ax.set_title(label, loc="left", fontsize=LABEL_PT, color=INK, pad=2)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.tick_params(colors=INK_MUTED, labelsize=5.8, length=0, pad=1.5)
        if index % columns == 0:
            ax.set_ylabel("Hz", fontsize=6.4, color=INK_SECONDARY, labelpad=1)
        if index >= len(panels) - columns:
            ax.set_xlabel("Tiempo (s)", fontsize=6.4, color=INK_SECONDARY, labelpad=1)
    if mesh is not None:
        bar = fig.colorbar(mesh, ax=axes.ravel().tolist(), location="right", shrink=0.85, aspect=24, pad=0.01)
        bar.outline.set_visible(False)
        bar.ax.tick_params(labelsize=5.8, colors=INK_MUTED, length=0)
        bar.set_label(unit, fontsize=6.4, color=INK_SECONDARY)
    return _to_svg(fig)


def topography_grid(
    maps: Sequence[Tuple[str, Mapping[str, Optional[float]]]],
    positions: Mapping[str, Tuple[float, float]],
    *,
    value_suffix: str = "%",
    decimals: int = 0,
    width_mm: float = CONTENT_WIDTH_MM,
) -> bytes:
    """Schematic head maps: each electrode is a dot shaded on that map's own range."""

    columns = max(1, len(maps))
    panel_mm = min(38.0, width_mm / columns)
    fig = _figure(width_mm, panel_mm + 8.0)
    axes = fig.subplots(1, columns, squeeze=False)[0]
    for ax, (title, values) in zip(axes, maps):
        ax.set_aspect("equal")
        ax.set_xlim(-1.15, 1.15)
        ax.set_ylim(-1.12, 1.22)
        ax.axis("off")
        ax.add_patch(Circle((0, 0), 1.0, fill=False, edgecolor=AXIS, linewidth=0.8))
        ax.add_patch(Polygon([(-0.12, 0.99), (0.0, 1.14), (0.12, 0.99)], closed=False, fill=False, edgecolor=AXIS, linewidth=0.8))
        finite_values = [fmt.finite(value) for value in values.values()]
        finite_values = [value for value in finite_values if value is not None]
        low = min(finite_values) if finite_values else 0.0
        high = max(finite_values) if finite_values else 1.0
        norm = Normalize(vmin=low, vmax=high if high > low else low + 1.0)
        for channel, (x, y) in positions.items():
            value = fmt.finite(values.get(channel))
            fill = SEQUENTIAL(norm(value)) if value is not None else (0.93, 0.93, 0.93, 1.0)
            ax.add_patch(Circle((x, y), 0.31, facecolor=fill, edgecolor="white", linewidth=1.0, zorder=3))
            hex_fill = "#{:02x}{:02x}{:02x}".format(*(int(round(channel_value * 255)) for channel_value in fill[:3]))
            ink = _text_color_for(hex_fill)
            ax.text(x, y + 0.09, channel.upper(), ha="center", va="center", fontsize=5.8, color=ink, zorder=4)
            ax.text(
                x,
                y - 0.1,
                fmt.number(value, decimals, value_suffix) if value is not None else fmt.MISSING,
                ha="center",
                va="center",
                fontsize=6.2,
                color=ink,
                zorder=4,
            )
        ax.set_title(title, fontsize=LABEL_PT, color=INK, pad=1)
    return _to_svg(fig)

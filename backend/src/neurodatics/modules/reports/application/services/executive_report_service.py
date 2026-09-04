from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import UUID

import anyio
import matplotlib
from matplotlib import font_manager
import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .....infra.storage.gdrive_client import GoogleDriveClient
from .....infra.storage.gdrive_oauth_credentials import build_google_drive_oauth_credentials
from ....analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    EEG_CHANNELS,
    EegAnalyticsService,
    FixationDataService,
    FixationHistogramService,
    GsrAnalyticsService,
    HeatmapAnalyticsService,
    ScanpathAnalyticsService,
)
from ....analytics.application.services.comparison_chart_config import (
    ChartConfigBuilder,
    temporal_visualizations_for_sensors,
)
from ....analytics.application.services.parquet_reader_service import ParquetReaderService
from ....analytics.domain.cache_generation import project_cache_generation
from ....integrations.google_drive.infrastructure.repository import SystemIntegrationRepository
from ....projects.domain.entities import Project, ProjectFile
from ....scenaries.domain.entities import Scenaries
from ...api.schemas import ExecutiveReportRequest

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

logger = logging.getLogger(__name__)

REPORT_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
REPORT_FONT_REGULAR = REPORT_FONT_DIR / "Poppins-Regular.ttf"
REPORT_FONT_MEDIUM = REPORT_FONT_DIR / "Poppins-Medium.ttf"
REPORT_FONT_SEMIBOLD = REPORT_FONT_DIR / "Poppins-SemiBold.ttf"
REPORT_FONT_BOLD = REPORT_FONT_DIR / "Poppins-Bold.ttf"

REPORT_SENSOR_ORDER = ("EyeTracker", "GSR", "EEG")
CHART_SERIES_PALETTE = ["#2563EB", "#7C3AED", "#0F766E", "#06B6D4", "#DC2626", "#EA580C", "#BE123C"]
PEAK_MIN_COLOR = "#111827"
PEAK_MAX_COLOR = "#F97316"
PEAK_MIN_LINESTYLE = ":"
PEAK_MAX_LINESTYLE = "--"
REPORT_BG = "#F8FAFC"
REPORT_SURFACE = "#FFFFFF"
REPORT_BORDER = "#E2E8F0"
REPORT_MUTED = "#64748B"
REPORT_TEXT = "#0F172A"
REPORT_SOFT_TEXT = "#334155"
REPORT_GRID = "#E5E7EB"
SENSOR_COLORS = {
    "EyeTracker": "#6366F1",
    "GSR": "#14B8A6",
    "EEG": "#8B5CF6",
}
STIMULUS_CANVAS_SIZE = (2560, 1440)
STIMULUS_REFERENCE_SIZE = (1280, 720)
SCANPATH_RADIUS_CAP_MS = float(getattr(ScanpathAnalyticsService, "RADIUS_CAP_MS", 2000.0))
SCANPATH_RADIUS_MIN_PX = 13.0
SCANPATH_RADIUS_MAX_PX = 34.0
SCANPATH_LEGEND_REFERENCE_DURATIONS_MS = (200.0, 1000.0)
EYE_TRACKER_VISUALS = {
    "pupil",
    "gaze",
    "distance",
    "fixation_histogram",
    "heatmap",
    "scanpath",
    "aoi",
}
GSR_VISUALS = {"gsr"}
EEG_VISUALS = {"eeg_timeseries", "eeg_psd", "eeg_spectrogram"}


def _register_report_fonts() -> None:
    for font_path in (REPORT_FONT_REGULAR, REPORT_FONT_MEDIUM, REPORT_FONT_SEMIBOLD, REPORT_FONT_BOLD):
        if font_path.exists():
            try:
                font_manager.fontManager.addfont(str(font_path))
            except Exception as exc:
                logger.debug("Could not register report font %s: %s", font_path, exc)

    plt.rcParams.update(
        {
            "font.family": "Poppins",
            "font.sans-serif": ["Poppins", "DejaVu Sans", "Arial"],
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
            "axes.titlesize": 11,
            "axes.labelsize": 8,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
        }
    )


_register_report_fonts()


@dataclass
class ParticipantFrame:
    code: str
    dataframe: pd.DataFrame


@dataclass
class SpatialAssets:
    heatmap: Optional[Image.Image]
    scanpath: Optional[Image.Image]
    aoi: Optional[Image.Image]
    aoi_rows: List[Dict[str, Any]]
    spatial_metrics: List[Dict[str, Any]]


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


def resolve_report_visualizations(sensors: Sequence[str]) -> List[str]:
    visuals: List[str] = []
    if "EyeTracker" in sensors:
        visuals.extend(sorted(EYE_TRACKER_VISUALS))
    if "GSR" in sensors:
        visuals.extend(sorted(GSR_VISUALS))
    if "EEG" in sensors:
        visuals.extend(sorted(EEG_VISUALS))
    return visuals


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


def _finite_arrays(time_values: Sequence[float], values: Sequence[float]) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    time_arr = np.asarray(time_values, dtype=float)
    value_arr = np.asarray(values, dtype=float)
    if time_arr.size != value_arr.size or time_arr.size == 0:
        return None
    finite = np.isfinite(time_arr) & np.isfinite(value_arr)
    if not finite.any():
        return None
    time_arr = time_arr[finite]
    value_arr = value_arr[finite]
    order = np.argsort(time_arr)
    time_arr = time_arr[order]
    value_arr = value_arr[order]
    return time_arr, value_arr


def _safe_mean(values: Iterable[Optional[float]]) -> Optional[float]:
    finite = [float(value) for value in values if value is not None and np.isfinite(float(value))]
    return float(np.mean(finite)) if finite else None


def _safe_sum(values: Iterable[Optional[float]]) -> float:
    finite = [float(value) for value in values if value is not None and np.isfinite(float(value))]
    return float(np.sum(finite)) if finite else 0.0


def _format_number(value: Any, decimals: int = 2) -> str:
    if value is None:
        return "-"
    try:
        value_float = float(value)
    except (TypeError, ValueError):
        return str(value)
    if not np.isfinite(value_float):
        return "-"
    if abs(value_float) >= 1000:
        return f"{value_float:,.0f}"
    return f"{value_float:.{decimals}f}"


def _make_placeholder_image(title: str = "Imagen no disponible") -> Image.Image:
    canvas_width, canvas_height = STIMULUS_CANVAS_SIZE
    image = Image.new("RGBA", STIMULUS_CANVAS_SIZE, (248, 250, 252, 255))
    draw = ImageDraw.Draw(image)
    border_width = max(3, int(round(canvas_width / 640)))
    draw.rectangle((0, 0, canvas_width - 1, canvas_height - 1), outline=(203, 213, 225, 255), width=border_width)
    try:
        font = ImageFont.truetype("arial.ttf", max(34, int(round(canvas_width * 0.027))))
    except OSError:
        font = ImageFont.load_default()
    draw.text((canvas_width * 0.047, canvas_height * 0.460), title, fill=(71, 85, 105, 255), font=font)
    return image


def _open_base_image(image_bytes: Optional[bytes]) -> Image.Image:
    if not image_bytes:
        image = _make_placeholder_image()
        image.info["content_box"] = (0, 0, image.width, image.height)
        return image
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except Exception:
        image = _make_placeholder_image()
        image.info["content_box"] = (0, 0, image.width, image.height)
        return image
    canvas_width, canvas_height = STIMULUS_CANVAS_SIZE
    scale = min(canvas_width / image.width, canvas_height / image.height)
    target_size = (
        max(1, int(round(image.width * scale))),
        max(1, int(round(image.height * scale))),
    )
    image = image.resize(target_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", STIMULUS_CANVAS_SIZE, (255, 255, 255, 255))
    offset = ((canvas_width - image.width) // 2, (canvas_height - image.height) // 2)
    canvas.alpha_composite(image, offset)
    canvas.info["content_box"] = (offset[0], offset[1], image.width, image.height)
    return canvas


def _hex_to_rgba(value: str, alpha: int = 190) -> Tuple[int, int, int, int]:
    raw = str(value or "#2563EB").strip().lstrip("#")
    if len(raw) != 6:
        raw = "2563EB"
    try:
        return (
            int(raw[0:2], 16),
            int(raw[2:4], 16),
            int(raw[4:6], 16),
            alpha,
        )
    except ValueError:
        return (37, 99, 235, alpha)


def _hex_to_rgb(value: str) -> Tuple[float, float, float]:
    red, green, blue, _ = _hex_to_rgba(value, 255)
    return red / 255.0, green / 255.0, blue / 255.0


def _load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    preferred = REPORT_FONT_SEMIBOLD if bold else REPORT_FONT_REGULAR
    if preferred.exists():
        try:
            return ImageFont.truetype(str(preferred), size=size)
        except OSError:
            pass

    candidates = (
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "Arial Bold.ttf" if bold else "Arial.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _aoi_attrs(aoi: Any) -> Dict[str, Any]:
    return {
        "id": str(getattr(aoi, "id", "")),
        "name": str(getattr(aoi, "name", "")),
        "color": str(getattr(aoi, "color", "#2563EB")),
        "shape_type": str(getattr(aoi, "shape_type", "rect")),
        "shape": getattr(aoi, "shape", None) or {},
    }


def _content_box(image: Image.Image) -> Tuple[int, int, int, int]:
    value = image.info.get("content_box")
    if (
        isinstance(value, tuple)
        and len(value) == 4
        and all(isinstance(item, (int, float)) for item in value)
    ):
        return int(value[0]), int(value[1]), int(value[2]), int(value[3])
    return 0, 0, image.width, image.height


def _aoi_bounds(item: Dict[str, Any]) -> Dict[str, float]:
    shape = item["shape"] if isinstance(item["shape"], dict) else {}
    shape_type = item["shape_type"].lower()
    if shape_type == "polygon" and isinstance(shape.get("points"), list):
        points = [
            (float(point.get("x", 0.0)), float(point.get("y", 0.0)))
            for point in shape["points"]
            if isinstance(point, dict)
        ]
        if points:
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            return {
                "x": float(np.clip(min(xs), 0.0, 100.0)),
                "y": float(np.clip(min(ys), 0.0, 100.0)),
                "width": float(np.clip(max(xs) - min(xs), 0.0, 100.0)),
                "height": float(np.clip(max(ys) - min(ys), 0.0, 100.0)),
            }
    return {
        "x": float(shape.get("x") or 0.0),
        "y": float(shape.get("y") or 0.0),
        "width": float(shape.get("width") or 0.0),
        "height": float(shape.get("height") or 0.0),
    }


def _draw_text_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    position: Tuple[float, float],
    color: Tuple[int, int, int, int],
    font_size: int = 18,
    stroke_width: int = 3,
) -> None:
    if not text:
        return
    draw.text(
        position,
        text[:42],
        font=_load_font(max(8, int(font_size)), bold=True),
        fill=color,
        stroke_width=max(1, int(stroke_width)),
        stroke_fill=(255, 255, 255, 230),
    )


def _draw_aoi_shape(
    draw: ImageDraw.ImageDraw,
    aoi: Any,
    bounds: Tuple[int, int, int, int],
    fill: bool = True,
    show_label: bool = True,
) -> None:
    item = _aoi_attrs(aoi)
    shape = item["shape"] if isinstance(item["shape"], dict) else {}
    color = _hex_to_rgba(item["color"], 26 if fill else 0)
    outline = _hex_to_rgba(item["color"], 255)
    offset_x, offset_y, rendered_width, rendered_height = bounds
    scale = max(
        rendered_width / STIMULUS_REFERENCE_SIZE[0],
        rendered_height / STIMULUS_REFERENCE_SIZE[1],
        1.0,
    )
    outline_width = max(3, int(round(4 * scale)))
    label_offset_x = max(8, int(round(8 * scale)))
    label_offset_y = max(24, int(round(24 * scale)))
    label_min_y = max(16, int(round(16 * scale)))
    label_font_size = max(18, int(round(18 * scale)))
    label_stroke_width = max(2, int(round(3 * scale)))

    def pct_x(value: Any) -> float:
        return offset_x + float(value or 0) * rendered_width / 100.0

    def pct_y(value: Any) -> float:
        return offset_y + float(value or 0) * rendered_height / 100.0

    shape_type = item["shape_type"].lower()
    if shape_type == "polygon" and isinstance(shape.get("points"), list):
        points = [(pct_x(point.get("x")), pct_y(point.get("y"))) for point in shape["points"] if isinstance(point, dict)]
        if len(points) >= 3:
            draw.polygon(points, fill=color if fill else None)
            try:
                draw.line([*points, points[0]], fill=outline, width=outline_width, joint="curve")
            except TypeError:
                draw.line([*points, points[0]], fill=outline, width=outline_width)
            if show_label:
                rect = _aoi_bounds(item)
                _draw_text_label(
                    draw,
                    item["name"],
                    (pct_x(rect["x"]) + label_offset_x, max(pct_y(rect["y"]) - label_offset_y, label_min_y)),
                    outline,
                    font_size=label_font_size,
                    stroke_width=label_stroke_width,
                )
        return

    x0 = pct_x(shape.get("x"))
    y0 = pct_y(shape.get("y"))
    x1 = x0 + float(shape.get("width") or 0) * rendered_width / 100.0
    y1 = y0 + float(shape.get("height") or 0) * rendered_height / 100.0
    box = (x0, y0, x1, y1)
    if shape_type in {"circle", "ellipse"}:
        draw.ellipse(box, fill=color if fill else None, outline=outline, width=outline_width)
    else:
        draw.rectangle(box, fill=color if fill else None, outline=outline, width=outline_width)
    if show_label:
        _draw_text_label(
            draw,
            item["name"],
            (x0 + label_offset_x, max(y0 - label_offset_y, label_min_y)),
            outline,
            font_size=label_font_size,
            stroke_width=label_stroke_width,
        )


def _draw_aois(base_image: Image.Image, aois: Sequence[Any]) -> Image.Image:
    image = base_image.copy()
    draw = ImageDraw.Draw(image, "RGBA")
    bounds = _content_box(image)
    for aoi in aois:
        _draw_aoi_shape(draw, aoi, bounds, fill=False)
    return image


def _scanpath_radius_cap_ms(radius_scale: Any = None) -> float:
    try:
        cap_ms = float((radius_scale or {}).get("cap_ms", SCANPATH_RADIUS_CAP_MS))
    except (AttributeError, TypeError, ValueError):
        cap_ms = SCANPATH_RADIUS_CAP_MS
    if not np.isfinite(cap_ms) or cap_ms <= 0.0:
        return SCANPATH_RADIUS_CAP_MS
    return cap_ms


def _scanpath_radius(duration_s: Any, scale: float = 1.0, cap_ms: Optional[float] = None) -> float:
    """Return an area-proportional report radius on the shared absolute scale."""

    try:
        duration_ms = float(duration_s) * 1000.0
    except (TypeError, ValueError):
        duration_ms = 0.0
    if not np.isfinite(duration_ms):
        duration_ms = 0.0

    resolved_cap_ms = (
        _scanpath_radius_cap_ms({"cap_ms": cap_ms})
        if cap_ms is not None
        else SCANPATH_RADIUS_CAP_MS
    )
    fraction = float(np.clip(duration_ms / resolved_cap_ms, 0.0, 1.0))
    radius_squared = (
        SCANPATH_RADIUS_MIN_PX ** 2
        + fraction * (SCANPATH_RADIUS_MAX_PX ** 2 - SCANPATH_RADIUS_MIN_PX ** 2)
    )
    return float(np.sqrt(radius_squared) * max(float(scale), 0.0))


def _scanpath_total_duration_s(scanpath: Dict[str, Any]) -> float:
    """Use API total dwell when valid, with an objective sum for older payloads."""

    try:
        total = float(scanpath.get("total_duration_s"))
    except (TypeError, ValueError):
        total = float("nan")
    if np.isfinite(total) and total >= 0.0:
        return total

    durations: List[float] = []
    for item in scanpath.get("objectives") or []:
        try:
            duration = float(item.get("duration_s"))
        except (AttributeError, TypeError, ValueError):
            continue
        if np.isfinite(duration) and duration > 0.0:
            durations.append(duration)
    return float(np.sum(durations)) if durations else 0.0


def _draw_scanpath(base_image: Image.Image, scanpath: Dict[str, Any], aois: Sequence[Any]) -> Image.Image:
    image = base_image.copy()
    draw = ImageDraw.Draw(image, "RGBA")
    offset_x, offset_y, rendered_width, rendered_height = _content_box(image)
    scale = max(
        rendered_width / STIMULUS_REFERENCE_SIZE[0],
        rendered_height / STIMULUS_REFERENCE_SIZE[1],
        1.0,
    )
    line_width = max(5, int(round(5 * scale)))
    circle_outline_width = max(3, int(round(3 * scale)))
    point_font = _load_font(max(11, int(round(12 * scale))), bold=True)
    for aoi in aois:
        _draw_aoi_shape(draw, aoi, (offset_x, offset_y, rendered_width, rendered_height), fill=False)

    objectives = list(scanpath.get("objectives") or [])
    radius_cap_ms = _scanpath_radius_cap_ms(scanpath.get("radius_scale"))
    points = [
        (
            offset_x + float(item.get("cx", 0.0)) * rendered_width,
            offset_y + float(item.get("cy", 0.0)) * rendered_height,
        )
        for item in objectives
    ]
    for start, end in zip(points, points[1:]):
        draw.line((*start, *end), fill=(244, 63, 94, 210), width=line_width)
    for index, (point, item) in enumerate(zip(points, objectives), start=1):
        radius = _scanpath_radius(item.get("duration_s"), scale, radius_cap_ms)
        x, y = point
        draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=(244, 63, 94, 210),
            outline=(255, 255, 255, 255),
            width=circle_outline_width,
        )
        draw.text((x - 5 * scale, y - 7 * scale), str(index), fill=(255, 255, 255, 255), font=point_font)
    image.info["scanpath_total_duration_s"] = _scanpath_total_duration_s(scanpath)
    image.info["scanpath_radius_scale"] = {
        "version": "absolute-area-v1",
        "encoding": "area",
        "cap_ms": int(radius_cap_ms) if radius_cap_ms.is_integer() else radius_cap_ms,
    }
    return image


def _draw_heatmap(base_image: Image.Image, overlay_bytes: Optional[bytes]) -> Optional[Image.Image]:
    """Composite the heatmap over the stimulus, not over the letterboxed canvas.

    The base image is the stimulus centred on a fixed report canvas, so pasting
    the overlay across the whole canvas would stretch it into the letterbox bars
    and put every hotspot in the wrong place relative to the scanpath and AOI
    figures, which draw inside ``_content_box``.
    """

    if not overlay_bytes:
        return None
    try:
        overlay = Image.open(io.BytesIO(overlay_bytes)).convert("RGBA")
    except Exception as exc:
        logger.warning("Executive report heatmap overlay unreadable (%s)", type(exc).__name__)
        return None
    image = base_image.copy()
    offset_x, offset_y, content_width, content_height = _content_box(image)
    if overlay.size != (content_width, content_height):
        overlay = overlay.resize((content_width, content_height), Image.Resampling.LANCZOS)
    image.alpha_composite(overlay, (offset_x, offset_y))
    return image


def _concat_frames(frames: Sequence[ParticipantFrame]) -> pd.DataFrame:
    if not frames:
        return pd.DataFrame()
    dataframes = []
    for frame in frames:
        df = frame.dataframe.copy()
        df["_participant_code"] = frame.code
        dataframes.append(df)
    return pd.concat(dataframes, ignore_index=True, sort=False)


def build_temporal_charts(
    frames: Sequence[ParticipantFrame],
    scenario: str,
    sensors: Sequence[str],
) -> List[Dict[str, Any]]:
    if len(frames) != 1:
        return []
    return ChartConfigBuilder.build_many(
        frames[0].dataframe,
        scenario,
        temporal_visualizations_for_sensors(sensors),
        max_points=5000,
    )


def build_metric_rows(
    combined_df: pd.DataFrame,
    scenario: str,
    sensors: Sequence[str],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if combined_df.empty:
        return rows

    if "EyeTracker" in sensors:
        histogram = FixationHistogramService.compute_histogram(combined_df, scenario)
        if histogram.get("n_fixations", 0):
            rows.extend(
                [
                    {"metric": "Fijaciones", "value": histogram["n_fixations"], "unit": ""},
                    {"metric": "Duracion total fijaciones", "value": histogram["total_duration_ms"], "unit": "ms"},
                    {"metric": "Duracion media fijacion", "value": histogram["mean_duration_ms"], "unit": "ms"},
                    {"metric": "Duracion maxima fijacion", "value": histogram["max_duration_ms"], "unit": "ms"},
                ]
            )

    if "GSR" in sensors:
        stats = GsrAnalyticsService.compute_statistics(combined_df, scenario)
        rows.extend(
            [
                {"metric": "GSR media", "value": stats.get("mean"), "unit": "uS"},
                {"metric": "GSR minimo", "value": stats.get("min"), "unit": "uS"},
                {"metric": "GSR maximo", "value": stats.get("max"), "unit": "uS"},
            ]
        )

    if "EEG" in sensors:
        psd = EegAnalyticsService.compute_psd(combined_df, scenario=scenario, max_freq_hz=45.0, max_points=1000)
        for channel in psd.get("channels", []):
            values = np.asarray(psd.get("power", {}).get(channel, []), dtype=float)
            freqs = np.asarray(psd.get("frequency", []), dtype=float)
            finite = np.isfinite(values) & np.isfinite(freqs)
            if finite.any():
                peak_idx = int(np.argmax(values[finite]))
                finite_freqs = freqs[finite]
                finite_values = values[finite]
                rows.append({"metric": f"PSD {channel.upper()} frecuencia pico", "value": finite_freqs[peak_idx], "unit": "Hz"})
                rows.append({"metric": f"PSD {channel.upper()} potencia pico", "value": finite_values[peak_idx], "unit": psd.get("unit", "dB")})

        spectrogram = EegAnalyticsService.compute_spectrogram(
            combined_df,
            scenario=scenario,
            max_freq_hz=45.0,
            max_time_bins=80,
            max_frequency_bins=80,
        )
        for channel in spectrogram.get("channels", []):
            values = np.asarray(spectrogram.get("power", {}).get(channel, []), dtype=float)
            finite = values[np.isfinite(values)]
            if finite.size:
                rows.append({"metric": f"Espectrograma {channel.upper()} potencia media", "value": float(np.mean(finite)), "unit": spectrogram.get("unit", "dB")})
                rows.append({"metric": f"Espectrograma {channel.upper()} potencia maxima", "value": float(np.max(finite)), "unit": spectrogram.get("unit", "dB")})

    return rows


def aggregate_metric_rows(participant_rows: Sequence[Sequence[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    grouped: Dict[Tuple[str, str], List[float]] = {}
    for rows in participant_rows:
        for row in rows:
            try:
                value = float(row.get("value"))
            except (TypeError, ValueError):
                continue
            if not np.isfinite(value):
                continue
            key = (str(row.get("metric") or ""), str(row.get("unit") or ""))
            grouped.setdefault(key, []).append(value)

    output: List[Dict[str, Any]] = []
    for (metric, unit), values in grouped.items():
        value_arr = np.asarray(values, dtype=float)
        output.append(
            {
                "metric": f"{metric} promedio",
                "value": float(np.mean(value_arr)),
                "unit": unit,
            }
        )
        if value_arr.size > 1:
            output.append(
                {
                    "metric": f"{metric} rango",
                    "value": f"{float(np.min(value_arr)):.2f} - {float(np.max(value_arr)):.2f}",
                    "unit": unit,
                }
            )
    return output


def build_metric_rows_for_frames(
    frames: Sequence[ParticipantFrame],
    scenario: str,
    sensors: Sequence[str],
) -> List[Dict[str, Any]]:
    if not frames:
        return []
    if len(frames) == 1:
        return build_metric_rows(frames[0].dataframe, scenario, sensors)
    participant_rows = [
        build_metric_rows(frame.dataframe, scenario, sensors)
        for frame in frames
    ]
    return aggregate_metric_rows(participant_rows)


def _aggregate_aoi_rows(results: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id: Dict[str, List[Dict[str, Any]]] = {}
    for result in results:
        for row in result.get("aois", []):
            by_id.setdefault(str(row.get("id")), []).append(row)

    output = []
    for group in by_id.values():
        first = group[0]
        output.append(
            {
                "id": first.get("id", ""),
                "name": first.get("name", ""),
                "color": first.get("color", "#3B82F6"),
                "shape_type": first.get("shape_type", "rect"),
                "shape": first.get("shape", {}),
                "fixation_count": int(_safe_sum(row.get("fixation_count") for row in group)),
                "total_dwell_time_ms": _safe_sum(row.get("total_dwell_time_ms") for row in group),
                "total_dwell_time_percent": _safe_mean(row.get("total_dwell_time_percent") for row in group),
                "avg_fixation_duration_ms": _safe_mean(row.get("avg_fixation_duration_ms") for row in group),
                "hit_rate_percent": _safe_mean(row.get("hit_rate_percent") for row in group),
            }
        )
    return sorted(output, key=lambda row: str(row.get("name", "")).lower())


def build_spatial_assets(
    frames: Sequence[ParticipantFrame],
    combined_df: pd.DataFrame,
    scenario: str,
    base_image_bytes: Optional[bytes],
    aois: Sequence[Any],
) -> SpatialAssets:
    base_image = _open_base_image(base_image_bytes)
    spatial_metrics: List[Dict[str, Any]] = []

    heatmap_image = None
    try:
        _, _, content_width, content_height = _content_box(base_image)
        heatmap_bytes = HeatmapAnalyticsService.compute_heatmap_overlay(
            combined_df,
            scenario,
            width=content_width,
            height=content_height,
        )
        heatmap_image = _draw_heatmap(base_image, heatmap_bytes)
    except Exception as exc:
        logger.info("Executive report heatmap unavailable for %s: %s", scenario, exc)

    scanpath_image = None
    try:
        scanpath = ScanpathAnalyticsService.compute_scanpath(combined_df, scenario)
        if scanpath.get("n_objectives", 0):
            scanpath_image = _draw_scanpath(base_image, scanpath, aois)
            spatial_metrics.extend(
                [
                    {"metric": "Objetivos de recorrido", "value": scanpath.get("n_objectives"), "unit": ""},
                    {"metric": "Distancia total recorrido", "value": scanpath.get("total_distance_px"), "unit": "px"},
                    {"metric": "Duracion media objetivo", "value": (scanpath.get("avg_duration_s") or 0) * 1000, "unit": "ms"},
                ]
            )
    except Exception as exc:
        logger.info("Executive report scanpath unavailable for %s: %s", scenario, exc)

    try:
        fixation = FixationDataService.compute_fixation_data(combined_df, scenario)
        stats = fixation.get("stats") or {}
        if stats.get("n_fixations", 0):
            spatial_metrics.extend(
                [
                    {"metric": "Fijaciones mapa calor", "value": stats.get("n_fixations"), "unit": ""},
                    {"metric": "Fijacion maxima", "value": (stats.get("max_duration_s") or 0) * 1000, "unit": "ms"},
                    {"metric": "Fijacion media", "value": (stats.get("avg_duration_s") or 0) * 1000, "unit": "ms"},
                ]
            )
    except Exception as exc:
        logger.warning("Executive report fixation summary unavailable (%s)", type(exc).__name__)

    aoi_image = _draw_aois(base_image, aois) if aois else None
    aoi_results = []
    if aois:
        for frame in frames:
            try:
                aoi_results.append(AoiAnalyticsService.compute_metrics(frame.dataframe, scenario, list(aois)))
            except Exception as exc:
                logger.info("Executive report AOI unavailable for %s/%s: %s", frame.code, scenario, exc)

    aoi_rows = _aggregate_aoi_rows(aoi_results)
    if aoi_rows:
        spatial_metrics.append({"metric": "AOIs con datos", "value": len(aoi_rows), "unit": ""})

    return SpatialAssets(
        heatmap=heatmap_image,
        scanpath=scanpath_image,
        aoi=aoi_image,
        aoi_rows=aoi_rows,
        spatial_metrics=spatial_metrics,
    )


def _chart_summaries(chart: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = []
    data_rows = list(chart.get("data") or [])
    time_values = [row.get("time") for row in data_rows]
    for series in chart.get("series") or []:
        key = str(series.get("key") or "")
        values = [row.get(key) for row in data_rows]
        summary = summarize_series(
            str(series.get("label") or key),
            str(series.get("unit") or ""),
            time_values,
            values,
        )
        if summary:
            rows.append(summary)
    return rows


def _draw_chart(ax: Any, chart: Dict[str, Any]) -> List[Dict[str, Any]]:
    summaries = _chart_summaries(chart)
    data_rows = list(chart.get("data") or [])
    time_values = np.asarray([row.get("time") for row in data_rows], dtype=float)
    ax.set_zorder(5)

    for index, series in enumerate(chart.get("series") or []):
        key = str(series.get("key") or "")
        values = np.asarray([row.get(key) for row in data_rows], dtype=float)
        finite = np.isfinite(time_values) & np.isfinite(values)
        if not finite.any():
            continue
        ax.plot(
            time_values[finite],
            values[finite],
            linewidth=1.9,
            label=str(series.get("label") or key),
            color=str(series.get("color") or CHART_SERIES_PALETTE[index % len(CHART_SERIES_PALETTE)]),
        )

    for peak in chart.get("peaks") or []:
        try:
            time_s = float(peak.get("time_s"))
            value = float(peak.get("value"))
        except (TypeError, ValueError):
            continue
        if not np.isfinite(time_s) or not np.isfinite(value):
            continue
        color = str(peak.get("color") or PEAK_MAX_COLOR)
        linestyle = PEAK_MIN_LINESTYLE if peak.get("line_style") == "dotted" else PEAK_MAX_LINESTYLE
        offset_y = 18 if peak.get("kind") == "min" else 20
        label = str(peak.get("label") or peak.get("kind") or "")
        unit = str(peak.get("unit") or "")
        ax.axvline(time_s, color=color, linestyle=linestyle, linewidth=1.1, alpha=0.58)
        ax.scatter(
            [time_s],
            [value],
            s=38,
            color=color,
            edgecolors="white",
            linewidths=1.2,
            zorder=6,
        )
        ax.annotate(
            f"{_format_number(value)} {unit}\n{label} - {time_s:.1f} s",
            xy=(time_s, value),
            xytext=(8, offset_y),
            textcoords="offset points",
            fontsize=6.7,
            color=color,
            fontweight="bold",
            bbox={
                "boxstyle": "round,pad=0.35,rounding_size=0.2",
                "facecolor": "#FFFFFF",
                "edgecolor": color,
                "linewidth": 0.8,
                "alpha": 0.94,
            },
            arrowprops={"arrowstyle": "-", "color": color, "linewidth": 0.8, "alpha": 0.8},
            zorder=7,
        )

    x_domain = chart.get("x_domain")
    if isinstance(x_domain, list) and len(x_domain) == 2:
        try:
            start, end = float(x_domain[0]), float(x_domain[1])
            if np.isfinite(start) and np.isfinite(end) and end > start:
                ax.set_xlim(start, end)
        except (TypeError, ValueError):
            pass

    ax.set_title(str(chart.get("title") or ""), loc="left", fontsize=11, fontweight="bold", color=REPORT_TEXT, pad=18)
    ax.set_xlabel(str(chart.get("x_label") or "Tiempo (s)"), fontsize=8, color=REPORT_MUTED, labelpad=8)
    ax.set_ylabel(str(chart.get("y_label") or ""), fontsize=8, color=REPORT_MUTED, labelpad=8)
    ax.grid(True, axis="y", alpha=0.55, color=REPORT_GRID, linewidth=0.8)
    ax.grid(False, axis="x")
    ax.tick_params(labelsize=7, colors=REPORT_MUTED)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#CBD5E1")
    ax.spines["bottom"].set_color("#CBD5E1")
    ax.set_facecolor(REPORT_SURFACE)
    series_count = len(chart.get("series") or [])
    if series_count:
        ax.legend(loc="upper left", bbox_to_anchor=(0, 1.05), fontsize=7, frameon=False, ncol=min(3, series_count))
    return summaries


def _draw_aoi_bar_chart(ax: Any, rows: Sequence[Dict[str, Any]]) -> None:
    ax.set_zorder(5)
    if not rows:
        ax.axis("off")
        return

    ordered_rows = sorted(rows, key=lambda row: float(row.get("total_dwell_time_percent") or 0.0), reverse=True)
    labels = [str(row.get("name") or "-")[:22] for row in ordered_rows]
    values = [
        float(np.clip(float(row.get("total_dwell_time_percent") or 0.0), 0.0, 100.0))
        for row in ordered_rows
    ]
    colors = [_hex_to_rgb(str(row.get("color") or "#3B82F6")) for row in ordered_rows]
    y_values = np.arange(len(labels))

    ax.barh(y_values, values, color=colors, height=0.58)
    for y_value, value in zip(y_values, values):
        ax.text(
            min(99.0, value + 1.2),
            y_value,
            f"{value:.1f}%",
            va="center",
            fontsize=7,
            color=REPORT_SOFT_TEXT,
            fontweight="bold",
        )
    ax.set_title("Atencion por AOI", loc="left", fontsize=12, fontweight="bold", pad=20, color=REPORT_TEXT)
    ax.text(
        0,
        1.03,
        "Tiempo de observacion dedicado a cada zona.",
        transform=ax.transAxes,
        fontsize=8,
        color="#64748B",
        va="bottom",
    )
    ax.set_xlim(0, 100)
    ax.set_yticks(y_values)
    ax.set_yticklabels(labels, fontsize=8, color=REPORT_SOFT_TEXT)
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.set_xticklabels(["0", "25", "50", "75", "100%"], fontsize=7, color=REPORT_MUTED)
    ax.tick_params(axis="y", length=0)
    ax.grid(True, axis="x", linestyle=(0, (2, 2)), color="#CBD5E1", alpha=0.65)
    ax.grid(False, axis="y")
    ax.set_axisbelow(True)
    ax.invert_yaxis()
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color("#CBD5E1")
    ax.set_facecolor(REPORT_SURFACE)


def _fig_text(
    fig: Any,
    x: float,
    y: float,
    text: str,
    size: int = 10,
    weight: str = "normal",
    color: str = REPORT_TEXT,
    ha: str = "left",
    va: str = "top",
) -> None:
    fig.text(
        x,
        y,
        text,
        fontsize=size,
        fontweight=weight,
        color=color,
        ha=ha,
        va=va,
        fontfamily="Poppins",
    )


def _new_report_figure() -> Any:
    return plt.figure(figsize=(8.27, 11.69), facecolor=REPORT_BG)


def _rounded_rect(
    fig: Any,
    x: float,
    y: float,
    width: float,
    height: float,
    facecolor: str = REPORT_SURFACE,
    edgecolor: str = REPORT_BORDER,
    linewidth: float = 0.8,
    radius: float = 0.012,
    alpha: float = 1.0,
) -> None:
    fig.patches.append(
        FancyBboxPatch(
            (x, y),
            width,
            height,
            boxstyle=f"round,pad=0.004,rounding_size={radius}",
            transform=fig.transFigure,
            facecolor=facecolor,
            edgecolor=edgecolor,
            linewidth=linewidth,
            alpha=alpha,
        )
    )


def _truncate(value: Any, max_length: int = 54) -> str:
    text = str(value or "").strip()
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 1]}..."


def _sensor_label(sensor: str) -> str:
    if sensor == "EyeTracker":
        return "Eye Tracking"
    return sensor


def _add_chip(fig: Any, x: float, y: float, text: str, color: str, width: Optional[float] = None) -> float:
    width = width or max(0.075, min(0.18, 0.014 * len(text) + 0.045))
    _rounded_rect(fig, x, y - 0.023, width, 0.030, facecolor="#F8FAFC", edgecolor=color, linewidth=0.9, radius=0.015)
    _fig_text(fig, x + 0.014, y - 0.001, text, size=7.3, weight="bold", color=color)
    return x + width + 0.010


def _add_sensor_chips(fig: Any, x: float, y: float, sensors: Sequence[str]) -> None:
    cursor = x
    for sensor in sensors:
        cursor = _add_chip(fig, cursor, y, _sensor_label(sensor), SENSOR_COLORS.get(sensor, "#64748B"))


def _add_page_header(
    fig: Any,
    title: str,
    subtitle: str = "",
    right_label: str = "",
    sensors: Sequence[str] = (),
) -> None:
    _fig_text(fig, 0.055, 0.965, "NeuroDatics", size=8, weight="bold", color=REPORT_MUTED)
    if right_label:
        _fig_text(fig, 0.945, 0.965, right_label, size=8, weight="bold", color=REPORT_MUTED, ha="right")
    _fig_text(fig, 0.055, 0.925, _truncate(title, 72), size=18, weight="bold", color=REPORT_TEXT)
    if subtitle:
        _fig_text(fig, 0.055, 0.890, _truncate(subtitle, 104), size=8.5, color=REPORT_MUTED)
    if sensors:
        _add_sensor_chips(fig, 0.055, 0.858, sensors)
    fig.lines.append(Line2D([0.055, 0.945], [0.835, 0.835], transform=fig.transFigure, color=REPORT_BORDER, linewidth=0.9))


def _add_footer(fig: Any, page_number: int, include_metadata: bool, generated_at: datetime) -> None:
    fig.lines.append(Line2D([0.055, 0.945], [0.045, 0.045], transform=fig.transFigure, color=REPORT_BORDER, linewidth=0.7))
    if include_metadata:
        fig.text(
            0.055,
            0.025,
            f"NeuroDatics - {generated_at.strftime('%Y-%m-%d %H:%M UTC')}",
            fontsize=7,
            color=REPORT_MUTED,
            fontfamily="Poppins",
        )
    fig.text(0.945, 0.025, f"Pag. {page_number}", fontsize=7, color=REPORT_MUTED, ha="right", fontfamily="Poppins")


def _format_metric_value(row: Dict[str, Any]) -> str:
    value = row.get("value")
    unit = str(row.get("unit") or "")
    return f"{_format_number(value)} {unit}".strip()


def _add_kpi_cards(
    fig: Any,
    cards: Sequence[Tuple[str, str, str]],
    x: float,
    y: float,
    width: float,
    height: float = 0.088,
) -> None:
    if not cards:
        return
    gap = 0.012
    card_width = (width - gap * (len(cards) - 1)) / len(cards)
    for index, (value, label, color) in enumerate(cards):
        card_x = x + index * (card_width + gap)
        _rounded_rect(fig, card_x, y - height, card_width, height, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
        fig.patches.append(
            Rectangle(
                (card_x, y - height),
                0.006,
                height,
                transform=fig.transFigure,
                facecolor=color,
                edgecolor=color,
                linewidth=0,
            )
        )
        _fig_text(fig, card_x + 0.018, y - 0.018, _truncate(value, 16), size=15, weight="bold", color=REPORT_TEXT)
        _fig_text(fig, card_x + 0.018, y - 0.056, _truncate(label.upper(), 24), size=6.7, weight="bold", color=REPORT_MUTED)


def _draw_wave_band(fig: Any, y_base: float = 0.16) -> None:
    x_values = np.linspace(0.06, 0.94, 320)
    specs = [
        ("EyeTracker", 0.000, 3.5, 0.010),
        ("GSR", -0.035, 2.4, 0.008),
        ("EEG", -0.070, 8.5, 0.006),
    ]
    for sensor, offset, frequency, amplitude in specs:
        y_values = y_base + offset + amplitude * np.sin(np.linspace(0, frequency * np.pi, x_values.size))
        fig.lines.append(
            Line2D(
                x_values,
                y_values,
                transform=fig.transFigure,
                color=SENSOR_COLORS[sensor],
                linewidth=1.5,
                alpha=0.45,
            )
        )


def _draw_metric_table(
    fig: Any,
    x: float,
    y: float,
    width: float,
    rows: Sequence[Dict[str, Any]],
    title: str = "Metricas",
    max_rows: int = 8,
) -> None:
    row_count = min(len(rows), max_rows)
    row_height = 0.034
    height = 0.080 + max(row_count, 1) * row_height + (0.030 if len(rows) > max_rows else 0)
    _rounded_rect(fig, x, y - height, width, height, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
    _fig_text(fig, x + 0.018, y - 0.020, title, size=10, weight="bold", color=REPORT_TEXT)
    header_y = y - 0.052
    _rounded_rect(fig, x + 0.014, header_y - 0.026, width - 0.028, 0.030, facecolor="#F1F5F9", edgecolor="#F1F5F9", radius=0.006)
    _fig_text(fig, x + 0.026, header_y - 0.004, "Metrica", size=6.8, weight="bold", color=REPORT_MUTED)
    _fig_text(fig, x + width - 0.030, header_y - 0.004, "Resultado", size=6.8, weight="bold", color=REPORT_MUTED, ha="right")

    cursor = header_y - 0.034
    for index, row in enumerate(rows[:max_rows]):
        if index % 2 == 1:
            fig.patches.append(
                Rectangle(
                    (x + 0.014, cursor - 0.024),
                    width - 0.028,
                    row_height,
                    transform=fig.transFigure,
                    facecolor="#F8FAFC",
                    edgecolor="#F8FAFC",
                    linewidth=0,
                )
            )
        metric = _truncate(row.get("metric") or row.get("name") or row.get("label") or "-", 44)
        _fig_text(fig, x + 0.026, cursor - 0.002, metric, size=7.2, weight="bold", color=REPORT_SOFT_TEXT)
        _fig_text(fig, x + width - 0.030, cursor - 0.002, _format_metric_value(row), size=7.2, color=REPORT_TEXT, ha="right")
        cursor -= row_height

    if len(rows) > max_rows:
        _fig_text(fig, x + 0.026, cursor - 0.004, f"+ {len(rows) - max_rows} metricas adicionales", size=7, color=REPORT_MUTED)


def _looks_like_id(value: str) -> bool:
    text = str(value or "").strip()
    if len(text) < 12:
        return False
    compact = text.replace("-", "")
    return compact.isdigit() or all(ch in "0123456789abcdefABCDEF" for ch in compact)


def _scenario_labels(name: str, index: int) -> Tuple[str, str]:
    if _looks_like_id(name):
        return f"Escenario {index:02d}", f"ID: {_truncate(name, 28)}"
    return str(name), ""


def _friendly_scope_label(value: str) -> str:
    text = str(value or "").strip()
    match = re.search(r"participante\s+(?:participante[\s_-]*)?(\d+)", text, flags=re.IGNORECASE)
    if match:
        return f"Participante {int(match.group(1)):02d}"
    return text.replace("_", " ")


def _scenario_duration_seconds(charts: Sequence[Dict[str, Any]]) -> Optional[float]:
    durations = []
    for chart in charts:
        x_domain = chart.get("x_domain")
        if not isinstance(x_domain, list) or len(x_domain) != 2:
            continue
        try:
            start, end = float(x_domain[0]), float(x_domain[1])
        except (TypeError, ValueError):
            continue
        if np.isfinite(start) and np.isfinite(end) and end >= start:
            durations.append(end - start)
    return max(durations) if durations else None


def _metric_name(row: Dict[str, Any]) -> str:
    return str(row.get("metric") or row.get("name") or row.get("label") or "").lower()


def _split_metric_groups(rows: Sequence[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    visual_rows: List[Dict[str, Any]] = []
    gsr_rows: List[Dict[str, Any]] = []
    eeg_rows: List[Dict[str, Any]] = []
    other_rows: List[Dict[str, Any]] = []
    for row in rows:
        name = _metric_name(row)
        if "gsr" in name or "galvan" in name:
            gsr_rows.append(row)
        elif "eeg" in name or "psd" in name or "espectrograma" in name:
            eeg_rows.append(row)
        elif any(token in name for token in ("fijacion", "fijaciones", "pupila", "gaze", "distancia")):
            visual_rows.append(row)
        else:
            other_rows.append(row)
    return visual_rows, gsr_rows, eeg_rows, other_rows


def _draw_status_card(fig: Any, x: float, y: float, width: float, title: str, detail: str, color: str = "#16A34A") -> None:
    _rounded_rect(fig, x, y - 0.095, width, 0.095, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
    fig.patches.append(
        Rectangle((x, y - 0.095), 0.006, 0.095, transform=fig.transFigure, facecolor=color, edgecolor=color, linewidth=0)
    )
    _fig_text(fig, x + 0.020, y - 0.024, title, size=9.5, weight="bold", color=REPORT_TEXT)
    _fig_text(fig, x + 0.020, y - 0.055, detail, size=8, color=REPORT_MUTED)


def _draw_eeg_matrix(fig: Any, x: float, y: float, width: float, rows: Sequence[Dict[str, Any]]) -> bool:
    channels = [channel.upper() for channel in EEG_CHANNELS]
    values: Dict[str, Dict[str, str]] = {"Hz": {}, "dB": {}}
    for row in rows:
        name = _metric_name(row)
        for channel in channels:
            if f"psd {channel.lower()}" not in name:
                continue
            if "frecuencia" in name:
                values["Hz"][channel] = _format_number(row.get("value"))
            elif "potencia" in name:
                values["dB"][channel] = _format_number(row.get("value"))

    if not values["Hz"] and not values["dB"]:
        return False

    height = 0.170
    _rounded_rect(fig, x, y - height, width, height, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
    _fig_text(fig, x + 0.018, y - 0.020, "EEG - frecuencia dominante", size=10, weight="bold", color=REPORT_TEXT)
    _fig_text(fig, x + 0.018, y - 0.044, "Matriz compacta de frecuencia pico y potencia por canal.", size=7.4, color=REPORT_MUTED)

    table_x = x + 0.018
    table_y = y - 0.077
    label_width = 0.050
    cell_width = (width - 0.036 - label_width) / len(channels)
    row_height = 0.032
    _rounded_rect(fig, table_x, table_y - row_height, width - 0.036, row_height, facecolor="#F1F5F9", edgecolor="#F1F5F9", radius=0.006)
    _fig_text(fig, table_x + 0.010, table_y - 0.009, "Canal", size=6.7, weight="bold", color=REPORT_MUTED)
    for index, channel in enumerate(channels):
        _fig_text(fig, table_x + label_width + index * cell_width + cell_width / 2, table_y - 0.009, channel, size=6.7, weight="bold", color=REPORT_MUTED, ha="center")

    for row_index, label in enumerate(("Hz", "dB")):
        cursor_y = table_y - row_height * (row_index + 1)
        if row_index % 2 == 0:
            fig.patches.append(Rectangle((table_x, cursor_y - row_height), width - 0.036, row_height, transform=fig.transFigure, facecolor="#F8FAFC", edgecolor="#F8FAFC", linewidth=0))
        _fig_text(fig, table_x + 0.010, cursor_y - 0.009, label, size=7.0, weight="bold", color=REPORT_SOFT_TEXT)
        for index, channel in enumerate(channels):
            _fig_text(
                fig,
                table_x + label_width + index * cell_width + cell_width / 2,
                cursor_y - 0.009,
                values[label].get(channel, "-"),
                size=6.8,
                color=REPORT_TEXT,
                ha="center",
            )
    return True


def _draw_metrics_dashboard(fig: Any, rows: Sequence[Dict[str, Any]]) -> None:
    visual_rows, gsr_rows, eeg_rows, other_rows = _split_metric_groups(rows)
    if visual_rows:
        _draw_metric_table(fig, 0.055, 0.800, 0.425, visual_rows, title="Atencion visual", max_rows=8)
    if gsr_rows:
        _draw_metric_table(fig, 0.520, 0.800, 0.425, gsr_rows, title="Respuesta galvanica", max_rows=8)

    used_eeg_matrix = False
    if eeg_rows:
        used_eeg_matrix = _draw_eeg_matrix(fig, 0.055, 0.455, 0.890, eeg_rows)
        if not used_eeg_matrix:
            _draw_metric_table(fig, 0.055, 0.455, 0.890, eeg_rows, title="Actividad cerebral", max_rows=10)

    if other_rows:
        y = 0.250 if used_eeg_matrix or eeg_rows else 0.455
        _draw_metric_table(fig, 0.055, y, 0.890, other_rows, title="Otras metricas", max_rows=8)


def _add_peak_legend(fig: Any, x: float, y: float) -> None:
    _fig_text(fig, x, y, "Leyenda de picos", size=12, weight="bold")
    items = [
        (PEAK_MIN_COLOR, PEAK_MIN_LINESTYLE, "Pico minimo: linea negra punteada en el tiempo del valor mas bajo."),
        (PEAK_MAX_COLOR, PEAK_MAX_LINESTYLE, "Pico maximo: linea dorada segmentada en el tiempo del valor mas alto."),
    ]
    for index, (color, linestyle, label) in enumerate(items):
        item_y = y - 0.045 - index * 0.033
        fig.lines.append(
            Line2D(
                [x, x + 0.045],
                [item_y, item_y],
                transform=fig.transFigure,
                color=color,
                linestyle=linestyle,
                linewidth=2.0,
            )
        )
        _fig_text(fig, x + 0.055, item_y + 0.009, label, size=8, color="#334155")


def _add_table_text(fig: Any, x: float, y: float, rows: Sequence[Dict[str, Any]], max_rows: int = 12, title: str = "Metricas") -> None:
    _fig_text(fig, x, y, title, size=10, weight="bold")
    cursor = y - 0.026
    for row in rows[:max_rows]:
        metric = str(row.get("metric") or row.get("name") or row.get("label") or "")
        value = row.get("value")
        if value is None and "fixation_count" in row:
            value = row.get("fixation_count")
        unit = str(row.get("unit") or "")
        line = f"{metric}: {_format_number(value)} {unit}".strip()
        _fig_text(fig, x, cursor, line[:88], size=8, color="#334155")
        cursor -= 0.022
    if len(rows) > max_rows:
        _fig_text(fig, x, cursor, f"+ {len(rows) - max_rows} metricas adicionales", size=8, color="#64748B")


def _image_axis(fig: Any, image: Image.Image, title: str, bounds: Tuple[float, float, float, float]) -> None:
    x, y, width, height = bounds
    _rounded_rect(fig, x - 0.010, y - 0.020, width + 0.020, height + 0.052, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
    _fig_text(fig, x, y + height + 0.020, title, size=9.5, weight="bold", color=REPORT_TEXT)
    ax = fig.add_axes((x, y, width, height))
    ax.set_zorder(5)
    ax.imshow(image.convert("RGB"), interpolation="lanczos", resample=True)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_facecolor(REPORT_SURFACE)
    for spine in ax.spines.values():
        spine.set_visible(False)


def _scanpath_image_axis(
    fig: Any,
    image: Image.Image,
    title: str,
    bounds: Tuple[float, float, float, float],
) -> None:
    """Render a scanpath with a non-overlapping, print-friendly caption row."""

    x, y, width, height = bounds
    caption_height = min(0.074, max(0.062, height * 0.22))
    caption_top = y + caption_height
    image_gap = 0.006

    _rounded_rect(
        fig,
        x - 0.010,
        y - 0.020,
        width + 0.020,
        height + 0.052,
        facecolor=REPORT_SURFACE,
        edgecolor=REPORT_BORDER,
        radius=0.014,
    )
    _fig_text(fig, x, y + height + 0.020, title, size=9.5, weight="bold", color=REPORT_TEXT)

    image_ax = fig.add_axes((x, caption_top + image_gap, width, height - caption_height - image_gap))
    image_ax.set_zorder(5)
    image_ax.imshow(image.convert("RGB"), interpolation="lanczos", resample=True)
    image_ax.set_xticks([])
    image_ax.set_yticks([])
    image_ax.set_facecolor(REPORT_SURFACE)
    for spine in image_ax.spines.values():
        spine.set_visible(False)

    fig.lines.append(
        Line2D(
            [x, x + width],
            [caption_top, caption_top],
            transform=fig.transFigure,
            color=REPORT_BORDER,
            linewidth=0.7,
        )
    )

    legend_width = width * 0.64
    legend_ax = fig.add_axes((x + 0.008, y + 0.004, legend_width - 0.008, caption_height - 0.008))
    legend_ax.set_zorder(6)
    legend_ax.set_xlim(0.0, 1.0)
    legend_ax.set_ylim(0.0, 1.0)
    legend_ax.axis("off")
    legend_ax.text(
        0.0,
        0.96,
        "Tamaño por duración · misma escala entre participantes",
        fontsize=5.9,
        fontweight="bold",
        color=REPORT_SOFT_TEXT,
        va="top",
        fontfamily="Poppins",
    )
    radius_scale = image.info.get("scanpath_radius_scale")
    radius_cap_ms = _scanpath_radius_cap_ms(radius_scale)
    marker_positions = (0.035, 0.355, 0.675)
    cap_label = (
        f"≥ {radius_cap_ms / 1000.0:g} s"
        if radius_cap_ms >= 1000.0
        else f"≥ {radius_cap_ms:g} ms"
    )
    marker_labels = ("200 ms", "1 s", cap_label)
    label_offsets = (0.070, 0.085, 0.105)
    legend_durations_ms = (*SCANPATH_LEGEND_REFERENCE_DURATIONS_MS, radius_cap_ms)
    for marker_x, label, label_offset, duration_ms in zip(
        marker_positions,
        marker_labels,
        label_offsets,
        legend_durations_ms,
    ):
        radius = _scanpath_radius(duration_ms / 1000.0, cap_ms=radius_cap_ms)
        legend_ax.scatter(
            [marker_x],
            [0.34],
            s=(radius * 0.82) ** 2,
            facecolor="#F43F5E",
            edgecolor="#FFFFFF",
            linewidth=0.8,
            zorder=2,
        )
        legend_ax.text(
            marker_x + label_offset,
            0.34,
            label,
            fontsize=6.0,
            color=REPORT_SOFT_TEXT,
            va="center",
            fontfamily="Poppins",
        )

    try:
        total_duration_s = float(image.info.get("scanpath_total_duration_s", 0.0))
    except (TypeError, ValueError):
        total_duration_s = 0.0
    if not np.isfinite(total_duration_s) or total_duration_s < 0.0:
        total_duration_s = 0.0
    total_x = x + width - 0.008
    _fig_text(
        fig,
        total_x,
        y + caption_height - 0.010,
        "TIEMPO FIJADO",
        size=5.9,
        weight="bold",
        color=REPORT_MUTED,
        ha="right",
    )
    _fig_text(
        fig,
        total_x,
        y + caption_height - 0.030,
        f"{total_duration_s:.2f} s",
        size=10.5,
        weight="bold",
        color=REPORT_TEXT,
        ha="right",
    )
    _fig_text(
        fig,
        total_x,
        y + 0.010,
        "Excluye sacadas, mirada inválida y fuera del estímulo",
        size=5.1,
        color=REPORT_MUTED,
        ha="right",
        va="bottom",
    )


def _safe_filename(value: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in value.strip().lower())
    while "--" in safe:
        safe = safe.replace("--", "-")
    return safe.strip("-") or "informe"


def build_executive_report_pdf(data: Dict[str, Any]) -> bytes:
    generated_at: datetime = data["generated_at"]
    include_metadata = bool(data["include_metadata"])
    page_number = 0
    buffer = io.BytesIO()
    year_label = generated_at.strftime("%Y")
    sensor_text = " - ".join(_sensor_label(sensor) for sensor in data["sensors"]) or "Sin sensores"
    scope_label = _friendly_scope_label(data["scope_label"])

    with PdfPages(buffer) as pdf:
        if data["include_cover"]:
            page_number += 1
            fig = _new_report_figure()
            _fig_text(fig, 0.070, 0.940, "NeuroDatics", size=9, weight="bold", color=REPORT_MUTED)
            _fig_text(fig, 0.930, 0.940, f"INFORME {year_label}", size=9, weight="bold", color=REPORT_MUTED, ha="right")
            _fig_text(fig, 0.070, 0.825, "Informe de Biosenales", size=28, weight="bold", color=REPORT_TEXT)
            _fig_text(fig, 0.070, 0.770, _truncate(data["project_name"], 64), size=17, weight="bold", color=REPORT_SOFT_TEXT)
            _add_chip(fig, 0.070, 0.710, data["mode_label"].upper(), "#2563EB", width=0.235)
            _fig_text(fig, 0.070, 0.650, scope_label, size=13, weight="bold", color=REPORT_TEXT)
            _fig_text(fig, 0.070, 0.612, sensor_text, size=10, color=REPORT_MUTED)
            _fig_text(fig, 0.070, 0.575, generated_at.strftime("%d/%m/%Y"), size=9, color=REPORT_MUTED)
            _rounded_rect(fig, 0.070, 0.360, 0.860, 0.120, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.016)
            _fig_text(fig, 0.095, 0.440, "Contenido ejecutivo", size=10, weight="bold", color=REPORT_TEXT)
            for offset, item in enumerate(data["contents"][:4]):
                _fig_text(fig, 0.095 + (offset % 2) * 0.400, 0.405 - (offset // 2) * 0.035, item, size=8, color=REPORT_SOFT_TEXT)
            _draw_wave_band(fig, y_base=0.180)
            _add_footer(fig, page_number, include_metadata, generated_at)
            pdf.savefig(fig, bbox_inches="tight")
            plt.close(fig)

        page_number += 1
        fig = _new_report_figure()
        _add_page_header(fig, "Resumen ejecutivo", data["project_name"], right_label=f"INFORME {year_label}", sensors=data["sensors"])
        cards = [
            (f"{data['participant_count']:02d}", "Participantes", "#2563EB"),
            (f"{data['scenario_count']:02d}", "Escenarios", "#6366F1"),
            (f"{len(data['sensors']):02d}", "Sensores", "#14B8A6"),
            (f"{len(data['visualizations']):02d}", "Visualizaciones", "#8B5CF6"),
        ]
        _add_kpi_cards(fig, cards, 0.055, 0.790, 0.890)
        _rounded_rect(fig, 0.055, 0.590, 0.430, 0.105, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
        _fig_text(fig, 0.075, 0.665, "Sensores registrados", size=10, weight="bold", color=REPORT_TEXT)
        _add_sensor_chips(fig, 0.075, 0.625, data["sensors"])
        _draw_status_card(
            fig,
            0.515,
            0.695,
            0.430,
            "Calidad de datos",
            "Sin incidencias detectadas" if not data["warnings"] else f"{len(data['warnings'])} avisos de datos",
            "#16A34A" if not data["warnings"] else "#F97316",
        )
        _rounded_rect(fig, 0.055, 0.410, 0.890, 0.130, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
        _add_peak_legend(fig, 0.075, 0.515)
        if data["warnings"]:
            _draw_metric_table(
                fig,
                0.055,
                0.340,
                0.890,
                [{"metric": warning, "value": "", "unit": ""} for warning in data["warnings"][:8]],
                title="Avisos de datos",
                max_rows=8,
            )
        else:
            _draw_status_card(fig, 0.055, 0.340, 0.890, "Estado del informe", "Listo para revision ejecutiva.", "#16A34A")
        _add_footer(fig, page_number, include_metadata, generated_at)
        pdf.savefig(fig, bbox_inches="tight")
        plt.close(fig)

        for scenario_index, scenario in enumerate(data["scenarios"], start=1):
            scenario_display, scenario_trace = _scenario_labels(scenario["name"], scenario_index)
            scenario_title = scenario_display if scenario_trace else f"Escenario: {scenario_display}"
            spatial: SpatialAssets = scenario["spatial"]
            charts: List[Dict[str, Any]] = scenario["charts"]
            duration = _scenario_duration_seconds(charts)
            subtitle_parts = [part for part in (scenario_trace, f"Duracion estimada: {duration:.1f} s" if duration is not None else "") if part]

            page_number += 1
            fig = _new_report_figure()
            _add_page_header(fig, scenario_title, " - ".join(subtitle_parts), right_label=f"SECCION {scenario_index:02d}", sensors=data["sensors"])
            kpi_cards = [
                (_format_metric_value(row), str(row.get("metric") or ""), SENSOR_COLORS.get("EyeTracker", "#6366F1"))
                for row in spatial.spatial_metrics[:3]
            ]
            has_spatial_visuals = bool(spatial.heatmap or spatial.scanpath)
            if kpi_cards and not has_spatial_visuals:
                _add_kpi_cards(fig, kpi_cards, 0.055, 0.800, 0.890, height=0.064)
            if spatial.heatmap:
                _image_axis(fig, spatial.heatmap, "Mapa de calor", (0.065, 0.455, 0.870, 0.315))
            else:
                _draw_status_card(fig, 0.075, 0.700, 0.850, "Mapa de calor", "Sin datos suficientes.", "#94A3B8")
            if spatial.scanpath:
                _scanpath_image_axis(fig, spatial.scanpath, "Mapa de recorridos", (0.065, 0.095, 0.870, 0.315))
            else:
                _draw_status_card(fig, 0.075, 0.365, 0.850, "Mapa de recorridos", "Sin datos suficientes.", "#94A3B8")
            if not has_spatial_visuals and "EyeTracker" in data["sensors"] and not spatial.aoi:
                _fig_text(fig, 0.055, 0.070, "AOI no configurado para este escenario.", size=8, color=REPORT_MUTED)
            elif not has_spatial_visuals and spatial.aoi:
                _fig_text(fig, 0.055, 0.070, "AOI visual y atencion por area en la pagina siguiente.", size=8, color=REPORT_MUTED)
            _add_footer(fig, page_number, include_metadata, generated_at)
            pdf.savefig(fig, bbox_inches="tight")
            plt.close(fig)

            if spatial.aoi or spatial.aoi_rows:
                page_number += 1
                fig = _new_report_figure()
                _add_page_header(fig, f"AOI - {scenario_display}", scenario_trace, right_label=f"SECCION {scenario_index:02d}", sensors=["EyeTracker"])
                if spatial.aoi:
                    _image_axis(fig, spatial.aoi, "Areas de Interes (AOI)", (0.065, 0.535, 0.870, 0.265))
                else:
                    _draw_status_card(fig, 0.065, 0.700, 0.870, "Areas de Interes (AOI)", "Visual no disponible.", "#94A3B8")

                if spatial.aoi_rows:
                    _rounded_rect(fig, 0.065, 0.275, 0.870, 0.215, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
                    ax = fig.add_axes((0.105, 0.315, 0.790, 0.130))
                    _draw_aoi_bar_chart(ax, spatial.aoi_rows)
                    aoi_table_rows = [
                        {
                            "metric": row.get("name"),
                            "value": row.get("fixation_count"),
                            "unit": f"fij. / {_format_number(row.get('total_dwell_time_percent'))}%",
                        }
                        for row in spatial.aoi_rows
                    ]
                    _draw_metric_table(fig, 0.065, 0.235, 0.870, aoi_table_rows, max_rows=4, title="Resumen AOI")
                else:
                    _draw_status_card(fig, 0.065, 0.390, 0.870, "Atencion por AOI", "No hay metricas suficientes para barras.", "#94A3B8")
                _add_footer(fig, page_number, include_metadata, generated_at)
                pdf.savefig(fig, bbox_inches="tight")
                plt.close(fig)

            for chart_index in range(0, len(charts), 2):
                page_number += 1
                fig = _new_report_figure()
                _add_page_header(fig, f"Senales temporales - {scenario_display}", scenario_trace, right_label=f"SECCION {scenario_index:02d}", sensors=data["sensors"])
                chart_bounds = [(0.085, 0.535, 0.830, 0.250), (0.085, 0.140, 0.830, 0.250)]
                for ax_index, bounds in enumerate(chart_bounds):
                    chart = charts[chart_index + ax_index] if chart_index + ax_index < len(charts) else None
                    if chart is None:
                        continue
                    _rounded_rect(fig, bounds[0] - 0.025, bounds[1] - 0.035, bounds[2] + 0.050, bounds[3] + 0.075, facecolor=REPORT_SURFACE, edgecolor=REPORT_BORDER, radius=0.014)
                    ax = fig.add_axes(bounds)
                    _draw_chart(ax, chart)
                _add_footer(fig, page_number, include_metadata, generated_at)
                pdf.savefig(fig, bbox_inches="tight")
                plt.close(fig)

            if scenario["metrics"]:
                page_number += 1
                fig = _new_report_figure()
                _add_page_header(fig, f"Metricas ejecutivas - {scenario_display}", scenario_trace, right_label=f"SECCION {scenario_index:02d}", sensors=data["sensors"])
                _draw_metrics_dashboard(fig, scenario["metrics"][:40])
                _add_footer(fig, page_number, include_metadata, generated_at)
                pdf.savefig(fig, bbox_inches="tight")
                plt.close(fig)

    buffer.seek(0)
    return buffer.read()


def build_report_payload(
    project: Project,
    request: ExecutiveReportRequest,
    selected_sensors: Sequence[str],
    frames: Sequence[ParticipantFrame],
    scenario_images: Dict[str, Optional[bytes]],
    data_warnings: Sequence[str],
) -> Dict[str, Any]:
    all_scenarios = list(project.scenaries or [])
    scenarios = select_report_scenarios(all_scenarios)
    warnings = list(data_warnings)
    omitted_videos = len(all_scenarios) - len(scenarios)
    if omitted_videos:
        warnings.append(
            f"Se omitieron {omitted_videos} escenarios de video para mantener el informe en estimulos de imagen."
        )
    generated_at = datetime.now(timezone.utc)
    combined_df = _concat_frames(frames)
    report_scenarios = []

    for scenary in scenarios:
        scenario_name = str(scenary.name)
        aois = list(getattr(scenary, "aois", []) or [])
        scenario_combined = combined_df
        charts = build_temporal_charts(frames, scenario_name, selected_sensors)
        metrics = build_metric_rows_for_frames(frames, scenario_name, selected_sensors)
        spatial = (
            build_spatial_assets(
                frames,
                scenario_combined,
                scenario_name,
                scenario_images.get(scenario_name),
                aois,
            )
            if "EyeTracker" in selected_sensors
            else SpatialAssets(None, None, None, [], [])
        )
        report_scenarios.append(
            {
                "name": scenario_name,
                "charts": charts,
                "metrics": metrics,
                "spatial": spatial,
            }
        )

    scope_label = (
        f"Participante {request.scope.participant_code}"
        if request.scope.kind == "participant"
        else "Resumen agregado de todos los participantes"
    )
    mode_label = (
        "Informe comparativo"
        if request.mode.kind == "comparative"
        else f"Informe por sensor: {request.mode.sensor}"
    )
    contents = [
        "Resumen ejecutivo por escenario",
        "Mapas de calor y recorridos cuando hay Eye Tracker",
        "AOI visual con metricas ejecutivas",
        "Senales temporales con maximos, minimos y medias",
    ]
    return {
        "project_name": project.name,
        "scope_label": scope_label,
        "mode_label": mode_label,
        "sensors": list(selected_sensors),
        "visualizations": resolve_report_visualizations(selected_sensors),
        "contents": contents,
        "include_cover": request.include_cover,
        "include_metadata": request.include_metadata,
        "participant_count": len(frames),
        "scenario_count": len(scenarios),
        "scenarios": report_scenarios,
        "warnings": warnings,
        "generated_at": generated_at,
    }


class ExecutiveReportService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def generate(self, request: ExecutiveReportRequest, current_user: str) -> Tuple[bytes, str]:
        project = await self._load_project(request.project_id, UUID(current_user))
        project_sensors = [sensor.sensor_type for sensor in project.sensors]
        selected_sensors = resolve_report_sensors(project_sensors, request.mode.kind, request.mode.sensor)
        if not selected_sensors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay sensores disponibles para el modo seleccionado",
            )

        if not select_report_scenarios(project.scenaries or []):
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
        payload = await anyio.to_thread.run_sync(
            lambda: build_report_payload(
                project,
                request,
                selected_sensors,
                frames,
                scenario_images,
                data_warnings,
            )
        )
        pdf_bytes = await anyio.to_thread.run_sync(lambda: build_executive_report_pdf(payload))
        filename = f"informe-ejecutivo-{_safe_filename(project.name)}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.pdf"
        return pdf_bytes, filename

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
    ) -> Tuple[List[ParticipantFrame], List[str]]:
        reader = ParquetReaderService(self._db)
        frames = []
        warnings = []
        for code in participant_codes:
            try:
                df = await reader.read(project_id, code, generation)
                frames.append(ParticipantFrame(code=code, dataframe=df))
            except Exception as exc:
                logger.warning("Could not load participant %s for executive report: %s", code, exc)
                warnings.append(f"No se pudo cargar el participante {code}: {exc}")
        return frames, warnings

    async def _load_scenario_images(self, project: Project) -> Dict[str, Optional[bytes]]:
        images: Dict[str, Optional[bytes]] = {}
        drive_client = None
        for scenary in select_report_scenarios(project.scenaries or []):
            images[str(scenary.name)] = None
            if not scenary.file_id:
                continue
            project_file = await self._load_project_file(project.id, scenary.file_id)
            if not project_file or not (project_file.mime_type or "").startswith("image/"):
                continue
            if not project_file.external_id:
                continue
            if drive_client is None:
                drive_client = await self._build_drive_client()
            if drive_client is None:
                continue
            try:
                images[str(scenary.name)] = await anyio.to_thread.run_sync(
                    lambda external_id=project_file.external_id: drive_client.download_file_content(external_id)
                )
            except Exception as exc:
                logger.info("Could not load scenario image %s for report: %s", scenary.name, exc)
        return images

    async def _load_project_file(self, project_id: UUID, file_id: UUID) -> Optional[ProjectFile]:
        result = await self._db.execute(
            select(ProjectFile).where(
                ProjectFile.project_id == project_id,
                ProjectFile.id == file_id,
                ProjectFile.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def _build_drive_client(self) -> Optional[GoogleDriveClient]:
        repository = SystemIntegrationRepository(self._db)
        integration = await repository.get_by_provider("google_drive")
        if not integration or not integration.get("refresh_token"):
            return None
        credentials = build_google_drive_oauth_credentials(
            refresh_token=integration.get("refresh_token"),
            scope=integration.get("scope"),
        )
        client = GoogleDriveClient()
        client.set_oauth_credentials(credentials)
        return client

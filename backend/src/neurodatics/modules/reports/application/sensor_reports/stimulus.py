"""Stimulus-space images for Eye Tracking reports.

Every figure is drawn on one fixed canvas with the stimulus centred inside a
content box, so heatmap hotspots, scanpath nodes and AOI outlines agree on where
a fixation is. Report images are then cropped to that content box.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from ....analytics.application.services.analytics_service import (
    HeatmapAnalyticsService,
    ScanpathAnalyticsService,
)

logger = logging.getLogger(__name__)

REPORT_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
REPORT_FONT_REGULAR = REPORT_FONT_DIR / "Poppins-Regular.ttf"
REPORT_FONT_SEMIBOLD = REPORT_FONT_DIR / "Poppins-SemiBold.ttf"

STIMULUS_CANVAS_SIZE = (2560, 1440)
STIMULUS_REFERENCE_SIZE = (1280, 720)
SCANPATH_RADIUS_CAP_MS = float(getattr(ScanpathAnalyticsService, "RADIUS_CAP_MS", 2000.0))
SCANPATH_RADIUS_MIN_PX = 13.0
SCANPATH_RADIUS_MAX_PX = 34.0
SCANPATH_LEGEND_REFERENCE_DURATIONS_MS = (200.0, 1000.0)
SCANPATH_FILL = (244, 63, 94, 210)


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


def _render_scale(rendered_width: float, rendered_height: float) -> float:
    """Stroke and marker scale for a stimulus drawn at this size on the canvas."""

    return max(
        rendered_width / STIMULUS_REFERENCE_SIZE[0],
        rendered_height / STIMULUS_REFERENCE_SIZE[1],
        1.0,
    )


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
    scale = _render_scale(rendered_width, rendered_height)
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
    scale = _render_scale(rendered_width, rendered_height)
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
        draw.line((*start, *end), fill=SCANPATH_FILL, width=line_width)
    for index, (point, item) in enumerate(zip(points, objectives), start=1):
        radius = _scanpath_radius(item.get("duration_s"), scale, radius_cap_ms)
        x, y = point
        draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=SCANPATH_FILL,
            outline=(255, 255, 255, 255),
            width=circle_outline_width,
        )
        if isinstance(point_font, ImageFont.FreeTypeFont):
            draw.text((x, y), str(index), fill=(255, 255, 255, 255), font=point_font, anchor="mm")
        else:
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


def crop_to_stimulus(image: Image.Image) -> Image.Image:
    offset_x, offset_y, width, height = _content_box(image)
    return image.crop((offset_x, offset_y, offset_x + width, offset_y + height))


def stimulus_aspect_ratio(canvas: Image.Image) -> float:
    _, _, width, height = _content_box(canvas)
    return float(width) / float(height) if height else 1.0


def encode_jpeg(image: Image.Image, max_edge: int = 1600, quality: int = 86) -> bytes:
    rgb = image.convert("RGB")
    if max(rgb.size) > max_edge:
        rgb.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    rgb.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buffer.getvalue()


def heatmap_figure(
    canvas: Image.Image,
    events: pd.DataFrame,
    aois: Sequence[Any] = (),
) -> Optional[Image.Image]:
    """Fixation heatmap over the stimulus, cropped to it; ``None`` without fixations."""

    _, _, width, height = _content_box(canvas)
    try:
        overlay = HeatmapAnalyticsService.render_overlay(events, width=width, height=height)
    except Exception as exc:
        logger.warning("Report heatmap unavailable (%s)", type(exc).__name__)
        return None
    drawn = _draw_heatmap(canvas, overlay)
    if drawn is None:
        return None
    if aois:
        drawn = _draw_aois(drawn, aois)
    return crop_to_stimulus(drawn)


def aoi_figure(canvas: Image.Image, aois: Sequence[Any]) -> Image.Image:
    return crop_to_stimulus(_draw_aois(canvas, aois))


def scanpath_figure(
    canvas: Image.Image,
    scanpath: Dict[str, Any],
    aois: Sequence[Any] = (),
) -> Optional[Image.Image]:
    """Numbered scanpath over the stimulus, cropped to it; ``None`` without objectives."""

    if not scanpath.get("objectives"):
        return None
    return crop_to_stimulus(_draw_scanpath(canvas, scanpath, aois))


def scanpath_key(canvas: Image.Image, scanpath: Dict[str, Any]) -> Dict[str, Any]:
    """Reference marker sizes as fractions of the stimulus height.

    The layout multiplies them by the height the image is printed at, so the key
    circles match the scanpath markers exactly at any page size.
    """

    _, _, width, height = _content_box(canvas)
    scale = _render_scale(width, height)
    cap_ms = _scanpath_radius_cap_ms(scanpath.get("radius_scale"))
    cap_label = f"\u2265 {cap_ms / 1000.0:g} s" if cap_ms >= 1000.0 else f"\u2265 {cap_ms:g} ms"
    references = (*SCANPATH_LEGEND_REFERENCE_DURATIONS_MS, cap_ms)
    labels = ("200 ms", "1 s", cap_label)
    red, green, blue, alpha = SCANPATH_FILL
    return {
        "title": "Tamaño del círculo según la duración de la fijación",
        "fill": f"#{red:02x}{green:02x}{blue:02x}{alpha:02x}",
        "items": [
            {"label": label, "radius": _scanpath_radius(duration / 1000.0, scale, cap_ms) / float(max(height, 1))}
            for duration, label in zip(references, labels)
        ],
    }

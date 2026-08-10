"""The report's heatmap page must use the same convention as its scanpath page.

The report centres each stimulus on a fixed 2560x1440 canvas and draws scanpath
and AOI figures inside the resulting content box. The heatmap was pasted across
the whole canvas instead, so on any stimulus that is not 16:9 it was stretched
into the letterbox bars and every hotspot sat somewhere the other two figures
disagreed with.

These build the report figures from one fixation and check numerically that the
heatmap's hot pixel and the scanpath's node land on the same spot.
"""

import io

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    HeatmapAnalyticsService,
)
from neurodatics.modules.reports.application.services.executive_report_service import (
    STIMULUS_CANVAS_SIZE,
    _content_box,
    _draw_heatmap,
    _draw_scanpath,
    _open_base_image,
    build_spatial_assets,
)
from neurodatics.modules.reports.application.services.executive_report_service import (
    ParticipantFrame,
)

Image = pytest.importorskip("PIL.Image", reason="report rendering needs Pillow")

FIXATION_X = 0.5
FIXATION_Y = 0.2

STIMULUS_SHAPES = [
    pytest.param(800, 800, id="square"),
    pytest.param(1920, 1080, id="16:9"),
    pytest.param(3440, 1440, id="ultrawide"),
]


def _stimulus_bytes(width: int, height: int) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (255, 255, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


def _fixation_frame() -> pd.DataFrame:
    samples = 20
    return pd.DataFrame(
        {
            "time": [index / 100.0 for index in range(samples)],
            "fix_x": [FIXATION_X * 100.0] * samples,
            "fix_y": [FIXATION_Y * 100.0] * samples,
            "scenario": ["A"] * samples,
        }
    )


def _changed_centroid(base: Image.Image, drawn: Image.Image) -> tuple[float, float]:
    """Canvas pixel where ``drawn`` differs most from ``base``, as a centroid."""

    base_arr = np.asarray(base.convert("RGB"), dtype=float)
    drawn_arr = np.asarray(drawn.convert("RGB"), dtype=float)
    weight = np.abs(drawn_arr - base_arr).sum(axis=2)
    total = weight.sum()
    assert total > 0, "the figure drew nothing over the stimulus"

    rows = np.arange(weight.shape[0], dtype=float)
    cols = np.arange(weight.shape[1], dtype=float)
    centre_y = float((weight.sum(axis=1) * rows).sum() / total)
    centre_x = float((weight.sum(axis=0) * cols).sum() / total)
    return centre_x, centre_y


@pytest.mark.parametrize("width,height", STIMULUS_SHAPES)
def test_report_heatmap_lands_where_the_scanpath_node_lands(width, height):
    base = _open_base_image(_stimulus_bytes(width, height))
    offset_x, offset_y, content_width, content_height = _content_box(base)

    heatmap = _draw_heatmap(
        base,
        HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(),
            "A",
            width=content_width,
            height=content_height,
        ),
    )
    scanpath = _draw_scanpath(
        base,
        {"objectives": [{"cx": FIXATION_X, "cy": FIXATION_Y, "radius_norm": 0.4}]},
        [],
    )

    heatmap_x, heatmap_y = _changed_centroid(base, heatmap)
    scanpath_x, scanpath_y = _changed_centroid(base, scanpath)

    expected_x = offset_x + FIXATION_X * content_width
    expected_y = offset_y + FIXATION_Y * content_height

    assert heatmap_x == pytest.approx(expected_x, abs=0.03 * content_width)
    assert heatmap_y == pytest.approx(expected_y, abs=0.03 * content_height)
    assert heatmap_x == pytest.approx(scanpath_x, abs=0.03 * content_width)
    assert heatmap_y == pytest.approx(scanpath_y, abs=0.03 * content_height)


@pytest.mark.parametrize("width,height", STIMULUS_SHAPES)
def test_report_heatmap_stays_inside_the_stimulus_and_off_the_letterbox(width, height):
    base = _open_base_image(_stimulus_bytes(width, height))
    offset_x, offset_y, content_width, content_height = _content_box(base)

    drawn = _draw_heatmap(
        base,
        HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(),
            "A",
            width=content_width,
            height=content_height,
        ),
    )

    changed = np.abs(
        np.asarray(drawn.convert("RGB"), dtype=float)
        - np.asarray(base.convert("RGB"), dtype=float)
    ).sum(axis=2) > 1.0

    assert drawn.size == STIMULUS_CANVAS_SIZE
    assert not changed[:, :offset_x].any(), "overlay bled into the left letterbox bar"
    assert not changed[:offset_y, :].any(), "overlay bled into the top letterbox bar"
    assert not changed[:, offset_x + content_width:].any()
    assert not changed[offset_y + content_height:, :].any()


def test_build_spatial_assets_renders_the_heatmap_at_the_content_box():
    """The service wires the content box through, not just the drawing helper."""

    base = _open_base_image(_stimulus_bytes(800, 800))
    offset_x, offset_y, content_width, content_height = _content_box(base)
    frame = _fixation_frame()

    assets = build_spatial_assets(
        [ParticipantFrame(code="P1", dataframe=frame)],
        frame,
        "A",
        _stimulus_bytes(800, 800),
        [],
    )

    assert assets.heatmap is not None
    heatmap_x, heatmap_y = _changed_centroid(base, assets.heatmap)

    assert heatmap_x == pytest.approx(offset_x + FIXATION_X * content_width, abs=0.03 * content_width)
    assert heatmap_y == pytest.approx(offset_y + FIXATION_Y * content_height, abs=0.03 * content_height)

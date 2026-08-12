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
    ScanpathAnalyticsService,
)
from neurodatics.modules.reports.application.services.executive_report_service import (
    SCANPATH_RADIUS_CAP_MS,
    SCANPATH_RADIUS_MAX_PX,
    SCANPATH_RADIUS_MIN_PX,
    STIMULUS_CANVAS_SIZE,
    _content_box,
    _draw_heatmap,
    _draw_scanpath,
    _new_report_figure,
    _open_base_image,
    _scanpath_image_axis,
    _scanpath_radius,
    _scanpath_radius_cap_ms,
    _scanpath_total_duration_s,
    build_spatial_assets,
)
from neurodatics.modules.reports.application.services.executive_report_service import (
    ParticipantFrame,
)

Image = pytest.importorskip("PIL.Image", reason="report rendering needs Pillow")

FIXATION_X = 0.5
FIXATION_Y = 0.2

STIMULUS_SHAPES = [
    pytest.param(900, 1600, id="portrait"),
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


@pytest.mark.parametrize(
    "duration_s,fraction",
    [
        pytest.param(-1.0, 0.0, id="negative"),
        pytest.param(0.0, 0.0, id="zero"),
        pytest.param(0.2, 0.1, id="200ms"),
        pytest.param(1.0, 0.5, id="1s"),
        pytest.param(2.0, 1.0, id="2s"),
        pytest.param(4.0, 1.0, id="over-cap"),
        pytest.param(float("nan"), 0.0, id="not-finite"),
    ],
)
def test_report_scanpath_radius_interpolates_area_on_absolute_scale(duration_s, fraction):
    radius = _scanpath_radius(duration_s)
    expected_area_term = (
        SCANPATH_RADIUS_MIN_PX ** 2
        + fraction * (SCANPATH_RADIUS_MAX_PX ** 2 - SCANPATH_RADIUS_MIN_PX ** 2)
    )

    assert SCANPATH_RADIUS_CAP_MS == 2000.0
    assert SCANPATH_RADIUS_CAP_MS == float(ScanpathAnalyticsService.RADIUS_CAP_MS)
    assert radius ** 2 == pytest.approx(expected_area_term)
    assert _scanpath_radius(duration_s, scale=2.0) == pytest.approx(radius * 2.0)


def test_report_scanpath_uses_payload_cap_with_backend_default_as_fallback():
    assert _scanpath_radius_cap_ms({"cap_ms": 1000}) == pytest.approx(1000.0)
    assert _scanpath_radius(1.0, cap_ms=1000) == pytest.approx(SCANPATH_RADIUS_MAX_PX)
    assert _scanpath_radius_cap_ms({"cap_ms": -1}) == pytest.approx(SCANPATH_RADIUS_CAP_MS)
    assert _scanpath_radius_cap_ms({"cap_ms": float("nan")}) == pytest.approx(SCANPATH_RADIUS_CAP_MS)


def test_report_scanpath_ignores_participant_relative_radius_norm():
    base = _open_base_image(_stimulus_bytes(1920, 1080))
    objective = {
        "cx": FIXATION_X,
        "cy": FIXATION_Y,
        "duration_s": 1.0,
    }

    participant_shortest = _draw_scanpath(
        base,
        {"objectives": [{**objective, "radius_norm": 0.0}]},
        [],
    )
    participant_longest = _draw_scanpath(
        base,
        {"objectives": [{**objective, "radius_norm": 1.0}]},
        [],
    )

    assert np.array_equal(np.asarray(participant_shortest), np.asarray(participant_longest))


def test_report_scanpath_total_duration_prefers_api_value_and_falls_back_safely():
    objectives = [
        {"duration_s": 0.2},
        {"duration_s": 1.0},
        {"duration_s": -2.0},
        {"duration_s": float("nan")},
    ]

    assert _scanpath_total_duration_s({"total_duration_s": 3.75, "objectives": objectives}) == pytest.approx(3.75)
    assert _scanpath_total_duration_s({"objectives": objectives}) == pytest.approx(1.2)
    assert _scanpath_total_duration_s({"total_duration_s": -1.0, "objectives": objectives}) == pytest.approx(1.2)


@pytest.mark.parametrize("width,height", STIMULUS_SHAPES)
def test_report_scanpath_caption_is_reserved_below_image_for_all_aspect_ratios(width, height):
    import matplotlib.pyplot as plt

    base = _open_base_image(_stimulus_bytes(width, height))
    scanpath = _draw_scanpath(
        base,
        {
            "objectives": [
                {
                    "cx": FIXATION_X,
                    "cy": FIXATION_Y,
                    "duration_s": 1.0,
                }
            ],
            "total_duration_s": 1.0,
        },
        [],
    )
    fig = _new_report_figure()
    try:
        _scanpath_image_axis(fig, scanpath, "Mapa de recorridos", (0.065, 0.095, 0.870, 0.315))
        fig.canvas.draw()

        image_axis, legend_axis = fig.axes
        assert legend_axis.get_position().y1 < image_axis.get_position().y0
        assert len(legend_axis.collections) == 3
        assert {text.get_text() for text in legend_axis.texts} >= {
            "200 ms",
            "1 s",
            "≥ 2 s",
            "Tamaño por duración · misma escala entre participantes",
        }
        assert {text.get_text() for text in fig.texts} >= {
            "Mapa de recorridos",
            "TIEMPO FIJADO",
            "1.00 s",
            "Excluye sacadas, mirada inválida y fuera del estímulo",
        }
        assert scanpath.size == STIMULUS_CANVAS_SIZE
    finally:
        plt.close(fig)

"""The heatmap has to agree with the scanpath and AOI overlays about "up".

Fixations arrive normalized with the origin at the stimulus' top-left corner.
Scanpath draws ``cy`` straight down the image and AOI shapes are measured from
the top edge, but the heatmap renderer used to invert Y on its way to pixels,
so the same fixation appeared 20% from the top in two overlays and 20% from the
bottom in the third. Nothing downstream compensated for it.

These read the emitted PNG numerically - where is the hot pixel, how big is the
image - instead of trusting that the pipeline "looks right", and they check the
three overlays against one another on identical input.
"""

import io

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    HeatmapAnalyticsService,
    ScanpathAnalyticsService,
)
from neurodatics.modules.analytics.domain.stimulus_geometry import (
    MAX_OUTPUT_EDGE,
    MAX_OUTPUT_PIXELS,
    REFERENCE_SIZE,
    resolve_output_size,
)

Image = pytest.importorskip("PIL.Image", reason="heatmap rendering needs Pillow")

# Square, 16:9 and ultrawide - the shapes a stimulus actually comes in.
STIMULUS_SHAPES = [
    pytest.param(800, 800, id="square"),
    pytest.param(1920, 1080, id="16:9"),
    pytest.param(3440, 1440, id="ultrawide"),
]


def _fixation_frame(x_norm: float, y_norm: float, scenario: str = "A") -> pd.DataFrame:
    """One steady 200 ms fixation at a normalized top-left-origin position."""

    samples = 20
    return pd.DataFrame(
        {
            "time": [index / 100.0 for index in range(samples)],
            "fix_x": [x_norm * 100.0] * samples,
            "fix_y": [y_norm * 100.0] * samples,
            "scenario": [scenario] * samples,
        }
    )


def _hotspot(png_bytes: bytes) -> tuple[float, float, int, int]:
    """Return the peak of the rendered density as a normalized (x, y) plus size.

    The peak is the intensity-weighted centroid of the overlay's alpha channel,
    which is robust to the colormap and to the blur being wider than a pixel.
    """

    with Image.open(io.BytesIO(png_bytes)) as image:
        rgba = np.asarray(image.convert("RGBA"), dtype=float)
    width, height = rgba.shape[1], rgba.shape[0]

    alpha = rgba[:, :, 3]
    total = alpha.sum()
    assert total > 0, "overlay is fully transparent"

    rows = np.arange(height, dtype=float)
    cols = np.arange(width, dtype=float)
    centre_y = float((alpha.sum(axis=1) * rows).sum() / total)
    centre_x = float((alpha.sum(axis=0) * cols).sum() / total)
    return centre_x / width, centre_y / height, width, height


def _png_size(png_bytes: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(png_bytes)) as image:
        return image.size


class TestCoordinateConvention:
    def test_a_fixation_a_fifth_down_renders_a_fifth_down(self):
        png = HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(0.5, 0.2),
            "A",
            width=1920,
            height=1080,
        )

        x_norm, y_norm, _, _ = _hotspot(png)

        assert y_norm == pytest.approx(0.2, abs=0.02)
        assert x_norm == pytest.approx(0.5, abs=0.02)

    def test_the_upper_half_stays_in_the_upper_half(self):
        """The inverted renderer passed a centred test; an off-centre one pins it."""

        png = HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(0.25, 0.15),
            "A",
            width=1920,
            height=1080,
        )

        x_norm, y_norm, _, _ = _hotspot(png)

        assert y_norm < 0.5, "a fixation near the top must not render near the bottom"
        assert x_norm < 0.5

    @pytest.mark.parametrize("width,height", STIMULUS_SHAPES)
    def test_the_convention_holds_at_every_aspect_ratio(self, width, height):
        png = HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(0.75, 0.2),
            "A",
            width=width,
            height=height,
        )

        x_norm, y_norm, _, _ = _hotspot(png)

        assert y_norm == pytest.approx(0.2, abs=0.03)
        assert x_norm == pytest.approx(0.75, abs=0.03)

    def test_scanpath_aoi_and_heatmap_place_the_same_fixation_together(self):
        """The acceptance case: y=0.2 is 20% from the top in all three overlays."""

        frame = _fixation_frame(0.5, 0.2)
        top_band = _aoi("top", x=0, y=10, width=100, height=20)
        bottom_band = _aoi("bottom", x=0, y=70, width=100, height=20)

        scanpath = ScanpathAnalyticsService.compute_scanpath(frame, "A")
        aoi = AoiAnalyticsService.compute_metrics(frame, "A", [top_band, bottom_band])
        _, heatmap_y, _, _ = _hotspot(
            HeatmapAnalyticsService.compute_heatmap_overlay(frame, "A", width=1920, height=1080)
        )

        assert scanpath["objectives"][0]["cy"] == pytest.approx(0.2, abs=1e-6)
        hits = {row["name"]: row["fixation_count"] for row in aoi["aois"]}
        assert hits == {"top": 1, "bottom": 0}
        assert heatmap_y == pytest.approx(0.2, abs=0.02)
        assert heatmap_y == pytest.approx(scanpath["objectives"][0]["cy"], abs=0.02)


class TestOutputDimensions:
    @pytest.mark.parametrize("width,height", STIMULUS_SHAPES)
    def test_output_matches_the_stimulus_dimensions(self, width, height):
        png = HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(0.5, 0.5),
            "A",
            width=width,
            height=height,
        )

        assert _png_size(png) == (width, height)

    def test_unknown_dimensions_fall_back_to_the_reference_size(self):
        png = HeatmapAnalyticsService.compute_heatmap_overlay(_fixation_frame(0.5, 0.5), "A")

        assert _png_size(png) == REFERENCE_SIZE

    def test_an_oversized_stimulus_is_clamped_but_keeps_its_aspect_ratio(self):
        png = HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(0.5, 0.5),
            "A",
            width=12000,
            height=6000,
        )

        rendered_width, rendered_height = _png_size(png)

        assert rendered_width * rendered_height <= MAX_OUTPUT_PIXELS
        assert max(rendered_width, rendered_height) <= MAX_OUTPUT_EDGE
        assert rendered_width / rendered_height == pytest.approx(2.0, rel=1e-3)

    def test_a_clamped_overlay_still_places_the_fixation_correctly(self):
        png = HeatmapAnalyticsService.compute_heatmap_overlay(
            _fixation_frame(0.3, 0.8),
            "A",
            width=12000,
            height=6000,
        )

        x_norm, y_norm, _, _ = _hotspot(png)

        assert x_norm == pytest.approx(0.3, abs=0.03)
        assert y_norm == pytest.approx(0.8, abs=0.03)


class TestResolveOutputSize:
    def test_known_dimensions_pass_through(self):
        assert resolve_output_size(2560, 1440) == (2560, 1440)

    @pytest.mark.parametrize("width,height", [(None, 1080), (1920, None), (0, 0), (-4, 8)])
    def test_unusable_dimensions_fall_back(self, width, height):
        assert resolve_output_size(width, height) == REFERENCE_SIZE

    def test_the_edge_ceiling_applies_before_the_pixel_ceiling(self):
        # 6000x600 is only 3.6 MP but far past the edge cap.
        width, height = resolve_output_size(6000, 600)

        assert max(width, height) <= MAX_OUTPUT_EDGE
        assert width / height == pytest.approx(10.0, rel=1e-2)

    def test_clamping_never_returns_a_zero_edge(self):
        width, height = resolve_output_size(40000, 4)

        assert width >= 1 and height >= 1


def _aoi(name: str, *, x: float, y: float, width: float, height: float):
    from types import SimpleNamespace

    return SimpleNamespace(
        id=name,
        name=name,
        color="#2563EB",
        shape_type="rect",
        shape={"x": x, "y": y, "width": width, "height": height},
    )

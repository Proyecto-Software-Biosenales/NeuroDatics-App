"""Heatmap analytics service over the canonical event contract."""

from collections.abc import Mapping
from typing import Optional
import numpy as np
import pandas as pd
from ...domain.stimulus_geometry import resolve_output_size
from .fixation_analytics_service import FixationEventResult, FixationEventService


class HeatmapAnalyticsService:
    """Generates a heatmap PNG overlay from fixation/gaze data.

    The overlay is rendered at the stimulus' own pixel dimensions in the
    top-left coordinate convention documented in
    :mod:`...domain.stimulus_geometry`, so a client can lay it over the
    stimulus one-to-one and it agrees with the scanpath and AOI overlays on
    where any given fixation is.
    """

    # Longest edge of the density grid the histogram is accumulated on. The
    # grid is scaled from the output size, so its cells stay square whatever
    # the stimulus aspect ratio is and the smoothing kernel stays circular.
    GRID_MAX_EDGE: int = 900

    # Smoothing radius as a fraction of the stimulus' short edge. The legacy
    # renderer blurred by 21 cells of a 200-cell grid, which on a 1080 px short
    # edge is ~113 px; keeping that fraction preserves the established look
    # while making the kernel isotropic instead of stretching it with the
    # aspect ratio.
    SIGMA_SHORT_EDGE_FRACTION: float = 0.105

    @classmethod
    def compute_heatmap_overlay(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        gamma: float = 0.7,
        threshold: float = 0.10,
        alpha: float = 0.75,
        width: Optional[int] = None,
        height: Optional[int] = None,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> Optional[bytes]:
        png_bytes, _ = cls.compute_heatmap_overlay_with_metadata(
            df,
            scenario=scenario,
            gamma=gamma,
            threshold=threshold,
            alpha=alpha,
            width=width,
            height=height,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        return png_bytes

    @classmethod
    def compute_heatmap_overlay_with_metadata(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        gamma: float = 0.7,
        threshold: float = 0.10,
        alpha: float = 0.75,
        width: Optional[int] = None,
        height: Optional[int] = None,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> tuple[Optional[bytes], dict]:
        """Render the heatmap at the stimulus' intrinsic size.

        ``width``/``height`` are the stimulus' intrinsic pixel dimensions as
        captured at ingestion. When they are unknown the reference resolution
        stands in; when they exceed the safe ceiling the overlay is shrunk
        proportionally, so it still overlays exactly. Returns the RGBA PNG
        bytes plus the canonical fixation provenance used to build it.
        """
        result = FixationEventService.build_result(
            df,
            scenario=scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        return cls.compute_heatmap_overlay_from_events(
            result, gamma=gamma, threshold=threshold, alpha=alpha, width=width, height=height,
        )

    @classmethod
    def compute_heatmap_overlay_from_events(
        cls, result: FixationEventResult, gamma: float = 0.7,
        threshold: float = 0.10, alpha: float = 0.75,
        width: Optional[int] = None, height: Optional[int] = None,
    ) -> tuple[Optional[bytes], dict]:
        events, metadata = result.events, result.metadata
        png_bytes = cls.render_overlay(
            events,
            gamma=gamma,
            threshold=threshold,
            alpha=alpha,
            width=width,
            height=height,
        )
        return png_bytes, metadata

    # Optional per-event weight column. When present it replaces the
    # duration weighting, so a caller can decide how much each event counts.
    WEIGHT_COLUMN: str = "weight"

    @staticmethod
    def _duration_weights(events: pd.DataFrame) -> np.ndarray:
        """Fixation durations, with the median standing in for unusable ones."""
        durations = events["duration_s"].to_numpy(dtype=float)
        usable = np.isfinite(durations) & (durations > 0)
        positive_durations = durations[usable]
        fallback_weight = float(np.median(positive_durations)) if positive_durations.size else 1.0
        return np.where(usable, durations, fallback_weight)

    @staticmethod
    def _pixel_positions(
        events: pd.DataFrame, out_w: int, out_h: int,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Stimulus-pixel positions plus the mask of those inside the image."""
        # Normalised (top-left origin) to stimulus pixels. No Y inversion:
        # y_norm already grows downwards, exactly as scanpath and AOIs read it.
        x_px = events["x_norm"].to_numpy(dtype=float) * out_w
        y_px = events["y_norm"].to_numpy(dtype=float) * out_h
        # Points outside the image are rejected, never clipped to an edge.
        valid = (
            np.isfinite(x_px) & np.isfinite(y_px)
            & (x_px >= 0) & (x_px <= out_w)
            & (y_px >= 0) & (y_px <= out_h)
        )
        return x_px, y_px, valid

    @classmethod
    def render_group_overlay(
        cls,
        events_by_participant: Mapping[str, pd.DataFrame],
        gamma: float = 0.7,
        threshold: float = 0.10,
        alpha: float = 0.75,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> tuple[Optional[bytes], list[str]]:
        """Render several participants' events so each one counts the same.

        Within a participant, events keep the duration weighting of the
        individual overlay; across participants, each one's in-image weights
        are scaled to sum to 1, so a participant with many long fixations
        cannot drown out the rest. Returns the PNG and the participants that
        contributed at least one event inside the image, in input order.
        """
        out_w, out_h = resolve_output_size(width, height)
        weighted: list[pd.DataFrame] = []
        contributors: list[str] = []
        for participant, events in events_by_participant.items():
            if events is None or events.empty:
                continue
            weights = cls._duration_weights(events)
            _, _, valid = cls._pixel_positions(events, out_w, out_h)
            total = float(weights[valid].sum())
            if not valid.any() or not np.isfinite(total) or total <= 0:
                continue
            inside = events.loc[valid, ["x_norm", "y_norm"]].copy()
            inside[cls.WEIGHT_COLUMN] = weights[valid] / total
            weighted.append(inside)
            contributors.append(participant)
        if not weighted:
            return None, []
        pooled = pd.concat(weighted, ignore_index=True)
        png_bytes = cls.render_overlay(
            pooled, gamma=gamma, threshold=threshold, alpha=alpha, width=width, height=height,
        )
        return png_bytes, contributors if png_bytes else []

    @classmethod
    def render_overlay(
        cls,
        events: pd.DataFrame,
        gamma: float = 0.7,
        threshold: float = 0.10,
        alpha: float = 0.75,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> Optional[bytes]:
        """Render canonical fixation events as the RGBA heatmap PNG.

        Callers that pool events from several recordings, such as the group
        report, share the exact density, smoothing and colour mapping of the
        single-recording overlay. Events are weighted by duration unless the
        frame carries a ``weight`` column, which is then used as given.
        """
        if events.empty:
            return None

        import io
        from scipy.ndimage import gaussian_filter
        import matplotlib.cm as cm
        from PIL import Image

        out_w, out_h = resolve_output_size(width, height)

        if cls.WEIGHT_COLUMN in events.columns:
            weights = events[cls.WEIGHT_COLUMN].to_numpy(dtype=float)
            weights = np.where(np.isfinite(weights) & (weights > 0), weights, 0.0)
        else:
            weights = cls._duration_weights(events)

        x_px, y_px, valid = cls._pixel_positions(events, out_w, out_h)
        x_px = x_px[valid]
        y_px = y_px[valid]
        weights = weights[valid]

        if x_px.size == 0:
            return None

        # --- Density grid with square cells, so the blur below is circular ---
        grid_scale = min(1.0, cls.GRID_MAX_EDGE / max(out_w, out_h))
        grid_w = max(2, int(round(out_w * grid_scale)))
        grid_h = max(2, int(round(out_h * grid_scale)))
        sigma_px = cls.SIGMA_SHORT_EDGE_FRACTION * min(out_w, out_h)
        sigma = float(np.clip(sigma_px * grid_h / out_h, 1.0, min(grid_w, grid_h) / 2.0))

        # --- 2D histogram, transposed to (row=y, col=x) image order ---
        H, _, _ = np.histogram2d(
            x_px, y_px,
            bins=[grid_w, grid_h],
            range=[[0, out_w], [0, out_h]],
            weights=weights,
        )
        H = H.T  # (grid_w, grid_h) -> (grid_h, grid_w)

        # --- Gaussian smoothing ---
        H = gaussian_filter(H, sigma=sigma)

        # --- Normalize ---
        if H.max() > 0:
            H = H / H.max()

        # --- Gamma + threshold ---
        H = np.power(H, gamma)
        H[H < threshold] = 0.0
        if H.max() > 0:
            H = H / H.max()

        # --- Colorize with jet colormap ---
        rgba_f = cm.jet(H)  # shape (grid_h, grid_w, 4), float 0-1
        # Set alpha: transparent where H==0, else `alpha`
        rgba_f[:, :, 3] = np.where(H > 0, alpha, 0.0)

        # --- Convert to uint8 and resize to the stimulus dimensions ---
        rgba_u8 = (rgba_f * 255).astype(np.uint8)
        img = Image.fromarray(rgba_u8, "RGBA")
        img = img.resize((out_w, out_h), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=False)
        return buf.getvalue()

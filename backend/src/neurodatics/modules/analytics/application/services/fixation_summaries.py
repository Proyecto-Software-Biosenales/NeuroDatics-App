"""Fixation summaries over the canonical event contract."""

from typing import Optional
import numpy as np
import pandas as pd
from .fixation_analytics_service import FixationEventResult, FixationEventService


class FixationDataService:
    """Returns per-fixation data with timestamps for client-side heatmap rendering."""

    @classmethod
    def compute_fixation_data(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> dict:
        """
        Extract fixation points with timestamps and compute statistics.

        Primary source: fix_x / fix_y columns (same filter as ScanpathAnalyticsService).
        Fallback: cleaned gx / gy gaze columns.

        Returns dict with keys:
          - fixations: list of {x_norm, y_norm, time_s, duration_s}
          - stats: {n_fixations, max_duration_s, avg_duration_s}
        """
        result = FixationEventService.build_result(
            df,
            scenario=scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        return cls.compute_fixation_data_from_events(result)

    @classmethod
    def compute_fixation_data_from_events(cls, result: FixationEventResult) -> dict:
        events, metadata = result.events, result.metadata
        if events.empty:
            return {
                "fixations": [],
                "stats": {"n_fixations": 0, "max_duration_s": 0.0, "avg_duration_s": 0.0},
                **metadata,
            }

        fixations = events.to_dict("records")
        durations = events["duration_s"].to_numpy(dtype=float)
        n = len(events)
        max_dur = float(np.max(durations)) if durations.size else 0.0
        avg_dur = float(np.mean(durations)) if durations.size else 0.0

        return {
            "fixations": fixations,
            "stats": {
                "n_fixations": n,
                "max_duration_s": round(max_dur, 4),
                "avg_duration_s": round(avg_dur, 4),
            },
            **metadata,
        }


class FixationHistogramService:
    """Builds fixation-duration histogram bins from grouped scanpath objectives."""

    # Fixed 50 ms bins on multiples of 50, with one open bin from 1000 ms. The
    # limits never depend on the data, so they match across thresholds even when
    # the normalized detector (I-DT) re-detects the fixations at each threshold.
    BIN_WIDTH_MS = 50
    OPEN_FROM_MS = 1000
    OPEN_LABEL = "1000 o más"

    @classmethod
    def compute_histogram(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> dict:
        """Compute a fixed-width histogram of fixation durations in milliseconds."""
        result = FixationEventService.build_result(
            df,
            scenario=scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        return cls.compute_histogram_from_events(result)

    @classmethod
    def compute_histogram_from_events(cls, result: FixationEventResult) -> dict:
        events, metadata = result.events, result.metadata
        _empty = {
            "bins": [],
            "n_fixations": 0,
            "total_duration_ms": 0.0,
            "mean_duration_ms": 0.0,
            "min_duration_ms": 0.0,
            "max_duration_ms": 0.0,
            **metadata,
        }
        durations_ms = events["duration_s"].to_numpy(dtype=float) * 1000.0
        if durations_ms.size == 0:
            return _empty

        n = int(durations_ms.size)
        width = cls.BIN_WIDTH_MS
        open_from = cls.OPEN_FROM_MS
        max_ms = float(durations_ms.max())
        # The first bin is the multiple of the width at or below the threshold;
        # an unknown (historical) threshold starts at the shortest fixation.
        threshold = metadata.get("min_fixation_duration_ms")
        floor_ms = float(threshold) if threshold is not None else float(durations_ms.min())
        first_edge = min(int(np.floor(floor_ms / width)) * width, open_from)
        has_open = max_ms >= open_from
        if has_open:
            edges = list(range(first_edge, open_from, width))
        else:
            last_edge = max(first_edge, int(np.floor(max_ms / width)) * width)
            edges = list(range(first_edge, last_edge + width, width))
        # Clipping keeps a duration a rounding error under the threshold in the first bin.
        bin_index = np.clip(np.floor((durations_ms - first_edge) / width), 0, max(len(edges) - 1, 0))
        if has_open:
            bin_index = np.where(durations_ms >= open_from, len(edges), bin_index)

        bin_limits = [(edge, edge + width - 1, f"{edge}-{edge + width - 1}") for edge in edges]
        if has_open:
            bin_limits.append((open_from, int(np.ceil(max_ms)), cls.OPEN_LABEL))

        bins = []
        for i, (lo, hi, label) in enumerate(bin_limits):
            mask = bin_index == i

            conteo = int(mask.sum())
            porcentaje = float(round((conteo / n) * 100.0, 2))
            promedio_ms = float(round(float(durations_ms[mask].mean()), 2)) if conteo > 0 else 0.0

            bins.append({
                "rango_min": lo,
                "rango_max": hi,
                "label": label,
                "conteo": conteo,
                "porcentaje": porcentaje,
                "promedio_ms": promedio_ms,
            })

        return {
            "bins": bins,
            "n_fixations": n,
            "total_duration_ms": float(round(float(durations_ms.sum()), 2)),
            "mean_duration_ms": float(round(float(durations_ms.mean()), 2)),
            "min_duration_ms": float(round(float(durations_ms.min()), 2)),
            "max_duration_ms": float(round(float(durations_ms.max()), 2)),
            **metadata,
        }

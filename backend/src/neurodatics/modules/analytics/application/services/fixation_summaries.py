"""Fixation summaries over the canonical event contract."""

from typing import Optional
import numpy as np
import pandas as pd
from .fixation_analytics_service import FixationEventService as FixationEventService


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
        events, metadata = FixationEventService.build_events(
            df,
            scenario=scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
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

    @classmethod
    def compute_histogram(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> dict:
        """Compute a Sturges-binned histogram of fixation durations in milliseconds."""
        events, metadata = FixationEventService.build_events(
            df,
            scenario=scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
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
        k = max(1, int(np.ceil(np.log2(n) + 1)))
        edges = np.linspace(0.0, float(durations_ms.max()) + 1e-9, k + 1)

        bins = []
        for i in range(k):
            lo = int(np.ceil(edges[i]))
            hi = int(np.floor(edges[i + 1])) - (1 if i < k - 1 else 0)
            label = f"{lo}-{hi}"

            if i < k - 1:
                mask = (durations_ms >= edges[i]) & (durations_ms < edges[i + 1])
            else:
                mask = (durations_ms >= edges[i]) & (durations_ms <= edges[i + 1])

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

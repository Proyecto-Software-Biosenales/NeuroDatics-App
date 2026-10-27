"""Scanpath analytics service over the canonical event contract."""

from typing import Optional
import numpy as np
import pandas as pd
from ...domain.coordinate_transform import APPLIED_STATUS
from .numeric_helpers import scope_to_scenario as scope_to_scenario
from .fixation_analytics_service import FixationEventResult, FixationEventService


def _segment_label(value) -> Optional[str]:
    """A detector segment id as text; ``None`` when the event has none."""
    if value is None or (isinstance(value, float) and not np.isfinite(value)) or value is pd.NA:
        return None
    return str(value)


class ScanpathAnalyticsService:
    """Computes scanpath objectives and statistics from fixation data."""

    # Reference resolution assumed for all images (screen resolution during experiment)
    REF_W: int = 1920
    REF_H: int = 1080
    RADIUS_SCALE_VERSION: str = "absolute-area-v1"
    RADIUS_SCALE_ENCODING: str = "area"
    RADIUS_CAP_MS: int = 2000

    @staticmethod
    def _filter_fixations(df: pd.DataFrame) -> pd.DataFrame:
        """
        Extract, validate, and normalize fixation columns.
        - Requires fix_x, fix_y, time columns.
        - Removes rows where fix_x == -100 AND fix_y == -100 (sentinel invalid).
        - Auto-normalizes 0-100 range to 0-1 if needed.
        - Rejects values outside [0.0, 1.0]; never clips them onto an edge.
        - Returns sorted by time with only the three needed columns.
        """
        required = {"fix_x", "fix_y", "time"}
        if not required.issubset(df.columns):
            return pd.DataFrame(columns=["time", "fix_x", "fix_y"])

        df = df[["time", "fix_x", "fix_y"]].dropna().sort_values("time").copy()

        fx = df["fix_x"].astype(float).to_numpy()
        fy = df["fix_y"].astype(float).to_numpy()

        # Remove (-100, -100) sentinels
        is_invalid = (np.abs(fx + 100.0) < 1e-6) & (np.abs(fy + 100.0) < 1e-6)
        df = df.loc[~is_invalid].copy()
        if df.empty:
            return df

        fx = df["fix_x"].astype(float).to_numpy()
        fy = df["fix_y"].astype(float).to_numpy()

        # Auto-normalize 0-100 -> 0-1
        if max(np.nanmax(np.abs(fx)), np.nanmax(np.abs(fy))) > 1.1:
            df["fix_x"] = fx / 100.0
            df["fix_y"] = fy / 100.0

        valid = (
            np.isfinite(df["fix_x"])
            & np.isfinite(df["fix_y"])
            & df["fix_x"].between(0.0, 1.0, inclusive="both")
            & df["fix_y"].between(0.0, 1.0, inclusive="both")
        )
        return df.loc[valid]

    @staticmethod
    def _scale_radius(durations: np.ndarray) -> np.ndarray:
        """
        Encode fixation duration on one absolute, area-proportional scale.

        radius_norm is the square root of the fraction of the two-second cap.
        It is therefore cohort-independent: the same duration produces the
        same value for every participant. Renderers use the duration and their
        own minimum/maximum radii to preserve area proportionality. Invalid and
        negative durations map to zero; durations at or above the cap map to
        one.
        """
        d = np.asarray(durations, dtype=float)
        if d.size == 0:
            return np.array([], dtype=float)
        valid_durations = np.where(np.isfinite(d) & (d > 0.0), d, 0.0)
        fraction = np.clip(
            valid_durations / (ScanpathAnalyticsService.RADIUS_CAP_MS / 1000.0),
            0.0,
            1.0,
        )
        return np.sqrt(fraction)

    @classmethod
    def _radius_scale_metadata(cls) -> dict:
        return {
            "version": cls.RADIUS_SCALE_VERSION,
            "encoding": cls.RADIUS_SCALE_ENCODING,
            "cap_ms": cls.RADIUS_CAP_MS,
        }

    @classmethod
    def compute_scanpath(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        proximity_threshold: float = 0.03,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> dict:
        """
        Compute scanpath objectives and statistics from fixation data.

        Primary source: fix_x / fix_y fixation-event columns.
        Fallback: the clean gaze columns written at ingestion.

        Returns dict with:
        - objectives: list of {id, cx, cy, duration_s, radius_norm, t_start, t_end, n_points}
        - n_objectives: int
        - total_distance_px: float (displayed acquisition pixels when available)
        - avg_duration_s: float
        - total_duration_s: float (summed valid fixation dwell)
        - radius_scale: absolute area-encoding metadata
        """
        result = FixationEventService.build_result(
            df,
            scenario=scenario,
            proximity_threshold=proximity_threshold,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        return cls.compute_scanpath_from_events(result)

    @classmethod
    def compute_scanpath_from_events(cls, result: FixationEventResult) -> dict:
        events, metadata = result.events, result.metadata
        _empty = {
            "objectives": [],
            "n_objectives": 0,
            "total_distance_px": 0.0,
            "avg_duration_s": 0.0,
            "total_duration_s": 0.0,
            "radius_scale": cls._radius_scale_metadata(),
            **metadata,
        }
        if events.empty:
            return _empty

        dur_arr = events["duration_s"].to_numpy(dtype=float)
        valid_durations = np.where(
            np.isfinite(dur_arr) & (dur_arr > 0.0),
            dur_arr,
            0.0,
        )
        radii = cls._scale_radius(valid_durations)

        objectives_out = []
        for i, (event, radius) in enumerate(zip(events.to_dict("records"), radii), start=1):
            objectives_out.append({
                "id": i,
                "cx": round(float(event["x_norm"]), 6),
                "cy": round(float(event["y_norm"]), 6),
                "duration_s": round(float(event["duration_s"]), 4),
                "radius_norm": round(float(radius), 6),
                "t_start": round(float(event["time_s"]), 4),
                "t_end": round(float(event["t_end_s"]), 4),
                "n_points": int(event["detector_sample_count"]),
                # Lines join consecutive objectives of the same segment only,
                # the same rule as the travelled distance below.
                "segment_id": _segment_label(event.get("segment_id")),
            })

        display_size = result.display_size
        transform = metadata.get("coordinate_transform") or {}
        if display_size is not None:
            distance_width, distance_height = display_size
        else:
            distance_width, distance_height = float(cls.REF_W), float(cls.REF_H)
            if transform.get("status") == APPLIED_STATUS:
                metadata["warnings"].append(
                    "stimulus display size is missing; scanpath pixel distance uses the "
                    "legacy 1920 x 1080 reference"
                )
            else:
                metadata["warnings"].append(
                    "legacy scanpath pixel distance assumes a 1920 x 1080 reference; "
                    "this is not measured acquisition geometry"
                )
            metadata["warnings"] = list(dict.fromkeys(metadata["warnings"]))

        # Pixel travel is measured within detector segments only. A rejected
        # off-stimulus interval therefore cannot create a line across the image.
        total_dist = 0.0
        event_records = events.to_dict("records")
        for a, b in zip(event_records[:-1], event_records[1:]):
            if a.get("segment_id") != b.get("segment_id"):
                continue
            dx = (float(b["x_norm"]) - float(a["x_norm"])) * distance_width
            dy = (float(b["y_norm"]) - float(a["y_norm"])) * distance_height
            total_dist += float(np.sqrt(dx * dx + dy * dy))

        avg_dur = float(np.mean(valid_durations)) if valid_durations.size else 0.0
        total_dur = float(np.sum(valid_durations)) if valid_durations.size else 0.0

        return {
            "objectives": objectives_out,
            "n_objectives": len(objectives_out),
            "total_distance_px": round(total_dist, 1),
            "avg_duration_s": round(avg_dur, 4),
            "total_duration_s": round(total_dur, 4),
            "radius_scale": cls._radius_scale_metadata(),
            **metadata,
        }

"""Scanpath analytics service over the canonical event contract."""

from typing import Optional
import numpy as np
import pandas as pd
from ...domain.coordinate_transform import APPLIED_STATUS, displayed_stimulus_size
from .numeric_helpers import scope_to_scenario as scope_to_scenario
from .fixation_analytics_service import FixationEventService as FixationEventService


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
    def _infer_durations(times: np.ndarray) -> np.ndarray:
        """Infer per-sample duration from time differences (dt). Last sample gets median dt."""
        t = np.asarray(times, dtype=float)
        if t.size == 0:
            return np.array([], dtype=float)
        if t.size == 1:
            return np.array([0.0], dtype=float)
        diffs = np.diff(t)
        diffs = np.clip(diffs, 0.0, None)
        positive = diffs[diffs > 0]
        tail = float(np.median(positive)) if positive.size else 0.0
        return np.concatenate([diffs, [tail]])

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

    @staticmethod
    def _group_objectives(
        xs: np.ndarray,
        ys: np.ndarray,
        durs: np.ndarray,
        times: np.ndarray,
        proximity_threshold: float = 0.03,
    ) -> list:
        """
        Group consecutive nearby fixation points into objectives using a proximity
        threshold (as a fraction of image min-dimension, default 3%).
        Returns list of dicts: {cx, cy, duration_s, t_start, t_end, n_points}.
        """
        r2_thr = proximity_threshold ** 2
        objs = []
        cx = cy = None
        dur_sum = 0.0
        t_start = t_end = None
        n = 0

        def _flush():
            nonlocal cx, cy, dur_sum, t_start, t_end, n
            if n == 0:
                return
            objs.append({
                "cx": cx,
                "cy": cy,
                "duration_s": dur_sum,
                "t_start": t_start,
                "t_end": t_end,
                "n_points": n,
            })
            cx = cy = None
            dur_sum = 0.0
            t_start = t_end = None
            n = 0

        for x, y, dur, t in zip(xs, ys, durs, times):
            if cx is None:
                cx, cy = float(x), float(y)
                dur_sum = float(dur)
                t_start = t_end = float(t)
                n = 1
                continue
            dx, dy = float(x) - cx, float(y) - cy
            if (dx * dx + dy * dy) <= r2_thr:
                n += 1
                w = 1.0 / n
                cx = cx * (1 - w) + float(x) * w
                cy = cy * (1 - w) + float(y) * w
                dur_sum += float(dur)
                t_end = float(t)
            else:
                _flush()
                cx, cy = float(x), float(y)
                dur_sum = float(dur)
                t_start = t_end = float(t)
                n = 1

        _flush()
        return objs

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
        Fallback: cleaned gx / gy gaze columns (via PupilAnalyticsService._clean_gaze).

        Returns dict with:
        - objectives: list of {id, cx, cy, duration_s, radius_norm, t_start, t_end, n_points}
        - n_objectives: int
        - total_distance_px: float (displayed acquisition pixels when available)
        - avg_duration_s: float
        - total_duration_s: float (summed valid fixation dwell)
        - radius_scale: absolute area-encoding metadata
        """
        events, metadata = FixationEventService.build_events(
            df,
            scenario=scenario,
            proximity_threshold=proximity_threshold,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
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
            })

        scoped = scope_to_scenario(df, scenario)
        display_size = displayed_stimulus_size(scoped)
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

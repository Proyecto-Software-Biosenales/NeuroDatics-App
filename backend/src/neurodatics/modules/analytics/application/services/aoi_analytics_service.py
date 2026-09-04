"""Aoi analytics service over the canonical event contract."""

from typing import Optional
import numpy as np
import pandas as pd
from ...domain.coordinate_transform import (
    LOCAL_X_COLUMN,
    LOCAL_Y_COLUMN,
    applied_transform_mask,
    valid_stimulus_gaze_mask,
)
from .numeric_helpers import _infer_fs as _infer_fs
from .numeric_helpers import _moving_average as _moving_average
from .numeric_helpers import _robust_baseline as _robust_baseline
from .numeric_helpers import scope_to_scenario as scope_to_scenario
from .pupil_analytics_service import PupilAnalyticsService as PupilAnalyticsService
from .fixation_summaries import FixationDataService


class AoiAnalyticsService:
    """Computes fixation metrics inside persisted rectangular, circular, or polygonal AOIs."""

    @staticmethod
    def _rect_from_aoi(aoi: object) -> dict:
        shape = getattr(aoi, "shape", None) or {}

        def _num(key: str, fallback: float = 0.0) -> float:
            value = shape.get(key, fallback) if isinstance(shape, dict) else fallback
            try:
                value = float(value)
            except (TypeError, ValueError):
                value = fallback
            return float(np.clip(value, 0.0, 100.0))

        x = _num("x")
        y = _num("y")
        width = float(np.clip(_num("width"), 0.0, 100.0 - x))
        height = float(np.clip(_num("height"), 0.0, 100.0 - y))
        return {"x": x, "y": y, "width": width, "height": height}

    @staticmethod
    def _points_from_shape(shape: object) -> list[dict]:
        if not isinstance(shape, dict) or not isinstance(shape.get("points"), list):
            return []

        points = []
        for raw_point in shape["points"]:
            if not isinstance(raw_point, dict):
                continue
            try:
                x = float(raw_point.get("x"))
                y = float(raw_point.get("y"))
            except (TypeError, ValueError):
                continue
            if not np.isfinite(x) or not np.isfinite(y):
                continue
            points.append({
                "x": float(np.clip(x, 0.0, 100.0)),
                "y": float(np.clip(y, 0.0, 100.0)),
            })

        return points

    @staticmethod
    def _bounds_from_points(points: list[dict]) -> dict:
        xs = [point["x"] for point in points]
        ys = [point["y"] for point in points]
        x = float(np.clip(min(xs), 0.0, 100.0))
        y = float(np.clip(min(ys), 0.0, 100.0))
        max_x = float(np.clip(max(xs), 0.0, 100.0))
        max_y = float(np.clip(max(ys), 0.0, 100.0))
        return {
            "x": x,
            "y": y,
            "width": float(np.clip(max_x - x, 0.0, 100.0 - x)),
            "height": float(np.clip(max_y - y, 0.0, 100.0 - y)),
        }

    @classmethod
    def _shape_from_aoi(cls, aoi: object) -> dict:
        shape = getattr(aoi, "shape", None) or {}
        rect = cls._rect_from_aoi(aoi)
        shape_type = str(getattr(aoi, "shape_type", "rect")).lower()
        points = cls._points_from_shape(shape)
        if shape_type == "polygon" and len(points) >= 3:
            return {**cls._bounds_from_points(points), "type": "polygon", "points": points}
        return {**rect, "type": "circle" if shape_type == "circle" else "rect"}

    @staticmethod
    def _contains(shape: dict, x_norm: float, y_norm: float) -> bool:
        x0 = shape["x"] / 100.0
        y0 = shape["y"] / 100.0
        x1 = (shape["x"] + shape["width"]) / 100.0
        y1 = (shape["y"] + shape["height"]) / 100.0
        if not (x0 <= x_norm <= x1 and y0 <= y_norm <= y1):
            return False

        if shape.get("type") == "circle":
            rx = (x1 - x0) / 2.0
            ry = (y1 - y0) / 2.0
            if rx <= 0.0 or ry <= 0.0:
                return False
            cx = x0 + rx
            cy = y0 + ry
            return (((x_norm - cx) ** 2) / (rx ** 2)) + (((y_norm - cy) ** 2) / (ry ** 2)) <= 1.0

        points = shape.get("points")
        if not isinstance(points, list) or len(points) < 3:
            return True

        x_pct = x_norm * 100.0
        y_pct = y_norm * 100.0
        inside = False
        j = len(points) - 1
        for i, current in enumerate(points):
            previous = points[j]
            current_y = current["y"]
            previous_y = previous["y"]
            intersects = (
                (current_y > y_pct) != (previous_y > y_pct)
                and x_pct
                < (
                    (previous["x"] - current["x"]) *
                    (y_pct - current_y) /
                    ((previous_y - current_y) or np.finfo(float).eps) +
                    current["x"]
                )
            )
            if intersects:
                inside = not inside
            j = i

        return inside

    @staticmethod
    def _nanmean_pair(left: pd.Series, right: pd.Series) -> np.ndarray:
        left_arr = left.to_numpy(dtype=float)
        right_arr = right.to_numpy(dtype=float)
        left_valid = np.isfinite(left_arr)
        right_valid = np.isfinite(right_arr)
        return np.where(
            left_valid & right_valid,
            (left_arr + right_arr) / 2.0,
            np.where(left_valid, left_arr, right_arr),
        )

    @classmethod
    def _sample_frame(cls, df: pd.DataFrame, scenario: str) -> tuple[pd.DataFrame, Optional[float], Optional[float]]:
        df = scope_to_scenario(df, scenario)

        has_raw = {"gx", "gy"}.issubset(df.columns)
        has_local = {LOCAL_X_COLUMN, LOCAL_Y_COLUMN}.issubset(df.columns)
        if "time" not in df.columns or not (has_raw or has_local):
            return pd.DataFrame(), None, None

        sample_df = (
            df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True).copy()
        )
        if sample_df.empty:
            return sample_df, None, None

        sample_df, has_applied = PupilAnalyticsService._gaze_in_output_space(sample_df)
        if has_applied:
            applied = applied_transform_mask(sample_df)
            eligible = (~applied) | valid_stimulus_gaze_mask(sample_df)
            sample_df = sample_df.loc[eligible].reset_index(drop=True)

        pupil_baseline = None
        if "lx_pupil" in sample_df.columns or "rx_pupil" in sample_df.columns:
            lx = pd.to_numeric(sample_df.get("lx_pupil", pd.Series(np.nan, index=sample_df.index)), errors="coerce")
            rx = pd.to_numeric(sample_df.get("rx_pupil", pd.Series(np.nan, index=sample_df.index)), errors="coerce")
            lx = lx.where(lx > 0)
            rx = rx.where(rx > 0)
            time_arr = sample_df["time"].to_numpy(dtype=float)
            fs = _infer_fs(time_arr)
            win = max(1, int(round(fs * 0.25)))
            smooth_left = _moving_average(lx.to_numpy(dtype=float), win)
            smooth_right = _moving_average(rx.to_numpy(dtype=float), win)
            pupil_avg = np.where(
                lx.notna().to_numpy() & rx.notna().to_numpy(),
                (smooth_left + smooth_right) / 2.0,
                np.where(lx.notna().to_numpy(), smooth_left, smooth_right),
            )
            sample_df["pupil_avg_mm"] = pupil_avg
            finite_pupil = pupil_avg[np.isfinite(pupil_avg)]
            pupil_baseline = (
                float(_robust_baseline(finite_pupil))
                if finite_pupil.size
                else None
            )

        distance_baseline = None
        if "distance" in sample_df.columns:
            distance_cm = pd.to_numeric(sample_df["distance"], errors="coerce") / 10.0
            sample_df["distance_cm"] = distance_cm
            finite_distance = distance_cm.to_numpy(dtype=float)
            finite_distance = finite_distance[np.isfinite(finite_distance)]
            distance_baseline = (
                float(_robust_baseline(finite_distance))
                if finite_distance.size
                else None
            )

        return sample_df, pupil_baseline, distance_baseline

    @classmethod
    def _sample_metrics_for_shape(
        cls,
        sample_df: pd.DataFrame,
        shape: dict,
        pupil_baseline: Optional[float],
        distance_baseline: Optional[float],
    ) -> dict:
        empty = {
            "pupil_sample_count": 0,
            "avg_pupil_mm": None,
            "pupil_delta_from_baseline_mm": None,
            "pupil_delta_percent": None,
            "distance_sample_count": 0,
            "avg_distance_cm": None,
            "distance_delta_from_baseline_cm": None,
            "distance_delta_percent": None,
        }
        if sample_df.empty or "gx_clean" not in sample_df.columns or "gy_clean" not in sample_df.columns:
            return empty

        gx = sample_df["gx_clean"].to_numpy(dtype=float)
        gy = sample_df["gy_clean"].to_numpy(dtype=float)
        valid_mask = np.isfinite(gx) & np.isfinite(gy)
        in_shape = np.array(
            [
                bool(valid) and cls._contains(shape, x / 100.0, y / 100.0)
                for x, y, valid in zip(gx, gy, valid_mask)
            ],
            dtype=bool,
        )

        metrics = dict(empty)

        if "pupil_avg_mm" in sample_df.columns:
            pupil_values = sample_df.loc[in_shape, "pupil_avg_mm"].to_numpy(dtype=float)
            pupil_values = pupil_values[np.isfinite(pupil_values)]
            metrics["pupil_sample_count"] = int(pupil_values.size)
            if pupil_values.size:
                avg_pupil = float(np.mean(pupil_values))
                pupil_delta = (
                    avg_pupil - pupil_baseline
                    if pupil_baseline is not None and np.isfinite(pupil_baseline)
                    else None
                )
                metrics["avg_pupil_mm"] = round(avg_pupil, 4)
                metrics["pupil_delta_from_baseline_mm"] = (
                    round(float(pupil_delta), 4)
                    if pupil_delta is not None
                    else None
                )
                metrics["pupil_delta_percent"] = (
                    round(float((pupil_delta / abs(pupil_baseline)) * 100.0), 2)
                    if pupil_delta is not None and pupil_baseline not in (None, 0)
                    else None
                )

        if "distance_cm" in sample_df.columns:
            distance_values = sample_df.loc[in_shape, "distance_cm"].to_numpy(dtype=float)
            distance_values = distance_values[np.isfinite(distance_values)]
            metrics["distance_sample_count"] = int(distance_values.size)
            if distance_values.size:
                avg_distance = float(np.mean(distance_values))
                distance_delta = (
                    avg_distance - distance_baseline
                    if distance_baseline is not None and np.isfinite(distance_baseline)
                    else None
                )
                metrics["avg_distance_cm"] = round(avg_distance, 4)
                metrics["distance_delta_from_baseline_cm"] = (
                    round(float(distance_delta), 4)
                    if distance_delta is not None
                    else None
                )
                metrics["distance_delta_percent"] = (
                    round(float((distance_delta / abs(distance_baseline)) * 100.0), 2)
                    if distance_delta is not None and distance_baseline not in (None, 0)
                    else None
                )

        return metrics

    @classmethod
    def _aoi_for_sample(cls, aoi_defs: list[dict], gx_pct: float, gy_pct: float) -> Optional[dict]:
        if not np.isfinite(gx_pct) or not np.isfinite(gy_pct):
            return None
        for aoi_def in aoi_defs:
            if cls._contains(aoi_def["shape"], gx_pct / 100.0, gy_pct / 100.0):
                return aoi_def
        return None

    @classmethod
    def _key_events(cls, sample_df: pd.DataFrame, aoi_defs: list[dict]) -> list[dict]:
        if sample_df.empty:
            return []

        event_specs = [
            ("pupil_avg_mm", "pupil", "min", "Dilatacion pupilar minima", "mm"),
            ("pupil_avg_mm", "pupil", "max", "Dilatacion pupilar maxima", "mm"),
            ("gx_clean", "gaze_x", "min", "Gaze X minimo", "%"),
            ("gx_clean", "gaze_x", "max", "Gaze X maximo", "%"),
            ("gy_clean", "gaze_y", "min", "Gaze Y minimo", "%"),
            ("gy_clean", "gaze_y", "max", "Gaze Y maximo", "%"),
            ("distance_cm", "distance", "min", "Distancia minima", "cm"),
            ("distance_cm", "distance", "max", "Distancia maxima", "cm"),
        ]

        events = []
        for column, metric, kind, label, unit in event_specs:
            if column not in sample_df.columns:
                continue

            values = sample_df[column].to_numpy(dtype=float)
            valid_positions = np.flatnonzero(np.isfinite(values))
            if valid_positions.size == 0:
                continue

            valid_values = values[valid_positions]
            selected_position = (
                int(valid_positions[int(np.argmin(valid_values))])
                if kind == "min"
                else int(valid_positions[int(np.argmax(valid_values))])
            )
            row = sample_df.iloc[selected_position]
            gx = float(row.get("gx_clean", np.nan))
            gy = float(row.get("gy_clean", np.nan))
            aoi = cls._aoi_for_sample(aoi_defs, gx, gy)
            time_s = float(row.get("time", np.nan))
            value = float(row.get(column, np.nan))

            event = {
                "id": f"{metric}_{kind}",
                "label": label,
                "metric": metric,
                "kind": kind,
                "value": round(value, 4),
                "unit": unit,
                "time_s": round(time_s, 4) if np.isfinite(time_s) else None,
                "gx": round(gx, 2) if np.isfinite(gx) else None,
                "gy": round(gy, 2) if np.isfinite(gy) else None,
                "aoi_id": aoi["id"] if aoi else None,
                "aoi_name": aoi["name"] if aoi else None,
                "aoi_color": aoi["color"] if aoi else None,
            }
            events.append(event)

        return events

    @classmethod
    def compute_metrics(
        cls,
        df: pd.DataFrame,
        scenario: str,
        aois: list,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> dict:
        ordered_aois = sorted(aois, key=lambda item: str(getattr(item, "name", "")).lower())
        fixation_data = FixationDataService.compute_fixation_data(
            df,
            scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        fixations = fixation_data.get("fixations", [])
        sample_df, pupil_baseline, distance_baseline = cls._sample_frame(df, scenario)

        total_fixations = len(fixations)
        total_dwell_time_ms = float(
            sum(float(fix.get("duration_s", 0.0)) * 1000.0 for fix in fixations)
        )

        aoi_defs = []
        for aoi in ordered_aois:
            shape = cls._shape_from_aoi(aoi)
            aoi_defs.append({
                "id": str(getattr(aoi, "id")),
                "name": str(getattr(aoi, "name", "")),
                "color": str(getattr(aoi, "color", "#3B82F6")),
                "shape_type": str(getattr(aoi, "shape_type", "rect")),
                "shape": shape,
            })

        metrics = []
        any_aoi_mask = [False] * total_fixations
        assigned_sequence: list[tuple[Optional[str], Optional[str]]] = []

        for fixation_index, fix in enumerate(fixations):
            x_norm = float(fix.get("x_norm", np.nan))
            y_norm = float(fix.get("y_norm", np.nan))
            assigned = None
            for aoi_def in aoi_defs:
                if np.isfinite(x_norm) and np.isfinite(y_norm) and cls._contains(aoi_def["shape"], x_norm, y_norm):
                    any_aoi_mask[fixation_index] = True
                    if assigned is None:
                        assigned = aoi_def["name"]
            assigned_sequence.append((fix.get("segment_id"), assigned))

        unique_aoi_dwell_time_ms = float(
            sum(
                float(fix.get("duration_s", 0.0)) * 1000.0
                for fix, is_inside_any in zip(fixations, any_aoi_mask)
                if is_inside_any
            )
        )

        for aoi_def in aoi_defs:
            inside = []
            first_index = None
            for fixation_index, fix in enumerate(fixations):
                x_norm = float(fix.get("x_norm", np.nan))
                y_norm = float(fix.get("y_norm", np.nan))
                if np.isfinite(x_norm) and np.isfinite(y_norm) and cls._contains(aoi_def["shape"], x_norm, y_norm):
                    inside.append(fix)
                    if first_index is None:
                        first_index = fixation_index

            fixation_count = len(inside)
            dwell_time_ms = float(
                sum(float(fix.get("duration_s", 0.0)) * 1000.0 for fix in inside)
            )
            avg_duration_ms = dwell_time_ms / fixation_count if fixation_count else 0.0
            dwell_time_percent = (
                (dwell_time_ms / total_dwell_time_ms) * 100.0
                if total_dwell_time_ms > 0
                else 0.0
            )
            ttff_ms = (
                float(min(float(fix.get("time_s", 0.0)) for fix in inside) * 1000.0)
                if inside
                else None
            )

            metrics.append({
                **aoi_def,
                "fixation_count": int(fixation_count),
                "total_dwell_time_ms": round(dwell_time_ms, 2),
                "total_dwell_time_percent": round(dwell_time_percent, 2),
                "avg_fixation_duration_ms": round(avg_duration_ms, 2),
                "ttff_ms": round(ttff_ms, 2) if ttff_ms is not None else None,
                "hit_rate_percent": round(
                    (fixation_count / total_fixations) * 100.0 if total_fixations > 0 else 0.0,
                    2,
                ),
                "fixations_to_target": int(first_index + 1) if first_index is not None else None,
                **cls._sample_metrics_for_shape(
                    sample_df,
                    aoi_def["shape"],
                    pupil_baseline,
                    distance_baseline,
                ),
            })

        aoi_names = [aoi_def["name"] for aoi_def in aoi_defs]
        transition_counts = {
            source: {target: 0 for target in aoi_names}
            for source in aoi_names
        }
        previous = None
        previous_segment = None
        for segment_id, current in assigned_sequence:
            if segment_id != previous_segment:
                previous = None
                previous_segment = segment_id
            if current is None:
                continue
            if previous is not None and previous != current:
                transition_counts[previous][current] += 1
            previous = current

        transitions = [
            {
                "from_aoi": source,
                "counts": counts,
                "total": int(sum(counts.values())),
            }
            for source, counts in transition_counts.items()
        ]

        return {
            "aois": metrics,
            "transitions": transitions,
            "events": cls._key_events(sample_df, aoi_defs),
            "total_fixations": int(total_fixations),
            "total_dwell_time_ms": round(total_dwell_time_ms, 2),
            "observed_aoi_dwell_time_ms": round(unique_aoi_dwell_time_ms, 2),
            "observed_aoi_dwell_time_percent": round(
                (unique_aoi_dwell_time_ms / total_dwell_time_ms) * 100.0
                if total_dwell_time_ms > 0
                else 0.0,
                2,
            ),
            "algorithm_version": fixation_data.get("algorithm_version", "legacy-adapter-v1"),
            "method": fixation_data.get("method", "legacy_proximity"),
            "source": fixation_data.get("source", "legacy_fixation_columns"),
            "estimated": bool(fixation_data.get("estimated", True)),
            "effective_sampling_rate_hz": fixation_data.get("effective_sampling_rate_hz"),
            "min_fixation_duration_ms": fixation_data.get("min_fixation_duration_ms"),
            "available_min_fixation_durations_ms": fixation_data.get(
                "available_min_fixation_durations_ms", []
            ),
            "warnings": fixation_data.get("warnings", []),
            "coordinate_transform": fixation_data.get("coordinate_transform"),
        }

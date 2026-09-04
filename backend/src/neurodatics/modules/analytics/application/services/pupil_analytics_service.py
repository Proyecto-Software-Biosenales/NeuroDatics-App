"""Pupil analytics service extracted without changing computations."""

from typing import Optional
import numpy as np
import pandas as pd
from ...domain.coordinate_transform import (
    LOCAL_X_COLUMN,
    LOCAL_Y_COLUMN,
    applied_transform_mask,
    attach_transform_provenance,
    valid_stimulus_gaze_mask,
)
from neurodatics.shared.scenario_identity import is_all_scenarios
from .numeric_helpers import _filter_time_window
from .numeric_helpers import _infer_fs
from .numeric_helpers import _moving_average
from .numeric_helpers import _robust_baseline
from .numeric_helpers import scope_to_scenario


class PupilAnalyticsService:
    """Stateless computation helpers for pupil data."""

    @staticmethod
    def compute_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute pupil timeseries from DataFrame."""
        df = scope_to_scenario(df, scenario)

        for col in ("time", "lx_pupil", "rx_pupil"):
            if col not in df.columns:
                return {
                    "time": [],
                    "left": [],
                    "right": [],
                    "average": [],
                    "smooth_left": [],
                    "smooth_right": [],
                }

        df = _filter_time_window(df, start_time_s, end_time_s)

        mask = df["lx_pupil"].notna() | df["rx_pupil"].notna()
        df = df.loc[mask].sort_values("time").reset_index(drop=True)

        time_arr = df["time"].fillna(0.0).astype(float).tolist()
        left_arr = df["lx_pupil"].fillna(0.0).astype(float).tolist()
        right_arr = df["rx_pupil"].fillna(0.0).astype(float).tolist()

        lx = df["lx_pupil"]
        rx = df["rx_pupil"]
        avg_series = pd.Series(
            np.where(
                lx.notna() & rx.notna(),
                (lx + rx) / 2,
                np.where(lx.notna(), lx, rx),
            )
        )
        average_arr = avg_series.fillna(0.0).astype(float).tolist()

        # Infer sampling frequency and compute dynamic window
        t = df["time"].to_numpy(dtype=float)
        fs = _infer_fs(t)
        win = max(1, int(round(fs * 0.25)))  # 0.25s window

        smooth_left_arr = _moving_average(df["lx_pupil"].to_numpy(dtype=float), win)
        smooth_right_arr = _moving_average(df["rx_pupil"].to_numpy(dtype=float), win)
        smooth_left = np.where(np.isfinite(smooth_left_arr), smooth_left_arr, 0.0).tolist()
        smooth_right = np.where(np.isfinite(smooth_right_arr), smooth_right_arr, 0.0).tolist()

        return {
            "time": time_arr,
            "left": left_arr,
            "right": right_arr,
            "average": average_arr,
            "smooth_left": smooth_left,
            "smooth_right": smooth_right,
        }

    @staticmethod
    def compute_statistics(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute pupil statistics on the smoothed signal (matches what the chart displays)."""
        _empty = {
            "mean": 0.0,
            "min": 0.0,
            "max": 0.0,
            "std": 0.0,
            "median": 0.0,
            "baseline": 0.0,
            "raw_mean": None,
            "raw_min": None,
            "raw_max": None,
            "raw_std": None,
            "raw_median": None,
            "raw_baseline": None,
        }

        df = scope_to_scenario(df, scenario)

        if "lx_pupil" not in df.columns or "rx_pupil" not in df.columns:
            return _empty

        df = _filter_time_window(df, start_time_s, end_time_s)

        # Keep rows where at least one eye is valid, sort by time (match timeseries pipeline)
        mask = df["lx_pupil"].notna() | df["rx_pupil"].notna()
        df = (
            df.loc[mask].sort_values("time").reset_index(drop=True)
            if "time" in df.columns
            else df.loc[mask].reset_index(drop=True)
        )

        if df.empty:
            return _empty

        # Infer sampling frequency and window (same as compute_timeseries)
        if "time" in df.columns and df["time"].notna().any():
            t = df["time"].dropna().to_numpy(dtype=float)
            fs = _infer_fs(t)
        else:
            fs = 60.0
        win = max(1, int(round(fs * 0.25)))

        # Smooth both channels
        smooth_left_arr = _moving_average(df["lx_pupil"].to_numpy(dtype=float), win)
        smooth_right_arr = _moving_average(df["rx_pupil"].to_numpy(dtype=float), win)

        # Per-sample average of smoothed channels (use valid eye when only one is available)
        lx_valid = df["lx_pupil"].notna().to_numpy()
        rx_valid = df["rx_pupil"].notna().to_numpy()
        avg_arr = np.where(
            lx_valid & rx_valid,
            (smooth_left_arr + smooth_right_arr) / 2.0,
            np.where(lx_valid, smooth_left_arr, smooth_right_arr),
        )

        # Keep only finite values
        finite_mask = np.isfinite(avg_arr)
        avg_arr = avg_arr[finite_mask]

        if avg_arr.size == 0:
            return _empty

        baseline = _robust_baseline(avg_arr)

        def safe_float(v: float) -> float:
            if not np.isfinite(v):
                return 0.0
            return round(float(v), 4)

        ddof = 1 if avg_arr.size > 1 else 0

        # Raw (unsmoothed) stats for comparison - shown as hover tooltip on frontend
        lx_raw = df["lx_pupil"].to_numpy(dtype=float)
        rx_raw = df["rx_pupil"].to_numpy(dtype=float)
        raw_avg = np.where(
            lx_valid & rx_valid,
            (lx_raw + rx_raw) / 2.0,
            np.where(lx_valid, lx_raw, rx_raw),
        )
        raw_avg_finite = raw_avg[np.isfinite(raw_avg)]
        raw_ddof = 1 if raw_avg_finite.size > 1 else 0

        return {
            "mean": safe_float(np.mean(avg_arr)),
            "min": safe_float(np.min(avg_arr)),
            "max": safe_float(np.max(avg_arr)),
            "std": safe_float(np.std(avg_arr, ddof=ddof)),
            "median": safe_float(np.median(avg_arr)),
            "baseline": safe_float(baseline),
            "raw_mean": round(float(np.mean(raw_avg_finite)), 4) if raw_avg_finite.size else None,
            "raw_min": round(float(np.min(raw_avg_finite)), 4) if raw_avg_finite.size else None,
            "raw_max": round(float(np.max(raw_avg_finite)), 4) if raw_avg_finite.size else None,
            "raw_std": round(float(np.std(raw_avg_finite, ddof=raw_ddof)), 4) if raw_avg_finite.size else None,
            "raw_median": round(float(np.median(raw_avg_finite)), 4) if raw_avg_finite.size else None,
            "raw_baseline": round(float(_robust_baseline(raw_avg_finite)), 4) if raw_avg_finite.size else None,
        }

    @staticmethod
    def find_gaze_at(
        df: pd.DataFrame,
        t_s: float,
        scenario: Optional[str] = None,
    ) -> dict:
        """Find gaze data at the nearest time, optionally within one scenario."""
        if not is_all_scenarios(scenario):
            # A scoped lookup on a frame with no scenario column cannot honour
            # the scope, so it answers with nothing rather than a point from an
            # unknown stimulus.
            df = df.iloc[0:0] if "scenario" not in df.columns else scope_to_scenario(df, scenario)

        def _empty(frame: pd.DataFrame) -> dict:
            return attach_transform_provenance(
                {
                    "requested_time_s": round(t_s, 4),
                    "nearest_time_s": 0.0,
                    "scenario": None,
                    "gx": None,
                    "gy": None,
                },
                frame,
            )

        if "time" not in df.columns or df.empty:
            return _empty(df)

        clean = df.copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        clean = clean.dropna(subset=["time"])
        if clean.empty:
            return _empty(clean)

        # Resolve the scenario from the original nearest row before cleaning.
        # For an unscoped lookup this prevents interpolation/smoothing across a
        # boundary when two scenarios contain overlapping or adjacent times.
        raw_idx = (clean["time"] - t_s).abs().idxmin()
        raw_row = clean.loc[raw_idx]
        has_scenario = "scenario" in clean.columns and pd.notna(
            raw_row.get("scenario")
        )
        raw_scenario = str(raw_row["scenario"]).strip() if has_scenario else None
        if raw_scenario and "scenario" in clean.columns:
            scenario_values = clean["scenario"].astype(str).str.strip()
            clean = clean.loc[scenario_values == raw_scenario]

        # The temporal gaze chart uses this same coordinate-selection seam. For
        # an applied contract it reads local derivatives and never interpolates
        # an outside-stimulus row back onto the image.
        clean = clean.sort_values("time").reset_index(drop=True)
        clean, _ = PupilAnalyticsService._gaze_in_output_space(clean)
        idx = (clean["time"] - t_s).abs().idxmin()
        row = clean.loc[idx]

        nearest_time = float(row["time"]) if pd.notna(row.get("time")) else 0.0
        scenario = (
            str(row["scenario"]).strip()
            if "scenario" in clean.columns and pd.notna(row.get("scenario"))
            else None
        )

        gx_value = row.get("gx_clean")
        gy_value = row.get("gy_clean")
        coordinates_are_valid = (
            pd.notna(gx_value)
            and pd.notna(gy_value)
            and np.isfinite(float(gx_value))
            and np.isfinite(float(gy_value))
            and 0 <= float(gx_value) <= 100
            and 0 <= float(gy_value) <= 100
        )
        if coordinates_are_valid:
            gx = float(gx_value)
            gy = float(gy_value)
        else:
            gx = None
            gy = None

        return attach_transform_provenance({
            "requested_time_s": round(t_s, 4),
            "nearest_time_s": round(nearest_time, 4),
            "scenario": scenario,
            "gx": round(gx, 2) if gx is not None else None,
            "gy": round(gy, 2) if gy is not None else None,
        }, clean.loc[[idx]])

    @staticmethod
    def compute_scenario_relative_time(
        df: pd.DataFrame,
        scenario: Optional[str],
        absolute_time_s: Optional[float],
    ) -> Optional[float]:
        """Convert a global sample time to time elapsed within a scenario."""
        if (
            is_all_scenarios(scenario)
            or absolute_time_s is None
            or "time" not in df.columns
            or "scenario" not in df.columns
            or df.empty
        ):
            return None

        clean = df.dropna(subset=["time"])
        if clean.empty:
            return None

        subset = scope_to_scenario(clean, scenario)
        if subset.empty:
            return None

        times = pd.to_numeric(subset["time"], errors="coerce").dropna()
        if times.empty:
            return None

        start_time = float(times.min())
        if not np.isfinite(start_time):
            return None

        relative_time = max(0.0, float(absolute_time_s) - start_time)
        return round(relative_time, 4)

    @staticmethod
    def _clean_gaze(df: pd.DataFrame) -> pd.DataFrame:
        """Apply gaze cleaning pipeline matching the notebook clean_gaze():
        normalize to %, invalidate out-of-range/blinks/speed, interpolate, smooth."""
        if "gx" not in df.columns or "gy" not in df.columns:
            return df

        gx = pd.to_numeric(df["gx"], errors="coerce")
        gy = pd.to_numeric(df["gy"], errors="coerce")
        # Normalize to percentage if raw values are in 0..1 range
        if gx.abs().max(skipna=True) <= 1.0:
            gx = gx * 100.0
        if gy.abs().max(skipna=True) <= 1.0:
            gy = gy * 100.0

        t = df["time"].to_numpy(dtype=float) if "time" in df.columns else np.arange(len(df), dtype=float)
        dt = np.diff(t)
        dt = dt[(dt > 0) & np.isfinite(dt)]
        fs = float(1.0 / np.median(dt)) if dt.size else 60.0

        # 1) Invalidate out-of-range gaze
        bad = (gx < 0) | (gx > 100) | (gy < 0) | (gy > 100)

        # 2) Invalidate blinks (pupil <= 0 or NaN)
        for pup in ("lx_pupil", "rx_pupil"):
            if pup in df.columns:
                pupil = pd.to_numeric(df[pup], errors="coerce")
                bad = bad | pupil.isna() | (pupil <= 0)

        # 3) Invalidate unrealistic speed (> 1500 %/s)
        vx = gx.diff() * fs
        vy = gy.diff() * fs
        speed = (vx ** 2 + vy ** 2) ** 0.5
        bad = bad | (speed > 1500.0)

        gx_clean = gx.copy()
        gy_clean = gy.copy()
        gx_clean[bad] = np.nan
        gy_clean[bad] = np.nan

        # 4) Interpolate short gaps (up to 150 ms)
        max_gap = max(1, int(round(0.150 * fs)))
        gx_clean = gx_clean.interpolate(limit=max_gap, limit_direction="both")
        gy_clean = gy_clean.interpolate(limit=max_gap, limit_direction="both")

        # 5) Median (60 ms) then mean (40 ms) smoothing
        w_med = max(3, int(round(0.060 * fs)))
        w_mean = max(3, int(round(0.040 * fs)))
        gx_clean = (
            gx_clean.rolling(w_med, center=True, min_periods=1).median()
            .rolling(w_mean, center=True, min_periods=1).mean()
        )
        gy_clean = (
            gy_clean.rolling(w_med, center=True, min_periods=1).median()
            .rolling(w_mean, center=True, min_periods=1).mean()
        )

        df = df.copy()
        df["gx_clean"] = gx_clean
        df["gy_clean"] = gy_clean
        return df

    @staticmethod
    def _gaze_in_output_space(df: pd.DataFrame) -> tuple[pd.DataFrame, bool]:
        """Prepare gaze percentages without bridging an off-stimulus row.

        Existing/legacy rows retain the historical cleaning path.  Rows whose
        persisted transform status is ``applied`` use the authoritative local
        derivatives and are present only when the ingestion-time eligibility
        mask and the unclipped ``[0,1]`` bounds both pass.
        """

        applied = applied_transform_mask(df)
        if not applied.any():
            return PupilAnalyticsService._clean_gaze(df), False

        output = df.copy()
        output["gx_clean"] = np.nan
        output["gy_clean"] = np.nan

        legacy = ~applied
        if legacy.any() and {"gx", "gy"}.issubset(output.columns):
            # Do not smooth one scenario into another in a mixed all-scenario
            # response. This is numerically identical to the old path for a
            # concrete legacy scope.
            if "scenario" in output.columns:
                groups = output.loc[legacy].groupby("scenario", sort=False, dropna=False)
                legacy_frames = [
                    PupilAnalyticsService._clean_gaze(group.copy())
                    for _, group in groups
                ]
                legacy_clean = pd.concat(legacy_frames).sort_index() if legacy_frames else output.iloc[0:0]
            else:
                legacy_clean = PupilAnalyticsService._clean_gaze(output.loc[legacy].copy())
            output.loc[legacy_clean.index, "gx_clean"] = legacy_clean["gx_clean"]
            output.loc[legacy_clean.index, "gy_clean"] = legacy_clean["gy_clean"]

        eligible = valid_stimulus_gaze_mask(output) & applied
        if LOCAL_X_COLUMN in output.columns and LOCAL_Y_COLUMN in output.columns:
            local_x = pd.to_numeric(output[LOCAL_X_COLUMN], errors="coerce") * 100.0
            local_y = pd.to_numeric(output[LOCAL_Y_COLUMN], errors="coerce") * 100.0
            output.loc[eligible, "gx_clean"] = local_x.loc[eligible]
            output.loc[eligible, "gy_clean"] = local_y.loc[eligible]
        return output, True

    @staticmethod
    def compute_gaze_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute cleaned gaze X/Y timeseries."""
        df = scope_to_scenario(df, scenario)
        df = _filter_time_window(df, start_time_s, end_time_s)
        _empty: dict = attach_transform_provenance(
            {"time": [], "gx_clean": [], "gy_clean": []},
            df,
        )

        has_raw = {"gx", "gy"}.issubset(df.columns)
        has_local = {LOCAL_X_COLUMN, LOCAL_Y_COLUMN}.issubset(df.columns)
        if "time" not in df.columns or not (has_raw or has_local):
            return _empty

        df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if df.empty:
            return _empty

        scoped_for_provenance = df.copy()
        df, has_applied = PupilAnalyticsService._gaze_in_output_space(df)
        if has_applied:
            # Applied outside rows stay absent. They must not become zero-valued
            # points or be interpolated back into the trace.
            applied = applied_transform_mask(df)
            eligible = (~applied) | valid_stimulus_gaze_mask(df)
            df = df.loc[eligible].reset_index(drop=True)

        def _safe_list(arr: np.ndarray) -> list:
            return [0.0 if not np.isfinite(float(v)) else round(float(v), 4) for v in arr]

        return attach_transform_provenance({
            "time": df["time"].astype(float).tolist(),
            "gx_clean": _safe_list(df["gx_clean"].to_numpy(dtype=float)),
            "gy_clean": _safe_list(df["gy_clean"].to_numpy(dtype=float)),
        }, scoped_for_provenance)

    @staticmethod
    def compute_gaze_statistics(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute statistics for cleaned gaze X and Y signals."""
        df = scope_to_scenario(df, scenario)
        df = _filter_time_window(df, start_time_s, end_time_s)
        _empty: dict = attach_transform_provenance({
            "gx_mean": 0.0, "gx_min": 0.0, "gx_max": 0.0,
            "gx_std": 0.0, "gx_median": 0.0, "gx_baseline": 0.0,
            "gy_mean": 0.0, "gy_min": 0.0, "gy_max": 0.0,
            "gy_std": 0.0, "gy_median": 0.0, "gy_baseline": 0.0,
        }, df)

        has_raw = {"gx", "gy"}.issubset(df.columns)
        has_local = {LOCAL_X_COLUMN, LOCAL_Y_COLUMN}.issubset(df.columns)
        if "time" not in df.columns or not (has_raw or has_local):
            return _empty

        df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if df.empty:
            return _empty

        scoped_for_provenance = df.copy()
        df, _ = PupilAnalyticsService._gaze_in_output_space(df)

        def _axis_stats(arr: np.ndarray) -> dict:
            finite = arr[np.isfinite(arr)]
            if finite.size == 0:
                return {"mean": 0.0, "min": 0.0, "max": 0.0, "std": 0.0, "median": 0.0, "baseline": 0.0}
            ddof = 1 if finite.size > 1 else 0
            return {
                "mean": round(float(np.mean(finite)), 4),
                "min": round(float(np.min(finite)), 4),
                "max": round(float(np.max(finite)), 4),
                "std": round(float(np.std(finite, ddof=ddof)), 4),
                "median": round(float(np.median(finite)), 4),
                "baseline": round(float(_robust_baseline(finite)), 4),
            }

        gx_s = _axis_stats(df["gx_clean"].to_numpy(dtype=float))
        gy_s = _axis_stats(df["gy_clean"].to_numpy(dtype=float))

        return attach_transform_provenance({
            "gx_mean": gx_s["mean"], "gx_min": gx_s["min"], "gx_max": gx_s["max"],
            "gx_std": gx_s["std"], "gx_median": gx_s["median"], "gx_baseline": gx_s["baseline"],
            "gy_mean": gy_s["mean"], "gy_min": gy_s["min"], "gy_max": gy_s["max"],
            "gy_std": gy_s["std"], "gy_median": gy_s["median"], "gy_baseline": gy_s["baseline"],
        }, scoped_for_provenance)

    @staticmethod
    def compute_distance_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute eye-to-screen distance timeseries (mm -> cm)."""
        _empty: dict = {"time": [], "distance_cm": []}

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns or "distance" not in df.columns:
            return _empty

        df = _filter_time_window(df, start_time_s, end_time_s)

        df = df.copy()
        df["distance"] = pd.to_numeric(df["distance"], errors="coerce")
        df["distance_cm"] = df["distance"] / 10.0
        df = df.dropna(subset=["time", "distance_cm"]).sort_values("time").reset_index(drop=True)

        if df.empty:
            return _empty

        return {
            "time": df["time"].astype(float).tolist(),
            "distance_cm": [round(float(v), 4) for v in df["distance_cm"].tolist()],
        }

    @staticmethod
    def compute_distance_statistics(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute statistics for eye-to-screen distance signal (cm)."""
        _empty: dict = {
            "mean": 0.0, "min": 0.0, "max": 0.0, "std": 0.0, "median": 0.0, "baseline": 0.0,
        }

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns or "distance" not in df.columns:
            return _empty

        df = _filter_time_window(df, start_time_s, end_time_s)

        df = df.copy()
        df["distance"] = pd.to_numeric(df["distance"], errors="coerce")
        df["distance_cm"] = df["distance"] / 10.0
        df = df.dropna(subset=["time", "distance_cm"]).sort_values("time").reset_index(drop=True)

        if df.empty:
            return _empty

        arr = df["distance_cm"].to_numpy(dtype=float)
        finite = arr[np.isfinite(arr)]

        if finite.size == 0:
            return _empty

        ddof = 1 if finite.size > 1 else 0

        def _sf(v: float) -> float:
            return round(float(v), 4) if np.isfinite(v) else 0.0

        return {
            "mean": _sf(np.mean(finite)),
            "min": _sf(np.min(finite)),
            "max": _sf(np.max(finite)),
            "std": _sf(np.std(finite, ddof=ddof)),
            "median": _sf(np.median(finite)),
            "baseline": _sf(_robust_baseline(finite)),
        }

from copy import deepcopy
import json
from typing import Iterable, Optional

import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter
from scipy.signal import spectrogram, welch

from neurodatics.modules.projects.application.services.fixation_detection_service import (
    CANONICAL_FIXATION_MIN_DURATION_MS,
    DEFAULT_FIXATION_MIN_DURATION_MS,
    FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    fixation_duration_column,
)

from ...domain.coordinate_transform import (
    APPLIED_STATUS,
    LOCAL_X_COLUMN,
    LOCAL_Y_COLUMN,
    applied_transform_mask,
    attach_transform_provenance,
    displayed_stimulus_size,
    hard_stimulus_boundary_mask,
    valid_stimulus_gaze_mask,
)
from ...domain.scenario_identity import (
    ScenarioResolution,
    is_all_scenarios,
    resolve_scenario,
)
from ...domain.stimulus_geometry import resolve_output_size

EEG_CHANNELS = ("le", "f4", "c4", "p4", "p3", "c3", "f3")
EEG_TOPOGRAPHY_CHANNELS = ("f3", "f4", "c3", "c4", "p3", "p4")
EEG_TOPOGRAPHY_LAYOUT = {
    "f3": (-0.5, 0.6),
    "f4": (0.5, 0.6),
    "c3": (-0.6, 0.0),
    "c4": (0.6, 0.0),
    "p3": (-0.5, -0.6),
    "p4": (0.5, -0.6),
}


def _infer_fs(t: np.ndarray, default: float = 60.0) -> float:
    """Estimate sampling frequency from time array (median of 1/Δt)."""
    t = np.asarray(t, float)
    dt = np.diff(t)
    dt = dt[(dt > 0) & np.isfinite(dt)]
    return float(1.0 / np.median(dt)) if dt.size else float(default)


def _moving_average(x: np.ndarray, win: int) -> np.ndarray:
    """Centered rolling mean with edge propagation (no NaN at boundaries)."""
    x = np.asarray(x, float)
    if x.size == 0:
        return x.copy()
    if win <= 1:
        return x.copy()
    s = pd.Series(x, dtype=float).rolling(
        win, min_periods=max(1, win // 2), center=True
    ).mean()
    v = s.to_numpy()
    if np.isnan(v[0]):
        idx = np.flatnonzero(~np.isnan(v))
        if idx.size:
            v[: idx[0]] = v[idx[0]]
    if np.isnan(v[-1]):
        idx = np.flatnonzero(~np.isnan(v))
        if idx.size:
            v[idx[-1] :] = v[idx[-1]]
    return v


def _robust_baseline(x: np.ndarray) -> float:
    """Baseline as mean of values between 5th and 20th percentiles."""
    x = np.asarray(x, float)
    finite = np.isfinite(x)
    if not finite.any():
        return 0.0
    lo, hi = np.nanpercentile(x[finite], [5, 20])
    m = (x >= lo) & (x <= hi)
    vals = x[m] if m.any() else x[finite]
    result = float(np.nanmean(vals))
    return result if np.isfinite(result) else 0.0


def resolve_scenario_in_frame(
    df: pd.DataFrame,
    scenario: Optional[str],
) -> Optional[ScenarioResolution]:
    """Resolve a requested scenario name against the values the frame stores.

    The caller may hold any of the spellings a scenario has - the media file
    name, the label the UI shows, the value the CSV importer wrote - so the
    Parquet's own ``scenario`` column is the authority on which string the rows
    can actually be compared against.
    """

    if is_all_scenarios(scenario) or "scenario" not in df.columns:
        return None
    stored = pd.unique(df["scenario"].dropna().astype(str))
    return resolve_scenario(scenario, stored.tolist())


def scope_to_scenario(df: pd.DataFrame, scenario: Optional[str]) -> pd.DataFrame:
    """Restrict a frame to one scenario, whatever spelling the caller used.

    A frame with no ``scenario`` column predates per-scenario storage and is
    left whole, as it always was. A name that matches nothing yields no rows
    rather than every row.
    """

    if is_all_scenarios(scenario) or "scenario" not in df.columns:
        return df
    resolution = resolve_scenario_in_frame(df, scenario)
    if resolution is None:
        return df.iloc[0:0]
    stored = df["scenario"].astype(str).str.strip()
    return df.loc[stored == resolution.value.strip()]


def _filter_time_window(
    df: pd.DataFrame,
    start_time_s: Optional[float] = None,
    end_time_s: Optional[float] = None,
) -> pd.DataFrame:
    if "time" not in df.columns or (start_time_s is None and end_time_s is None):
        return df

    time_values = pd.to_numeric(df["time"], errors="coerce")
    mask = time_values.notna()
    if start_time_s is not None:
        mask &= time_values >= float(start_time_s)
    if end_time_s is not None:
        mask &= time_values <= float(end_time_s)

    return df.loc[mask]


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


class GsrAnalyticsService:
    """Stateless computation helpers for galvanic skin response data."""

    @staticmethod
    def _clean_signal(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
        absolute_time: bool = False,
    ) -> pd.DataFrame:
        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns or "gsr" not in df.columns:
            return pd.DataFrame(columns=["time", "gsr", "gsr_smooth"])

        clean = df.copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        clean["gsr"] = pd.to_numeric(clean["gsr"], errors="coerce")
        clean = clean.dropna(subset=["time", "gsr"]).sort_values("time").reset_index(drop=True)

        if clean.empty:
            return pd.DataFrame(columns=["time", "gsr", "gsr_smooth"])

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        win = max(1, int(round(fs * 1.0)))
        smooth = _moving_average(clean["gsr"].to_numpy(dtype=float), win)
        clean["gsr_smooth"] = smooth

        if not absolute_time:
            clean["time"] = clean["time"] - clean["time"].min()
        clean = _filter_time_window(clean, start_time_s, end_time_s).reset_index(drop=True)
        if clean.empty:
            return pd.DataFrame(columns=["time", "gsr", "gsr_smooth"])

        return clean

    @staticmethod
    def compute_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
        absolute_time: bool = False,
    ) -> dict:
        """Compute raw and 1-second smoothed GSR timeseries."""
        _empty: dict = {"time": [], "gsr": [], "gsr_smooth": []}

        clean = GsrAnalyticsService._clean_signal(
            df,
            scenario,
            start_time_s,
            end_time_s,
            absolute_time=absolute_time,
        )
        if clean.empty:
            return _empty

        def _safe_list(values: np.ndarray) -> list:
            return [
                0.0 if not np.isfinite(float(value)) else round(float(value), 4)
                for value in values
            ]

        return {
            "time": _safe_list(clean["time"].to_numpy(dtype=float)),
            "gsr": _safe_list(clean["gsr"].to_numpy(dtype=float)),
            "gsr_smooth": _safe_list(clean["gsr_smooth"].to_numpy(dtype=float)),
        }

    @staticmethod
    def compute_statistics(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute statistics on the smoothed GSR signal shown in the chart."""
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

        clean = GsrAnalyticsService._clean_signal(df, scenario, start_time_s, end_time_s)
        if clean.empty:
            return _empty

        smooth = clean["gsr_smooth"].to_numpy(dtype=float)
        finite = smooth[np.isfinite(smooth)]
        if finite.size == 0:
            return _empty

        raw = clean["gsr"].to_numpy(dtype=float)
        raw_finite = raw[np.isfinite(raw)]

        def _sf(value: float) -> float:
            return round(float(value), 4) if np.isfinite(value) else 0.0

        ddof = 1 if finite.size > 1 else 0
        raw_ddof = 1 if raw_finite.size > 1 else 0

        return {
            "mean": _sf(np.mean(finite)),
            "min": _sf(np.min(finite)),
            "max": _sf(np.max(finite)),
            "std": _sf(np.std(finite, ddof=ddof)),
            "median": _sf(np.median(finite)),
            "baseline": _sf(_robust_baseline(finite)),
            "raw_mean": _sf(np.mean(raw_finite)) if raw_finite.size else None,
            "raw_min": _sf(np.min(raw_finite)) if raw_finite.size else None,
            "raw_max": _sf(np.max(raw_finite)) if raw_finite.size else None,
            "raw_std": _sf(np.std(raw_finite, ddof=raw_ddof)) if raw_finite.size else None,
            "raw_median": _sf(np.median(raw_finite)) if raw_finite.size else None,
            "raw_baseline": _sf(_robust_baseline(raw_finite)) if raw_finite.size else None,
        }


class EegAnalyticsService:
    """Stateless computation helpers for EEG channel traces."""

    @staticmethod
    def _empty(available_channels: Optional[list] = None) -> dict:
        return {
            "time": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "raw": {},
            "smooth": {},
        }

    @staticmethod
    def _empty_psd(available_channels: Optional[list] = None, use_db: bool = True) -> dict:
        return {
            "frequency": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "use_db": bool(use_db),
            "unit": "dB" if use_db else "uV^2/Hz",
            "power": {},
        }

    @staticmethod
    def _empty_spectrogram(
        available_channels: Optional[list] = None,
        use_db: bool = True,
        normalize: str = "freq_demean",
    ) -> dict:
        unit = "dB" if use_db else "uV^2/Hz"
        if normalize == "freq_demean":
            unit = "dB centrado" if use_db else "uV^2/Hz centrado"
        elif normalize == "freq_zscore":
            unit = "z-score"

        return {
            "time": [],
            "frequency": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "use_db": bool(use_db),
            "normalize": normalize,
            "unit": unit,
            "power": {},
            "color_domain": {"min": 0.0, "max": 0.0},
        }

    @staticmethod
    def _empty_topography(
        available_channels: Optional[list] = None,
        window_s: float = 2.0,
        overlap_ratio: float = 0.5,
        remove_dc: bool = True,
    ) -> dict:
        return {
            "time": [],
            "channels": [],
            "available_channels": available_channels or [],
            "sampling_rate_hz": 0.0,
            "unit": "uV^2",
            "positions": {},
            "power": {},
            "color_domain": {"min": 0.0, "max": 0.0},
            "window_s": round(float(window_s), 4),
            "overlap_ratio": round(float(overlap_ratio), 4),
            "remove_dc": bool(remove_dc),
        }

    @staticmethod
    def _parse_channels(channels: Optional[Iterable[str]], available_channels: list) -> list:
        if channels is None:
            return available_channels.copy()

        parsed = []
        for channel in channels:
            token = str(channel).strip().lower()
            if token and token not in parsed:
                parsed.append(token)

        return [channel for channel in parsed if channel in available_channels]

    @staticmethod
    def _safe_list(values: np.ndarray) -> list:
        return [
            0.0 if not np.isfinite(float(value)) else round(float(value), 4)
            for value in values
        ]

    @classmethod
    def _safe_matrix(cls, values: np.ndarray) -> list:
        return [cls._safe_list(row) for row in values]

    @staticmethod
    def _filter_time_window(
        df: pd.DataFrame,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> pd.DataFrame:
        if "time" not in df.columns or (start_time_s is None and end_time_s is None):
            return df

        time_values = pd.to_numeric(df["time"], errors="coerce")
        mask = time_values.notna()
        if start_time_s is not None:
            mask &= time_values >= float(start_time_s)
        if end_time_s is not None:
            mask &= time_values <= float(end_time_s)

        return df.loc[mask]

    @classmethod
    def compute_timeseries(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        smooth_window_s: float = 0.2,
        max_points: int = 5000,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute raw and smoothed EEG channel traces, aligned to the original time axis."""
        available_channels = [channel for channel in EEG_CHANNELS if channel in df.columns]
        selected_channels = cls._parse_channels(channels, available_channels)

        if not selected_channels:
            return cls._empty(available_channels)

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty(available_channels)

        df = cls._filter_time_window(df, start_time_s, end_time_s)

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = clean.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if clean.empty:
            return cls._empty(available_channels)

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        win = max(1, int(round(fs * max(float(smooth_window_s), 0.0))))

        raw_values = {}
        smooth_values = {}
        for channel in selected_channels:
            raw = clean[channel].to_numpy(dtype=float)
            raw_values[channel] = raw
            smooth_values[channel] = _moving_average(raw, win)

        if max_points > 0 and time_arr.size > max_points:
            indices = np.linspace(0, time_arr.size - 1, int(max_points), dtype=int)
        else:
            indices = np.arange(time_arr.size, dtype=int)

        return {
            "time": cls._safe_list(time_arr[indices]),
            "channels": selected_channels,
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "raw": {
                channel: cls._safe_list(values[indices])
                for channel, values in raw_values.items()
            },
            "smooth": {
                channel: cls._safe_list(values[indices])
                for channel, values in smooth_values.items()
            },
        }

    @classmethod
    def compute_psd(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        max_freq_hz: Optional[float] = None,
        use_db: bool = True,
        max_points: int = 5000,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute EEG power spectral density per channel using Welch's method."""
        available_channels = [channel for channel in EEG_CHANNELS if channel in df.columns]
        selected_channels = cls._parse_channels(channels, available_channels)

        if not selected_channels:
            return cls._empty_psd(available_channels, use_db)

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty_psd(available_channels, use_db)

        df = cls._filter_time_window(df, start_time_s, end_time_s)

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = clean.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if clean.empty:
            return cls._empty_psd(available_channels, use_db)

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)

        channel_values = {}
        for channel in selected_channels:
            values = clean[channel].to_numpy(dtype=float)
            values = values[np.isfinite(values)]
            if values.size >= 8:
                channel_values[channel] = values

        if not channel_values:
            return cls._empty_psd(available_channels, use_db)

        nperseg = min(1024, min(values.size for values in channel_values.values()))
        frequency = None
        power_values = {}
        for channel, values in channel_values.items():
            freqs, psd = welch(
                values,
                fs=fs,
                nperseg=nperseg,
                noverlap=None,
                detrend="constant",
                scaling="density",
            )

            if max_freq_hz is not None:
                mask = freqs <= float(max_freq_hz)
                freqs = freqs[mask]
                psd = psd[mask]

            if use_db:
                psd = 10.0 * np.log10(psd + 1e-12)

            if frequency is None:
                frequency = freqs
            power_values[channel] = psd

        if frequency is None or frequency.size == 0:
            return cls._empty_psd(available_channels, use_db)

        if max_points > 0 and frequency.size > max_points:
            indices = np.linspace(0, frequency.size - 1, int(max_points), dtype=int)
        else:
            indices = np.arange(frequency.size, dtype=int)

        return {
            "frequency": cls._safe_list(frequency[indices]),
            "channels": list(power_values.keys()),
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "use_db": bool(use_db),
            "unit": "dB" if use_db else "uV^2/Hz",
            "power": {
                channel: cls._safe_list(values[indices])
                for channel, values in power_values.items()
            },
        }

    @classmethod
    def compute_spectrogram(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        max_freq_hz: Optional[float] = 25.0,
        use_db: bool = True,
        normalize: str = "freq_demean",
        window_s: float = 1.5,
        overlap_ratio: float = 0.75,
        smooth_sigma: float = 0.8,
        clip_low_percentile: float = 2.0,
        clip_high_percentile: float = 98.0,
        max_time_bins: int = 600,
        max_frequency_bins: int = 256,
    ) -> dict:
        """Compute a multi-channel EEG spectrogram using SciPy's PSD mode."""
        available_channels = [channel for channel in EEG_CHANNELS if channel in df.columns]
        selected_channels = cls._parse_channels(channels, available_channels)
        normalize = normalize if normalize in {"none", "freq_demean", "freq_zscore"} else "freq_demean"

        if not selected_channels:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = (
            clean.dropna(subset=["time"] + selected_channels)
            .sort_values("time")
            .reset_index(drop=True)
        )
        if clean.empty:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        nperseg = max(64, int(round(max(float(window_s), 0.1) * fs)))
        noverlap = min(nperseg - 1, int(round(max(0.0, min(float(overlap_ratio), 0.95)) * nperseg)))

        spec_data = {}
        frequency = None
        segment_time = None
        for channel in selected_channels:
            values = clean[channel].to_numpy(dtype=float)
            values = values[np.isfinite(values)]
            if values.size < 2 * nperseg:
                continue

            freqs, times, power = spectrogram(
                values,
                fs=fs,
                window="hann",
                nperseg=nperseg,
                noverlap=noverlap,
                detrend="constant",
                scaling="density",
                mode="psd",
            )

            if max_freq_hz is not None:
                mask = freqs <= float(max_freq_hz)
                freqs = freqs[mask]
                power = power[mask, :]

            if freqs.size == 0 or times.size == 0:
                continue

            if use_db:
                power = 10.0 * np.log10(power + 1e-12)

            if normalize == "freq_demean":
                power = power - np.median(power, axis=1, keepdims=True)
            elif normalize == "freq_zscore":
                mu = np.mean(power, axis=1, keepdims=True)
                sd = np.std(power, axis=1, keepdims=True) + 1e-12
                power = (power - mu) / sd

            if smooth_sigma > 0:
                power = gaussian_filter(power, sigma=(float(smooth_sigma), float(smooth_sigma)))

            if frequency is None:
                frequency = freqs
                segment_time = times + float(time_arr[0])

            spec_data[channel] = power

        if frequency is None or segment_time is None or not spec_data:
            return cls._empty_spectrogram(available_channels, use_db, normalize)

        if max_frequency_bins > 0 and frequency.size > max_frequency_bins:
            freq_indices = np.linspace(0, frequency.size - 1, int(max_frequency_bins), dtype=int)
        else:
            freq_indices = np.arange(frequency.size, dtype=int)

        if max_time_bins > 0 and segment_time.size > max_time_bins:
            time_indices = np.linspace(0, segment_time.size - 1, int(max_time_bins), dtype=int)
        else:
            time_indices = np.arange(segment_time.size, dtype=int)

        downsampled_power = {
            channel: values[np.ix_(freq_indices, time_indices)]
            for channel, values in spec_data.items()
        }

        all_values = np.concatenate([values.ravel() for values in downsampled_power.values()])
        all_values = all_values[np.isfinite(all_values)]
        if all_values.size:
            low = max(0.0, min(float(clip_low_percentile), 100.0))
            high = max(low, min(float(clip_high_percentile), 100.0))
            vmin, vmax = np.percentile(all_values, [low, high])
        else:
            vmin, vmax = 0.0, 0.0

        unit = "dB" if use_db else "uV^2/Hz"
        if normalize == "freq_demean":
            unit = "dB centrado" if use_db else "uV^2/Hz centrado"
        elif normalize == "freq_zscore":
            unit = "z-score"

        return {
            "time": cls._safe_list(segment_time[time_indices]),
            "frequency": cls._safe_list(frequency[freq_indices]),
            "channels": list(downsampled_power.keys()),
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "use_db": bool(use_db),
            "normalize": normalize,
            "unit": unit,
            "power": {
                channel: cls._safe_matrix(values)
                for channel, values in downsampled_power.items()
            },
            "color_domain": {
                "min": round(float(vmin), 4) if np.isfinite(vmin) else 0.0,
                "max": round(float(vmax), 4) if np.isfinite(vmax) else 0.0,
            },
        }

    @classmethod
    def compute_topography(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        channels: Optional[Iterable[str]] = None,
        window_s: float = 2.0,
        overlap_ratio: float = 0.5,
        remove_dc: bool = True,
        max_frames: int = 600,
    ) -> dict:
        """Compute broadband EEG power topography over time windows."""
        available_channels = [
            channel for channel in EEG_TOPOGRAPHY_CHANNELS if channel in df.columns
        ]
        selected_channels = cls._parse_channels(channels, available_channels)
        overlap_ratio = max(0.0, min(float(overlap_ratio), 0.95))
        window_s = max(float(window_s), 0.1)

        if len(selected_channels) < 3:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        df = scope_to_scenario(df, scenario)

        if "time" not in df.columns:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        clean = df[["time"] + selected_channels].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        for channel in selected_channels:
            clean[channel] = pd.to_numeric(clean[channel], errors="coerce")

        clean = clean.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if clean.empty:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        time_arr = clean["time"].to_numpy(dtype=float)
        fs = _infer_fs(time_arr)
        sample_index = np.arange(time_arr.size, dtype=float)

        usable_channels = []
        signal_rows = []
        for channel in selected_channels:
            values = clean[channel].to_numpy(dtype=float)
            finite_mask = np.isfinite(values)
            if finite_mask.sum() < 2:
                continue

            values = np.interp(
                sample_index,
                sample_index[finite_mask],
                values[finite_mask],
            )
            if remove_dc:
                values = values - np.mean(values)

            usable_channels.append(channel)
            signal_rows.append(values)

        if len(usable_channels) < 3 or not signal_rows:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        signals = np.vstack(signal_rows)
        _, sample_count = signals.shape
        window_size = int(max(8, np.floor(window_s * fs)))
        hop_size = int(max(1, np.floor(window_size * (1.0 - overlap_ratio))))
        if window_size > sample_count:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        frame_count = 1 + (sample_count - window_size) // hop_size
        if frame_count <= 0:
            return cls._empty_topography(
                available_channels,
                window_s=window_s,
                overlap_ratio=overlap_ratio,
                remove_dc=remove_dc,
            )

        window = np.hanning(window_size)
        window_energy = float((window**2).mean()) or 1.0

        power = np.empty((len(usable_channels), frame_count), dtype=float)
        frame_time = np.empty(frame_count, dtype=float)
        for frame_index in range(frame_count):
            start = frame_index * hop_size
            segment = signals[:, start : start + window_size] * window
            power[:, frame_index] = (segment**2).mean(axis=1) / window_energy
            center_index = start + (window_size // 2)
            frame_time[frame_index] = time_arr[0] + (center_index / fs)

        if max_frames > 0 and frame_count > max_frames:
            frame_indices = np.linspace(0, frame_count - 1, int(max_frames), dtype=int)
        else:
            frame_indices = np.arange(frame_count, dtype=int)

        downsampled_power = power[:, frame_indices]
        downsampled_time = frame_time[frame_indices]
        finite_power = downsampled_power[np.isfinite(downsampled_power)]
        if finite_power.size:
            vmin, vmax = np.percentile(finite_power, [5.0, 95.0])
            if np.isclose(vmin, vmax):
                vmin = float(np.min(finite_power))
                vmax = float(np.max(finite_power))
        else:
            vmin, vmax = 0.0, 0.0

        layout_points = np.array(
            [EEG_TOPOGRAPHY_LAYOUT[channel] for channel in usable_channels],
            dtype=float,
        )
        radii = np.sqrt(np.sum(layout_points**2, axis=1))
        scale = 0.85 / float(radii.max()) if radii.size and radii.max() > 0 else 1.0
        layout_points = layout_points * scale

        return {
            "time": cls._safe_list(downsampled_time),
            "channels": usable_channels,
            "available_channels": available_channels,
            "sampling_rate_hz": round(float(fs), 4) if np.isfinite(fs) else 0.0,
            "unit": "uV^2",
            "positions": {
                channel: cls._safe_list(layout_points[index])
                for index, channel in enumerate(usable_channels)
            },
            "power": {
                channel: cls._safe_list(downsampled_power[index])
                for index, channel in enumerate(usable_channels)
            },
            "color_domain": {
                "min": round(float(vmin), 4) if np.isfinite(vmin) else 0.0,
                "max": round(float(vmax), 4) if np.isfinite(vmax) else 0.0,
            },
            "window_s": round(float(window_s), 4),
            "overlap_ratio": round(float(overlap_ratio), 4),
            "remove_dc": bool(remove_dc),
        }


class FixationDurationVariantService:
    """Select and compare the persisted minimum-duration detector variants.

    Ingestion stores the 200 ms canonical variant under the historical column
    names and the other variants under deterministic suffixes.  This adapter
    presents any requested variant through the canonical names so downstream
    analytics do not need five parallel implementations.
    """

    AVAILABLE_DURATIONS_FIELD = "available_min_fixation_durations_ms"
    REQUESTED_DURATION_ATTR = "requested_min_fixation_duration_ms"
    VARIANT_WARNINGS_ATTR = "fixation_variant_warnings"

    @classmethod
    def validate_duration(cls, value: object = DEFAULT_FIXATION_MIN_DURATION_MS) -> int:
        """Return a supported integer duration or raise an API-friendly error."""

        if value is None:
            value = DEFAULT_FIXATION_MIN_DURATION_MS
        if isinstance(value, (bool, np.bool_)):
            parsed = None
        else:
            try:
                numeric = float(str(value).strip().replace(",", "."))
            except (TypeError, ValueError):
                parsed = None
            else:
                parsed = int(numeric) if np.isfinite(numeric) and numeric.is_integer() else None

        supported = tuple(int(item) for item in SUPPORTED_FIXATION_MIN_DURATIONS_MS)
        if parsed not in supported:
            choices = ", ".join(f"{item} ms" for item in supported)
            raise ValueError(
                f"Unsupported minimum fixation duration {value!r}. "
                f"Supported values are: {choices}."
            )
        return int(parsed)

    @classmethod
    def _attrs_containers(cls, df: pd.DataFrame) -> list[dict]:
        attrs = dict(getattr(df, "attrs", {}) or {})
        containers = [attrs]
        for key in ("fixation", "fixation_metadata", "processing_metadata", "metadata"):
            nested = attrs.get(key)
            if isinstance(nested, dict):
                containers.append(nested)
        return containers

    @classmethod
    def _metadata_value(cls, df: pd.DataFrame, name: str):
        for container in cls._attrs_containers(df):
            if name in container and container[name] is not None:
                return container[name]
        if name in df.columns:
            values = df[name].dropna()
            if not values.empty:
                return values.iloc[0]
        return None

    @classmethod
    def _is_variant_aware(cls, df: pd.DataFrame) -> bool:
        if FIXATION_MIN_DURATION_COLUMN in df.columns:
            return True
        if cls._metadata_value(df, FIXATION_MIN_DURATION_COLUMN) is not None:
            return True
        if cls._metadata_value(df, cls.AVAILABLE_DURATIONS_FIELD) is not None:
            return True
        return any(
            fixation_duration_column(base, duration) in df.columns
            for duration in SUPPORTED_FIXATION_MIN_DURATIONS_MS
            if int(duration) != int(CANONICAL_FIXATION_MIN_DURATION_MS)
            for base in FIXATION_DURATION_VARIANT_COLUMNS
        )

    @classmethod
    def available_durations(cls, df: pd.DataFrame) -> list[int]:
        """Discover complete persisted variants without trusting stale metadata."""

        if not cls._is_variant_aware(df):
            return []
        return [
            int(duration)
            for duration in SUPPORTED_FIXATION_MIN_DURATIONS_MS
            if all(
                fixation_duration_column(base, duration) in df.columns
                for base in FIXATION_DURATION_VARIANT_COLUMNS
            )
        ]

    @classmethod
    def select_variant(
        cls,
        df: pd.DataFrame,
        min_fixation_duration_ms: object = DEFAULT_FIXATION_MIN_DURATION_MS,
    ) -> pd.DataFrame:
        """Return a copied frame whose canonical columns expose one exact variant.

        Files created before duration variants existed are deliberately left
        untouched.  They do not contain enough provenance to claim that their
        unsuffixed columns represent any newly requested threshold.
        """

        requested = cls.validate_duration(min_fixation_duration_ms)
        # The frame can contain wide EEG/GSR channels.  A shallow structural
        # copy lets us replace only the five canonical fixation columns without
        # duplicating every unrelated signal buffer on each request.
        selected = df.copy(deep=False)
        selected.attrs = deepcopy(dict(getattr(df, "attrs", {}) or {}))
        selected.attrs[cls.REQUESTED_DURATION_ATTR] = requested

        if not cls._is_variant_aware(df):
            if requested != int(DEFAULT_FIXATION_MIN_DURATION_MS):
                raise ValueError(
                    f"Requested {requested} ms fixation variant is unavailable for "
                    "this legacy file. Reprocess the project to generate the "
                    "100, 150, 200, 250 and 300 ms variants."
                )
            warning = (
                "this legacy file does not advertise persisted duration variants; "
                "stored fixation columns were used unchanged and their minimum "
                "duration is unknown. Reprocess the project to enable comparison"
            )
            warnings = list(selected.attrs.get(cls.VARIANT_WARNINGS_ATTR, []) or [])
            selected.attrs[cls.VARIANT_WARNINGS_ATTR] = list(
                dict.fromkeys([*warnings, warning])
            )
            return selected

        available = cls.available_durations(df)
        if requested not in available:
            available_text = (
                ", ".join(f"{duration} ms" for duration in available)
                if available
                else "none (the persisted variant columns are incomplete)"
            )
            raise ValueError(
                f"Requested {requested} ms fixation variant is unavailable. "
                f"Available persisted variants: {available_text}."
            )

        for base in FIXATION_DURATION_VARIANT_COLUMNS:
            source = fixation_duration_column(base, requested)
            if source != base:
                selected[base] = selected[source].copy()

        selected[FIXATION_MIN_DURATION_COLUMN] = requested
        selected.attrs[FIXATION_MIN_DURATION_COLUMN] = requested
        selected.attrs[cls.AVAILABLE_DURATIONS_FIELD] = list(available)

        fixation_metadata = deepcopy(selected.attrs.get("fixation", {}))
        if not isinstance(fixation_metadata, dict):
            fixation_metadata = {}
        fixation_metadata[FIXATION_MIN_DURATION_COLUMN] = requested
        fixation_metadata[cls.AVAILABLE_DURATIONS_FIELD] = list(available)
        selected.attrs["fixation"] = fixation_metadata
        return selected

    @classmethod
    def compute_sensitivity(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
    ) -> dict:
        """Summarise fixation/dwell sensitivity for every persisted duration."""

        available = cls.available_durations(df)
        if available and 100 not in available:
            raise ValueError(
                "Cannot compute fixation-duration sensitivity because the required "
                "100 ms baseline variant is unavailable."
            )

        points: list[dict] = []
        metadata: Optional[dict] = None
        totals: dict[int, float] = {}
        for duration in available:
            events, point_metadata = FixationEventService.build_events(
                df,
                scenario=scenario,
                min_fixation_duration_ms=duration,
            )
            if duration == int(DEFAULT_FIXATION_MIN_DURATION_MS) or metadata is None:
                metadata = point_metadata

            durations_ms = events["duration_s"].to_numpy(dtype=float) * 1000.0
            total_duration_ms = float(durations_ms.sum()) if durations_ms.size else 0.0
            totals[duration] = total_duration_ms
            points.append(
                {
                    "min_fixation_duration_ms": duration,
                    "n_fixations": int(durations_ms.size),
                    "total_duration_ms": round(total_duration_ms, 2),
                    "mean_duration_ms": round(float(durations_ms.mean()), 2)
                    if durations_ms.size
                    else 0.0,
                    "median_duration_ms": round(float(np.median(durations_ms)), 2)
                    if durations_ms.size
                    else 0.0,
                    "max_duration_ms": round(float(durations_ms.max()), 2)
                    if durations_ms.size
                    else 0.0,
                }
            )

        baseline_total = totals.get(100, 0.0)
        for point in points:
            retained = (
                (totals[point["min_fixation_duration_ms"]] / baseline_total) * 100.0
                if baseline_total > 0.0
                else 0.0
            )
            point["retained_dwell_percent"] = round(float(retained), 2)

        if metadata is None:
            _, metadata = FixationEventService.build_events(df, scenario=scenario)
        metadata = dict(metadata)
        metadata["available_min_fixation_durations_ms"] = list(available)
        return {
            "points": points,
            "default_min_fixation_duration_ms": int(DEFAULT_FIXATION_MIN_DURATION_MS),
            **metadata,
        }


class FixationEventService:
    """Build one canonical fixation-event table for every spatial analytic.

    Detector-v2 Parquets are event-labelled sample streams.  Legacy Parquets are
    adapted through the old proximity semantics, but invalid rows always break an
    event so missing/saccade intervals are never charged to a neighbouring
    fixation.
    """

    EVENT_COLUMNS = [
        "id",
        "x_norm",
        "y_norm",
        "time_s",
        "t_end_s",
        "duration_s",
        "detector_sample_count",
        "source_row_count",
        "segment_id",
    ]
    V2_COLUMNS = {
        "time",
        "fix_x",
        "fix_y",
        "fixation_id",
        "fixation_segment_id",
        "fixation_method",
        "fixation_detector_version",
    }
    _GAP_FLOOR_S = 0.100
    _GAP_MULTIPLIER = 3.0
    _DEFAULT_BRIDGE_GAP_S = 0.075
    # A V2 export can never carry a detection rate above its own row grid, so a
    # declared rate that does is treated as stale metadata and is not used to
    # rebuild the detector duration.
    _RATE_CONSISTENCY_TOLERANCE = 0.05
    # Legacy containment: one isolated row proves a sample, not a fixation, so
    # it never becomes an event.  Documented in docs/FIXATION_V2.md.
    _LEGACY_MIN_SOURCE_ROWS = 2

    @classmethod
    def empty_events(cls) -> pd.DataFrame:
        return pd.DataFrame(columns=cls.EVENT_COLUMNS)

    @staticmethod
    def _scope(df: pd.DataFrame, scenario: Optional[str]) -> pd.DataFrame:
        attrs = dict(getattr(df, "attrs", {}) or {})
        scoped = scope_to_scenario(df, scenario)
        scoped = scoped.copy(deep=False)
        scoped.attrs.update(attrs)
        return scoped

    @staticmethod
    def _first_text(df: pd.DataFrame, names: tuple[str, ...]) -> Optional[str]:
        for name in names:
            if name not in df.columns:
                continue
            values = df[name].dropna().astype(str).str.strip()
            values = values[~values.str.lower().isin({"", "nan", "none", "null"})]
            if not values.empty:
                return str(values.iloc[0])
        return None

    @staticmethod
    def _metadata_value(df: pd.DataFrame, names: tuple[str, ...]):
        attrs = dict(getattr(df, "attrs", {}) or {})
        containers = [attrs]
        for key in ("fixation", "fixation_metadata", "processing_metadata", "metadata"):
            nested = attrs.get(key)
            if isinstance(nested, dict):
                containers.append(nested)

        for container in containers:
            for name in names:
                if name in container and container[name] is not None:
                    return container[name]

        for name in names:
            if name not in df.columns:
                continue
            values = df[name].dropna()
            if not values.empty:
                return values.iloc[0]
        return None

    @staticmethod
    def _as_positive_float(value) -> Optional[float]:
        if value is None:
            return None
        try:
            parsed = float(str(value).strip().replace(",", "."))
        except (TypeError, ValueError):
            return None
        return parsed if np.isfinite(parsed) and parsed > 0 else None

    @classmethod
    def _effective_rate(cls, df: pd.DataFrame) -> tuple[Optional[float], bool]:
        declared = cls._as_positive_float(
            cls._metadata_value(
                df,
                (
                    "fixation_effective_rate_hz",
                    "effective_sampling_rate_hz",
                    "effective_rate_hz",
                    "file_frequency_hz",
                    "sampling_frequency_hz",
                ),
            )
        )
        if declared is not None:
            return declared, False

        if "time" not in df.columns:
            return None, False
        times = pd.to_numeric(df["time"], errors="coerce").to_numpy(dtype=float)
        times = times[np.isfinite(times)]
        if times.size < 2:
            return None, False
        rate = _infer_fs(times, default=0.0)
        return (rate, True) if rate > 0 and np.isfinite(rate) else (None, False)

    @staticmethod
    def _warning_list(value) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            try:
                decoded = json.loads(text)
            except (TypeError, ValueError, json.JSONDecodeError):
                return [text]
            if isinstance(decoded, list):
                return [str(item) for item in decoded if str(item).strip()]
            return [str(decoded)] if str(decoded).strip() else []
        if isinstance(value, (list, tuple, set)):
            return [str(item) for item in value if str(item).strip()]
        return [str(value)]

    @classmethod
    def _metadata(cls, df: pd.DataFrame, *, is_v2: bool, fallback_source: str = "") -> dict:
        warnings = cls._warning_list(
            cls._metadata_value(
                df,
                ("fixation_warnings", "fixation_warning", "quality_warnings"),
            )
        )
        warnings.extend(
            cls._warning_list(
                cls._metadata_value(
                    df,
                    (FixationDurationVariantService.VARIANT_WARNINGS_ATTR,),
                )
            )
        )
        effective_rate, inferred = cls._effective_rate(df)
        if inferred:
            warnings.append("effective sampling rate inferred from timestamps")

        duration_value = cls._metadata_value(df, (FIXATION_MIN_DURATION_COLUMN,))
        try:
            min_fixation_duration_ms = (
                FixationDurationVariantService.validate_duration(duration_value)
                if duration_value is not None
                else None
            )
        except ValueError:
            min_fixation_duration_ms = None
            warnings.append(
                f"stored {FIXATION_MIN_DURATION_COLUMN} value is invalid and was ignored"
            )
        available_durations = FixationDurationVariantService.available_durations(df)

        if is_v2:
            version = cls._first_text(df, ("fixation_detector_version",)) or str(
                cls._metadata_value(df, ("fixation_detector_version", "algorithm_version"))
                or "fixation-v2"
            )
            method = cls._first_text(df, ("fixation_method",)) or str(
                cls._metadata_value(df, ("fixation_method", "method")) or "unknown"
            )
            source = "raw_gaze"
        else:
            version = "legacy-adapter-v1"
            method = "legacy_proximity"
            source = fallback_source or "legacy_fixation_columns"
            warnings.append(
                "legacy adapter: these fixation events and their durations are "
                "estimates rebuilt from stored samples, not detector output"
            )

        return {
            "algorithm_version": version,
            "method": method,
            "source": source,
            # False only when the events come from a detector-v2 export; every
            # legacy event is inferred and must be read as an estimate.
            "estimated": not is_v2,
            "effective_sampling_rate_hz": (
                float(effective_rate) if effective_rate is not None else None
            ),
            "min_fixation_duration_ms": min_fixation_duration_ms,
            "available_min_fixation_durations_ms": available_durations,
            "warnings": list(dict.fromkeys(warnings)),
        }

    @staticmethod
    def _normalise_identifier(value) -> Optional[str]:
        if value is None or pd.isna(value):
            return None
        if isinstance(value, (int, np.integer)):
            return str(int(value))
        if isinstance(value, (float, np.floating)) and np.isfinite(value) and float(value).is_integer():
            return str(int(value))
        text = str(value).strip()
        return text if text and text.lower() not in {"nan", "none", "null"} else None

    @classmethod
    def _normalised_coordinates(
        cls,
        df: pd.DataFrame,
        x_col: str,
        y_col: str,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
        """Normalise stored fixation coordinates and reject off-screen rows.

        A coordinate outside the screen is evidence that the row is not a
        usable fixation sample, so it is dropped.  Clamping it to the border
        instead would move real attention onto an edge it never visited, and
        the edge would then win AOI hits and heatmap weight.
        """

        x = pd.to_numeric(df[x_col], errors="coerce").to_numpy(dtype=float)
        y = pd.to_numeric(df[y_col], errors="coerce").to_numpy(dtype=float)
        finite = np.isfinite(x) & np.isfinite(y)
        sentinel = np.isclose(x, -100.0, atol=1e-6) & np.isclose(y, -100.0, atol=1e-6)

        unit = str(
            cls._metadata_value(
                df,
                ("fixation_coordinate_unit", "fixation_coordinate_scale", "coordinate_unit"),
            )
            or ""
        ).strip().lower()
        if unit in {"normalized", "normalised", "0-1", "fraction"}:
            scale = 1.0
        elif unit in {"percent", "percentage", "0-100", "%"}:
            scale = 100.0
        else:
            usable = np.concatenate([np.abs(x[finite & ~sentinel]), np.abs(y[finite & ~sentinel])])
            scale = 1.0 if usable.size and float(np.nanmax(usable)) <= 1.1 else 100.0

        x_norm = x / scale
        y_norm = y / scale
        on_screen = (
            (x_norm >= 0.0) & (x_norm <= 1.0) & (y_norm >= 0.0) & (y_norm <= 1.0)
        )
        candidate = finite & ~sentinel
        rejected = int(np.count_nonzero(candidate & ~on_screen))
        return x_norm, y_norm, candidate & on_screen, rejected

    @classmethod
    def _cadence_by_segment(
        cls,
        times: np.ndarray,
        segments: list[Optional[str]],
        effective_rate: Optional[float],
    ) -> dict[Optional[str], float]:
        fallback = 1.0 / effective_rate if effective_rate and effective_rate > 0 else 0.0
        cadence: dict[Optional[str], float] = {}
        for segment in dict.fromkeys(segments):
            segment_times = np.asarray(
                [time for time, key in zip(times, segments) if key == segment and np.isfinite(time)],
                dtype=float,
            )
            diffs = np.diff(segment_times)
            diffs = diffs[(diffs > 0) & np.isfinite(diffs)]
            cadence[segment] = float(np.median(diffs)) if diffs.size else fallback
        return cadence

    @staticmethod
    def _support_runs(
        positions: np.ndarray,
        times: np.ndarray,
        gap_limit_s: Optional[float],
    ) -> list[tuple[int, int]]:
        """Split an event wherever its rows stop proving continuous support.

        A dropped source row, a backwards clock and a gap longer than the
        bridge limit all end a run.  A repeated timestamp does not: it is an
        export-grid artefact, and restarting a run there would pay its closing
        period twice.
        """

        starts = [0]
        for offset in range(1, int(positions.size)):
            dt = float(times[positions[offset]] - times[positions[offset - 1]])
            source_discontinuity = positions[offset] != positions[offset - 1] + 1
            time_discontinuity = (
                not np.isfinite(dt)
                or dt < 0.0
                or (gap_limit_s is not None and dt > gap_limit_s)
            )
            if source_discontinuity or time_discontinuity:
                starts.append(offset)
        starts.append(int(positions.size))
        return list(zip(starts[:-1], starts[1:]))

    @staticmethod
    def _row_support_seconds(
        positions: np.ndarray,
        times: np.ndarray,
        runs: list[tuple[int, int]],
        cadence_s: float,
    ) -> float:
        """Sum only the support the surviving rows prove, as the detector does.

        Every interval between two consecutive rows contributes at most one
        sampling period, so a short stretch of absent rows cannot be charged
        back as dwell, and each run closes with one period for its last row.
        """

        cadence = max(0.0, float(cadence_s))
        total = 0.0
        for start_offset, end_offset in runs:
            window = positions[start_offset:end_offset]
            for previous, current in zip(window[:-1], window[1:]):
                dt = float(times[current] - times[previous])
                if not np.isfinite(dt) or dt <= 0.0:
                    continue
                total += min(dt, cadence) if cadence > 0.0 else dt
            total += cadence
        return total

    @classmethod
    def _event_from_run(
        cls,
        run: list[int],
        *,
        event_id: str,
        segment_id: Optional[str],
        x_norm: np.ndarray,
        y_norm: np.ndarray,
        times: np.ndarray,
        cadence_s: float,
        detector_counts: Optional[np.ndarray] = None,
        gap_limit_s: Optional[float] = None,
        detector_rate_hz: Optional[float] = None,
        warnings: Optional[list[str]] = None,
    ) -> dict:
        positions = np.asarray(run, dtype=int)
        start = float(times[positions[0]])
        last = float(times[positions[-1]])
        cadence = max(0.0, float(cadence_s))
        end = max(start, last + cadence)
        source_count = int(positions.size)

        runs = cls._support_runs(positions, times, gap_limit_s)
        row_support_s = cls._row_support_seconds(positions, times, runs, cadence)
        span_s = max(0.0, last - start)

        detector_count = source_count
        counted_by_detector = False
        if detector_counts is not None:
            candidates = detector_counts[positions]
            candidates = candidates[np.isfinite(candidates) & (candidates >= 0)]
            if candidates.size:
                stored_count = int(round(float(np.max(candidates))))
                # Every detector sample is fed by at least one source row, so a
                # stored count above the rows this event actually kept describes
                # something wider than the event and is clamped to what is here.
                detector_count = min(stored_count, source_count)
                counted_by_detector = True
                if warnings is not None and stored_count > source_count:
                    warnings.append(
                        f"fixation {event_id}: stored detector sample count "
                        f"({stored_count}) exceeds its {source_count} exported row(s) "
                        "and was clamped"
                    )

        duration = row_support_s
        # Without a stored count the rows are all there is; reading the row
        # count as a detector count would multiply a resampled event's dwell.
        if detector_rate_hz and counted_by_detector and detector_count > 0:
            # The detector reports valid support as a sample count on its own
            # grid; count / rate is that same support, not a new heuristic.
            detector_period = 1.0 / float(detector_rate_hz)
            detector_support_s = float(detector_count) * detector_period
            # The event's rows span ``span_s`` and its last detector sample
            # supports one detection period past them, which on a resampled
            # export is longer than the one exported row the grid cadence buys.
            detector_wall_s = span_s + max(cadence, detector_period)
            if np.isfinite(detector_support_s) and (
                0.0 < detector_support_s <= detector_wall_s + 1e-9
            ):
                duration = detector_support_s
                tolerance = max(cadence, detector_period)
                if warnings is not None and abs(detector_support_s - row_support_s) > tolerance:
                    warnings.append(
                        f"fixation {event_id}: detector support "
                        f"({detector_support_s * 1000.0:.1f} ms) and exported row support "
                        f"({row_support_s * 1000.0:.1f} ms) disagree; the detector value was kept"
                    )
            elif warnings is not None:
                warnings.append(
                    f"fixation {event_id}: stored detector metadata does not fit its "
                    "timestamps; duration was measured from the exported rows"
                )

        return {
            "id": event_id,
            "x_norm": round(float(np.median(x_norm[positions])), 6),
            "y_norm": round(float(np.median(y_norm[positions])), 6),
            "time_s": round(start, 6),
            "t_end_s": round(end, 6),
            "duration_s": round(duration, 6),
            "detector_sample_count": detector_count,
            "source_row_count": source_count,
            "segment_id": segment_id,
        }

    @classmethod
    def _from_v2(cls, df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
        metadata = cls._metadata(df, is_v2=True)
        if df.empty:
            return cls.empty_events(), metadata

        x_norm, y_norm, valid_coordinates, off_screen = cls._normalised_coordinates(
            df, "fix_x", "fix_y"
        )
        if off_screen:
            metadata["warnings"].append(
                f"{off_screen} fixation row(s) fell outside the screen and were rejected"
            )
        times = pd.to_numeric(df["time"], errors="coerce").to_numpy(dtype=float)
        fixation_ids = [cls._normalise_identifier(value) for value in df["fixation_id"]]
        raw_segment_ids = [
            cls._normalise_identifier(value) for value in df["fixation_segment_id"]
        ]
        participant_ids = (
            [cls._normalise_identifier(value) for value in df["_participant_code"]]
            if "_participant_code" in df.columns
            else [None] * len(df)
        )
        segment_ids = [
            (
                f"{participant_id}:{segment_id}"
                if participant_id is not None and segment_id is not None
                else participant_id or segment_id
            )
            for participant_id, segment_id in zip(participant_ids, raw_segment_ids)
        ]
        valid = valid_coordinates & np.isfinite(times) & np.asarray(
            [value is not None for value in fixation_ids], dtype=bool
        )
        # The ingestion mask is authoritative for an applied transform.  In
        # particular, a labelled fixation row in a letterbox/cropped region is
        # not allowed to survive merely because its stored fixation coordinate
        # looks finite.
        valid &= valid_stimulus_gaze_mask(df).to_numpy(dtype=bool)
        hard_boundaries = hard_stimulus_boundary_mask(df)
        stimulus_epochs = np.cumsum(hard_boundaries.astype(int))

        detector_counts = None
        for name in ("fixation_detector_sample_count", "detector_sample_count"):
            if name in df.columns:
                detector_counts = pd.to_numeric(df[name], errors="coerce").to_numpy(dtype=float)
                break

        effective_rate = metadata.get("effective_sampling_rate_hz")
        cadence = cls._cadence_by_segment(times, segment_ids, effective_rate)
        positive_diffs = np.diff(times[np.isfinite(times)])
        positive_diffs = positive_diffs[(positive_diffs > 0) & np.isfinite(positive_diffs)]
        median_dt = float(np.median(positive_diffs)) if positive_diffs.size else 0.0
        configured_bridge_ms = cls._as_positive_float(
            cls._metadata_value(
                df,
                ("fixation_bridge_gap_ms", "max_bridge_gap_ms", "fixation_max_gap_ms"),
            )
        )
        bridge_floor = (
            configured_bridge_ms / 1000.0
            if configured_bridge_ms is not None
            else cls._DEFAULT_BRIDGE_GAP_S
        )
        bridge_gap_limit = max(bridge_floor, cls._GAP_MULTIPLIER * median_dt)

        # Only a rate the export actually declared can stand in for the
        # detector's own valid support.  A rate inferred from this frame's
        # timestamps describes the row grid, which for a resampled export is
        # several times faster than the eye clock the detector ran on.
        declared_rate, rate_inferred = cls._effective_rate(df)
        observed_grid_rate = 1.0 / median_dt if median_dt > 0 else None
        detector_rate: Optional[float] = None
        if declared_rate is not None and not rate_inferred:
            if observed_grid_rate is None or declared_rate <= observed_grid_rate * (
                1.0 + cls._RATE_CONSISTENCY_TOLERANCE
            ):
                detector_rate = float(declared_rate)
            else:
                metadata["warnings"].append(
                    "declared effective sampling rate exceeds the exported row grid; "
                    "fixation durations were measured from the exported rows"
                )

        grouped_positions: dict[tuple[Optional[str], int, str], list[int]] = {}
        for position in range(len(df)):
            if not valid[position] or fixation_ids[position] is None:
                continue
            key = (
                segment_ids[position],
                int(stimulus_epochs[position]),
                fixation_ids[position],
            )
            grouped_positions.setdefault(key, []).append(position)

        events: list[dict] = []
        for (raw_segment_id, stimulus_epoch, fixation_id), positions in grouped_positions.items():
            segment_id = (
                raw_segment_id
                if stimulus_epoch == 0
                else f"{raw_segment_id or 'segment'}:stimulus-span-{stimulus_epoch}"
            )
            canonical_id = f"{segment_id}:{fixation_id}" if segment_id is not None else fixation_id
            event_spans: list[list[int]] = []
            for position in positions:
                if not event_spans:
                    event_spans.append([position])
                    continue
                previous = event_spans[-1][-1]
                dt = times[position] - times[previous]
                another_event_between = bool(valid[previous + 1 : position].any())
                off_stimulus_between = bool(
                    hard_boundaries[previous + 1 : position].any()
                )
                # A repeated timestamp is an export-grid artefact, not a second
                # visit: splitting on it would turn one event into one event per
                # exported row.  Only a backwards clock is a real break.
                long_discontinuity = (
                    not np.isfinite(dt) or dt < 0 or dt > bridge_gap_limit
                )
                if another_event_between or off_stimulus_between or long_discontinuity:
                    event_spans.append([position])
                else:
                    event_spans[-1].append(position)

            if len(event_spans) > 1:
                metadata["warnings"].append(
                    f"fixation {canonical_id} reappeared after a long discontinuity and was split into {len(event_spans)} events"
                )

            for span_number, span_positions in enumerate(event_spans, start=1):
                event_id = canonical_id if span_number == 1 else f"{canonical_id}#span{span_number}"
                span_segment_id = (
                    segment_id
                    if len(event_spans) == 1
                    else f"{segment_id or 'segment'}:span{span_number}"
                )
                short_gaps = sum(
                    current != previous + 1
                    for previous, current in zip(span_positions, span_positions[1:])
                )
                if short_gaps:
                    metadata["warnings"].append(
                        f"fixation {event_id} contains {short_gaps} bridged gap(s); gaps were excluded from duration"
                    )
                events.append(
                    cls._event_from_run(
                        span_positions,
                        event_id=event_id,
                        segment_id=span_segment_id,
                        x_norm=x_norm,
                        y_norm=y_norm,
                        times=times,
                        cadence_s=cadence.get(raw_segment_id, 0.0),
                        detector_counts=detector_counts,
                        gap_limit_s=bridge_gap_limit,
                        # A stored count describes the whole identifier, so it
                        # cannot be spread over the spans a defensive split made.
                        detector_rate_hz=(
                            detector_rate if len(event_spans) == 1 else None
                        ),
                        warnings=metadata["warnings"],
                    )
                )

        metadata["warnings"] = list(dict.fromkeys(metadata["warnings"]))
        event_frame = pd.DataFrame(events, columns=cls.EVENT_COLUMNS)
        if not event_frame.empty:
            event_frame = event_frame.sort_values(["time_s", "id"], kind="stable").reset_index(drop=True)
        return event_frame, metadata

    @classmethod
    def _legacy_events(
        cls,
        df: pd.DataFrame,
        proximity_threshold: float,
    ) -> tuple[pd.DataFrame, dict]:
        if df.empty or "time" not in df.columns:
            return cls.empty_events(), cls._metadata(
                df, is_v2=False, fallback_source="legacy_fixation_columns"
            )

        source = "legacy_fixation_columns"
        working = df.copy()
        off_screen = 0
        if {"fix_x", "fix_y"}.issubset(working.columns):
            x_norm, y_norm, valid, off_screen = cls._normalised_coordinates(
                working, "fix_x", "fix_y"
            )
        else:
            valid = np.zeros(len(working), dtype=bool)
            x_norm = np.full(len(working), np.nan, dtype=float)
            y_norm = np.full(len(working), np.nan, dtype=float)

        if not valid.any() and {"gx", "gy"}.issubset(working.columns):
            source = "legacy_gaze_fallback"
            working, _ = PupilAnalyticsService._gaze_in_output_space(working)
            x_norm = pd.to_numeric(working["gx_clean"], errors="coerce").to_numpy(dtype=float) / 100.0
            y_norm = pd.to_numeric(working["gy_clean"], errors="coerce").to_numpy(dtype=float) / 100.0
            valid = (
                np.isfinite(x_norm)
                & np.isfinite(y_norm)
                & (x_norm >= 0.0)
                & (x_norm <= 1.0)
                & (y_norm >= 0.0)
                & (y_norm <= 1.0)
            )
            valid &= valid_stimulus_gaze_mask(working).to_numpy(dtype=bool)

        metadata = cls._metadata(working, is_v2=False, fallback_source=source)
        if source == "legacy_gaze_fallback":
            metadata["method"] = "legacy_gaze_proximity"
            metadata["warnings"].append(
                "fixation events inferred from cleaned gaze because labelled fixation columns were unavailable"
            )
        if off_screen:
            metadata["warnings"].append(
                f"{off_screen} legacy fixation row(s) fell outside the screen and were "
                "rejected instead of being pulled onto the border"
            )

        times = pd.to_numeric(working["time"], errors="coerce").to_numpy(dtype=float)
        valid &= np.isfinite(times)
        effective_rate = metadata.get("effective_sampling_rate_hz")
        cadence = 1.0 / effective_rate if effective_rate and effective_rate > 0 else 0.0
        positive_diffs = np.diff(times[np.isfinite(times)])
        positive_diffs = positive_diffs[(positive_diffs > 0) & np.isfinite(positive_diffs)]
        median_dt = float(np.median(positive_diffs)) if positive_diffs.size else cadence
        cadence = median_dt if median_dt > 0 else cadence
        gap_limit = max(cls._GAP_FLOOR_S, cls._GAP_MULTIPLIER * median_dt)

        events: list[dict] = []
        run: list[int] = []
        segment_number = 0
        event_number = 0
        isolated_rows = 0
        cx = cy = 0.0

        def flush() -> None:
            nonlocal run, event_number, isolated_rows, cx, cy
            if not run:
                return
            # A run this short is a transition sample between two fixations, or
            # the single survivor of a rejected stretch.  Legacy data carries no
            # detector labels to tell those apart, so it never becomes an event.
            if len(run) < cls._LEGACY_MIN_SOURCE_ROWS:
                isolated_rows += 1
                run = []
                cx = cy = 0.0
                return
            event_number += 1
            events.append(
                cls._event_from_run(
                    run,
                    event_id=f"legacy-{event_number}",
                    segment_id=f"legacy-segment-{segment_number}",
                    x_norm=x_norm,
                    y_norm=y_norm,
                    times=times,
                    cadence_s=cadence,
                    gap_limit_s=gap_limit,
                )
            )
            run = []
            cx = cy = 0.0

        for position in range(len(working)):
            if not valid[position]:
                if run:
                    flush()
                segment_number += 1
                continue

            if run:
                dt = times[position] - times[run[-1]]
                distance_sq = (float(x_norm[position]) - cx) ** 2 + (float(y_norm[position]) - cy) ** 2
                if not np.isfinite(dt) or dt <= 0 or dt > gap_limit or distance_sq > proximity_threshold ** 2:
                    flush()
                    segment_number += 1

            if not run:
                segment_number += 1
                cx = float(x_norm[position])
                cy = float(y_norm[position])
            run.append(position)
            count = len(run)
            cx += (float(x_norm[position]) - cx) / count
            cy += (float(y_norm[position]) - cy) / count
        flush()

        if isolated_rows:
            metadata["warnings"].append(
                f"{isolated_rows} isolated legacy row(s) were discarded: an event needs at "
                f"least {cls._LEGACY_MIN_SOURCE_ROWS} consecutive rows"
            )
        metadata["warnings"] = list(dict.fromkeys(metadata["warnings"]))
        return pd.DataFrame(events, columns=cls.EVENT_COLUMNS), metadata

    @classmethod
    def build_events(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        proximity_threshold: float = 0.03,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> tuple[pd.DataFrame, dict]:
        selected = (
            FixationDurationVariantService.select_variant(
                df,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
            if min_fixation_duration_ms is not None
            else df
        )
        scoped = cls._scope(selected, scenario)
        if cls.V2_COLUMNS.issubset(scoped.columns):
            events, metadata = cls._from_v2(scoped)
        else:
            events, metadata = cls._legacy_events(scoped, proximity_threshold)
        return events, attach_transform_provenance(metadata, scoped)


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
        events, metadata = FixationEventService.build_events(
            df,
            scenario=scenario,
            min_fixation_duration_ms=min_fixation_duration_ms,
        )
        if events.empty:
            return None, metadata

        import io
        from scipy.ndimage import gaussian_filter
        import matplotlib.cm as cm
        from PIL import Image

        out_w, out_h = resolve_output_size(width, height)

        durations = events["duration_s"].to_numpy(dtype=float)
        positive_durations = durations[np.isfinite(durations) & (durations > 0)]
        fallback_weight = float(np.median(positive_durations)) if positive_durations.size else 1.0
        weights = np.where(np.isfinite(durations) & (durations > 0), durations, fallback_weight)

        # --- Normalised (top-left origin) to stimulus pixels. No Y inversion:
        # y_norm already grows downwards, exactly as scanpath and AOIs read it.
        x_px = events["x_norm"].to_numpy(dtype=float) * out_w
        y_px = events["y_norm"].to_numpy(dtype=float) * out_h

        # --- Reject points outside image bounds; never clip them to an edge ---
        valid = (
            np.isfinite(x_px) & np.isfinite(y_px)
            & (x_px >= 0) & (x_px <= out_w)
            & (y_px >= 0) & (y_px <= out_h)
        )
        x_px = x_px[valid]
        y_px = y_px[valid]
        weights = weights[valid]

        if x_px.size == 0:
            return None, metadata

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
        return buf.getvalue(), metadata


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

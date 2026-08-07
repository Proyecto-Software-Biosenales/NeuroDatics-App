from typing import Iterable, Optional

import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter
from scipy.signal import spectrogram, welch

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
        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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
        if scenario and str(scenario).strip().lower() != "all":
            if "scenario" not in df.columns:
                df = df.iloc[0:0]
            else:
                from pathlib import Path as _Path

                scenario_values = df["scenario"].astype(str).str.strip()
                target = str(scenario).strip()
                mask = scenario_values == target
                if not mask.any():
                    def _norm(name: str) -> str:
                        return _Path(str(name).strip()).stem.lower().replace(" ", "")

                    target_stem = _norm(target)
                    mask = scenario_values.map(_norm) == target_stem
                df = df.loc[mask]

        if "time" not in df.columns or df.empty:
            return {
                "requested_time_s": round(t_s, 4),
                "nearest_time_s": 0.0,
                "scenario": None,
                "gx": None,
                "gy": None,
            }

        clean = df.copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        clean = clean.dropna(subset=["time"])
        if clean.empty:
            return {
                "requested_time_s": round(t_s, 4),
                "nearest_time_s": 0.0,
                "scenario": None,
                "gx": None,
                "gy": None,
            }

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

        # The temporal gaze chart uses this same cleaning pipeline. Reusing it
        # here keeps the point-on-stimulus preview aligned with the clicked
        # curve and fills the short gaps that otherwise produced a missing dot.
        clean = clean.sort_values("time").reset_index(drop=True)
        clean = PupilAnalyticsService._clean_gaze(clean)
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

        return {
            "requested_time_s": round(t_s, 4),
            "nearest_time_s": round(nearest_time, 4),
            "scenario": scenario,
            "gx": round(gx, 2) if gx is not None else None,
            "gy": round(gy, 2) if gy is not None else None,
        }

    @staticmethod
    def compute_scenario_relative_time(
        df: pd.DataFrame,
        scenario: Optional[str],
        absolute_time_s: Optional[float],
    ) -> Optional[float]:
        """Convert a global sample time to time elapsed within a scenario."""
        if (
            not scenario
            or absolute_time_s is None
            or "time" not in df.columns
            or "scenario" not in df.columns
            or df.empty
        ):
            return None

        clean = df.dropna(subset=["time"])
        if clean.empty:
            return None

        scenario_values = clean["scenario"].astype(str).str.strip()
        target = str(scenario).strip()
        subset = clean[scenario_values == target]

        if subset.empty:
            from pathlib import Path as _Path

            def _norm(name: str) -> str:
                return _Path(str(name).strip()).stem.lower().replace(" ", "")

            target_stem = _norm(target)
            subset = clean[scenario_values.map(_norm) == target_stem]

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
    def compute_gaze_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute cleaned gaze X/Y timeseries."""
        _empty: dict = {"time": [], "gx_clean": [], "gy_clean": []}

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
            return _empty

        df = _filter_time_window(df, start_time_s, end_time_s)

        df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if df.empty:
            return _empty

        df = PupilAnalyticsService._clean_gaze(df)

        def _safe_list(arr: np.ndarray) -> list:
            return [0.0 if not np.isfinite(float(v)) else round(float(v), 4) for v in arr]

        return {
            "time": df["time"].astype(float).tolist(),
            "gx_clean": _safe_list(df["gx_clean"].to_numpy(dtype=float)),
            "gy_clean": _safe_list(df["gy_clean"].to_numpy(dtype=float)),
        }

    @staticmethod
    def compute_gaze_statistics(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute statistics for cleaned gaze X and Y signals."""
        _empty: dict = {
            "gx_mean": 0.0, "gx_min": 0.0, "gx_max": 0.0,
            "gx_std": 0.0, "gx_median": 0.0, "gx_baseline": 0.0,
            "gy_mean": 0.0, "gy_min": 0.0, "gy_max": 0.0,
            "gy_std": 0.0, "gy_median": 0.0, "gy_baseline": 0.0,
        }

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
            return _empty

        df = _filter_time_window(df, start_time_s, end_time_s)

        df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if df.empty:
            return _empty

        df = PupilAnalyticsService._clean_gaze(df)

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

        return {
            "gx_mean": gx_s["mean"], "gx_min": gx_s["min"], "gx_max": gx_s["max"],
            "gx_std": gx_s["std"], "gx_median": gx_s["median"], "gx_baseline": gx_s["baseline"],
            "gy_mean": gy_s["mean"], "gy_min": gy_s["min"], "gy_max": gy_s["max"],
            "gy_std": gy_s["std"], "gy_median": gy_s["median"], "gy_baseline": gy_s["baseline"],
        }

    @staticmethod
    def compute_distance_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
    ) -> dict:
        """Compute eye-to-screen distance timeseries (mm -> cm)."""
        _empty: dict = {"time": [], "distance_cm": []}

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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
    ) -> pd.DataFrame:
        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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
    ) -> dict:
        """Compute raw and 1-second smoothed GSR timeseries."""
        _empty: dict = {"time": [], "gsr": [], "gsr_smooth": []}

        clean = GsrAnalyticsService._clean_signal(df, scenario, start_time_s, end_time_s)
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

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

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


class ScanpathAnalyticsService:
    """Computes scanpath objectives and statistics from fixation data."""

    # Reference resolution assumed for all images (screen resolution during experiment)
    REF_W: int = 1920
    REF_H: int = 1080

    @staticmethod
    def _filter_fixations(df: pd.DataFrame) -> pd.DataFrame:
        """
        Extract, validate, and normalize fixation columns.
        - Requires fix_x, fix_y, time columns.
        - Removes rows where fix_x == -100 AND fix_y == -100 (sentinel invalid).
        - Auto-normalizes 0-100 range to 0-1 if needed.
        - Clips to [0.0, 1.0].
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

        df["fix_x"] = df["fix_x"].clip(0.0, 1.0)
        df["fix_y"] = df["fix_y"].clip(0.0, 1.0)
        return df

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
        Normalize fixation durations to [0, 1] using robust p5-p95 percentile scaling.
        Returns 0.0 for the shortest fixations and 1.0 for the longest.
        When all durations are equal (p95 <= p5), returns 0.5 for all.
        """
        d = np.asarray(durations, dtype=float)
        if d.size == 0:
            return np.array([], dtype=float)
        p5, p95 = np.percentile(d, [5, 95])
        if p95 <= p5:
            return np.full_like(d, 0.5)
        return np.clip((d - p5) / (p95 - p5), 0.0, 1.0)

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
    ) -> dict:
        """
        Compute scanpath objectives and statistics from fixation data.

        Primary source: fix_x / fix_y fixation-event columns.
        Fallback: cleaned gx / gy gaze columns (via PupilAnalyticsService._clean_gaze).

        Returns dict with:
        - objectives: list of {id, cx, cy, duration_s, radius_norm, t_start, t_end, n_points}
        - n_objectives: int
        - total_distance_px: float  (assuming REF_W x REF_H = 1920x1080)
        - avg_duration_s: float
        """
        _empty = {
            "objectives": [],
            "n_objectives": 0,
            "total_distance_px": 0.0,
            "avg_duration_s": 0.0,
        }

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if df.empty:
            return _empty

        # --- Primary: fixation-event columns ---
        df_fix = cls._filter_fixations(df)

        if not df_fix.empty:
            xs = df_fix["fix_x"].astype(float).to_numpy()
            ys = df_fix["fix_y"].astype(float).to_numpy()
            times = df_fix["time"].astype(float).to_numpy()
        else:
            # --- Fallback: cleaned continuous gaze (gx/gy) ---
            if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
                return _empty

            df_gaze = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True).copy()
            if df_gaze.empty:
                return _empty

            df_gaze = PupilAnalyticsService._clean_gaze(df_gaze)

            gx_arr = df_gaze["gx_clean"].to_numpy(dtype=float)
            gy_arr = df_gaze["gy_clean"].to_numpy(dtype=float)
            t_arr = df_gaze["time"].to_numpy(dtype=float)

            # gx_clean/gy_clean are in 0-100 range; normalize to 0-1 and keep valid points
            valid = np.isfinite(gx_arr) & np.isfinite(gy_arr)
            if not valid.any():
                return _empty

            xs = np.clip(gx_arr[valid] / 100.0, 0.0, 1.0)
            ys = np.clip(gy_arr[valid] / 100.0, 0.0, 1.0)
            times = t_arr[valid]

        durs = cls._infer_durations(times)
        objs = cls._group_objectives(xs, ys, durs, times, proximity_threshold)
        if not objs:
            return _empty

        dur_arr = np.array([o["duration_s"] for o in objs], dtype=float)
        radii = cls._scale_radius(dur_arr)

        objectives_out = []
        for i, (o, r) in enumerate(zip(objs, radii), start=1):
            objectives_out.append({
                "id": i,
                "cx": round(float(o["cx"]), 6),
                "cy": round(float(o["cy"]), 6),
                "duration_s": round(float(o["duration_s"]), 4),
                "radius_norm": round(float(r), 6),
                "t_start": round(float(o["t_start"]), 4),
                "t_end": round(float(o["t_end"]), 4),
                "n_points": int(o["n_points"]),
            })

        # Total path distance assuming 1920x1080 reference resolution
        total_dist = 0.0
        for i in range(1, len(objectives_out)):
            a = objectives_out[i - 1]
            b = objectives_out[i]
            dx = (b["cx"] - a["cx"]) * cls.REF_W
            dy = (b["cy"] - a["cy"]) * cls.REF_H
            total_dist += float(np.sqrt(dx * dx + dy * dy))

        avg_dur = float(np.mean(dur_arr)) if dur_arr.size else 0.0

        return {
            "objectives": objectives_out,
            "n_objectives": len(objectives_out),
            "total_distance_px": round(total_dist, 1),
            "avg_duration_s": round(avg_dur, 4),
        }


class FixationDataService:
    """Returns per-fixation data with timestamps for client-side heatmap rendering."""

    @classmethod
    def compute_fixation_data(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
    ) -> dict:
        """
        Extract fixation points with timestamps and compute statistics.

        Primary source: fix_x / fix_y columns (same filter as ScanpathAnalyticsService).
        Fallback: cleaned gx / gy gaze columns.

        Returns dict with keys:
          - fixations: list of {x_norm, y_norm, time_s, duration_s}
          - stats: {n_fixations, max_duration_s, avg_duration_s}
        """
        _empty = {
            "fixations": [],
            "stats": {"n_fixations": 0, "max_duration_s": 0.0, "avg_duration_s": 0.0},
        }

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if df.empty:
            return _empty

        # --- Primary: fixation-event columns ---
        df_fix = ScanpathAnalyticsService._filter_fixations(df)

        if not df_fix.empty:
            xs = df_fix["fix_x"].astype(float).to_numpy()
            ys = df_fix["fix_y"].astype(float).to_numpy()
            times = df_fix["time"].astype(float).to_numpy()
        else:
            # --- Fallback: cleaned continuous gaze (gx/gy) ---
            if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
                return _empty

            df_gaze = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True).copy()
            if df_gaze.empty:
                return _empty

            df_gaze = PupilAnalyticsService._clean_gaze(df_gaze)
            gx_arr = df_gaze["gx_clean"].to_numpy(dtype=float)
            gy_arr = df_gaze["gy_clean"].to_numpy(dtype=float)
            t_arr = df_gaze["time"].to_numpy(dtype=float)

            valid = np.isfinite(gx_arr) & np.isfinite(gy_arr)
            if not valid.any():
                return _empty

            xs = np.clip(gx_arr[valid] / 100.0, 0.0, 1.0)
            ys = np.clip(gy_arr[valid] / 100.0, 0.0, 1.0)
            times = t_arr[valid]

        if xs.size == 0:
            return _empty

        durs = ScanpathAnalyticsService._infer_durations(times)

        fixations = [
            {
                "x_norm": round(float(x), 6),
                "y_norm": round(float(y), 6),
                "time_s": round(float(t), 4),
                "duration_s": round(float(d), 4),
            }
            for x, y, t, d in zip(xs, ys, times, durs)
        ]

        n = len(fixations)

        # Compute duration stats from grouped objectives (consistent with ScanpathAnalyticsService)
        objs = ScanpathAnalyticsService._group_objectives(xs, ys, durs, times)
        if objs:
            obj_durs = np.array([o["duration_s"] for o in objs], dtype=float)
            max_dur = float(np.max(obj_durs))
            avg_dur = float(np.mean(obj_durs))
        else:
            dur_arr = np.array([f["duration_s"] for f in fixations], dtype=float)
            max_dur = float(np.max(dur_arr)) if n > 0 else 0.0
            avg_dur = float(np.mean(dur_arr)) if n > 0 else 0.0

        return {
            "fixations": fixations,
            "stats": {
                "n_fixations": n,
                "max_duration_s": round(max_dur, 4),
                "avg_duration_s": round(avg_dur, 4),
            },
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
        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
            return pd.DataFrame(), None, None

        sample_df = (
            df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True).copy()
        )
        if sample_df.empty:
            return sample_df, None, None

        sample_df = PupilAnalyticsService._clean_gaze(sample_df)

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
    def compute_metrics(cls, df: pd.DataFrame, scenario: str, aois: list) -> dict:
        ordered_aois = sorted(aois, key=lambda item: str(getattr(item, "name", "")).lower())
        fixation_data = FixationDataService.compute_fixation_data(df, scenario)
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
        assigned_sequence: list[Optional[str]] = []

        for fixation_index, fix in enumerate(fixations):
            x_norm = float(fix.get("x_norm", np.nan))
            y_norm = float(fix.get("y_norm", np.nan))
            assigned = None
            for aoi_def in aoi_defs:
                if np.isfinite(x_norm) and np.isfinite(y_norm) and cls._contains(aoi_def["shape"], x_norm, y_norm):
                    any_aoi_mask[fixation_index] = True
                    if assigned is None:
                        assigned = aoi_def["name"]
            assigned_sequence.append(assigned)

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
        for current in assigned_sequence:
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
        }


class HeatmapAnalyticsService:
    """Generates a heatmap PNG overlay from fixation/gaze data."""

    REF_W: int = 1920
    REF_H: int = 1080

    @classmethod
    def compute_heatmap_overlay(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        gamma: float = 0.7,
        threshold: float = 0.10,
        alpha: float = 0.75,
        flip_y: bool = True,
    ) -> Optional[bytes]:
        """
        Returns a REF_W x REF_H RGBA PNG (bytes) with a jet-colormap heatmap overlay,
        or None if there is no usable data.
        """
        import io
        from scipy.ndimage import gaussian_filter
        import matplotlib.cm as cm
        from PIL import Image

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if df.empty:
            return None

        # --- Data source: prefer fixations, fallback to cleaned gaze ---
        df_fix = ScanpathAnalyticsService._filter_fixations(df)

        if not df_fix.empty:
            # fix_x / fix_y are normalized 0-1 after _filter_fixations
            x_pct = df_fix["fix_x"].astype(float).to_numpy() * 100.0
            y_pct = df_fix["fix_y"].astype(float).to_numpy() * 100.0
        else:
            if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
                return None
            df_gaze = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True).copy()
            if df_gaze.empty:
                return None
            df_gaze = PupilAnalyticsService._clean_gaze(df_gaze)
            gx = df_gaze["gx_clean"].to_numpy(dtype=float)
            gy = df_gaze["gy_clean"].to_numpy(dtype=float)
            valid = np.isfinite(gx) & np.isfinite(gy)
            if not valid.any():
                return None
            x_pct = gx[valid]  # already in 0-100 range from _clean_gaze
            y_pct = gy[valid]

        # --- Convert percent to pixels ---
        x_px = x_pct * cls.REF_W / 100.0
        y_px = y_pct * cls.REF_H / 100.0
        if flip_y:
            y_px = cls.REF_H - y_px

        # --- Clip to image bounds ---
        valid = (
            np.isfinite(x_px) & np.isfinite(y_px)
            & (x_px >= 0) & (x_px <= cls.REF_W)
            & (y_px >= 0) & (y_px <= cls.REF_H)
        )
        x_px = x_px[valid]
        y_px = y_px[valid]

        if x_px.size == 0:
            return None

        # --- Auto bins and sigma based on reference resolution ---
        bins = int(np.clip(min(cls.REF_W, cls.REF_H) / 6, 200, 900))
        sigma = int(np.clip(min(cls.REF_W, cls.REF_H) / 50, 8, 60))

        # --- 2D histogram (shape will be bins x bins) ---
        H, _, _ = np.histogram2d(
            x_px, y_px,
            bins=bins,
            range=[[0, cls.REF_W], [0, cls.REF_H]],
        )
        H = H.T  # transpose: shape (bins, bins) -> (H_axis, W_axis)

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
        rgba_f = cm.jet(H)  # shape (bins, bins, 4), float 0-1
        # Set alpha: transparent where H==0, else `alpha`
        rgba_f[:, :, 3] = np.where(H > 0, alpha, 0.0)

        # --- Convert to uint8 and resize to REF_W x REF_H ---
        rgba_u8 = (rgba_f * 255).astype(np.uint8)
        img = Image.fromarray(rgba_u8, "RGBA")
        img = img.resize((cls.REF_W, cls.REF_H), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=False)
        return buf.getvalue()


class FixationHistogramService:
    """Builds fixation-duration histogram bins from grouped scanpath objectives."""

    @classmethod
    def compute_histogram(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
    ) -> dict:
        """Compute a Sturges-binned histogram of fixation durations in milliseconds."""
        _empty = {
            "bins": [],
            "n_fixations": 0,
            "total_duration_ms": 0.0,
            "mean_duration_ms": 0.0,
            "min_duration_ms": 0.0,
            "max_duration_ms": 0.0,
        }

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        df_clean = ScanpathAnalyticsService._filter_fixations(df)
        if df_clean.empty:
            return _empty

        times = df_clean["time"].astype(float).to_numpy()
        xs = df_clean["fix_x"].astype(float).to_numpy()
        ys = df_clean["fix_y"].astype(float).to_numpy()

        durs_s = ScanpathAnalyticsService._infer_durations(times)
        objs = ScanpathAnalyticsService._group_objectives(xs, ys, durs_s, times)

        durations_ms = np.array([o["duration_s"] * 1000.0 for o in objs], dtype=float)
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
        }

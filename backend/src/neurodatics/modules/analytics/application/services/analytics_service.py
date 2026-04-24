from typing import Optional

import numpy as np
import pandas as pd


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


class PupilAnalyticsService:
    """Stateless computation helpers for pupil data."""

    @staticmethod
    def compute_timeseries(df: pd.DataFrame, scenario: Optional[str] = None) -> dict:
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
    def compute_statistics(df: pd.DataFrame, scenario: Optional[str] = None) -> dict:
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
    def find_gaze_at(df: pd.DataFrame, t_s: float) -> dict:
        """Find gaze data at nearest time point."""
        if "time" not in df.columns or df.empty:
            return {
                "requested_time_s": round(t_s, 1),
                "nearest_time_s": 0.0,
                "scenario": None,
                "gx": None,
                "gy": None,
            }

        clean = df.dropna(subset=["time"])
        if clean.empty:
            return {
                "requested_time_s": round(t_s, 1),
                "nearest_time_s": 0.0,
                "scenario": None,
                "gx": None,
                "gy": None,
            }

        idx = (clean["time"] - t_s).abs().idxmin()
        row = clean.loc[idx]

        nearest_time = float(row["time"]) if pd.notna(row.get("time")) else 0.0
        scenario = (
            str(row["scenario"]).strip()
            if "scenario" in clean.columns and pd.notna(row.get("scenario"))
            else None
        )

        gx = float(row["gx"]) if "gx" in clean.columns and pd.notna(row.get("gx")) else None
        gy = float(row["gy"]) if "gy" in clean.columns and pd.notna(row.get("gy")) else None

        if gx is not None and (gx < 0 or gx > 100):
            gx = None
            gy = None
        if gy is not None and (gy < 0 or gy > 100):
            gx = None
            gy = None

        return {
            "requested_time_s": round(t_s, 1),
            "nearest_time_s": round(nearest_time, 4),
            "scenario": scenario,
            "gx": round(gx, 2) if gx is not None else None,
            "gy": round(gy, 2) if gy is not None else None,
        }

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
    def compute_gaze_timeseries(df: pd.DataFrame, scenario: Optional[str] = None) -> dict:
        """Compute cleaned gaze X/Y timeseries."""
        _empty: dict = {"time": [], "gx_clean": [], "gy_clean": []}

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "time" not in df.columns or "gx" not in df.columns or "gy" not in df.columns:
            return _empty

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
    def compute_gaze_statistics(df: pd.DataFrame, scenario: Optional[str] = None) -> dict:
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
    def compute_distance_timeseries(df: pd.DataFrame, scenario: Optional[str] = None) -> dict:
        """Compute eye-to-screen distance timeseries (mm -> cm)."""
        _empty: dict = {"time": [], "distance_cm": []}

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "time" not in df.columns or "distance" not in df.columns:
            return _empty

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
    def compute_distance_statistics(df: pd.DataFrame, scenario: Optional[str] = None) -> dict:
        """Compute statistics for eye-to-screen distance signal (cm)."""
        _empty: dict = {
            "mean": 0.0, "min": 0.0, "max": 0.0, "std": 0.0, "median": 0.0, "baseline": 0.0,
        }

        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "time" not in df.columns or "distance" not in df.columns:
            return _empty

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

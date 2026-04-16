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
        """Compute pupil statistics over per-sample average of both eyes."""
        if scenario and scenario != "all" and "scenario" in df.columns:
            df = df[df["scenario"].astype(str).str.strip() == scenario]

        if "lx_pupil" not in df.columns or "rx_pupil" not in df.columns:
            return {"mean": 0, "min": 0, "max": 0, "std": 0, "median": 0, "baseline": 0}

        lx = df["lx_pupil"]
        rx = df["rx_pupil"]
        avg = pd.Series(
            np.where(
                lx.notna() & rx.notna(),
                (lx + rx) / 2,
                np.where(lx.notna(), lx, rx),
            )
        ).dropna()

        if avg.empty:
            return {"mean": 0, "min": 0, "max": 0, "std": 0, "median": 0, "baseline": 0}

        # Robust baseline: mean of values between 5th and 20th percentiles
        avg_arr = avg.to_numpy()
        baseline = _robust_baseline(avg_arr)

        def safe_float(value: float) -> float:
            if pd.isna(value):
                return 0.0
            return round(float(value), 4)

        return {
            "mean": safe_float(avg.mean()),
            "min": safe_float(avg.min()),
            "max": safe_float(avg.max()),
            "std": safe_float(avg.std()),
            "median": safe_float(avg.median()),
            "baseline": safe_float(baseline),
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

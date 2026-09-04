"""Gsr analytics service extracted without changing computations."""

from typing import Optional
import numpy as np
import pandas as pd
from .numeric_helpers import _filter_time_window
from .numeric_helpers import _infer_fs
from .numeric_helpers import _moving_average
from .numeric_helpers import _robust_baseline
from .numeric_helpers import scope_to_scenario


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

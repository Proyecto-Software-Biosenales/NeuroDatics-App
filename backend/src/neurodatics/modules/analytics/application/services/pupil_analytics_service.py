"""Pupil analytics service extracted without changing computations."""

from typing import Optional
import numpy as np
import pandas as pd
from ...domain.coordinate_transform import attach_transform_provenance
from neurodatics.shared.gaze_contract import GAZE_X_CLEAN_COLUMN, GAZE_Y_CLEAN_COLUMN
from neurodatics.shared.scenario_identity import is_all_scenarios
from .numeric_helpers import _display_indices
from .numeric_helpers import _filter_time_window
from .numeric_helpers import _infer_fs
from .numeric_helpers import _moving_average
from .numeric_helpers import _robust_baseline
from .numeric_helpers import scope_to_scenario


def _nearest_sorted_gaze_index(times: np.ndarray, t_s: float) -> int:
    """Nearest sorted time, with the earlier/first sample winning ties."""
    if not np.isfinite(t_s):
        return int(pd.Series(times).sub(t_s).abs().idxmin())
    right = int(np.searchsorted(times, t_s, side="left"))
    if right == 0:
        return 0
    left = right - 1
    if right < len(times) and abs(times[right] - t_s) < abs(times[left] - t_s):
        return right
    return int(np.searchsorted(times, times[left], side="left"))


def _positive_pupils(df: pd.DataFrame) -> pd.DataFrame:
    """A diameter at or below zero is a lost eye, not a measurement."""
    df = df.copy()
    for column in ("lx_pupil", "rx_pupil"):
        values = pd.to_numeric(df[column], errors="coerce")
        df[column] = values.where(values > 0)
    return df


def _optional_list(values: np.ndarray) -> list:
    return [round(float(v), 4) if np.isfinite(v) else None for v in values]


class PupilAnalyticsService:
    """Stateless computation helpers for pupil data."""

    @staticmethod
    def compute_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
        max_points: int = 0,
        decimation: str = "linspace",
    ) -> dict:
        """Compute pupil timeseries from DataFrame.

        ``decimation="minmax_envelope"`` keeps each display bucket's extremes of
        the smoothed traces the charts draw; see ``_envelope_display_indices``.
        """
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

        df = _positive_pupils(_filter_time_window(df, start_time_s, end_time_s))

        mask = df["lx_pupil"].notna() | df["rx_pupil"].notna()
        df = df.loc[mask].sort_values("time").reset_index(drop=True)

        time_arr = df["time"].fillna(0.0).astype(float).to_numpy()
        left_arr = df["lx_pupil"].fillna(0.0).astype(float).to_numpy()
        right_arr = df["rx_pupil"].fillna(0.0).astype(float).to_numpy()

        lx = df["lx_pupil"]
        rx = df["rx_pupil"]
        avg_series = pd.Series(
            np.where(
                lx.notna() & rx.notna(),
                (lx + rx) / 2,
                np.where(lx.notna(), lx, rx),
            )
        )
        average_arr = avg_series.fillna(0.0).astype(float).to_numpy()

        # Infer sampling frequency and compute dynamic window
        t = df["time"].to_numpy(dtype=float)
        fs = _infer_fs(t)
        win = max(1, int(round(fs * 0.25)))  # 0.25s window

        smooth_left_arr = _moving_average(df["lx_pupil"].to_numpy(dtype=float), win)
        smooth_right_arr = _moving_average(df["rx_pupil"].to_numpy(dtype=float), win)
        smooth_left = np.where(np.isfinite(smooth_left_arr), smooth_left_arr, 0.0)
        smooth_right = np.where(np.isfinite(smooth_right_arr), smooth_right_arr, 0.0)

        # Decimate only after smoothing, which needs the full-rate signal, and
        # with one index set so every series stays aligned to the time axis.
        indices = _display_indices(
            time_arr.size, (smooth_left, smooth_right), max_points, decimation
        )
        return {
            "time": time_arr[indices].tolist(),
            "left": left_arr[indices].tolist(),
            "right": right_arr[indices].tolist(),
            "average": average_arr[indices].tolist(),
            "smooth_left": smooth_left[indices].tolist(),
            "smooth_right": smooth_right[indices].tolist(),
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

        df = _positive_pupils(_filter_time_window(df, start_time_s, end_time_s))

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

        numeric_times = pd.to_numeric(df["time"], errors="coerce")
        positions = np.flatnonzero(numeric_times.notna().to_numpy())
        if not positions.size:
            return _empty(df.iloc[0:0])
        times = numeric_times.to_numpy()[positions]
        # Guard the importer ordering assumption; among duplicate times the
        # first row wins.
        if not bool(np.all(times[1:] > times[:-1])):
            order = np.argsort(times, kind="stable")
            positions, times = positions[order], times[order]
        idx = _nearest_sorted_gaze_index(times, t_s)
        clean = PupilAnalyticsService._with_clean_gaze(df.iloc[[positions[idx]]])
        clean["time"] = [times[idx]]
        row = clean.iloc[0]

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
        }, clean)

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
    def _with_clean_gaze(df: pd.DataFrame) -> pd.DataFrame:
        """``gx_clean``/``gy_clean`` in percent, as ingestion cleaned them.

        A Parquet ingested before the cleaning existed has no clean columns and
        yields no gaze: its project has to be uploaded again.
        """
        output = df.copy()
        for target, column in (("gx_clean", GAZE_X_CLEAN_COLUMN), ("gy_clean", GAZE_Y_CLEAN_COLUMN)):
            output[target] = (
                pd.to_numeric(df[column], errors="coerce") if column in df.columns else np.nan
            )
        return output

    @staticmethod
    def compute_gaze_timeseries(
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        start_time_s: Optional[float] = None,
        end_time_s: Optional[float] = None,
        max_points: int = 0,
        decimation: str = "linspace",
    ) -> dict:
        """Compute cleaned gaze X/Y timeseries."""
        df = scope_to_scenario(df, scenario)
        df = _filter_time_window(df, start_time_s, end_time_s)
        _empty: dict = attach_transform_provenance(
            {"time": [], "gx_clean": [], "gy_clean": []},
            df,
        )

        if "time" not in df.columns or not {GAZE_X_CLEAN_COLUMN, GAZE_Y_CLEAN_COLUMN}.issubset(df.columns):
            return _empty

        df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if df.empty:
            return _empty

        clean = PupilAnalyticsService._with_clean_gaze(df)
        gx = clean["gx_clean"].to_numpy(dtype=float)
        gy = clean["gy_clean"].to_numpy(dtype=float)
        # Gaps stay null so the chart breaks the line instead of drawing a zero.
        indices = _display_indices(len(df), (gx, gy), max_points, decimation)
        return attach_transform_provenance({
            "time": df["time"].to_numpy(dtype=float)[indices].tolist(),
            "gx_clean": _optional_list(gx[indices]),
            "gy_clean": _optional_list(gy[indices]),
        }, df)

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

        if "time" not in df.columns or not {GAZE_X_CLEAN_COLUMN, GAZE_Y_CLEAN_COLUMN}.issubset(df.columns):
            return _empty

        df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
        if df.empty:
            return _empty

        scoped_for_provenance = df
        df = PupilAnalyticsService._with_clean_gaze(df)

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
        max_points: int = 0,
        decimation: str = "linspace",
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

        indices = _display_indices(
            len(df), (df["distance_cm"].to_numpy(dtype=float),), max_points, decimation
        )
        return {
            "time": df["time"].to_numpy(dtype=float)[indices].tolist(),
            "distance_cm": [
                round(float(v), 4) for v in df["distance_cm"].to_numpy(dtype=float)[indices]
            ],
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

"""Numeric helpers extracted without changing computations."""

from typing import Optional
import numpy as np
import pandas as pd
from neurodatics.shared.scenario_identity import ScenarioResolution, is_all_scenarios, resolve_scenario


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

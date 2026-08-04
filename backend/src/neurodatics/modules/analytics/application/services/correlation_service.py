from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .analytics_service import (
    EEG_TOPOGRAPHY_CHANNELS,
    GsrAnalyticsService,
    PupilAnalyticsService,
    _infer_fs,
    _moving_average,
)


CORRELATION_SIGNAL_IDS = (
    "pupil_avg_mm",
    "gaze_x_pct",
    "gaze_y_pct",
    "distance_cm",
    "gsr_smoothed_us",
    "eeg_broadband_power_db",
)


class CorrelationAnalyticsService:
    """Build a curated, zero-lag Pearson matrix for continuous sensor signals."""

    BIN_SIZE_S = 0.25
    MIN_PAIR_SAMPLES = 10

    _SIGNAL_DEFINITIONS = {
        "pupil_avg_mm": ("Dilatación pupilar promedio", "mm"),
        "gaze_x_pct": ("Posición de mirada X", "%"),
        "gaze_y_pct": ("Posición de mirada Y", "%"),
        "distance_cm": ("Distancia al dispositivo", "cm"),
        "gsr_smoothed_us": ("Respuesta GSR", "µS"),
        "eeg_broadband_power_db": ("Potencia EEG de banda ancha", "dB"),
    }

    @staticmethod
    def _normalize_scenario(value: object) -> str:
        return Path(str(value).strip()).stem.lower().replace(" ", "")

    @classmethod
    def _scenario_frame(cls, df: pd.DataFrame, scenario: str) -> pd.DataFrame:
        def _empty_frame() -> pd.DataFrame:
            empty = df.iloc[0:0].copy()
            empty["_relative_time_s"] = pd.Series(dtype=float)
            empty["_bin"] = pd.Series(dtype=int)
            return empty

        if "scenario" not in df.columns or "time" not in df.columns:
            return _empty_frame()

        scenario_values = df["scenario"].astype(str).str.strip()
        target = str(scenario).strip()
        mask = scenario_values == target
        if not mask.any():
            target_normalized = cls._normalize_scenario(target)
            mask = scenario_values.map(cls._normalize_scenario) == target_normalized

        clean = df.loc[mask].copy()
        clean["time"] = pd.to_numeric(clean["time"], errors="coerce")
        finite_time = np.isfinite(clean["time"].to_numpy(dtype=float))
        clean = clean.loc[finite_time].sort_values("time").reset_index(drop=True)
        if clean.empty:
            return _empty_frame()

        clean["_relative_time_s"] = clean["time"] - float(clean["time"].min())
        clean["_bin"] = np.floor(
            clean["_relative_time_s"].to_numpy(dtype=float) / cls.BIN_SIZE_S
        ).astype(int)
        return clean.loc[clean["_bin"] >= 0].reset_index(drop=True)

    @staticmethod
    def _empty_series(total_bins: int) -> pd.Series:
        return pd.Series(
            np.full(total_bins, np.nan, dtype=float),
            index=pd.RangeIndex(total_bins),
            dtype=float,
        )

    @classmethod
    def _aggregate_median(
        cls,
        bins: pd.Series,
        values: np.ndarray,
        total_bins: int,
    ) -> pd.Series:
        if total_bins <= 0 or len(values) == 0:
            return cls._empty_series(total_bins)

        work = pd.DataFrame(
            {
                "bin": pd.to_numeric(bins, errors="coerce"),
                "value": pd.to_numeric(pd.Series(values), errors="coerce"),
            }
        )
        finite = np.isfinite(work["bin"].to_numpy(dtype=float)) & np.isfinite(
            work["value"].to_numpy(dtype=float)
        )
        work = work.loc[finite]
        if work.empty:
            return cls._empty_series(total_bins)

        grouped = work.groupby(work["bin"].astype(int), sort=True)["value"].median()
        return grouped.reindex(pd.RangeIndex(total_bins)).astype(float)

    @classmethod
    def _aggregate_mean(
        cls,
        bins: pd.Series,
        values: np.ndarray,
        total_bins: int,
    ) -> pd.Series:
        if total_bins <= 0 or len(values) == 0:
            return cls._empty_series(total_bins)

        work = pd.DataFrame(
            {
                "bin": pd.to_numeric(bins, errors="coerce"),
                "value": pd.to_numeric(pd.Series(values), errors="coerce"),
            }
        )
        finite = np.isfinite(work["bin"].to_numpy(dtype=float)) & np.isfinite(
            work["value"].to_numpy(dtype=float)
        )
        work = work.loc[finite]
        if work.empty:
            return cls._empty_series(total_bins)

        grouped = work.groupby(work["bin"].astype(int), sort=True)["value"].mean()
        return grouped.reindex(pd.RangeIndex(total_bins)).astype(float)

    @classmethod
    def _pupil_signal(
        cls,
        frame: pd.DataFrame,
        total_bins: int,
    ) -> Tuple[pd.Series, List[str], Optional[str]]:
        source_columns = [
            column for column in ("lx_pupil", "rx_pupil") if column in frame.columns
        ]
        if not source_columns:
            return (
                cls._empty_series(total_bins),
                [],
                "No se encontraron columnas de pupila.",
            )

        sample_count = len(frame)
        left = (
            pd.to_numeric(frame["lx_pupil"], errors="coerce").to_numpy(dtype=float)
            if "lx_pupil" in frame.columns
            else np.full(sample_count, np.nan, dtype=float)
        )
        right = (
            pd.to_numeric(frame["rx_pupil"], errors="coerce").to_numpy(dtype=float)
            if "rx_pupil" in frame.columns
            else np.full(sample_count, np.nan, dtype=float)
        )

        # Non-positive samples are blink/invalid markers in the eye-tracker data.
        # Remove them before smoothing so they cannot contaminate neighboring values.
        left[(~np.isfinite(left)) | (left <= 0.0)] = np.nan
        right[(~np.isfinite(right)) | (right <= 0.0)] = np.nan

        sampling_rate = _infer_fs(frame["time"].to_numpy(dtype=float))
        window = max(1, int(round(sampling_rate * 0.25)))
        smooth_left = _moving_average(left, window)
        smooth_right = _moving_average(right, window)

        left_valid = np.isfinite(left)
        right_valid = np.isfinite(right)
        averages = np.where(
            left_valid & right_valid,
            (smooth_left + smooth_right) / 2.0,
            np.where(
                left_valid,
                smooth_left,
                np.where(right_valid, smooth_right, np.nan),
            ),
        )
        return (
            cls._aggregate_median(frame["_bin"], averages, total_bins),
            source_columns,
            None,
        )

    @classmethod
    def _gaze_signals(
        cls,
        frame: pd.DataFrame,
        total_bins: int,
    ) -> Tuple[pd.Series, pd.Series, Optional[str], Optional[str]]:
        has_x = "gx" in frame.columns
        has_y = "gy" in frame.columns
        gaze_x = cls._empty_series(total_bins)
        gaze_y = cls._empty_series(total_bins)
        gaze_x_reason = None if has_x else "No se encontró la columna gx."
        gaze_y_reason = None if has_y else "No se encontró la columna gy."

        if has_x and has_y:
            gaze = PupilAnalyticsService._clean_gaze(frame.copy())
            gaze_x = cls._aggregate_median(
                gaze["_bin"],
                gaze["gx_clean"].to_numpy(dtype=float),
                total_bins,
            )
            gaze_y = cls._aggregate_median(
                gaze["_bin"],
                gaze["gy_clean"].to_numpy(dtype=float),
                total_bins,
            )
            return gaze_x, gaze_y, gaze_x_reason, gaze_y_reason

        if has_x:
            gaze_x = cls._aggregate_median(
                frame["_bin"],
                cls._clean_single_gaze_axis(frame, "gx"),
                total_bins,
            )
        if has_y:
            gaze_y = cls._aggregate_median(
                frame["_bin"],
                cls._clean_single_gaze_axis(frame, "gy"),
                total_bins,
            )
        return gaze_x, gaze_y, gaze_x_reason, gaze_y_reason

    @staticmethod
    def _clean_single_gaze_axis(frame: pd.DataFrame, column: str) -> np.ndarray:
        """Apply the established gaze pipeline when only one gaze axis is present."""
        values = pd.to_numeric(frame[column], errors="coerce")
        if values.abs().max(skipna=True) <= 1.0:
            values = values * 100.0

        time_values = frame["time"].to_numpy(dtype=float)
        sampling_rate = _infer_fs(time_values)
        bad = (values < 0.0) | (values > 100.0)
        for pupil_column in ("lx_pupil", "rx_pupil"):
            if pupil_column in frame.columns:
                pupil = pd.to_numeric(frame[pupil_column], errors="coerce")
                bad = bad | pupil.isna() | (pupil <= 0.0)

        speed = values.diff().abs() * sampling_rate
        bad = bad | (speed > 1500.0)
        clean = values.copy()
        clean[bad] = np.nan

        max_gap = max(1, int(round(0.150 * sampling_rate)))
        clean = clean.interpolate(limit=max_gap, limit_direction="both")
        median_window = max(3, int(round(0.060 * sampling_rate)))
        mean_window = max(3, int(round(0.040 * sampling_rate)))
        clean = (
            clean.rolling(median_window, center=True, min_periods=1)
            .median()
            .rolling(mean_window, center=True, min_periods=1)
            .mean()
        )
        return clean.to_numpy(dtype=float)

    @classmethod
    def _distance_signal(
        cls,
        frame: pd.DataFrame,
        total_bins: int,
    ) -> Tuple[pd.Series, List[str], Optional[str]]:
        if "distance" not in frame.columns:
            return (
                cls._empty_series(total_bins),
                [],
                "No se encontró la columna distance.",
            )

        distance_cm = (
            pd.to_numeric(frame["distance"], errors="coerce").to_numpy(dtype=float)
            / 10.0
        )
        return (
            cls._aggregate_median(frame["_bin"], distance_cm, total_bins),
            ["distance"],
            None,
        )

    @classmethod
    def _gsr_signal(
        cls,
        frame: pd.DataFrame,
        total_bins: int,
    ) -> Tuple[pd.Series, List[str], Optional[str]]:
        if "gsr" not in frame.columns:
            return cls._empty_series(total_bins), [], "No se encontró la columna gsr."

        # `_clean_signal` keeps auxiliary columns while dropping invalid GSR rows.
        # Use the preserved shared scenario bin instead of its rebased `time` column.
        clean = GsrAnalyticsService._clean_signal(frame, scenario=None)
        if clean.empty:
            return cls._empty_series(total_bins), ["gsr"], None

        bins = clean["_bin"].astype(int)
        return (
            cls._aggregate_median(
                bins,
                clean["gsr_smooth"].to_numpy(dtype=float),
                total_bins,
            ),
            ["gsr"],
            None,
        )

    @classmethod
    def _eeg_signal(
        cls,
        frame: pd.DataFrame,
        total_bins: int,
    ) -> Tuple[pd.Series, List[str], Optional[str]]:
        # `le` is intentionally excluded: it is a reference/auxiliary channel, not scalp data.
        source_columns = [
            channel for channel in EEG_TOPOGRAPHY_CHANNELS if channel in frame.columns
        ]
        if not source_columns:
            return (
                cls._empty_series(total_bins),
                [],
                "No se encontraron canales EEG de cuero cabelludo.",
            )

        channel_power = []
        bins = frame["_bin"].astype(int)
        for channel in source_columns:
            values = pd.to_numeric(frame[channel], errors="coerce").to_numpy(
                dtype=float
            )
            finite = np.isfinite(values)
            if not finite.any():
                continue

            # Match the existing broadband topography semantics by removing DC before
            # measuring mean-square power. Each result is then aligned to the same bins.
            centered = values.copy()
            centered[finite] = centered[finite] - float(np.mean(centered[finite]))
            power = centered**2
            channel_power.append(cls._aggregate_mean(bins, power, total_bins))

        if not channel_power:
            return cls._empty_series(total_bins), source_columns, None

        combined_linear = pd.concat(channel_power, axis=1).mean(axis=1, skipna=True)
        combined_linear = combined_linear.where(combined_linear > 0.0)
        with np.errstate(divide="ignore", invalid="ignore"):
            broadband_db = 10.0 * np.log10(combined_linear.astype(float))
        broadband_db = pd.Series(
            broadband_db, index=pd.RangeIndex(total_bins), dtype=float
        )
        broadband_db = broadband_db.where(np.isfinite(broadband_db))
        return broadband_db, source_columns, None

    @classmethod
    def build_binned_signals(
        cls,
        df: pd.DataFrame,
        scenario: str,
    ) -> Tuple[float, int, Dict[str, pd.Series], List[dict]]:
        """Prepare the six fixed signals on a shared scenario-relative 250 ms grid."""
        frame = cls._scenario_frame(df, scenario)
        if frame.empty:
            duration_s = 0.0
            total_bins = 0
        else:
            duration_s = float(frame["_relative_time_s"].max())
            total_bins = int(frame["_bin"].max()) + 1

        pupil, pupil_sources, pupil_reason = cls._pupil_signal(frame, total_bins)
        gaze_x, gaze_y, gaze_x_reason, gaze_y_reason = cls._gaze_signals(
            frame, total_bins
        )
        distance, distance_sources, distance_reason = cls._distance_signal(
            frame, total_bins
        )
        gsr, gsr_sources, gsr_reason = cls._gsr_signal(frame, total_bins)
        eeg, eeg_sources, eeg_reason = cls._eeg_signal(frame, total_bins)

        series_by_id = {
            "pupil_avg_mm": pupil,
            "gaze_x_pct": gaze_x,
            "gaze_y_pct": gaze_y,
            "distance_cm": distance,
            "gsr_smoothed_us": gsr,
            "eeg_broadband_power_db": eeg,
        }
        source_columns = {
            "pupil_avg_mm": pupil_sources,
            "gaze_x_pct": ["gx"] if "gx" in frame.columns else [],
            "gaze_y_pct": ["gy"] if "gy" in frame.columns else [],
            "distance_cm": distance_sources,
            "gsr_smoothed_us": gsr_sources,
            "eeg_broadband_power_db": eeg_sources,
        }
        unavailable_reasons = {
            "pupil_avg_mm": pupil_reason,
            "gaze_x_pct": gaze_x_reason,
            "gaze_y_pct": gaze_y_reason,
            "distance_cm": distance_reason,
            "gsr_smoothed_us": gsr_reason,
            "eeg_broadband_power_db": eeg_reason,
        }

        no_scenario_data = frame.empty
        metadata = []
        for signal_id in CORRELATION_SIGNAL_IDS:
            series = series_by_id[signal_id]
            valid_bins = int(np.isfinite(series.to_numpy(dtype=float)).sum())
            available = valid_bins > 0
            reason = unavailable_reasons[signal_id]
            if not available:
                if no_scenario_data:
                    reason = "No hay datos para el escenario seleccionado."
                elif reason is None:
                    reason = "No hay muestras válidas para esta señal."

            label, unit = cls._SIGNAL_DEFINITIONS[signal_id]
            metadata.append(
                {
                    "id": signal_id,
                    "label": label,
                    "unit": unit,
                    "available": available,
                    "valid_bins": valid_bins,
                    "coverage": round(valid_bins / total_bins, 4)
                    if total_bins
                    else 0.0,
                    "source_columns": source_columns[signal_id],
                    "unavailable_reason": None if available else reason,
                }
            )

        return round(duration_s, 4), total_bins, series_by_id, metadata

    @staticmethod
    def _is_constant(values: np.ndarray) -> bool:
        if values.size == 0:
            return True
        spread = float(np.max(values) - np.min(values))
        scale = max(1.0, float(np.max(np.abs(values))))
        return spread <= np.finfo(float).eps * scale

    @classmethod
    def _matrix(
        cls,
        series_by_id: Dict[str, pd.Series],
        metadata: List[dict],
        total_bins: int,
    ) -> List[List[dict]]:
        availability = {item["id"]: bool(item["available"]) for item in metadata}
        matrix: List[List[dict]] = []

        for signal_x in CORRELATION_SIGNAL_IDS:
            row = []
            x_values = series_by_id[signal_x].to_numpy(dtype=float)
            for signal_y in CORRELATION_SIGNAL_IDS:
                y_values = series_by_id[signal_y].to_numpy(dtype=float)
                coefficient = None
                n_samples = 0

                if not availability[signal_x] or not availability[signal_y]:
                    status = "unavailable"
                else:
                    paired = np.isfinite(x_values) & np.isfinite(y_values)
                    n_samples = int(paired.sum())
                    if n_samples < cls.MIN_PAIR_SAMPLES:
                        status = "insufficient_overlap"
                    else:
                        paired_x = x_values[paired]
                        paired_y = y_values[paired]
                        if cls._is_constant(paired_x) or cls._is_constant(paired_y):
                            status = "constant_signal"
                        else:
                            value = float(np.corrcoef(paired_x, paired_y)[0, 1])
                            if np.isfinite(value):
                                value = float(np.clip(value, -1.0, 1.0))
                                coefficient = round(value, 4)
                                if coefficient == -0.0:
                                    coefficient = 0.0
                                status = "ok"
                            else:
                                status = "constant_signal"

                row.append(
                    {
                        "signal_x": signal_x,
                        "signal_y": signal_y,
                        "coefficient": coefficient,
                        "n_samples": n_samples,
                        "coverage": round(n_samples / total_bins, 4)
                        if total_bins
                        else 0.0,
                        "status": status,
                    }
                )
            matrix.append(row)

        return matrix

    @classmethod
    def compute(cls, df: pd.DataFrame, scenario: str) -> dict:
        duration_s, total_bins, series_by_id, metadata = cls.build_binned_signals(
            df,
            scenario,
        )
        return {
            "method": "pearson",
            "time_basis": "scenario_relative",
            "bin_size_s": cls.BIN_SIZE_S,
            "min_pair_samples": cls.MIN_PAIR_SAMPLES,
            "duration_s": duration_s,
            "total_bins": total_bins,
            "signals": metadata,
            "matrix": cls._matrix(series_by_id, metadata, total_bins),
        }

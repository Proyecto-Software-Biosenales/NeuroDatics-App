from __future__ import annotations

import logging
import math
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from .analytics_service import (
    EEG_CHANNELS,
    EegAnalyticsService,
    GsrAnalyticsService,
    PupilAnalyticsService,
)


REPORT_PALETTE = {
    "background": "#F8FAFC",
    "surface": "#FFFFFF",
    "surfaceMuted": "#F1F5F9",
    "border": "#E2E8F0",
    "text": "#0F172A",
    "textSoft": "#334155",
    "textMuted": "#64748B",
    "primary": "#2563EB",
    "eyeTracking": "#6366F1",
    "gsr": "#14B8A6",
    "eeg": "#8B5CF6",
    "peakMax": "#F97316",
    "peakMin": "#111827",
    "success": "#16A34A",
    "warning": "#F59E0B",
    "danger": "#DC2626",
    "chartSeries": [
        "#2563EB",
        "#7C3AED",
        "#0F766E",
        "#06B6D4",
        "#DC2626",
        "#EA580C",
        "#BE123C",
    ],
}

TEMPORAL_VISUALIZATIONS_BY_SENSOR = {
    "EyeTracker": ("pupil", "gaze", "distance"),
    "GSR": ("gsr",),
    "EEG": ("eeg_timeseries",),
}

EEG_CHANNEL_COLORS: Dict[str, str] = {
    "le": "#2563EB",
    "f4": "#DC2626",
    "c4": "#059669",
    "p4": "#7C3AED",
    "p3": "#EA580C",
    "c3": "#65A30D",
    "f3": "#BE123C",
}

COMPARISON_CHARTS_CONTRACT_VERSION = "comparison-charts-v3"
COMPARISON_STATISTICS_SCHEMA_VERSION = "comparison-statistics-v1"
logger = logging.getLogger(__name__)


def temporal_visualizations_for_sensors(sensors: Sequence[str]) -> List[str]:
    visualizations: List[str] = []
    for sensor in ("EyeTracker", "GSR", "EEG"):
        if sensor in sensors:
            visualizations.extend(TEMPORAL_VISUALIZATIONS_BY_SENSOR[sensor])
    return visualizations


def _finite_number(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(numeric):
        return None
    return numeric


def _downsample_indexes(size: int, max_points: int) -> np.ndarray:
    if size <= 0:
        return np.asarray([], dtype=int)
    if max_points <= 0 or size <= max_points:
        return np.arange(size, dtype=int)
    return np.linspace(0, size - 1, int(max_points)).round().astype(int)


def _legacy_timeseries_indexes(size: int, max_points: int) -> np.ndarray:
    """Match the five historical ``decimation=linspace`` endpoints exactly."""
    if size <= 0:
        return np.asarray([], dtype=int)
    if max_points > 0 and size > max_points:
        return np.linspace(0, size - 1, int(max_points), dtype=int)
    return np.arange(size, dtype=int)


def _js_add(left: float, right: float) -> float:
    """IEEE-754 addition without Python raising on finite overflow."""
    with np.errstate(over="ignore", invalid="ignore"):
        return float(np.float64(left) + np.float64(right))


def _js_multiply(left: float, right: float) -> float:
    with np.errstate(over="ignore", invalid="ignore"):
        return float(np.float64(left) * np.float64(right))


def legacy_javascript_summary(values: Sequence[Any]) -> Optional[Dict[str, Any]]:
    """Port of ComparisonStatistics.summarize, including reduction order.

    Inputs are the already serialized historical endpoint samples.  Only finite
    JavaScript numbers participate.  Non-finite derived results are normalized
    to JSON ``null``; the old UI rendered those results as an em dash too.
    """
    finite: List[float] = []
    for value in values:
        if isinstance(value, (bool, np.bool_)) or not isinstance(
            value, (int, float, np.integer, np.floating)
        ):
            continue
        numeric = float(value)
        if math.isfinite(numeric):
            finite.append(numeric)
    if not finite:
        return None

    sorted_values = sorted(finite)
    total = 0.0
    for value in finite:
        total = _js_add(total, value)
    mean = total / len(finite)
    middle = len(finite) // 2
    median = (
        sorted_values[middle]
        if len(finite) % 2
        else _js_add(sorted_values[middle - 1], sorted_values[middle]) / 2.0
    )
    if len(finite) > 1:
        squared_total = 0.0
        for value in finite:
            delta = value - mean
            squared_total = _js_add(squared_total, _js_multiply(delta, delta))
        std = math.sqrt(squared_total / (len(finite) - 1))
    else:
        std = 0.0

    baseline_start = math.floor(len(sorted_values) * 0.05)
    baseline_end = max(baseline_start + 1, math.ceil(len(sorted_values) * 0.2))
    baseline_values = sorted_values[baseline_start:baseline_end]
    baseline_total = 0.0
    for value in baseline_values:
        baseline_total = _js_add(baseline_total, value)
    baseline = baseline_total / len(baseline_values)
    maximum = sorted_values[-1]
    peak = None if baseline == 0 else (maximum - baseline) / abs(baseline) * 100.0

    def transported(value: float) -> Optional[float]:
        return value if math.isfinite(value) else None

    return {
        "count": len(finite),
        "mean": transported(mean),
        "median": transported(median),
        "std": transported(std),
        "min": transported(sorted_values[0]),
        "max": transported(maximum),
        "baseline": transported(baseline),
        "peak": transported(peak) if peak is not None else None,
    }


class ChartConfigBuilder:
    """Build temporal comparison chart configs used by dashboard and PDF."""

    DEFAULT_MAX_POINTS = 5000

    @classmethod
    def build_many(
        cls,
        df: pd.DataFrame,
        scenario: str,
        visualizations: Optional[Iterable[str]] = None,
        max_points: int = DEFAULT_MAX_POINTS,
    ) -> List[Dict[str, Any]]:
        requested = list(visualizations or temporal_visualizations_for_sensors(("EyeTracker", "GSR", "EEG")))
        builders = {
            "pupil": cls._build_pupil,
            "gaze": cls._build_gaze,
            "distance": cls._build_distance,
            "gsr": cls._build_gsr,
            "eeg_timeseries": cls._build_eeg,
        }
        charts: List[Dict[str, Any]] = []
        for visualization_id in requested:
            builder = builders.get(str(visualization_id))
            if builder is None:
                continue
            chart = builder(df, scenario, max_points)
            if chart is not None:
                charts.append(chart)
        return charts

    @classmethod
    def build_comparison_payload(
        cls,
        df: pd.DataFrame,
        scenario: str,
        visualizations: Optional[Iterable[str]] = None,
        max_points: int = DEFAULT_MAX_POINTS,
    ) -> Dict[str, Any]:
        """Build charts and their legacy-equivalent summaries in one pass.

        A failure is isolated to its visualization.  This is important now that
        one HTTP response replaces five independently failing summary requests.
        """
        requested = list(
            visualizations
            or temporal_visualizations_for_sensors(("EyeTracker", "GSR", "EEG"))
        )
        builders = {
            "pupil": cls._build_pupil_payload,
            "gaze": cls._build_gaze_payload,
            "distance": cls._build_distance_payload,
            "gsr": cls._build_gsr_payload,
            "eeg_timeseries": cls._build_eeg_payload,
        }
        charts: List[Dict[str, Any]] = []
        statistics: List[Dict[str, Any]] = []
        for visualization_id in requested:
            builder = builders.get(str(visualization_id))
            if builder is None:
                continue
            try:
                chart, summary = builder(df, scenario, max_points)
            except Exception:  # isolate one signal; HTTP auth/cache stay outside
                logger.exception(
                    "Comparison visualization failed: %s", visualization_id
                )
                statistics.append(
                    {
                        "visualization_id": str(visualization_id),
                        "status": "error",
                        "source": cls._statistics_source(
                            str(visualization_id), max_points, 0, 0
                        ),
                        "series": [],
                        "error": "computation_failed",
                    }
                )
                continue
            if chart is not None:
                charts.append(chart)
            statistics.append(summary)
        return {
            "contract_version": COMPARISON_CHARTS_CONTRACT_VERSION,
            "statistics_schema_version": COMPARISON_STATISTICS_SCHEMA_VERSION,
            "charts": charts,
            "statistics": statistics,
        }

    @staticmethod
    def _statistics_source(
        visualization_id: str,
        max_points: int,
        source_samples: int,
        selected_samples: int,
    ) -> Dict[str, Any]:
        endpoints = {
            "pupil": "/timeseries/pupil",
            "gaze": "/timeseries/gaze",
            "distance": "/timeseries/distance",
            "gsr": "/timeseries/gsr",
            "eeg_timeseries": "/timeseries/eeg",
        }
        parameters: Dict[str, Any] = {
            "scenario": "request",
            "max_points": max_points,
            "decimation": "linspace",
            "start_time_s": None,
            "end_time_s": None,
        }
        if visualization_id == "gsr":
            parameters["time_basis"] = "relative_for_legacy_endpoint_values"
        if visualization_id == "eeg_timeseries":
            parameters.update(
                {
                    "channels": "all_available_in_canonical_order",
                    "smooth_window_s": 0.0,
                    "reference": "as_exported",
                    "bandpass_hz": None,
                    "notch_hz": None,
                }
            )
        return {
            "endpoint": endpoints.get(visualization_id, ""),
            "resolution": "legacy_timeseries_display_samples",
            "source_samples": source_samples,
            "selected_samples": selected_samples,
            "parameters": parameters,
            "chart_resolution": "comparison_chart_display_samples",
            "relationship": (
                "same transformed signal; statistics preserve legacy endpoint "
                "selection/precision and are not computed from chart rows"
            ),
        }

    @classmethod
    def _summary_block(
        cls,
        visualization_id: str,
        series_definitions: Sequence[Dict[str, Any]],
        max_points: int,
        source_samples: int,
        *,
        already_selected: bool = False,
    ) -> Dict[str, Any]:
        indexes = (
            np.arange(source_samples, dtype=int)
            if already_selected
            else _legacy_timeseries_indexes(source_samples, max_points)
        )
        summaries: List[Dict[str, Any]] = []
        for definition in series_definitions:
            values = list(definition.get("statistics_values", []))
            if len(values) != source_samples:
                continue
            selected = [values[int(index)] for index in indexes]
            summary = legacy_javascript_summary(selected)
            if summary is None:
                continue
            summaries.append(
                {
                    "key": str(definition["key"]),
                    "label": str(
                        definition.get("statistics_label") or definition["label"]
                    ),
                    "unit": str(
                        definition.get("statistics_unit")
                        if definition.get("statistics_unit") is not None
                        else definition.get("unit") or ""
                    ),
                    "summary": summary,
                }
            )
        status = "ok" if summaries else "empty"
        return {
            "visualization_id": visualization_id,
            "status": status,
            "source": cls._statistics_source(
                visualization_id, max_points, source_samples, len(indexes)
            ),
            "series": summaries,
            "error": None,
        }

    @classmethod
    def _build_chart(
        cls,
        chart_id: str,
        title: str,
        y_label: str,
        time_values: Sequence[float],
        series_definitions: Sequence[Dict[str, Any]],
        max_points: int,
        synchronized: bool = True,
        height: int = 320,
    ) -> Optional[Dict[str, Any]]:
        time_arr = np.asarray(time_values, dtype=float)
        if time_arr.size == 0:
            return None

        finite_time = np.isfinite(time_arr)
        if not finite_time.any():
            return None
        indexes = _downsample_indexes(time_arr.size, max_points)
        if indexes.size == 0:
            return None

        data_rows: List[Dict[str, Optional[float]]] = []
        prepared_series: List[Dict[str, Any]] = []
        for definition in series_definitions:
            values = np.asarray(definition.get("values", []), dtype=float)
            if values.size != time_arr.size:
                continue
            if not (np.isfinite(values) & finite_time).any():
                continue
            prepared_series.append(
                {
                    "key": str(definition["key"]),
                    "label": str(definition["label"]),
                    "color": str(definition["color"]),
                    "unit": str(definition.get("unit") or ""),
                    "values": values,
                }
            )

        if not prepared_series:
            return None

        for index in indexes:
            source_time = _finite_number(time_arr[index])
            if source_time is None:
                continue
            row: Dict[str, Optional[float]] = {
                "time": round(source_time, 4),
                "sourceTime": round(source_time, 4),
            }
            for definition in prepared_series:
                value = _finite_number(definition["values"][index])
                row[definition["key"]] = round(value, 6) if value is not None else None
            data_rows.append(row)

        if not data_rows:
            return None

        series = [
            {
                "key": definition["key"],
                "label": definition["label"],
                "color": definition["color"],
                "unit": definition["unit"],
            }
            for definition in prepared_series
        ]
        x_values = [row["time"] for row in data_rows if row.get("time") is not None]
        x_domain = [float(min(x_values)), float(max(x_values))] if x_values else None

        return {
            "id": chart_id,
            "title": title,
            "x_label": "Tiempo (s)",
            "y_label": y_label,
            "time_basis": "absolute",
            "x_domain": x_domain,
            "data": data_rows,
            "series": series,
            "legend": [{"label": item["label"], "color": item["color"]} for item in series],
            "peaks": cls._build_peaks(data_rows, series),
            "annotations": [],
            "synchronized": synchronized,
            "height": height,
        }

    @classmethod
    def _build_peaks(
        cls,
        data_rows: Sequence[Dict[str, Optional[float]]],
        series: Sequence[Dict[str, str]],
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for definition in series:
            key = definition["key"]
            values: List[Tuple[float, float]] = []
            for row in data_rows:
                time_value = _finite_number(row.get("time"))
                value = _finite_number(row.get(key))
                if time_value is None or value is None:
                    continue
                values.append((time_value, value))
            if not values:
                continue
            min_time, min_value = min(values, key=lambda item: item[1])
            max_time, max_value = max(values, key=lambda item: item[1])
            candidates.append(
                {
                    "kind": "min",
                    "series_key": key,
                    "series_label": definition["label"],
                    "value": min_value,
                    "time_s": min_time,
                    "unit": definition.get("unit", ""),
                }
            )
            candidates.append(
                {
                    "kind": "max",
                    "series_key": key,
                    "series_label": definition["label"],
                    "value": max_value,
                    "time_s": max_time,
                    "unit": definition.get("unit", ""),
                }
            )

        if not candidates:
            return []

        min_peak = min(
            (item for item in candidates if item["kind"] == "min"),
            key=lambda item: item["value"],
        )
        max_peak = max(
            (item for item in candidates if item["kind"] == "max"),
            key=lambda item: item["value"],
        )
        return [
            {
                **min_peak,
                "color": REPORT_PALETTE["peakMin"],
                "line_style": "dotted",
                "label": "Minimo",
            },
            {
                **max_peak,
                "color": REPORT_PALETTE["peakMax"],
                "line_style": "dashed",
                "label": "Maximo",
            },
        ]

    @classmethod
    def _chart_and_summary(
        cls,
        visualization_id: str,
        title: str,
        y_label: str,
        time_values: Sequence[float],
        series_definitions: Sequence[Dict[str, Any]],
        max_points: int,
        *,
        synchronized: bool = True,
        height: int = 320,
        statistics_already_selected: bool = False,
        statistics_source_samples: Optional[int] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
        chart = cls._build_chart(
            visualization_id,
            title,
            y_label,
            time_values,
            series_definitions,
            max_points,
            synchronized=synchronized,
            height=height,
        )
        source_samples = (
            len(time_values)
            if statistics_source_samples is None
            else statistics_source_samples
        )
        summary = cls._summary_block(
            visualization_id,
            series_definitions,
            max_points,
            source_samples,
            already_selected=statistics_already_selected,
        )
        return chart, summary

    @classmethod
    def _build_pupil_payload(cls, df, scenario, max_points):
        data = PupilAnalyticsService.compute_timeseries(df, scenario)
        definitions = [
            {
                "key": "left",
                "label": "Pupila izquierda",
                "statistics_label": "Izquierda suavizada",
                "color": REPORT_PALETTE["chartSeries"][0],
                "unit": "mm",
                "values": data.get("smooth_left", []),
                "statistics_values": data.get("smooth_left", []),
            },
            {
                "key": "right",
                "label": "Pupila derecha",
                "statistics_label": "Derecha suavizada",
                "color": REPORT_PALETTE["chartSeries"][1],
                "unit": "mm",
                "values": data.get("smooth_right", []),
                "statistics_values": data.get("smooth_right", []),
            },
        ]
        return cls._chart_and_summary(
            "pupil", "Dilatacion pupilar", "Diametro (mm)",
            data.get("time", []), definitions, max_points,
        )

    @classmethod
    def _build_gaze_payload(cls, df, scenario, max_points):
        data = PupilAnalyticsService.compute_gaze_timeseries(df, scenario)
        definitions = [
            {
                "key": "x", "label": "Posicion X",
                "statistics_label": "Posición X",
                "color": REPORT_PALETTE["chartSeries"][0], "unit": "%",
                "values": data.get("gx_clean", []),
                "statistics_values": data.get("gx_clean", []),
            },
            {
                "key": "y", "label": "Posicion Y",
                "statistics_label": "Posición Y",
                "color": REPORT_PALETTE["chartSeries"][1], "unit": "%",
                "values": data.get("gy_clean", []),
                "statistics_values": data.get("gy_clean", []),
            },
        ]
        return cls._chart_and_summary(
            "gaze", "Gaze point", "Posicion (%)",
            data.get("time", []), definitions, max_points,
        )

    @classmethod
    def _build_distance_payload(cls, df, scenario, max_points):
        data = PupilAnalyticsService.compute_distance_timeseries(df, scenario)
        definitions = [{
            "key": "distance", "label": "Distancia",
            "color": REPORT_PALETTE["eyeTracking"], "unit": "cm",
            "values": data.get("distance_cm", []),
            "statistics_values": data.get("distance_cm", []),
        }]
        return cls._chart_and_summary(
            "distance", "Distancia al dispositivo", "Distancia (cm)",
            data.get("time", []), definitions, max_points,
        )

    @classmethod
    def _build_gsr_payload(cls, df, scenario, max_points):
        # Absolute time only affects the chart x-axis.  Values are identical to
        # the old relative-time endpoint that supplied the statistics.
        data = GsrAnalyticsService.compute_timeseries(
            df, scenario, absolute_time=True
        )
        definitions = [{
            "key": "gsr", "label": "GSR suavizada",
            "statistics_label": "Señal suavizada",
            "statistics_unit": "µS",
            "color": REPORT_PALETTE["gsr"], "unit": "uS",
            "values": data.get("gsr_smooth", []),
            "statistics_values": data.get("gsr_smooth", []),
        }]
        return cls._chart_and_summary(
            "gsr", "Respuesta galvanica", "Conductancia (uS)",
            data.get("time", []), definitions, max_points,
            synchronized=False,
        )

    @classmethod
    def _build_eeg_payload(cls, df, scenario, max_points):
        data = EegAnalyticsService.compute_timeseries(
            df,
            scenario=scenario,
            smooth_window_s=0.0,
            max_points=max_points,
        )
        definitions = []
        for index, channel in enumerate(EEG_CHANNELS):
            if channel not in data.get("channels", []):
                continue
            definitions.append({
                "key": channel,
                "label": channel.upper(),
                "statistics_unit": "µV",
                "color": EEG_CHANNEL_COLORS.get(
                    channel,
                    REPORT_PALETTE["chartSeries"][
                        index % len(REPORT_PALETTE["chartSeries"])
                    ],
                ),
                "unit": "uV",
                "values": data.get("raw", {}).get(channel, []),
                # The former UI summarized ``smooth``. With a zero-second
                # window it remains scientifically distinct in the contract.
                "statistics_values": data.get("smooth", {}).get(channel, []),
            })
        source_samples = int(
            data.get("metadata", {}).get("display_source_samples")
            or len(data.get("time", []))
        )
        chart, summary = cls._chart_and_summary(
            "eeg_timeseries", "EEG por canal", "Amplitud (uV)",
            data.get("time", []), definitions, max_points,
            height=380,
            statistics_already_selected=True,
            statistics_source_samples=len(data.get("time", [])),
        )
        summary["source"]["source_samples"] = source_samples
        return chart, summary

    @classmethod
    def _build_pupil(
        cls,
        df: pd.DataFrame,
        scenario: str,
        max_points: int,
    ) -> Optional[Dict[str, Any]]:
        data = PupilAnalyticsService.compute_timeseries(df, scenario)
        return cls._build_chart(
            "pupil",
            "Dilatacion pupilar",
            "Diametro (mm)",
            data.get("time", []),
            [
                {
                    "key": "left",
                    "label": "Pupila izquierda",
                    "color": REPORT_PALETTE["chartSeries"][0],
                    "unit": "mm",
                    "values": data.get("smooth_left", []),
                },
                {
                    "key": "right",
                    "label": "Pupila derecha",
                    "color": REPORT_PALETTE["chartSeries"][1],
                    "unit": "mm",
                    "values": data.get("smooth_right", []),
                },
            ],
            max_points,
        )

    @classmethod
    def _build_gaze(
        cls,
        df: pd.DataFrame,
        scenario: str,
        max_points: int,
    ) -> Optional[Dict[str, Any]]:
        data = PupilAnalyticsService.compute_gaze_timeseries(df, scenario)
        return cls._build_chart(
            "gaze",
            "Gaze point",
            "Posicion (%)",
            data.get("time", []),
            [
                {
                    "key": "x",
                    "label": "Posicion X",
                    "color": REPORT_PALETTE["chartSeries"][0],
                    "unit": "%",
                    "values": data.get("gx_clean", []),
                },
                {
                    "key": "y",
                    "label": "Posicion Y",
                    "color": REPORT_PALETTE["chartSeries"][1],
                    "unit": "%",
                    "values": data.get("gy_clean", []),
                },
            ],
            max_points,
        )

    @classmethod
    def _build_distance(
        cls,
        df: pd.DataFrame,
        scenario: str,
        max_points: int,
    ) -> Optional[Dict[str, Any]]:
        data = PupilAnalyticsService.compute_distance_timeseries(df, scenario)
        return cls._build_chart(
            "distance",
            "Distancia al dispositivo",
            "Distancia (cm)",
            data.get("time", []),
            [
                {
                    "key": "distance",
                    "label": "Distancia",
                    "color": REPORT_PALETTE["eyeTracking"],
                    "unit": "cm",
                    "values": data.get("distance_cm", []),
                }
            ],
            max_points,
        )

    @classmethod
    def _build_gsr(
        cls,
        df: pd.DataFrame,
        scenario: str,
        max_points: int,
    ) -> Optional[Dict[str, Any]]:
        data = GsrAnalyticsService.compute_timeseries(df, scenario, absolute_time=True)
        return cls._build_chart(
            "gsr",
            "Respuesta galvanica",
            "Conductancia (uS)",
            data.get("time", []),
            [
                {
                    "key": "gsr",
                    "label": "GSR suavizada",
                    "color": REPORT_PALETTE["gsr"],
                    "unit": "uS",
                    "values": data.get("gsr_smooth", []),
                }
            ],
            max_points,
            synchronized=False,
        )

    @classmethod
    def _build_eeg(
        cls,
        df: pd.DataFrame,
        scenario: str,
        max_points: int,
    ) -> Optional[Dict[str, Any]]:
        data = EegAnalyticsService.compute_timeseries(
            df,
            scenario=scenario,
            smooth_window_s=0.0,
            max_points=max_points,
        )
        definitions = []
        for index, channel in enumerate(EEG_CHANNELS):
            if channel not in data.get("channels", []):
                continue
            definitions.append(
                {
                    "key": channel,
                    "label": channel.upper(),
                    "color": EEG_CHANNEL_COLORS.get(
                        channel,
                        REPORT_PALETTE["chartSeries"][index % len(REPORT_PALETTE["chartSeries"])],
                    ),
                    "unit": "uV",
                    "values": data.get("raw", {}).get(channel, []),
                }
            )

        return cls._build_chart(
            "eeg_timeseries",
            "EEG por canal",
            "Amplitud (uV)",
            data.get("time", []),
            definitions,
            max_points,
            height=380,
        )

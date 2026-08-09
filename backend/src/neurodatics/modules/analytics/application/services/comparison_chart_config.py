from __future__ import annotations

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
            smooth_window_s=0.2,
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
                    "values": data.get("smooth", {}).get(channel, []),
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

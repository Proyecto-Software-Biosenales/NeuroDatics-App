from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pandas as pd

from neurodatics.modules.analytics.application.services.comparison_chart_config import (
    ChartConfigBuilder,
)
from neurodatics.modules.reports.api.schemas import ExecutiveReportRequest
from neurodatics.modules.reports.application.services.executive_report_service import (
    STIMULUS_CANVAS_SIZE,
    SpatialAssets,
    _open_base_image,
    aggregate_metric_rows,
    aggregate_summary_rows,
    build_executive_report_pdf,
    resolve_report_sensors,
    resolve_report_visualizations,
    select_report_scenarios,
    summarize_series,
)


def test_executive_report_scope_requires_participant_code():
    with pytest.raises(ValueError):
        ExecutiveReportRequest(
            project_id=uuid4(),
            scope={"kind": "participant"},
            mode={"kind": "comparative"},
        )


def test_executive_report_sensor_mode_requires_sensor():
    with pytest.raises(ValueError):
        ExecutiveReportRequest(
            project_id=uuid4(),
            scope={"kind": "all_participants"},
            mode={"kind": "sensor"},
        )


def test_resolve_report_sensors_maps_comparative_and_single_sensor():
    assert resolve_report_sensors(["GSR", "EyeTracker", "EEG"], "comparative") == [
        "EyeTracker",
        "GSR",
        "EEG",
    ]
    assert resolve_report_sensors(["GSR", "EyeTracker"], "sensor", "GSR") == ["GSR"]
    assert resolve_report_sensors(["GSR"], "sensor", "EEG") == []


def test_resolve_report_visualizations_includes_sensor_specific_content():
    visuals = resolve_report_visualizations(["EyeTracker", "EEG"])

    assert "heatmap" in visuals
    assert "scanpath" in visuals
    assert "aoi" in visuals
    assert "eeg_timeseries" in visuals
    assert "gsr" not in visuals


def test_select_report_scenarios_excludes_videos():
    image = SimpleNamespace(name="Stimulus", type="image", source_entry_path="stimulus.png", file=None)
    typed_video = SimpleNamespace(name="Clip", type="video", source_entry_path="clip.png", file=None)
    mime_video = SimpleNamespace(
        name="Recording",
        type="image",
        source_entry_path="recording.png",
        file=SimpleNamespace(mime_type="video/mp4"),
    )
    extension_video = SimpleNamespace(name="Ad", type="image", source_entry_path="ad.webm", file=None)

    assert select_report_scenarios([image, typed_video, mime_video, extension_video]) == [image]


def test_report_spatial_canvas_uses_high_resolution_stimulus_size():
    image = _open_base_image(None)

    assert image.size == STIMULUS_CANVAS_SIZE
    assert image.info["content_box"] == (0, 0, STIMULUS_CANVAS_SIZE[0], STIMULUS_CANVAS_SIZE[1])


def test_summarize_series_returns_min_max_mean_and_times():
    result = summarize_series("GSR", "uS", [0, 1, 2], [3, 1, 5])

    assert result is not None
    assert result["count"] == 3
    assert result["mean"] == pytest.approx(3.0)
    assert result["min"] == pytest.approx(1.0)
    assert result["min_time"] == pytest.approx(1.0)
    assert result["max"] == pytest.approx(5.0)
    assert result["max_time"] == pytest.approx(2.0)


def test_chart_config_builder_preserves_absolute_pupil_time_and_peaks():
    df = pd.DataFrame(
        {
            "scenario": ["comer_chocolate"] * 6,
            "time": [59.0, 59.4, 61.0, 62.0, 63.7, 64.0],
            "lx_pupil": [4.5, 4.28, 4.7, 4.9, 4.95, 4.8],
            "rx_pupil": [4.9, 4.8, 5.0, 5.1, 5.23, 5.0],
        }
    )

    chart = ChartConfigBuilder.build_many(df, "comer_chocolate", ["pupil"])[0]
    peaks = {peak["kind"]: peak for peak in chart["peaks"]}

    assert chart["x_domain"] == [59.0, 64.0]
    assert chart["data"][0]["time"] == pytest.approx(59.0)
    assert chart["data"][0]["sourceTime"] == pytest.approx(59.0)
    assert peaks["min"]["time_s"] == pytest.approx(59.4)
    assert peaks["min"]["value"] == pytest.approx(4.28)
    assert peaks["max"]["time_s"] == pytest.approx(63.7)
    assert peaks["max"]["value"] == pytest.approx(5.23)


def test_chart_config_builder_preserves_absolute_gsr_time():
    df = pd.DataFrame(
        {
            "scenario": ["comer_chocolate"] * 6,
            "time": [59.0, 60.0, 61.0, 62.0, 63.0, 64.0],
            "gsr": [3.0, 2.0, 1.0, 4.0, 5.0, 4.0],
        }
    )

    chart = ChartConfigBuilder.build_many(df, "comer_chocolate", ["gsr"])[0]
    peak_times = {peak["kind"]: peak["time_s"] for peak in chart["peaks"]}

    assert chart["x_domain"] == [59.0, 64.0]
    assert chart["data"][0]["time"] == pytest.approx(59.0)
    assert chart["data"][0]["sourceTime"] == pytest.approx(59.0)
    assert all(time_s >= 59.0 for time_s in peak_times.values())
    assert peak_times["min"] == pytest.approx(61.0)
    assert peak_times["max"] == pytest.approx(63.0)


def test_aggregate_summary_rows_averages_participant_summaries():
    rows = [
        {"label": "GSR", "unit": "uS", "count": 3, "mean": 2.0, "min": 1.0, "max": 5.0},
        {"label": "GSR", "unit": "uS", "count": 4, "mean": 4.0, "min": 2.0, "max": 8.0},
    ]

    result = aggregate_summary_rows(rows)

    assert result == [
        {
            "label": "GSR",
            "unit": "uS",
            "count": 7,
            "mean": 3.0,
            "min": 1.0,
            "max": 8.0,
            "participants": 2,
        }
    ]


def test_aggregate_metric_rows_reports_average_and_range():
    result = aggregate_metric_rows(
        [
            [{"metric": "GSR media", "value": 2.0, "unit": "uS"}],
            [{"metric": "GSR media", "value": 4.0, "unit": "uS"}],
        ]
    )

    assert result == [
        {"metric": "GSR media promedio", "value": 3.0, "unit": "uS"},
        {"metric": "GSR media rango", "value": "2.00 - 4.00", "unit": "uS"},
    ]


def test_build_executive_report_pdf_returns_pdf_bytes():
    payload = {
        "generated_at": datetime.now(timezone.utc),
        "include_metadata": True,
        "include_cover": True,
        "project_name": "Demo",
        "scope_label": "Participante P1",
        "mode_label": "Informe comparativo",
        "contents": ["Resumen ejecutivo"],
        "participant_count": 1,
        "scenario_count": 1,
        "sensors": ["EyeTracker"],
        "visualizations": ["heatmap"],
        "warnings": [],
        "scenarios": [
            {
                "name": "Escenario A",
                "spatial": SpatialAssets(
                    None,
                    None,
                    None,
                    [
                        {
                            "id": "aoi-1",
                            "name": "Logo",
                            "color": "#3B82F6",
                            "total_dwell_time_percent": 42.0,
                            "fixation_count": 3,
                        }
                    ],
                    [],
                ),
                "charts": [],
                "metrics": [],
            }
        ],
    }

    pdf_bytes = build_executive_report_pdf(payload)

    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000

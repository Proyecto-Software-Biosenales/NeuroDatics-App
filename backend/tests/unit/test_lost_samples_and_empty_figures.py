"""Lost samples are never figures, and an empty selection has no figures.

A lost eye arrives as a zero or negative diameter or distance; Comparativas,
the distance view and the AOI metrics must drop it, as the dashboard and the
fixation detector already do. Without a valid sample the statistics endpoints
return ``None`` (shown as «—»), not 0, so a group average skips that
participant. Also pins the scanpath segment rule, the GSR report time origin
and the participant code of comma-delimited exports.
"""

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    GsrAnalyticsService,
    PupilAnalyticsService,
    ScanpathAnalyticsService,
)
from neurodatics.modules.analytics.application.services.comparison_chart_config import (
    ChartConfigBuilder,
)
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingService,
)
from neurodatics.modules.reports.application.sensor_reports import gsr as gsr_report


def _pupil_frame() -> pd.DataFrame:
    time = np.arange(0, 4, 1 / 60)
    left = np.full(time.size, 3.0)
    right = np.full(time.size, 3.2)
    left[(time >= 1.0) & (time < 2.0)] = 0.0  # one eye lost for a second
    return pd.DataFrame(
        {"time": time, "lx_pupil": left, "rx_pupil": right, "scenario": "A"}
    )


def test_comparativas_pupil_never_counts_a_lost_eye_as_zero():
    payload = ChartConfigBuilder.build_comparison_payload(
        _pupil_frame(), "A", ["pupil"], max_points=5000
    )
    series = {item["key"]: item["summary"] for item in payload["statistics"][0]["series"]}

    assert series["left"]["min"] > 0
    assert series["left"]["mean"] > 2.9
    assert series["right"]["min"] > 3.1
    chart = payload["charts"][0]
    assert all(row["left"] is None or row["left"] > 0 for row in chart["data"])


def test_distance_drops_zero_and_negative_values():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.1, 0.2, 0.3, 0.4],
            "distance": [600.0, 0.0, -1.0, 620.0, 640.0],
            "scenario": "A",
        }
    )
    series = PupilAnalyticsService.compute_distance_timeseries(frame, "A")
    stats = PupilAnalyticsService.compute_distance_statistics(frame, "A")

    assert series["distance_cm"] == [60.0, 62.0, 64.0]
    assert stats["min"] == 60.0
    assert stats["mean"] == 62.0


def test_empty_selection_has_no_figures_instead_of_zeros():
    frame = pd.DataFrame({"time": [0.0, 0.1], "gsr": [np.nan, np.nan], "scenario": "A"})
    gsr = GsrAnalyticsService.compute_statistics(frame, "A")
    distance = PupilAnalyticsService.compute_distance_statistics(
        frame.assign(distance=[0.0, 0.0]), "A"
    )
    pupil = PupilAnalyticsService.compute_statistics(
        frame.assign(lx_pupil=[0.0, 0.0], rx_pupil=[0.0, 0.0]), "A"
    )

    for stats in (gsr, distance, pupil):
        assert {stats[key] for key in ("mean", "min", "max", "std", "median", "baseline")} == {None}


def test_scanpath_objectives_carry_their_detector_segment():
    frame = pd.DataFrame(
        {
            "time": [0.0, 0.01, 1.0, 1.01],
            "fix_x": [10.0, 10.0, 70.0, 70.0],
            "fix_y": [10.0, 10.0, 70.0, 70.0],
            "fixation_id": [1, 1, 1, 1],
            "fixation_segment_id": ["segment-a", "segment-a", "segment-b", "segment-b"],
            "fixation_method": ["idt"] * 4,
            "fixation_detector_version": ["fixation-v2.0"] * 4,
            "scenario": ["A"] * 4,
        }
    )
    result = ScanpathAnalyticsService.compute_scanpath(frame, "A")

    assert [item["segment_id"] for item in result["objectives"]] == ["segment-a", "segment-b"]
    # Neither the drawn line nor the travelled distance crosses segments.
    assert result["total_distance_px"] == 0.0


def test_gsr_report_counts_time_from_the_scenario_start():
    time = np.arange(0, 10, 0.1)
    gsr = np.where(time >= 3.0, 2.0 + 0.01 * time, np.nan)  # sensor starts 3 s late
    frame = pd.DataFrame({"time": time + 100.0, "gsr": gsr, "scenario": "A"})
    participant = SimpleNamespace(frame=frame, alias="P1", color="#000000")

    recording = gsr_report.collect(participant, SimpleNamespace(name="A", position=1))

    assert recording is not None
    assert recording.time[0] == pytest.approx(3.0, abs=1e-6)


def test_participant_code_drops_the_padding_of_delimited_exports():
    lines = ["Grabación: P01,,,,,", "Grabación : A002\t\t | Rec 1"]
    assert CsvProcessingService._extract_participant_code(lines[:1]) == "P01"
    assert CsvProcessingService._extract_participant_code(lines[1:]) == "A002"

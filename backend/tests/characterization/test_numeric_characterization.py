"""Tolerance-aware numerical goldens from a clearly synthetic corpus.

Goldens capture existing behaviour. Never regenerate one to hide a failure.
"""

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService, EegAnalyticsService, FixationDurationVariantService,
    FixationEventService, FixationHistogramService, GsrAnalyticsService,
    HeatmapAnalyticsService, PupilAnalyticsService, ScanpathAnalyticsService,
)
from neurodatics.modules.analytics.application.services.comparison_chart_config import ChartConfigBuilder
from neurodatics.modules.reports.application.services.executive_report_service import (
    aggregate_summary_rows, summarize_series,
)

CASES = [(participant, scenario) for participant in ("SYN-01", "SYN-02")
         for scenario in ("stimulus-a", "stimulus-b")]
TOLERANCE = {"atol": 1e-8, "rtol": 1e-6}


def numeric_columns(value, prefix=""):
    """Keep complete numeric arrays, including matrix shape, out of JSON snapshots."""
    output = {}
    if isinstance(value, dict):
        for key, item in sorted(value.items()):
            output.update(numeric_columns(item, f"{prefix}.{key}" if prefix else key))
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        output[prefix] = np.asarray([value], dtype=float)
    elif isinstance(value, list) and value:
        if isinstance(value[0], dict):
            for index, item in enumerate(value):
                output.update(numeric_columns(item, f"{prefix}.{index}"))
        elif all(isinstance(item, (int, float, list)) for item in value):
            array = np.asarray(value, dtype=float)
            output[prefix] = array.reshape(-1)
            output[f"{prefix}.shape"] = np.asarray(array.shape, dtype=float)
    return output


def test_ingestion_contract(corpus, snapshot):
    assert snapshot == {
        "sensors": corpus.processing.detected_sensors,
        "participants": list(corpus.frames),
        "frames": {code: {
            "rows": len(frame), "scenarios": sorted(frame.scenario.unique()),
            "columns": {name: str(dtype) for name, dtype in frame.dtypes.items()},
        } for code, frame in corpus.frames.items()},
    }


@pytest.mark.parametrize("participant,scenario", CASES)
def test_timeseries_and_statistics(corpus, participant, scenario, num_regression):
    frame = corpus.frames[participant]
    result = {
        "pupil": PupilAnalyticsService.compute_timeseries(frame, scenario),
        "pupil_stats": PupilAnalyticsService.compute_statistics(frame, scenario),
        "gaze": PupilAnalyticsService.compute_gaze_timeseries(frame, scenario),
        "distance": PupilAnalyticsService.compute_distance_timeseries(frame, scenario),
        "gsr": GsrAnalyticsService.compute_timeseries(frame, scenario),
        "gsr_stats": GsrAnalyticsService.compute_statistics(frame, scenario),
        "eeg": EegAnalyticsService.compute_timeseries(frame, scenario, max_points=80),
    }
    assert len(result["pupil"]["time"]) == 800
    assert len(result["eeg"]["channels"]) == 7
    num_regression.check(numeric_columns(result), default_tolerance=TOLERANCE)


@pytest.mark.parametrize("participant,scenario", CASES)
def test_eeg_spectral_outputs(corpus, participant, scenario, num_regression):
    frame = corpus.frames[participant]
    result = {
        "psd": EegAnalyticsService.compute_psd(frame, scenario, channels=["f3", "f4"], max_points=100),
        "spectrogram": EegAnalyticsService.compute_spectrogram(frame, scenario, channels=["f3", "f4"]),
        "topography": EegAnalyticsService.compute_topography(frame, scenario),
    }
    assert result["psd"]["frequency"]
    assert result["spectrogram"]["time"]
    assert len(result["topography"]["channels"]) == 6
    num_regression.check(numeric_columns(result), default_tolerance=TOLERANCE)


@pytest.mark.parametrize("participant,scenario", CASES)
def test_ingested_detector_events(corpus, participant, scenario, dataframe_regression):
    events, metadata = FixationEventService.build_events(corpus.frames[participant], scenario)
    assert len(events) >= 4
    assert metadata["source"] == "raw_gaze"
    numeric = events.select_dtypes(include="number").reset_index(drop=True)
    assert {"duration_s", "x_norm", "y_norm"}.issubset(numeric.columns)
    dataframe_regression.check(numeric, default_tolerance=TOLERANCE)


@pytest.mark.parametrize("participant,scenario", CASES)
def test_spatial_and_duration_outputs(corpus, participant, scenario, aois, num_regression):
    frame = corpus.frames[participant]
    result = {
        "scanpath": ScanpathAnalyticsService.compute_scanpath(frame, scenario),
        "histogram": FixationHistogramService.compute_histogram(frame, scenario),
        "sensitivity": FixationDurationVariantService.compute_sensitivity(frame, scenario),
        "aois": AoiAnalyticsService.compute_metrics(frame, scenario, aois),
    }
    assert len(result["sensitivity"]["points"]) == 5
    assert len(result["aois"]["aois"]) == 2
    num_regression.check(numeric_columns(result), default_tolerance=TOLERANCE)


def test_heatmap_numeric_substrate(corpus, monkeypatch, num_regression):
    histograms = []
    original = np.histogram2d

    def capture(*args, **kwargs):
        result = original(*args, **kwargs)
        histograms.append(result)
        return result

    monkeypatch.setattr(np, "histogram2d", capture)
    image, _ = HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(
        corpus.frames["SYN-01"], "stimulus-a", width=160, height=90,
    )
    assert image.startswith(b"\x89PNG\r\n\x1a\n")
    histogram, x_edges, y_edges = histograms[0]
    # Pin occupied bins and weights, not image bytes or matplotlib colours.
    num_regression.check({key: np.asarray(value, dtype=float) for key, value in {
        "occupied_bins": np.flatnonzero(histogram),
        "weights": histogram[histogram > 0],
        "shape": list(histogram.shape),
        "extent": [x_edges[0], x_edges[-1], y_edges[0], y_edges[-1]],
        "summary": [histogram.min(), histogram.max(), histogram.mean(), histogram.sum()],
    }.items()}, default_tolerance=TOLERANCE)


def test_executive_report_numeric_summaries(corpus, dataframe_regression):
    rows = []
    for frame in corpus.frames.values():
        for chart in ChartConfigBuilder.build_many(frame, "stimulus-a"):
            for series in chart["series"]:
                row = summarize_series(
                    series["label"], series["unit"],
                    [point["time"] for point in chart["data"]],
                    [point[series["key"]] for point in chart["data"]],
                )
                if row is not None:
                    rows.append(row)
    summary = pd.DataFrame(aggregate_summary_rows(rows)).sort_values(["label", "unit"]).reset_index(drop=True)
    assert len(summary) >= 10
    dataframe_regression.check(summary, default_tolerance=TOLERANCE)

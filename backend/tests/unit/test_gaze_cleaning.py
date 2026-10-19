"""Ingestion-time gaze cleaning: the Tobii (0,0) loss and its ramp never reach analytics."""

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.pupil_analytics_service import (
    PupilAnalyticsService,
)
from neurodatics.modules.projects.application.services.fixation_detection_service import (
    FixationDetectionMetadata,
    FixationDetectionService,
)

GRID_HZ = 300.0
EYE_HZ = 60.0


def _blink_frame(lost_rows: int) -> pd.DataFrame:
    """Steady gaze at (50%, 40%) with a loss written as (0,0) and the exporter's ramp."""
    rows = 900
    gx = np.full(rows, 0.5)
    gy = np.full(rows, 0.4)
    start = 450
    ramp = np.array([0.8, 0.6, 0.4, 0.2, 0.02])  # one native period (5 grid rows) toward 0
    gx[start - 5:start] = 0.5 * ramp
    gy[start - 5:start] = 0.4 * ramp
    gx[start:start + lost_rows] = 0.0
    gy[start:start + lost_rows] = 0.0
    end = start + lost_rows
    gx[end:end + 5] = 0.5 * ramp[::-1]
    gy[end:end + 5] = 0.4 * ramp[::-1]
    return pd.DataFrame({
        "time": np.arange(rows) / GRID_HZ,
        "scenario": ["A"] * rows,
        "gx": gx,
        "gy": gy,
        "lx_pupil": [3.0] * rows,
        "rx_pupil": [3.0] * rows,
    })


def _ingest(frame: pd.DataFrame) -> pd.DataFrame:
    return FixationDetectionService.detect_duration_variants(
        frame,
        FixationDetectionMetadata(
            eye_sampling_rate_hz=EYE_HZ,
            grid_sampling_rate_hz=GRID_HZ,
            gaze_units="normalized",
        ),
    ).samples


def test_ramp_rows_are_marked_as_signal_transition():
    samples = _ingest(_blink_frame(lost_rows=120))

    reasons = samples["gaze_invalid_reason"]
    assert (reasons.iloc[450:570] == "signal_missing").all()
    # Two native periods (10 grid rows) on each side cover the 5-row ramp.
    assert (reasons.iloc[440:450] == "signal_transition").all()
    assert (reasons.iloc[570:580] == "signal_transition").all()
    assert not samples["is_valid_gaze"].iloc[440:580].any()
    assert samples["is_valid_gaze"].iloc[:439].all()


def test_long_loss_is_a_gap_and_never_a_value_pulled_toward_zero():
    samples = _ingest(_blink_frame(lost_rows=120))

    clean_x = samples["gaze_x_clean"].to_numpy()
    finite = clean_x[np.isfinite(clean_x)]
    assert np.isnan(clean_x[500:520]).all()
    assert finite.min() == pytest.approx(50.0)
    assert finite.max() == pytest.approx(50.0)

    series = PupilAnalyticsService.compute_gaze_timeseries(samples, "A")
    assert None in series["gx_clean"]
    assert all(value is None or value == pytest.approx(50.0) for value in series["gx_clean"])


def test_short_loss_is_bridged_at_the_steady_value():
    samples = _ingest(_blink_frame(lost_rows=15))

    assert samples["gaze_x_clean"].to_numpy() == pytest.approx(np.full(900, 50.0))
    assert samples["gaze_y_clean"].to_numpy() == pytest.approx(np.full(900, 40.0))


def test_the_same_sample_keeps_its_value_whatever_the_time_window():
    samples = _ingest(_blink_frame(lost_rows=120))

    full = PupilAnalyticsService.compute_gaze_timeseries(samples, "A")
    zoomed = PupilAnalyticsService.compute_gaze_timeseries(samples, "A", 1.40, 1.60)

    by_time = dict(zip(full["time"], full["gx_clean"]))
    assert all(by_time[time] == value for time, value in zip(zoomed["time"], zoomed["gx_clean"]))


def test_non_positive_pupil_values_are_not_measurements():
    frame = pd.DataFrame({
        "time": np.arange(6) / 10.0,
        "scenario": ["A"] * 6,
        "lx_pupil": [3.0, -0.75, 3.0, 0.0, 3.0, 3.0],
        "rx_pupil": [3.0, -0.75, 3.0, 0.0, 3.0, 3.0],
    })

    series = PupilAnalyticsService.compute_timeseries(frame, "A")
    statistics = PupilAnalyticsService.compute_statistics(frame, "A")

    assert series["time"] == pytest.approx([0.0, 0.2, 0.4, 0.5])
    assert statistics["raw_min"] == 3.0
    assert statistics["min"] == 3.0

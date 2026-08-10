from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import (
    AoiAnalyticsService,
    FixationDataService,
    FixationEventService,
    FixationHistogramService,
    ScanpathAnalyticsService,
)
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingService,
)
from neurodatics.modules.projects.application.services.fixation_detection_service import (
    FixationDetectionMetadata,
    FixationDetectionService,
    ScreenGeometry,
)


def _decimal(value: float) -> str:
    return f"{value:.15f}".rstrip("0").rstrip(".").replace(".", ",")


def _metadata(
    participant: str,
    file_rate: str,
    channels: list[tuple[str, str]],
) -> list[str]:
    lines = [f"Grabación : {participant} | Rec 1"]
    for name, rate in channels:
        lines.extend(
            [
                f"Nombre : {name}",
                "Tiempo de inicio : 1/01/2026 10:00:00 a. m.",
                f"Frecuencia : {rate}",
                "Unidad Tobii : %",
                "",
            ]
        )
    lines.extend([f"Frecuencia del archivo : {file_rate}", ""])
    return lines


def _write_multirate_fixture(path: Path) -> tuple[int, int]:
    lines: list[str] = []

    lines.extend(
        _metadata(
            "111111",
            "60 Hz",
            [
                ("Bandwidth / X", "60 Hz"),
                ("Bandwidth / Y", "60 hz"),
                ("Electroencefalografía (EEG) / F3", "60 Hz"),
            ],
        )
    )
    lines.append(
        "Custom Sensor;Scenario 1;Bandwidth / Y;Time;Bandwidth / X;"
        "Fixations / Y;Fixations / X;Electroencefalografía (EEG) / F3;"
    )
    first_count = 31
    for index in range(first_count):
        time_s = index / 60.0
        gaze_x = 20.0 + (index % 3 - 1) * 0.05
        gaze_y = 30.0 + (index % 2) * 0.04
        if index == 10:
            gaze_x = gaze_y = 0.0
        lines.append(
            ";".join(
                [
                    _decimal(1000.0 + index),
                    "Stim A",
                    _decimal(gaze_y),
                    _decimal(time_s),
                    _decimal(gaze_x),
                    _decimal(88.0),
                    _decimal(99.0),
                    _decimal(100.0 + index),
                    "",
                ]
            )
        )

    lines.extend(
        _metadata(
            "222222",
            "300,313802515981 hz",
            [
                ("Bandwidth / X", "60,125 Hz"),
                ("Bandwidth / Y", "60.1 Hz"),
                ("GSR / GSR", "32 Hz"),
            ],
        )
    )
    lines.append("Bandwidth / X;GSR / GSR;Time;Scenario / Scenario 1;Bandwidth / Y;")
    second_count = 151
    grid_rate = 300.313802515981
    for index in range(second_count):
        time_s = index / grid_rate
        # Smooth changes on the file grid mimic a natively ~60 Hz eye channel
        # exported on a ~300 Hz master clock.
        gaze_x = 70.0 + 0.03 * np.sin(index / 20.0)
        gaze_y = 40.0 + 0.03 * np.cos(index / 20.0)
        lines.append(
            ";".join(
                [
                    _decimal(gaze_x),
                    _decimal(2.0 + index / 1000.0),
                    _decimal(time_s),
                    "Stim B",
                    _decimal(gaze_y),
                    "",
                ]
            )
        )

    path.write_text("\n".join(lines), encoding="utf-16")
    return first_count, second_count


def test_multiblock_multirate_pipeline_recomputes_fixations_and_preserves_sensors(
    tmp_path: Path,
) -> None:
    csv_path = tmp_path / "multirate.csv"
    first_count, second_count = _write_multirate_fixture(csv_path)

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "processed"))

    assert [item.participant_code for item in result.participants] == [
        "111111",
        "222222",
    ]
    assert len(result.block_metadata) == 2
    assert result.block_metadata[0].declared_file_rate_hz == pytest.approx(60.0)
    assert result.block_metadata[1].declared_file_rate_hz == pytest.approx(
        300.313802515981
    )
    assert result.block_metadata[1].declared_gaze_rate_hz == pytest.approx(60.1125)
    assert result.block_metadata[1].observed_grid_rate_hz == pytest.approx(
        300.313802515981, rel=1e-8
    )

    frames = [pd.read_parquet(path) for _, path in result.user_parquet_paths]
    first, second = frames
    assert len(first) == first_count
    assert len(second) == second_count
    assert not any(
        str(column).lower().startswith("unnamed")
        for frame in frames
        for column in frame
    )

    assert {"vendor_fix_x", "vendor_fix_y", "fix_x", "fix_y"}.issubset(first.columns)
    assert {"fix_x", "fix_y", "fixation_id", "fixation_segment_id"}.issubset(
        second.columns
    )
    assert (first["vendor_fix_x"] == 99.0).all()
    assert (first["vendor_fix_y"] == 88.0).all()

    # An eye-tracker blackout invalidates only eye-derived output. Simultaneous
    # EEG and arbitrary sensor data must remain numerically intact.
    assert first.loc[10, "f3"] == pytest.approx(110.0)
    custom_column = next(
        column for column in first.columns if "custom" in str(column).lower()
    )
    assert first.loc[10, custom_column] == pytest.approx(1010.0)
    assert tuple(first.loc[10, ["fix_x", "fix_y"]]) == (-100.0, -100.0)

    for frame in frames:
        fx = pd.to_numeric(frame["fix_x"], errors="coerce")
        fy = pd.to_numeric(frame["fix_y"], errors="coerce")
        sentinel = (fx == -100.0) & (fy == -100.0)
        valid = fx.between(0.0, 100.0) & fy.between(0.0, 100.0)
        assert bool((sentinel | valid).all())
        assert bool(((fx == -100.0) == (fy == -100.0)).all())
        assert int(valid.sum()) > 0

    # The second block was exported on a ~300 Hz grid but must be detected on
    # the declared ~60 Hz eye clock.
    assert second["fixation_effective_rate_hz"].dropna().iloc[0] == pytest.approx(
        60.1125
    )
    assert int(second["fixation_detector_sample_count"].max()) < second_count


def test_sensor_only_block_does_not_fabricate_fixations(tmp_path: Path) -> None:
    csv_path = tmp_path / "sensor-only.csv"
    lines = _metadata("333333", "30hz", [("GSR / GSR", "30 Hz")])
    lines.extend(
        [
            "Other Sensor;Time;GSR / GSR;",
            "7;0;1,5;",
            "8;0,033333333333;1,6;",
        ]
    )
    csv_path.write_text("\n".join(lines), encoding="utf-16")

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "processed"))
    frame = pd.read_parquet(result.user_parquet_paths[0][1])

    assert result.block_metadata[0].fixation_available is False
    assert "GSR" in result.detected_sensors
    assert "fix_x" not in frame.columns
    assert frame["gsr"].tolist() == pytest.approx([1.5, 1.6])


def test_complete_screen_geometry_selects_angular_detection_end_to_end(
    tmp_path: Path,
) -> None:
    csv_path = tmp_path / "with-geometry.csv"
    _write_multirate_fixture(csv_path)
    geometry = ScreenGeometry(
        width_px=1920,
        height_px=1080,
        width_mm=531.0,
        height_mm=299.0,
        viewing_distance_mm=620.0,
    )

    result = CsvProcessingService.process(
        str(csv_path),
        str(tmp_path / "processed"),
        screen_geometry=geometry,
    )

    assert all(
        block.fixation_method == "adaptive-ivt-angular"
        for block in result.block_metadata
    )
    for _, parquet_path in result.user_parquet_paths:
        frame = pd.read_parquet(parquet_path)
        assert set(frame["fixation_method"]) == {"adaptive-ivt-angular"}


def _resampled_gaze_block(
    *,
    grid_rate_hz: float = 300.0,
    first_event_s: float = 0.30,
    total_s: float = 0.60,
) -> pd.DataFrame:
    """A stable 300 ms gaze followed by a jump, exported on a fast master grid."""

    rows = int(round(total_s * grid_rate_hz))
    time_s = np.arange(rows) / grid_rate_hz
    gaze_x = np.where(time_s < first_event_s, 30.0, 70.0) + 0.01 * np.sin(
        np.arange(rows)
    )
    gaze_y = np.where(time_s < first_event_s, 40.0, 20.0) + 0.01 * np.cos(
        np.arange(rows)
    )
    return pd.DataFrame(
        {"time": time_s, "gx": gaze_x, "gy": gaze_y, "scenario": ["A"] * rows}
    )


def test_detector_event_duration_survives_the_canonical_analytics_contract() -> None:
    block = _resampled_gaze_block()

    detection = FixationDetectionService.detect(
        block,
        FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0, grid_sampling_rate_hz=300.0
        ),
    )

    assert detection.metadata["resampled"] is True
    assert detection.metadata["effective_rate_hz"] == pytest.approx(60.0)
    detector_durations_ms = [
        float(value) for value in detection.events["duration_ms"].tolist()
    ]
    assert detector_durations_ms[0] == pytest.approx(300.0, abs=1e-6)

    events, metadata = FixationEventService.build_events(detection.samples, "A")
    canonical_durations_ms = [
        float(value) * 1000.0 for value in events["duration_s"].tolist()
    ]

    # The API must report the detector's own valid support, not the wall time
    # its 300 Hz rows happen to span.
    # The canonical table stores seconds at microsecond resolution.
    assert canonical_durations_ms == pytest.approx(detector_durations_ms, abs=1e-3)
    assert metadata["estimated"] is False
    assert int(events["source_row_count"].iloc[0]) > int(
        events["detector_sample_count"].iloc[0]
    )

    fixation = FixationDataService.compute_fixation_data(detection.samples, "A")
    scanpath = ScanpathAnalyticsService.compute_scanpath(detection.samples, "A")
    histogram = FixationHistogramService.compute_histogram(detection.samples, "A")
    aoi = AoiAnalyticsService.compute_metrics(
        detection.samples,
        "A",
        [
            SimpleNamespace(
                id="target",
                name="Target",
                color="#ff0000",
                shape_type="rect",
                shape={"x": 20, "y": 30, "width": 25, "height": 25},
            )
        ],
    )

    assert fixation["fixations"][0]["duration_s"] == pytest.approx(0.300, abs=1e-6)
    assert scanpath["objectives"][0]["duration_s"] == pytest.approx(0.300, abs=1e-4)
    assert aoi["aois"][0]["total_dwell_time_ms"] == pytest.approx(300.0, abs=1e-2)
    assert histogram["n_fixations"] == len(detector_durations_ms)
    assert histogram["total_duration_ms"] == pytest.approx(
        sum(detector_durations_ms), abs=1e-2
    )
    # 180 exported rows never become 180 fixation events.
    assert len(block) == 180
    assert fixation["stats"]["n_fixations"] == len(detector_durations_ms) < 5


def test_signal_loss_inside_a_detector_event_stays_out_of_canonical_dwell() -> None:
    block = _resampled_gaze_block(total_s=0.40, first_event_s=0.40)
    # An eye-tracker blackout in the middle of an otherwise stable fixation.
    blackout = (block["time"] >= 0.15) & (block["time"] < 0.19)
    block.loc[blackout, ["gx", "gy"]] = 0.0

    detection = FixationDetectionService.detect(
        block,
        FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0, grid_sampling_rate_hz=300.0
        ),
    )
    events, _ = FixationEventService.build_events(detection.samples, "A")

    assert not events.empty
    detector_durations_ms = [
        float(value) for value in detection.events["duration_ms"].tolist()
    ]
    canonical_durations_ms = [
        float(value) * 1000.0 for value in events["duration_s"].tolist()
    ]
    # The canonical table stores seconds at microsecond resolution.
    assert canonical_durations_ms == pytest.approx(detector_durations_ms, abs=1e-3)

    # The blackout rows keep the paired sentinel and buy no dwell: the reported
    # duration stays below the wall time the event spans.
    invalid = detection.samples.loc[blackout, ["fix_x", "fix_y"]]
    assert (invalid["fix_x"] == -100.0).all()
    assert (invalid["fix_y"] == -100.0).all()
    wall_ms = [
        float(value) for value in detection.events["wall_duration_ms"].tolist()
    ]
    assert sum(canonical_durations_ms) < sum(wall_ms)

from pathlib import Path

import pandas as pd
import pytest

from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingError,
    CsvProcessingService,
)
from neurodatics.modules.projects.application.services.fixation_detection_service import (
    CANONICAL_FIXATION_MIN_DURATION_MS,
    FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    FixationDetectionConfig,
    FixationDetectionMetadata,
    FixationDetectionService,
    fixation_duration_column,
)
from neurodatics.modules.scenaries.domain.stimulus_placement import (
    StimulusPlacementContract,
)


def _capture_frames(monkeypatch):
    frames = []

    def fake_write(cls, df, user_index, output_dir, **kwargs):
        frames.append(df.copy())
        return [(user_index, str(Path(output_dir) / f"user{user_index}.parquet"))], []

    monkeypatch.setattr(
        CsvProcessingService, "_write_parquets", classmethod(fake_write)
    )
    return frames


def _write_csv(path: Path, lines, encoding="utf-16") -> None:
    path.write_text("\n".join(lines), encoding=encoding)


def test_process_parses_recording_blocks_aliases_metadata_and_arbitrary_order(
    tmp_path, monkeypatch
):
    frames = _capture_frames(monkeypatch)
    csv_path = tmp_path / "multiblock.csv"
    lines = [
        "Grabación : A001 | Rec 1",
        "Nombre : Bandwidth\u00a0/\u00a0X",
        "Tiempo de inicio : 1/01/2026 10:00:00 a. m.",
        "Frecuencia : 60,1 Hz",
        "Unidad Tobii : %",
        "Nombre : Bandwidth / Y",
        "Tiempo de inicio : 1/01/2026 10:00:00 a. m.",
        "Frecuencia : 60.2 hz",
        "Unidad Tobii : %",
        "Frecuencia del archivo : 10 Hz",
        "Custom   Sensor;BANDWIDTH / Y;Ｔｉｍｅ;Bandwidth / X;",
        "7;20;0;10;",
        "8;21;0,1;11;",
        "Grabacion : B002 | Rec 1",
        "Nombre : GSR / GSR",
        "Frecuencia : 32 Hz",
        "Unidad Tobii : µS",
        "Frecuencia del archivo : 20,0 Hz",
        "GSR / GSR;Time;Other Sensor;",
        "1,5;0;90;",
        "1,6;0,05;91;",
    ]
    _write_csv(csv_path, lines)

    result = CsvProcessingService.process(
        str(csv_path),
        str(tmp_path / "out"),
        screen_geometry={"width_px": 1920, "height_px": 1080},
    )

    assert result.encoding == "utf-16"
    assert [item.participant_code for item in result.participants] == ["A001", "B002"]
    assert result.detected_sensors == ["EyeTracker", "GSR"]
    assert len(result.block_metadata) == 2

    first = result.block_metadata[0]
    assert first.declared_file_rate_hz == pytest.approx(10.0)
    assert first.observed_grid_rate_hz == pytest.approx(10.0)
    assert first.declared_gaze_rate_hz == pytest.approx(60.15)
    assert first.resampled_for_detection is False
    assert first.effective_detection_rate_hz == pytest.approx(10.0)
    assert first.fixation_available is True
    assert first.fixation_method == "i-dt-normalized"
    assert first.fixation_source == "raw_gaze"
    assert first.sample_count == 2
    assert first.time_start == pytest.approx(0.0)
    assert first.time_end == pytest.approx(0.1)
    assert "custom sensor" in first.extra_columns
    assert {channel.canonical_name for channel in first.channels} == {"gx", "gy"}
    assert not any(column.startswith("unnamed") for column in first.normalized_columns)

    assert list(frames[0].columns)[:4] == ["custom sensor", "gy", "time", "gx"]
    assert {"fix_x", "fix_y", "fixation_id"}.issubset(frames[0].columns)
    assert frames[0]["custom sensor"].tolist() == pytest.approx([7.0, 8.0])
    assert frames[1]["gsr"].tolist() == pytest.approx([1.5, 1.6])


def test_raw_gaze_ingestion_persists_exact_compact_duration_variants(
    tmp_path, monkeypatch
):
    frames = _capture_frames(monkeypatch)
    rate_hz = 60.0
    segment_sample_counts = [6, 9, 12, 15, 18]
    data_lines = ["Time;Bandwidth / X;Bandwidth / Y;Scenario 1;"]
    row_number = 0
    for scenario_number, sample_count in enumerate(segment_sample_counts, start=1):
        for _ in range(sample_count):
            data_lines.append(
                ";".join(
                    [
                        str(row_number / rate_hz),
                        str(10.0 + scenario_number * 10.0),
                        str(20.0 + scenario_number * 5.0),
                        f"segment-{scenario_number}",
                        "",
                    ]
                )
            )
            row_number += 1

    csv_path = tmp_path / "duration-variants.csv"
    _write_csv(
        csv_path,
        [
            "Grabación : duration-test | Rec 1",
            "Frecuencia del archivo : 60 Hz",
            *data_lines,
        ],
    )

    CsvProcessingService.process(str(csv_path), str(tmp_path / "out"))

    persisted = frames[0]
    assert set(persisted[FIXATION_MIN_DURATION_COLUMN]) == {200}
    expected_variant_columns = {
        fixation_duration_column(base_column, duration_ms)
        for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS
        if duration_ms != CANONICAL_FIXATION_MIN_DURATION_MS
        for base_column in FIXATION_DURATION_VARIANT_COLUMNS
    }
    assert {
        column for column in persisted.columns if "__" in str(column)
    } == expected_variant_columns

    source = CsvProcessingService._build_dataframe_with_info(data_lines, ";").dataframe
    observed_rate_hz, _ = CsvProcessingService._derive_observed_rate(source, 60.0)
    metadata = FixationDetectionMetadata(grid_sampling_rate_hz=observed_rate_hz)
    for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        exact = FixationDetectionService.detect(
            source,
            metadata=metadata,
            config=FixationDetectionConfig(min_fixation_duration_ms=float(duration_ms)),
        )
        for base_column in FIXATION_DURATION_VARIANT_COLUMNS:
            persisted_column = fixation_duration_column(base_column, duration_ms)
            pd.testing.assert_series_equal(
                persisted[persisted_column],
                exact.samples[base_column],
                check_names=False,
            )


def test_header_fallback_creates_blocks_without_recording_markers(
    tmp_path, monkeypatch
):
    frames = _capture_frames(monkeypatch)
    csv_path = tmp_path / "headers-only.csv"
    _write_csv(
        csv_path,
        [
            "Value;Time;",
            "1;0;",
            "2;0,5;",
            "Time;Other;",
            "0;3;",
            "0,25;4;",
        ],
        encoding="utf-8",
    )

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "out"))

    assert [item.participant_code for item in result.participants] == [
        "participante_1",
        "participante_2",
    ]
    assert len(frames) == 2
    assert frames[0]["time"].tolist() == pytest.approx([0.0, 0.5])
    assert frames[1]["time"].tolist() == pytest.approx([0.0, 0.25])


def test_duplicate_alias_columns_are_coalesced_when_complementary():
    parsed = CsvProcessingService._build_dataframe_with_info(
        [
            "Time;Gaze X;Bandwidth / X;Bandwidth / Y;",
            "0;10;;20;",
            "0,1;;11;21;",
        ],
        ";",
    )

    assert parsed.dataframe["gx"].tolist() == pytest.approx([10.0, 11.0])
    assert parsed.dataframe["gy"].tolist() == pytest.approx([20.0, 21.0])
    assert any("coalesced duplicate column 'gx'" in item for item in parsed.warnings)


def test_duplicate_alias_columns_raise_on_conflicting_values():
    with pytest.raises(CsvProcessingError, match="duplicadas en conflicto"):
        CsvProcessingService._build_dataframe_with_info(
            [
                "Time;Gaze X;Bandwidth / X;Bandwidth / Y;",
                "0;10;99;20;",
            ],
            ";",
        )


@pytest.mark.parametrize(
    "lines,expected",
    [
        (["Time;Value;", "0;1;extra;too-many"], "Fila malformada"),
        (["Value;Time;", "1;not-a-time;"], "Valor numérico inválido"),
        (["Time;Value;", "0;1;", "0;2;"], "Timestamps no crecientes"),
    ],
)
def test_malformed_rows_and_timestamps_fail_strictly(lines, expected):
    with pytest.raises(CsvProcessingError, match=expected):
        CsvProcessingService._build_dataframe_with_info(lines, ";")


def test_only_trailing_all_null_unnamed_columns_are_removed():
    parsed = CsvProcessingService._build_dataframe_with_info(
        [
            "Time;Named Empty;;Value;",
            "0;;;;",
            "1;;;;",
        ],
        ";",
    )

    assert list(parsed.dataframe.columns) == [
        "time",
        "named empty",
        "unnamed_3",
        "value",
    ]
    assert parsed.dataframe["named empty"].isna().all()
    assert parsed.dataframe["unnamed_3"].isna().all()
    assert parsed.dataframe["value"].isna().all()


def test_eye_blackout_never_erases_eeg_gsr_or_extra_sensor():
    source = pd.DataFrame(
        {
            "time": [0.0],
            "gx": [0.0],
            "gy": [0.0],
            "f3": [110.0],
            "gsr": [1.5],
            "custom sensor": [1010.0],
            "vendor_fix_x": [99.0],
            "vendor_fix_y": [88.0],
        }
    )

    cleaned = CsvProcessingService._clean_dataframe(source)

    assert cleaned.loc[0, "gx"] == pytest.approx(0.0)
    assert cleaned.loc[0, "gy"] == pytest.approx(0.0)
    assert cleaned.loc[0, "f3"] == pytest.approx(110.0)
    assert cleaned.loc[0, "gsr"] == pytest.approx(1.5)
    assert cleaned.loc[0, "custom sensor"] == pytest.approx(1010.0)
    assert cleaned.loc[0, "vendor_fix_x"] == pytest.approx(99.0)
    assert cleaned.loc[0, "vendor_fix_y"] == pytest.approx(88.0)


def test_vendor_fixations_are_namespaced_by_default_and_legacy_mapping_is_optional():
    lines = [
        "Time;Fixations / X;Fixations / Y;Bandwidth / X;Bandwidth / Y;",
        "0;10;20;11;21;",
    ]

    namespaced = CsvProcessingService._build_dataframe_with_info(lines, ";")
    legacy = CsvProcessingService._build_dataframe_with_info(
        lines,
        ";",
        rename_vendor_fixations=False,
    )

    assert {"vendor_fix_x", "vendor_fix_y"}.issubset(namespaced.dataframe.columns)
    assert {"fix_x", "fix_y"}.issubset(legacy.dataframe.columns)


def test_partial_vendor_fixation_pair_is_reported(tmp_path, monkeypatch):
    frames = _capture_frames(monkeypatch)
    csv_path = tmp_path / "partial-fix.csv"
    _write_csv(
        csv_path,
        [
            "Grabación : 123 | Rec 1",
            "Frecuencia del archivo : 10 Hz",
            "Time;Fixations / X;Bandwidth / X;Bandwidth / Y;",
            "0;10;11;21;",
            "0,1;10;11;21;",
        ],
    )

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "out"))
    block = result.block_metadata[0]

    assert block.fixation_available is True
    assert block.fixation_source == "raw_gaze"
    assert "vendor_fix_x" in frames[0].columns
    assert "vendor_fix_y" not in frames[0].columns
    assert {"fix_x", "fix_y"}.issubset(frames[0].columns)
    assert any("partial vendor fixation columns" in item for item in block.warnings)


def test_gaze_rate_uses_lower_axis_rate_when_metadata_differs_by_more_than_two_percent(
    tmp_path, monkeypatch
):
    _capture_frames(monkeypatch)
    csv_path = tmp_path / "rate-mismatch.csv"
    _write_csv(
        csv_path,
        [
            "Grabación : 123 | Rec 1",
            "Nombre : Bandwidth / X",
            "Frecuencia : 60 Hz",
            "Nombre : Bandwidth / Y",
            "Frecuencia : 50 Hz",
            "Frecuencia del archivo : 10 Hz",
            "Time;Bandwidth / X;Bandwidth / Y;",
            "0;10;20;",
            "0,1;11;21;",
        ],
    )

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "out"))
    block = result.block_metadata[0]

    assert block.declared_gaze_rate_hz == pytest.approx(50.0)
    assert any("differ by more than 2%" in item for item in block.warnings)


def test_invalid_rates_and_mixed_extra_sensor_are_preserved_with_warnings(
    tmp_path, monkeypatch
):
    frames = _capture_frames(monkeypatch)
    csv_path = tmp_path / "invalid-rates.csv"
    _write_csv(
        csv_path,
        [
            "Grabación : 123 | Rec 1",
            "Nombre : Bandwidth / X",
            "Tiempo de inicio : channel-start",
            "Frecuencia : -60 Hz",
            "Nombre : Bandwidth / Y",
            "Frecuencia : 60 Hz",
            "Frecuencia del archivo : 0 Hz",
            "Tiempo de inicio : global-start",
            "Time;Bandwidth / X;Bandwidth / Y;Mixed Sensor;",
            "0;10;20;1;",
            "0,1;11;21;text;",
        ],
    )

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "out"))
    block = result.block_metadata[0]

    assert block.declared_file_rate_hz is None
    assert block.channels[0].declared_frequency_hz is None
    assert block.channels[0].start_time == "channel-start"
    assert frames[0]["mixed sensor"].tolist() == ["1", "text"]
    assert any("must be positive" in item for item in block.warnings)


def test_process_threads_resolved_placement_and_exposes_json_safe_snapshots(
    tmp_path, monkeypatch
):
    frames = _capture_frames(monkeypatch)
    csv_path = tmp_path / "placed.csv"
    rows = [f"{index / 60:.8f};480;540;Centered Square;" for index in range(12)]
    _write_csv(
        csv_path,
        [
            "Grabación : P01 | Rec 1",
            "Nombre : Bandwidth / X",
            "Frecuencia : 60 Hz",
            "Unidad Tobii : px",
            "Nombre : Bandwidth / Y",
            "Frecuencia : 60 Hz",
            "Unidad Tobii : px",
            "Frecuencia del archivo : 60 Hz",
            "Time;Bandwidth / X;Bandwidth / Y;Scenario 1;",
            *rows,
        ],
        encoding="utf-8",
    )
    placement = StimulusPlacementContract.from_dict(
        {
            "geometry_stability": "static",
            "contract_version": "screen-stimulus-v1",
            "screen_width_px": 1920,
            "screen_height_px": 1080,
            "stimulus_left_px": 420,
            "stimulus_top_px": 0,
            "stimulus_width_px": 1080,
            "stimulus_height_px": 1080,
            "display_mode": "contain",
        },
        intrinsic_width=1080,
        intrinsic_height=1080,
    )

    result = CsvProcessingService.process(
        str(csv_path),
        str(tmp_path / "out"),
        stimulus_placements_by_scenario={"Centered Square.png": placement},
    )

    frame = frames[0]
    assert frame["gx"].tolist() == [480.0] * 12
    assert frame["gy"].tolist() == [540.0] * 12
    assert frame["gaze_x_stimulus_norm"].tolist() == pytest.approx([1.0 / 18.0] * 12)
    assert set(frame["stimulus_transform_status"]) == {"applied"}
    assert set(frame["fixation_coordinate_space"]) == {"stimulus_percent"}
    assert set(frame["screen_width_px"]) == {1920.0}
    assert set(frame["stimulus_display_width_px"]) == {1080.0}

    block = result.block_metadata[0]
    assert block.stimulus_transform_status == "applied"
    assert block.stimulus_transform_version == "screen-stimulus-v1"
    assert block.stimulus_transform_fingerprint == placement.fingerprint
    assert block.stimulus_placements_by_scenario == {
        "Centered Square.png": placement.to_snapshot()
    }
    assert result.stimulus_placements_by_scenario == (
        block.stimulus_placements_by_scenario
    )
    assert result.physical_screen_geometry is None


def test_parquet_schema_metadata_contains_user_and_scenario_snapshots(tmp_path):
    import json

    import pyarrow.parquet as pq

    frame = pd.DataFrame(
        {
            "time": [0.0],
            "scenario": ["Centered Square"],
            "gx": [480.0],
            "gy": [540.0],
        }
    )
    placement = {
        "geometry_stability": "static",
        "contract_version": "screen-stimulus-v1",
        "screen_width_px": 1920,
        "screen_height_px": 1080,
        "stimulus_left_px": 420,
        "stimulus_top_px": 0,
        "stimulus_width_px": 1080,
        "stimulus_height_px": 1080,
        "display_mode": "contain",
        "viewport": {
            "left_px": 0,
            "top_px": 0,
            "width_px": 1920,
            "height_px": 1080,
            "scroll_x_px": 0,
            "scroll_y_px": 0,
        },
        "source": "user_config",
        "contract_fingerprint": "a" * 64,
    }
    physical = {
        "width_px": 1920.0,
        "height_px": 1080.0,
        "width_mm": 530.0,
        "height_mm": 300.0,
        "viewing_distance_mm": 650.0,
    }

    user_paths, scenario_paths = CsvProcessingService._write_parquets(
        frame,
        user_index=1,
        output_dir=str(tmp_path),
        stimulus_placements_by_scenario={"Centered Square.png": placement},
        physical_screen_geometry=physical,
    )

    user_metadata = pq.read_metadata(user_paths[0][1]).metadata
    scenario_metadata = pq.read_metadata(scenario_paths[0][2]).metadata
    assert json.loads(user_metadata[b"stimulus_placements_by_scenario"]) == {
        "Centered Square.png": placement
    }
    assert json.loads(scenario_metadata[b"stimulus_placement"]) == placement
    assert json.loads(user_metadata[b"physical_screen_geometry"]) == physical
    assert json.loads(scenario_metadata[b"physical_screen_geometry"]) == physical
    pd.testing.assert_frame_equal(pd.read_parquet(user_paths[0][1]), frame)

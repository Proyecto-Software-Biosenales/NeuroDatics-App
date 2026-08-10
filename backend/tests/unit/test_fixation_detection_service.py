import json

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from neurodatics.modules.projects.application.services.fixation_detection_service import (
    CANONICAL_FIXATION_MIN_DURATION_MS,
    DEFAULT_FIXATION_MIN_DURATION_MS,
    FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    FixationDetectionConfig,
    FixationDetectionMetadata,
    FixationDetectionService,
    ScreenGeometry,
    fixation_duration_column,
)
from neurodatics.modules.scenaries.domain.stimulus_placement import (
    StimulusPlacementContract,
)


def _placement(
    *,
    left: float,
    top: float,
    width: float,
    height: float,
    mode: str = "crop",
    viewport=None,
) -> StimulusPlacementContract:
    payload = {
        "geometry_stability": "static",
        "contract_version": "screen-stimulus-v1",
        "screen_width_px": 1920,
        "screen_height_px": 1080,
        "stimulus_left_px": left,
        "stimulus_top_px": top,
        "stimulus_width_px": width,
        "stimulus_height_px": height,
        "display_mode": mode,
        "viewport": viewport
        or {
            "left_px": 0,
            "top_px": 0,
            "width_px": 1920,
            "height_px": 1080,
        },
    }
    return StimulusPlacementContract.from_dict(
        payload,
        intrinsic_width=int(width),
        intrinsic_height=int(height),
    )


def _two_fixations(rate_hz: float, duration_s: float = 1.0) -> pd.DataFrame:
    time = np.arange(0.0, duration_s, 1.0 / rate_hz)
    gx = np.full(time.size, -100.0)
    gy = np.full(time.size, -100.0)

    first = time < 0.35
    transition = (time >= 0.35) & (time < 0.48)
    second = time >= 0.48

    gx[first] = 20.0 + 0.08 * np.sin(2.0 * np.pi * 3.0 * time[first])
    gy[first] = 30.0 + 0.08 * np.cos(2.0 * np.pi * 2.0 * time[first])
    alpha = (time[transition] - 0.35) / 0.13
    gx[transition] = 20.0 + 50.0 * alpha
    gy[transition] = 30.0 + 30.0 * alpha
    gx[second] = 70.0 + 0.08 * np.sin(2.0 * np.pi * 3.0 * time[second])
    gy[second] = 60.0 + 0.08 * np.cos(2.0 * np.pi * 2.0 * time[second])

    return pd.DataFrame(
        {
            "time": time,
            "gx": gx,
            "gy": gy,
            "scenario": ["stimulus-a"] * time.size,
        }
    )


def test_minimum_duration_contract_defaults_to_canonical_200_ms():
    assert SUPPORTED_FIXATION_MIN_DURATIONS_MS == (100, 150, 200, 250, 300)
    assert DEFAULT_FIXATION_MIN_DURATION_MS == 200
    assert CANONICAL_FIXATION_MIN_DURATION_MS == 200
    assert FixationDetectionConfig().min_fixation_duration_ms == pytest.approx(200.0)
    assert fixation_duration_column("fix_x", 200) == "fix_x"
    assert fixation_duration_column("fixation_id", 150) == "fixation_id__150ms"

    result = FixationDetectionService.detect(
        _two_fixations(60.0),
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0),
    )

    assert result.metadata["min_fixation_duration_ms"] == pytest.approx(200.0)
    assert set(result.samples[FIXATION_MIN_DURATION_COLUMN]) == {200}
    assert set(result.events[FIXATION_MIN_DURATION_COLUMN]) == {200}

    with pytest.raises(ValueError, match="one of 100, 150, 200, 250, 300"):
        FixationDetectionService.detect(
            _two_fixations(60.0),
            config=FixationDetectionConfig(min_fixation_duration_ms=125.0),
        )


def test_duration_variants_are_exact_independent_runs_and_row_aligned(monkeypatch):
    rate_hz = 60.0
    segment_sample_counts = [6, 9, 12, 15, 18]
    scenario_values = [
        scenario
        for scenario, count in enumerate(segment_sample_counts, start=1)
        for _ in range(count)
    ]
    row_count = len(scenario_values)
    block = pd.DataFrame(
        {
            "time": np.arange(row_count, dtype=float) / rate_hz,
            "gx": [10.0 + scenario * 10.0 for scenario in scenario_values],
            "gy": [20.0 + scenario * 5.0 for scenario in scenario_values],
            "scenario": [f"segment-{scenario}" for scenario in scenario_values],
        },
        index=np.arange(1000, 1000 + row_count),
    )
    metadata = FixationDetectionMetadata(eye_sampling_rate_hz=rate_hz)

    original_resolver = FixationDetectionService._resolve_coordinate_spaces
    coordinate_resolution_calls = 0

    def counting_resolver(*args, **kwargs):
        nonlocal coordinate_resolution_calls
        coordinate_resolution_calls += 1
        return original_resolver(*args, **kwargs)

    monkeypatch.setattr(
        FixationDetectionService,
        "_resolve_coordinate_spaces",
        staticmethod(counting_resolver),
    )

    combined = FixationDetectionService.detect_duration_variants(
        block,
        metadata=metadata,
    )
    assert coordinate_resolution_calls == 1
    monkeypatch.setattr(
        FixationDetectionService,
        "_resolve_coordinate_spaces",
        staticmethod(original_resolver),
    )

    assert combined.samples.index.equals(block.index)
    assert combined.metadata["supported_min_fixation_durations_ms"] == [
        100,
        150,
        200,
        250,
        300,
    ]
    assert combined.metadata["canonical_min_fixation_duration_ms"] == 200

    expected_variant_columns = {
        fixation_duration_column(base_column, duration_ms)
        for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS
        if duration_ms != CANONICAL_FIXATION_MIN_DURATION_MS
        for base_column in FIXATION_DURATION_VARIANT_COLUMNS
    }
    actual_variant_columns = {
        column for column in combined.samples if "__" in str(column)
    }
    assert actual_variant_columns == expected_variant_columns

    event_counts = []
    for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        independent = FixationDetectionService.detect(
            block,
            metadata=metadata,
            config=FixationDetectionConfig(min_fixation_duration_ms=float(duration_ms)),
        )
        event_counts.append(len(independent.events))
        for base_column in FIXATION_DURATION_VARIANT_COLUMNS:
            actual_column = fixation_duration_column(base_column, duration_ms)
            assert_frame_equal(
                combined.samples[[actual_column]].rename(
                    columns={actual_column: base_column}
                ),
                independent.samples[[base_column]],
            )

    assert event_counts == [5, 4, 3, 2, 1]


def test_angular_duration_filter_matches_independent_ivt_runs():
    rate_hz = 60.0
    counts = [6, 9, 12, 15, 18]
    scenarios = [
        scenario
        for scenario, count in enumerate(counts, start=1)
        for _ in range(count)
    ]
    block = pd.DataFrame(
        {
            "time": np.arange(len(scenarios), dtype=float) / rate_hz,
            "gx": [10.0 + scenario * 10.0 for scenario in scenarios],
            "gy": [20.0 + scenario * 5.0 for scenario in scenarios],
            "scenario": [f"segment-{scenario}" for scenario in scenarios],
        }
    )
    metadata = FixationDetectionMetadata(
        eye_sampling_rate_hz=rate_hz,
        screen_geometry=ScreenGeometry(1920, 1080, 531.0, 299.0, 620.0),
    )

    combined = FixationDetectionService.detect_duration_variants(
        block,
        metadata=metadata,
    )

    for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        independent = FixationDetectionService.detect(
            block,
            metadata=metadata,
            config=FixationDetectionConfig(min_fixation_duration_ms=duration_ms),
        )
        for base_column in FIXATION_DURATION_VARIANT_COLUMNS:
            actual_column = fixation_duration_column(base_column, duration_ms)
            assert_frame_equal(
                combined.samples[[actual_column]].rename(
                    columns={actual_column: base_column}
                ),
                independent.samples[[base_column]],
            )
        if duration_ms == CANONICAL_FIXATION_MIN_DURATION_MS:
            assert_frame_equal(
                combined.samples[list(independent.samples.columns)],
                independent.samples,
            )
            assert_frame_equal(combined.events, independent.events)


@pytest.mark.parametrize("rate_hz", [30.0, 60.0, 300.313])
def test_normalized_idt_detects_two_events_at_supported_grid_rates(rate_hz):
    block = _two_fixations(rate_hz)

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=rate_hz),
    )

    assert len(result.samples) == len(block)
    assert len(result.events) == 2
    assert result.events["duration_ms"].ge(200.0).all()
    assert result.events["centroid_x"].tolist() == pytest.approx([20.0, 70.0], abs=0.2)
    assert result.events["centroid_y"].tolist() == pytest.approx([30.0, 60.0], abs=0.2)
    assert set(result.samples["method"]) == {"i-dt-normalized"}
    assert set(result.samples["version"]) == {"fixation-v2"}

    no_fixation = result.samples["fixation_id"].isna()
    assert (result.samples.loc[no_fixation, ["fix_x", "fix_y"]] == -100.0).all().all()
    assert (
        result.samples["fix_x"].eq(-100.0) == result.samples["fix_y"].eq(-100.0)
    ).all()


def test_resamples_a_300_hz_export_to_the_declared_60_hz_eye_rate():
    native = _two_fixations(60.0)
    export_time = np.arange(0.0, native["time"].iloc[-1], 1.0 / 300.313)
    exported = pd.DataFrame(
        {
            "time": export_time,
            "gx": np.interp(export_time, native["time"], native["gx"]),
            "gy": np.interp(export_time, native["time"], native["gy"]),
            "scenario": ["stimulus-a"] * export_time.size,
        }
    )

    native_result = FixationDetectionService.detect(
        native,
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0),
    )
    exported_result = FixationDetectionService.detect(
        exported,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            grid_sampling_rate_hz=300.313,
        ),
    )

    assert exported_result.metadata["resampled"] is True
    assert exported_result.metadata["analysis_sample_count"] < len(exported)
    assert len(exported_result.events) == len(native_result.events) == 2
    assert exported_result.events["centroid_x"].tolist() == pytest.approx(
        native_result.events["centroid_x"].tolist(), abs=0.25
    )
    assert exported_result.events["duration_ms"].tolist() == pytest.approx(
        native_result.events["duration_ms"].tolist(), abs=35.0
    )


def test_effective_rate_never_exceeds_a_slower_file_grid():
    block = _two_fixations(30.0)

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            grid_sampling_rate_hz=30.0,
        ),
    )

    assert result.metadata["effective_rate_hz"] == pytest.approx(30.0)
    assert result.metadata["resampled"] is False


def test_short_stationary_invalid_gap_is_bridged_but_rows_remain_sentinel():
    block = _two_fixations(60.0, duration_s=0.34)
    gap_rows = block.index[(block["time"] >= 0.15) & (block["time"] < 0.20)]
    block.loc[gap_rows, ["gx", "gy"]] = -100.0

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0),
    )

    assert len(result.events) == 1
    assert result.events.iloc[0]["bridged_gap_count"] == 1
    assert result.samples.loc[gap_rows, "fixation_id"].isna().all()
    assert (result.samples.loc[gap_rows, ["fix_x", "fix_y"]] == -100.0).all().all()


def test_long_invalid_gap_splits_events_and_never_leaks_coordinates():
    rate_hz = 60.0
    time = np.arange(0.0, 0.8, 1.0 / rate_hz)
    block = pd.DataFrame(
        {
            "time": time,
            "gx": np.full(time.size, 42.0),
            "gy": np.full(time.size, 58.0),
            "scenario": ["stimulus-a"] * time.size,
        }
    )
    gap_rows = block.index[(block["time"] >= 0.30) & (block["time"] < 0.42)]
    block.loc[gap_rows, ["gx", "gy"]] = np.nan

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=rate_hz),
    )

    assert len(result.events) == 2
    assert result.samples.loc[gap_rows, "fixation_id"].isna().all()
    assert (result.samples.loc[gap_rows, ["fix_x", "fix_y"]] == -100.0).all().all()


def test_short_gap_is_not_bridged_when_endpoints_are_spatially_incompatible():
    rate_hz = 60.0
    time = np.arange(0.0, 0.7, 1.0 / rate_hz)
    gx = np.where(time < 0.32, 15.0, 80.0)
    gy = np.where(time < 0.32, 25.0, 70.0)
    block = pd.DataFrame(
        {"time": time, "gx": gx, "gy": gy, "scenario": ["stimulus-a"] * len(time)}
    )
    gap_rows = block.index[(block["time"] >= 0.30) & (block["time"] < 0.35)]
    block.loc[gap_rows, ["gx", "gy"]] = -100.0

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=rate_hz),
    )

    assert len(result.events) == 2
    assert result.events["bridged_gap_count"].sum() == 0


def test_angular_mode_uses_complete_screen_geometry():
    geometry = ScreenGeometry(
        width_px=1920,
        height_px=1080,
        width_mm=531.0,
        height_mm=299.0,
        viewing_distance_mm=620.0,
    )
    result = FixationDetectionService.detect(
        _two_fixations(60.0),
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            screen_geometry=geometry,
        ),
        config=FixationDetectionConfig(coordinate_mode="angular"),
    )

    assert len(result.events) == 2
    assert set(result.samples["method"]) == {"adaptive-ivt-angular"}
    assert result.metadata["classification_units"] == "degrees_per_second"
    assert result.events["velocity_threshold_deg_s"].notna().all()


def test_angular_mode_rejects_missing_geometry():
    with pytest.raises(ValueError, match="screen geometry"):
        FixationDetectionService.detect(
            _two_fixations(60.0),
            config=FixationDetectionConfig(coordinate_mode="angular"),
        )


def test_detector_is_deterministic():
    block = _two_fixations(60.0)
    metadata = FixationDetectionMetadata(eye_sampling_rate_hz=60.0)

    first = FixationDetectionService.detect(block, metadata=metadata)
    second = FixationDetectionService.detect(block, metadata=metadata)

    assert_frame_equal(first.samples, second.samples)
    assert_frame_equal(first.events, second.events)
    assert first.metadata == second.metadata


def test_scenario_change_never_crosses_an_event_and_ids_are_globally_unique():
    rate_hz = 60.0
    time = np.arange(0.0, 0.4, 1.0 / rate_hz)
    block = pd.DataFrame(
        {
            "time": time,
            "gx": np.full(len(time), 40.0),
            "gy": np.full(len(time), 55.0),
            "scenario": np.where(time < 0.2, "a", "b"),
        }
    )

    result = FixationDetectionService.detect(
        block, metadata=FixationDetectionMetadata(eye_sampling_rate_hz=rate_hz)
    )

    assert result.events["scenario"].tolist() == ["a", "b"]
    assert result.events["fixation_segment_id"].tolist() == [1, 2]
    assert result.events["fixation_id"].tolist() == [1, 2]
    assert result.events["fixation_id"].is_unique
    assert set(result.samples["fixation_id"].dropna().astype(int)) == {1, 2}


def test_non_increasing_timestamp_starts_a_new_segment():
    rate_hz = 60.0
    one_run = np.arange(0.0, 0.22, 1.0 / rate_hz)
    time = np.concatenate([one_run, one_run])
    block = pd.DataFrame(
        {
            "time": time,
            "gx": np.full(len(time), 33.0),
            "gy": np.full(len(time), 44.0),
            "scenario": ["a"] * len(time),
        }
    )

    result = FixationDetectionService.detect(
        block, metadata=FixationDetectionMetadata(eye_sampling_rate_hz=rate_hz)
    )

    reset_row = len(one_run)
    assert result.events["fixation_segment_id"].tolist() == [1, 2]
    assert result.samples["fixation_segment_id"].nunique() == 2
    assert not bool(result.samples.loc[reset_row, "is_valid_gaze"])
    assert tuple(result.samples.loc[reset_row, ["fix_x", "fix_y"]]) == (
        -100.0,
        -100.0,
    )
    assert "non_increasing_timestamps_invalidated" in result.metadata["warnings"]


def test_zero_pair_and_out_of_bounds_coordinates_are_always_invalid():
    block = _two_fixations(60.0, duration_s=0.34)
    invalid_rows = [4, 9, 10]
    block.loc[4, ["gx", "gy"]] = [0.0, 0.0]
    block.loc[9, ["gx", "gy"]] = [101.0, 50.0]
    block.loc[10, ["gx", "gy"]] = [50.0, -1.0]

    result = FixationDetectionService.detect(
        block, metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0)
    )

    assert not result.samples.loc[invalid_rows, "is_valid_gaze"].any()
    assert result.samples.loc[invalid_rows, "fixation_id"].isna().all()
    assert (result.samples.loc[invalid_rows, ["fix_x", "fix_y"]] == -100.0).all().all()


def test_missing_scenario_is_treated_as_one_empty_scenario_segment():
    block = _two_fixations(60.0).drop(columns="scenario")

    result = FixationDetectionService.detect(
        block, metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0)
    )

    assert "scenario" in result.samples
    assert set(result.samples["scenario"]) == {""}
    assert result.samples["fixation_segment_id"].nunique() == 1
    assert set(result.events["scenario"]) == {""}


def test_angular_mode_accepts_per_sample_distance_and_reports_its_use():
    geometry = ScreenGeometry(
        width_px=1920,
        height_px=1080,
        width_mm=531.0,
        height_mm=299.0,
        viewing_distance_mm=620.0,
    )
    block = _two_fixations(60.0)
    block["distance"] = np.linspace(590.0, 650.0, len(block))

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            distance_unit="mm",
            screen_geometry=geometry,
        ),
    )

    assert result.metadata["sample_distance_used"] is True
    assert set(result.events["fixation_method"]) == {"adaptive-ivt-angular"}


def test_event_duration_is_valid_detector_support_not_bridged_wall_time():
    block = _two_fixations(60.0, duration_s=0.34)
    gap_rows = block.index[(block["time"] >= 0.15) & (block["time"] < 0.20)]
    block.loc[gap_rows, ["gx", "gy"]] = -100.0

    result = FixationDetectionService.detect(
        block, metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0)
    )

    event = result.events.iloc[0]
    assert event["duration_ms"] >= 200.0
    assert event["wall_duration_ms"] > event["duration_ms"]
    assert event["duration_ms"] == pytest.approx(
        event["fixation_detector_sample_count"]
        / event["fixation_effective_rate_hz"]
        * 1000.0
    )


def test_irregular_timestamps_control_minimum_duration_and_reported_support():
    metadata = FixationDetectionMetadata(
        eye_sampling_rate_hz=60.0,
        grid_sampling_rate_hz=60.0,
    )
    short = pd.DataFrame(
        {
            "time": np.arange(0.0, 0.15, 0.01),
            "gx": 25.0,
            "gy": 35.0,
            "scenario": "a",
        }
    )

    short_result = FixationDetectionService.detect(short, metadata=metadata)

    assert short_result.events.empty

    long = pd.DataFrame(
        {
            "time": np.arange(0.0, 0.20, 0.01),
            "gx": 25.0,
            "gy": 35.0,
            "scenario": "a",
        }
    )
    long_result = FixationDetectionService.detect(long, metadata=metadata)

    assert len(long_result.events) == 1
    event = long_result.events.iloc[0]
    assert event["duration_ms"] == pytest.approx(200.0)
    assert event["duration_ms"] < (
        event["fixation_detector_sample_count"]
        / event["fixation_effective_rate_hz"]
        * 1000.0
    )


def test_angular_threshold_adapts_when_local_maxima_have_two_populations():
    rate_hz = 60.0
    time = np.arange(0.0, 6.0, 1.0 / rate_hz)
    alternating_target = np.where(np.floor(time / 0.5).astype(int) % 2 == 0, 30.0, 70.0)
    block = pd.DataFrame(
        {
            "time": time,
            "gx": alternating_target + 0.03 * np.sin(2.0 * np.pi * 5.0 * time),
            "gy": 50.0 + 0.03 * np.cos(2.0 * np.pi * 4.0 * time),
        }
    )
    geometry = ScreenGeometry(1920, 1080, 531.0, 299.0, 620.0)

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=rate_hz, screen_geometry=geometry
        ),
    )

    threshold = result.metadata["segment_thresholds"][0]
    assert threshold["threshold_source"] == "adaptive_gap_statistic"
    assert threshold["velocity_threshold_deg_s"] != pytest.approx(30.0)
    assert len(result.events) == 12


def test_centered_square_maps_to_local_centroid_and_preserves_raw_pixels():
    block = pd.DataFrame(
        {
            "time": np.arange(12, dtype=float) / 60.0,
            "gx": [480.0] * 12,
            "gy": [540.0] * 12,
            "scenario": ["Centered Square.png"] * 12,
        }
    )
    original = block[["gx", "gy"]].copy(deep=True)
    placement = _placement(
        left=420.0,
        top=0.0,
        width=1080.0,
        height=1080.0,
        mode="contain",
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"centered square": placement},
        ),
    )

    assert_frame_equal(result.samples[["gx", "gy"]], original)
    assert result.samples["gaze_x_screen_px"].tolist() == [480.0] * 12
    assert result.samples["gaze_x_stimulus_norm"].tolist() == pytest.approx(
        [1.0 / 18.0] * 12
    )
    assert result.samples["gaze_y_stimulus_norm"].tolist() == pytest.approx([0.5] * 12)
    assert result.samples["is_valid_gaze"].all()
    assert len(result.events) == 1
    assert result.events.iloc[0]["centroid_x"] == pytest.approx(5.5555556)
    assert result.events.iloc[0]["centroid_y"] == pytest.approx(50.0)
    assert set(result.samples["fixation_coordinate_space"]) == {"stimulus_percent"}
    assert set(result.samples["stimulus_display_width_px"]) == {1080.0}
    assert result.metadata["stimulus_transform_status"] == "applied"


def test_letterbox_interval_is_unclipped_invalid_and_non_bridgeable():
    placement = _placement(
        left=420.0,
        top=0.0,
        width=1080.0,
        height=1080.0,
        mode="contain",
    )
    gx = np.asarray([480.0] * 13 + [300.0] * 3 + [480.0] * 13)
    block = pd.DataFrame(
        {
            "time": np.arange(len(gx), dtype=float) / 60.0,
            "gx": gx,
            "gy": [540.0] * len(gx),
            "scenario": ["centered-square"] * len(gx),
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"centered-square.png": placement},
        ),
    )

    outside = result.samples.iloc[13:16]
    assert outside["gaze_x_stimulus_norm"].tolist() == pytest.approx([-1.0 / 9.0] * 3)
    assert set(outside["gaze_invalid_reason"].dropna()) == {"outside_stimulus"}
    assert not outside["is_valid_gaze"].any()
    assert outside["fixation_id"].isna().all()
    assert outside["fixation_segment_id"].isna().all()
    assert len(result.events) == 2
    assert result.events["fixation_segment_id"].nunique() == 2
    assert result.metadata["rejected_outside_count"] == 3


def test_crop_and_offset_fixtures_keep_unclipped_local_coordinates():
    crop = _placement(
        left=0.0,
        top=0.0,
        width=1920.0,
        height=1080.0,
        viewport={
            "left_px": 420,
            "top_px": 0,
            "width_px": 1080,
            "height_px": 1080,
        },
    )
    offset = _placement(left=160.0, top=90.0, width=1280.0, height=720.0)
    block = pd.DataFrame(
        {
            "time": [0.0, 1.0 / 60.0, 2.0 / 60.0, 3.0 / 60.0],
            "gx": [420.0, 200.0, 800.0, 100.0],
            "gy": [540.0, 540.0, 450.0, 450.0],
            "scenario": ["crop", "crop", "offset", "offset"],
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"crop.png": crop, "offset": offset},
        ),
    )

    assert result.samples["gaze_x_stimulus_norm"].tolist() == pytest.approx(
        [0.21875, 0.1041666667, 0.5, -0.046875]
    )
    assert result.samples["gaze_y_stimulus_norm"].tolist() == pytest.approx(
        [0.5, 0.5, 0.5, 0.5]
    )
    assert result.samples["gaze_invalid_reason"].tolist() == [
        pd.NA,
        "outside_viewport",
        pd.NA,
        "outside_stimulus",
    ]


def test_approved_cover_crop_and_offset_numerical_examples():
    cover = _placement(
        left=0.0,
        top=-180.0,
        width=1920.0,
        height=1440.0,
        mode="cover",
    )
    offset = _placement(left=240.0, top=120.0, width=1200.0, height=800.0)
    block = pd.DataFrame(
        {
            "time": np.arange(5, dtype=float) / 60.0,
            "gx": [960.0, 960.0, 960.0, 840.0, 200.0],
            "gy": [0.0, 540.0, 1080.0, 520.0, 520.0],
            "scenario": ["cover", "cover", "cover", "offset", "offset"],
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"cover": cover, "offset": offset},
        ),
    )

    assert result.samples["gaze_x_stimulus_norm"].tolist() == pytest.approx(
        [0.5, 0.5, 0.5, 0.5, -1.0 / 30.0]
    )
    assert result.samples["gaze_y_stimulus_norm"].tolist() == pytest.approx(
        [0.125, 0.5, 0.875, 0.5, 0.5]
    )
    assert result.samples["gaze_invalid_reason"].tolist() == [
        pd.NA,
        pd.NA,
        pd.NA,
        pd.NA,
        "outside_stimulus",
    ]


def test_normalized_idt_classifies_in_screen_space_but_centroids_locally():
    placement = _placement(left=800.0, top=0.0, width=200.0, height=1080.0)
    gx = np.tile([850.0, 870.0], 6)
    block = pd.DataFrame(
        {
            "time": np.arange(len(gx), dtype=float) / 60.0,
            "gx": gx,
            "gy": [540.0] * len(gx),
            "scenario": ["narrow"] * len(gx),
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"narrow": placement},
        ),
    )

    # Screen dispersion is 20/1920 (< 0.03); local dispersion is 20/200
    # (> 0.03). A fixation proves classification did not use stretched local X.
    assert len(result.events) == 1
    assert result.events.iloc[0]["centroid_x"] == pytest.approx(30.0)
    assert result.events.iloc[0]["classification_units"] == "normalized"
    assert result.metadata["coordinate_mode"] == "normalized"


def test_angular_detector_uses_physical_screen_but_emits_local_centroid():
    placement = _placement(
        left=420.0,
        top=0.0,
        width=1080.0,
        height=1080.0,
        mode="contain",
    )
    geometry = ScreenGeometry(1920, 1080, 531.0, 299.0, 620.0)
    block = pd.DataFrame(
        {
            "time": np.arange(12, dtype=float) / 60.0,
            "gx": [480.0] * 12,
            "gy": [540.0] * 12,
            "scenario": ["centered"] * 12,
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            screen_geometry=geometry,
            stimulus_placements_by_scenario={"centered": placement},
        ),
    )

    assert result.metadata["coordinate_mode"] == "angular"
    assert len(result.events) == 1
    assert result.events.iloc[0]["centroid_x"] == pytest.approx(5.5555556)
    assert result.events.iloc[0]["fixation_coordinate_space"] == "stimulus_percent"
    assert result.metadata["physical_screen_geometry"] == {
        "width_px": 1920.0,
        "height_px": 1080.0,
        "width_mm": 531.0,
        "height_mm": 299.0,
        "viewing_distance_mm": 620.0,
    }


def test_nonzero_screen_point_mapping_to_local_zero_is_a_valid_boundary():
    placement = _placement(left=420.0, top=100.0, width=1080.0, height=800.0)
    block = pd.DataFrame(
        {
            "time": np.arange(8, dtype=float) / 60.0,
            "gx": [420.0] * 8,
            "gy": [100.0] * 8,
            "scenario": ["offset"] * 8,
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"offset": placement},
        ),
    )

    assert result.samples["gaze_x_stimulus_norm"].eq(0.0).all()
    assert result.samples["gaze_y_stimulus_norm"].eq(0.0).all()
    assert result.samples["is_valid_gaze"].all()


def test_multiple_applied_fingerprints_report_mixed_block_provenance():
    first = _placement(left=0.0, top=0.0, width=960.0, height=1080.0)
    second = _placement(left=960.0, top=0.0, width=960.0, height=1080.0)
    block = pd.DataFrame(
        {
            "time": np.arange(16, dtype=float) / 60.0,
            "gx": [480.0] * 8 + [1440.0] * 8,
            "gy": [540.0] * 16,
            "scenario": ["left"] * 8 + ["right"] * 8,
        }
    )

    result = FixationDetectionService.detect(
        block,
        metadata=FixationDetectionMetadata(
            eye_sampling_rate_hz=60.0,
            gaze_units="pixels",
            stimulus_placements_by_scenario={"left": first, "right": second},
        ),
    )

    assert result.metadata["stimulus_transform_status"] == "mixed"
    assert result.metadata["stimulus_transform_fingerprint"] is None
    assert result.metadata["rejected_outside_count"] is None
    assert "mixed_stimulus_coordinate_transforms" in result.metadata["warnings"]
    assert set(result.samples["stimulus_transform_status"]) == {"applied"}


def test_integration_columns_are_consistent_and_warnings_are_json():
    result = FixationDetectionService.detect(
        _two_fixations(60.0),
        metadata=FixationDetectionMetadata(eye_sampling_rate_hz=60.0),
    )

    required = {
        "fixation_id",
        "fixation_segment_id",
        "fixation_method",
        "fixation_detector_version",
        "fixation_detector_sample_count",
        "fixation_source_row_count",
        "fixation_effective_rate_hz",
        "fixation_coordinate_unit",
        "fixation_coordinate_space",
        "fixation_source",
        "fixation_warnings",
        "stimulus_transform_status",
        "stimulus_transform_version",
        "stimulus_transform_fingerprint",
    }
    assert required.issubset(result.samples.columns)
    assert required.issubset(result.events.columns)
    assert result.samples["fixation_warnings"].map(json.loads).map(list).notna().all()
    assert set(result.samples["fixation_coordinate_unit"]) == {"percent"}
    assert set(result.samples["fixation_coordinate_space"]) == {"legacy_screen_percent"}
    assert set(result.samples["stimulus_transform_status"]) == {
        "legacy_passthrough_missing"
    }
    assert "stimulus_placement_missing" in result.metadata["warnings"]
    assert result.metadata["stimulus_placements_by_scenario"] == {}
    assert result.samples["stimulus_display_width_px"].isna().all()
    assert result.samples["stimulus_display_height_px"].isna().all()
    assert set(result.samples["fixation_source"]) == {"raw_gaze"}

    for event in result.events.itertuples():
        rows = result.samples[result.samples["fixation_id"] == event.fixation_id]
        assert len(rows) == event.fixation_source_row_count
        assert set(rows["fixation_source_row_count"]) == {
            event.fixation_source_row_count
        }
        assert set(rows["fixation_detector_sample_count"]) == {
            event.fixation_detector_sample_count
        }

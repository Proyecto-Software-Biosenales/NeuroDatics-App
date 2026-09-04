"""Deterministic fixation detection from raw gaze coordinates.

The detector deliberately treats vendor fixation columns as output, never as input.
Invalid samples remain invalid in the row-aligned result, even when a short gap is
interpolated internally to decide whether the surrounding gaze belongs to one
fixation.  This prevents filter/interpolation artefacts around sentinels from
leaking into ``fix_x``/``fix_y``.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, replace
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from neurodatics.shared.scenario_identity import (
    ScenarioAmbiguityError,
    resolve_scenario,
    scenario_key,
)

from neurodatics.shared.fixation_contract import (
    CANONICAL_FIXATION_MIN_DURATION_MS,
    DEFAULT_FIXATION_MIN_DURATION_MS,
    FIXATION_DETECTOR_VERSION,
    FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN,
    NO_FIXATION_VALUE,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    fixation_duration_column,
    validate_fixation_min_duration_ms,
)


@dataclass(frozen=True)
class ScreenPixelSize:
    """Pixel extent of the acquisition coordinate space.

    Unlike :class:`ScreenGeometry`, this contains no physical calibration and
    therefore never opts a detector into angular classification by itself.
    """

    width_px: float
    height_px: float


@dataclass(frozen=True)
class ScreenGeometry(ScreenPixelSize):
    """Physical screen calibration used by angular-velocity detection."""

    width_mm: float
    height_mm: float
    viewing_distance_mm: float


# New code can use the explicit name while existing routes and callers keep the
# long-standing ``ScreenGeometry`` import without a migration flag day.
PhysicalScreenGeometry = ScreenGeometry


@dataclass(frozen=True)
class _StimulusPlacementMetadata:
    """Detector-facing projection of a resolved canonical placement contract."""

    contract_version: str
    screen_width_px: float
    screen_height_px: float
    stimulus_left_px: float
    stimulus_top_px: float
    stimulus_width_px: float
    stimulus_height_px: float
    display_mode: str
    viewport_left_px: float
    viewport_top_px: float
    viewport_width_px: float
    viewport_height_px: float
    source: Optional[str]
    fingerprint: str
    resolved_payload: Dict[str, Any]


@dataclass(frozen=True)
class FixationDetectionMetadata:
    """Optional acquisition metadata.

    ``grid_sampling_rate_hz`` describes the row grid.  It can be higher than the
    actual eye tracker rate when another sensor dictated the exported time grid.
    ``eye_sampling_rate_hz`` describes the true gaze update rate.
    """

    eye_sampling_rate_hz: Optional[float] = None
    grid_sampling_rate_hz: Optional[float] = None
    gaze_units: str = "auto"  # auto | normalized | percent | pixels
    time_unit: str = "auto"  # auto | seconds | milliseconds | microseconds
    distance_unit: str = "auto"  # auto | mm | cm | m
    screen_geometry: Optional[ScreenGeometry] = None
    screen_pixel_size: Optional[ScreenPixelSize] = None
    stimulus_placements_by_scenario: Optional[Mapping[str, Any]] = None


@dataclass(frozen=True)
class FixationDetectionConfig:
    """Parameters shared by normalized I-DT and adaptive angular I-VT."""

    coordinate_mode: str = "auto"  # auto | normalized | angular
    normalized_dispersion_threshold: float = 0.03
    # Retained for configuration compatibility; angular mode uses velocity.
    angular_dispersion_threshold_deg: float = 1.0
    velocity_fallback_threshold_deg_s: float = 30.0
    velocity_hysteresis_ratio: float = 1.25
    velocity_max_for_adaptation_deg_s: float = 1000.0
    adaptive_min_local_maxima: int = 11
    min_fixation_duration_ms: float = float(DEFAULT_FIXATION_MIN_DURATION_MS)
    max_bridge_gap_ms: float = 75.0
    resample_rate_tolerance: float = 0.05
    zero_pair_is_invalid: bool = True


@dataclass(frozen=True)
class FixationDetectionResult:
    """Row-aligned samples, one row per fixation event, and JSON-safe metadata."""

    samples: pd.DataFrame
    events: pd.DataFrame
    metadata: Dict[str, Any]


@dataclass
class _AnalysisBlock:
    segment_id: int
    scenario: Any
    time_s: np.ndarray
    x_screen_norm: np.ndarray
    y_screen_norm: np.ndarray
    x_centroid_norm: np.ndarray
    y_centroid_norm: np.ndarray
    distance_mm: np.ndarray
    source_positions: List[List[int]]
    valid_source_positions: List[List[int]]
    original_valid: np.ndarray
    effective_rate_hz: float
    fixation_coordinate_space: str
    stimulus_transform_status: str
    stimulus_transform_version: Optional[str]
    stimulus_transform_fingerprint: Optional[str]
    screen_width_px: Optional[float]
    screen_height_px: Optional[float]
    stimulus_display_width_px: Optional[float]
    stimulus_display_height_px: Optional[float]


class FixationDetectionService:
    """Detect fixations with normalized I-DT or adaptive angular I-VT."""

    REQUIRED_COLUMNS = ("time", "gx", "gy")

    @classmethod
    def detect_duration_variants(
        cls,
        block: pd.DataFrame,
        metadata: Optional[FixationDetectionMetadata] = None,
        config: Optional[FixationDetectionConfig] = None,
    ) -> FixationDetectionResult:
        """Detect every supported minimum-duration variant in one sample frame.

        The normalized I-DT detector is rerun for every duration because its
        opening window can change event boundaries and centroids.  Only the five
        compact event-defining columns are retained from noncanonical runs; the
        full 200 ms result remains canonical.
        """

        base_config = config or FixationDetectionConfig()
        resolved_metadata = metadata or FixationDetectionMetadata()
        requested_mode = base_config.coordinate_mode.lower()
        angular_mode = requested_mode == "angular" or (
            requested_mode == "auto" and resolved_metadata.screen_geometry is not None
        )

        angular_base_result: Optional[FixationDetectionResult] = None
        if angular_mode:
            # I-VT classification is independent of minimum duration. Classify
            # once at the smallest supported cutoff, then apply the exact same
            # support filter and compact ids for the longer variants.
            angular_base_result = cls.detect(
                block,
                metadata=resolved_metadata,
                config=replace(
                    base_config,
                    min_fixation_duration_ms=float(
                        SUPPORTED_FIXATION_MIN_DURATIONS_MS[0]
                    ),
                ),
            )
            canonical_result = cls._filter_angular_result_by_min_duration(
                angular_base_result,
                CANONICAL_FIXATION_MIN_DURATION_MS,
            )
        else:
            canonical_result = cls._detect(
                block,
                metadata=resolved_metadata,
                config=replace(
                    base_config,
                    min_fixation_duration_ms=float(
                        CANONICAL_FIXATION_MIN_DURATION_MS
                    ),
                ),
                duration_variants_ms=tuple(
                    duration_ms
                    for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS
                    if duration_ms != CANONICAL_FIXATION_MIN_DURATION_MS
                ),
            )
        samples = canonical_result.samples.copy(deep=True)

        if angular_base_result is not None:
            for duration_ms in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
                if duration_ms == CANONICAL_FIXATION_MIN_DURATION_MS:
                    continue
                variant_result = (
                    angular_base_result
                    if duration_ms == SUPPORTED_FIXATION_MIN_DURATIONS_MS[0]
                    else cls._filter_angular_result_by_min_duration(
                        angular_base_result,
                        duration_ms,
                    )
                )
                if len(variant_result.samples) != len(
                    samples
                ) or not variant_result.samples.index.equals(samples.index):
                    raise RuntimeError(
                        "fixation duration variants must preserve sample row alignment"
                    )
                for base_column in FIXATION_DURATION_VARIANT_COLUMNS:
                    target_column = fixation_duration_column(
                        base_column, duration_ms
                    )
                    # Assignment through the ExtensionArray is positional and
                    # keeps nullable Int64 ids intact for a non-unique index.
                    samples[target_column] = variant_result.samples[
                        base_column
                    ].array.copy()

        result_metadata = dict(canonical_result.metadata)
        result_metadata.update(
            {
                "supported_min_fixation_durations_ms": list(
                    SUPPORTED_FIXATION_MIN_DURATIONS_MS
                ),
                "canonical_min_fixation_duration_ms": (
                    CANONICAL_FIXATION_MIN_DURATION_MS
                ),
            }
        )
        return FixationDetectionResult(
            samples=samples,
            events=canonical_result.events,
            metadata=result_metadata,
        )

    @classmethod
    def _filter_angular_result_by_min_duration(
        cls,
        result: FixationDetectionResult,
        min_duration_ms: Any,
    ) -> FixationDetectionResult:
        """Derive an exact longer-duration I-VT result from the 100 ms run."""

        duration_ms = validate_fixation_min_duration_ms(min_duration_ms)
        if result.metadata.get("coordinate_mode") != "angular":
            raise ValueError("duration filtering is only valid for angular I-VT")

        source_events = result.events
        event_durations = pd.to_numeric(
            source_events["duration_ms"], errors="coerce"
        )
        tolerance_ms = max(1e-6, abs(duration_ms) * 1e-9)
        retained = source_events.loc[
            event_durations + tolerance_ms >= duration_ms
        ].copy()
        retained.reset_index(drop=True, inplace=True)
        old_ids = [int(value) for value in retained["fixation_id"].tolist()]
        id_map = {old_id: new_id for new_id, old_id in enumerate(old_ids, start=1)}
        retained["fixation_id"] = retained["fixation_id"].map(id_map).astype("int64")
        retained[FIXATION_MIN_DURATION_COLUMN] = int(duration_ms)

        samples = result.samples.copy(deep=True)
        original_ids = samples["fixation_id"]
        mapped_ids = original_ids.map(id_map)
        dropped = original_ids.notna() & mapped_ids.isna()
        samples.loc[dropped, ["fix_x", "fix_y"]] = NO_FIXATION_VALUE
        samples.loc[
            dropped,
            ["fixation_detector_sample_count", "fixation_source_row_count"],
        ] = 0
        samples["fixation_id"] = pd.array(mapped_ids, dtype="Int64")
        samples[FIXATION_MIN_DURATION_COLUMN] = np.full(
            len(samples), duration_ms, dtype=np.int64
        )

        metadata = dict(result.metadata)
        metadata["min_fixation_duration_ms"] = float(duration_ms)
        metadata["fixation_event_count"] = int(len(retained))
        return FixationDetectionResult(samples, retained, metadata)

    @classmethod
    def detect(
        cls,
        block: pd.DataFrame,
        metadata: Optional[FixationDetectionMetadata] = None,
        config: Optional[FixationDetectionConfig] = None,
    ) -> FixationDetectionResult:
        return cls._detect(block, metadata=metadata, config=config)

    @classmethod
    def _detect(
        cls,
        block: pd.DataFrame,
        metadata: Optional[FixationDetectionMetadata] = None,
        config: Optional[FixationDetectionConfig] = None,
        duration_variants_ms: Sequence[int] = (),
    ) -> FixationDetectionResult:
        """Classify a gaze block without mutating it.

        The returned ``samples`` frame retains the input index and columns.  Only
        rows assigned to a fixation receive a median centroid; every other row is
        assigned the exact paired sentinel ``(-100.0, -100.0)``.
        """

        if not isinstance(block, pd.DataFrame):
            raise TypeError("block must be a pandas DataFrame")

        metadata = metadata or FixationDetectionMetadata()
        config = config or FixationDetectionConfig()
        cls._validate_contract(block, metadata, config)

        samples = block.copy(deep=True)
        if "scenario" not in samples:
            samples["scenario"] = ""
        row_count = len(samples)
        warnings: List[str] = []
        requested_mode = config.coordinate_mode.lower()
        coordinate_mode = (
            "angular"
            if requested_mode == "auto" and metadata.screen_geometry is not None
            else "normalized"
            if requested_mode == "auto"
            else requested_mode
        )
        method = (
            "adaptive-ivt-angular"
            if coordinate_mode == "angular"
            else "i-dt-normalized"
        )
        threshold = (
            float(config.velocity_fallback_threshold_deg_s)
            if coordinate_mode == "angular"
            else float(config.normalized_dispersion_threshold)
        )
        classification_units = (
            "degrees_per_second" if coordinate_mode == "angular" else "normalized"
        )

        time_raw = pd.to_numeric(samples["time"], errors="coerce").to_numpy(float)
        scenario_values = samples["scenario"].to_numpy(dtype=object, copy=True)
        scenario_keys = cls._scenario_keys(samples["scenario"])
        time_unit = cls._resolve_time_unit(
            time_raw,
            scenario_keys,
            metadata.time_unit,
            metadata.grid_sampling_rate_hz or metadata.eye_sampling_rate_hz,
            warnings,
        )
        time_s = time_raw * cls._time_factor(time_unit)

        gx = pd.to_numeric(samples["gx"], errors="coerce").to_numpy(float)
        gy = pd.to_numeric(samples["gy"], errors="coerce").to_numpy(float)
        placements_by_key = cls._resolved_placement_map(
            metadata.stimulus_placements_by_scenario
        )
        row_placements, used_placements = cls._placements_for_scenarios(
            scenario_values,
            placements_by_key,
        )
        if any(placement is None for placement in row_placements):
            warnings.append("stimulus_placement_missing")

        pixel_size = cls._coordinate_pixel_size(metadata, used_placements)
        gaze_units = cls._resolve_gaze_units(
            gx,
            gy,
            metadata.gaze_units,
            pixel_size,
            config.zero_pair_is_invalid,
            warnings,
        )
        coordinates = cls._resolve_coordinate_spaces(
            gx=gx,
            gy=gy,
            units=gaze_units,
            row_placements=row_placements,
            fallback_pixel_size=pixel_size,
        )

        non_increasing = np.zeros(row_count, dtype=bool)
        if row_count > 1:
            comparable = np.isfinite(time_s[:-1]) & np.isfinite(time_s[1:])
            non_increasing[1:] = comparable & (time_s[1:] <= time_s[:-1])
        if non_increasing.any():
            warnings.append("non_increasing_timestamps_invalidated")
        invalid_reason, valid = cls._gaze_validity(
            gx=gx,
            gy=gy,
            time_s=time_s,
            non_increasing=non_increasing,
            x_screen_norm=coordinates["x_screen_norm"],
            y_screen_norm=coordinates["y_screen_norm"],
            in_viewport=coordinates["in_viewport"],
            in_stimulus=coordinates["in_stimulus"],
            transform_applied=coordinates["transform_applied"],
            zero_pair_is_invalid=config.zero_pair_is_invalid,
        )
        hard_spatial_invalid = (
            np.isin(
                invalid_reason,
                ["outside_screen", "outside_viewport", "outside_stimulus"],
            )
            & coordinates["transform_applied"]
        )

        observed_grid_rate = cls._infer_rate(time_s, scenario_keys)
        declared_grid_rate = cls._positive_optional_rate(metadata.grid_sampling_rate_hz)
        eye_rate = cls._positive_optional_rate(metadata.eye_sampling_rate_hz)
        grid_rate = declared_grid_rate or observed_grid_rate
        resampled = bool(
            eye_rate is not None
            and grid_rate is not None
            and grid_rate > eye_rate * (1.0 + config.resample_rate_tolerance)
        )
        if eye_rate is not None and grid_rate is not None:
            # The detector can never observe more independent samples than
            # either the native eye clock or the exported row grid provides.
            effective_rate = float(min(eye_rate, grid_rate))
        elif eye_rate is not None:
            effective_rate = float(eye_rate)
        elif grid_rate is not None:
            effective_rate = float(grid_rate)
        else:
            effective_rate = 0.0

        if resampled:
            warnings.append("gaze_resampled_to_eye_rate")
        if effective_rate <= 0.0:
            effective_rate = cls._fallback_rate(time_s)
            if effective_rate <= 0.0:
                warnings.append("sampling_rate_unavailable")

        distance_mm = cls._distance_mm(samples, metadata, valid, warnings)
        if "distance" in samples:
            raw_distance = pd.to_numeric(samples["distance"], errors="coerce").to_numpy(
                float
            )
            sample_distance_used = bool(
                (np.isfinite(raw_distance) & (raw_distance > 0.0) & valid).any()
            )
        else:
            sample_distance_used = False
        segment_ids = cls._segment_ids(
            time_s,
            scenario_keys,
            effective_rate,
            config.max_bridge_gap_ms,
            hard_spatial_invalid,
        )

        cls._initialize_output_columns(
            samples,
            segment_ids,
            method,
            effective_rate,
            valid,
            gaze_units=gaze_units,
            coordinates=coordinates,
            invalid_reason=invalid_reason,
        )
        samples[FIXATION_MIN_DURATION_COLUMN] = np.full(
            row_count,
            validate_fixation_min_duration_ms(config.min_fixation_duration_ms),
            dtype=np.int64,
        )

        analysis_blocks: List[_AnalysisBlock] = []
        for segment_id in cls._ordered_segment_ids(segment_ids):
            positions = np.flatnonzero(segment_ids == segment_id)
            if positions.size == 0:
                continue
            analysis_blocks.append(
                cls._build_analysis_block(
                    segment_id=int(segment_id),
                    positions=positions,
                    scenario=scenario_values[positions[0]],
                    time_s=time_s,
                    x_screen_norm=coordinates["x_screen_norm"],
                    y_screen_norm=coordinates["y_screen_norm"],
                    x_centroid_norm=coordinates["x_centroid_norm"],
                    y_centroid_norm=coordinates["y_centroid_norm"],
                    distance_mm=distance_mm,
                    valid=valid,
                    effective_rate_hz=effective_rate,
                    resample=resampled,
                    fixation_coordinate_space=str(
                        coordinates["fixation_coordinate_space"][positions[0]]
                    ),
                    stimulus_transform_status=str(
                        coordinates["transform_status"][positions[0]]
                    ),
                    stimulus_transform_version=coordinates["transform_version"][
                        positions[0]
                    ],
                    stimulus_transform_fingerprint=coordinates["transform_fingerprint"][
                        positions[0]
                    ],
                    screen_width_px=cls._finite_optional(
                        coordinates["screen_width_px"][positions[0]]
                    ),
                    screen_height_px=cls._finite_optional(
                        coordinates["screen_height_px"][positions[0]]
                    ),
                    stimulus_display_width_px=cls._finite_optional(
                        coordinates["stimulus_display_width_px"][positions[0]]
                    ),
                    stimulus_display_height_px=cls._finite_optional(
                        coordinates["stimulus_display_height_px"][positions[0]]
                    ),
                )
            )

        events: List[Dict[str, Any]] = []
        segment_diagnostics: List[Dict[str, Any]] = []
        next_fixation_id = 1
        for analysis in analysis_blocks:
            detected, bridged, detector_diagnostics = cls._detect_analysis_events(
                analysis,
                metadata.screen_geometry,
                config,
                coordinate_mode,
            )
            segment_diagnostics.append(
                {
                    "fixation_segment_id": int(analysis.segment_id),
                    "velocity_threshold_deg_s": (
                        float(detector_diagnostics["threshold"])
                        if coordinate_mode == "angular"
                        else None
                    ),
                    "threshold_source": str(detector_diagnostics["threshold_source"]),
                }
            )
            if detector_diagnostics["threshold_source"] == "fallback":
                warnings.append(
                    "adaptive_velocity_threshold_fallback:"
                    f"segment:{analysis.segment_id}"
                )
            for analysis_indices in detected:
                event, mapped_positions = cls._materialize_event(
                    fixation_id=next_fixation_id,
                    analysis=analysis,
                    analysis_indices=analysis_indices,
                    bridged=bridged,
                    time_raw=time_raw,
                    method=method,
                    classification_threshold=float(detector_diagnostics["threshold"]),
                    classification_units=classification_units,
                    threshold_source=str(detector_diagnostics["threshold_source"]),
                )
                if not mapped_positions:
                    continue
                cls._write_event_to_samples(samples, mapped_positions, event)
                events.append(event)
                next_fixation_id += 1

        if duration_variants_ms:
            if coordinate_mode != "normalized":
                raise ValueError(
                    "shared duration-variant detection is only valid for normalized I-DT"
                )
            for duration_ms in dict.fromkeys(
                validate_fixation_min_duration_ms(value)
                for value in duration_variants_ms
            ):
                if duration_ms == validate_fixation_min_duration_ms(
                    config.min_fixation_duration_ms
                ):
                    continue
                variant_samples = cls._normalized_duration_variant_samples(
                    source_index=samples.index,
                    analysis_blocks=analysis_blocks,
                    geometry=metadata.screen_geometry,
                    config=replace(
                        config,
                        min_fixation_duration_ms=float(duration_ms),
                    ),
                    time_raw=time_raw,
                    method=method,
                    classification_units=classification_units,
                )
                for base_column in FIXATION_DURATION_VARIANT_COLUMNS:
                    samples[
                        fixation_duration_column(base_column, duration_ms)
                    ] = variant_samples[base_column].array.copy()

        warnings = list(dict.fromkeys(warnings))
        transform_provenance = cls._transform_provenance(
            coordinates["transform_status"],
            coordinates["transform_version"],
            coordinates["transform_fingerprint"],
            invalid_reason,
            used_placements,
        )
        if transform_provenance["stimulus_transform_status"] == "mixed":
            warnings.append("mixed_stimulus_coordinate_transforms")
            warnings = list(dict.fromkeys(warnings))
        warning_json = json.dumps(warnings, ensure_ascii=False, separators=(",", ":"))
        samples["fixation_warnings"] = warning_json
        samples["fixation_id"] = pd.array(samples["fixation_id"], dtype="Int64")
        samples["fixation_segment_id"] = pd.array(
            samples["fixation_segment_id"], dtype="Int64"
        )
        samples["segment_id"] = pd.array(samples["segment_id"], dtype="Int64")

        event_frame = cls._event_frame(
            events,
            warning_json,
            validate_fixation_min_duration_ms(config.min_fixation_duration_ms),
        )
        result_metadata: Dict[str, Any] = {
            "method": method,
            "version": FIXATION_DETECTOR_VERSION,
            "coordinate_mode": coordinate_mode,
            "coordinate_unit": "percent",
            "classification_threshold": (
                threshold if coordinate_mode == "normalized" else None
            ),
            "classification_units": classification_units,
            "dispersion_threshold": (
                threshold if coordinate_mode == "normalized" else None
            ),
            "dispersion_units": (
                "normalized" if coordinate_mode == "normalized" else None
            ),
            "velocity_fallback_threshold_deg_s": float(
                config.velocity_fallback_threshold_deg_s
            ),
            "segment_thresholds": segment_diagnostics,
            "min_fixation_duration_ms": float(config.min_fixation_duration_ms),
            "max_bridge_gap_ms": float(config.max_bridge_gap_ms),
            "source_row_count": int(row_count),
            "valid_source_row_count": int(valid.sum()),
            "analysis_sample_count": int(
                sum(len(analysis.time_s) for analysis in analysis_blocks)
            ),
            "fixation_event_count": int(len(events)),
            "segment_count": int(len(analysis_blocks)),
            "observed_grid_sampling_rate_hz": cls._json_float(observed_grid_rate),
            "grid_sampling_rate_hz": cls._json_float(grid_rate),
            "eye_sampling_rate_hz": cls._json_float(eye_rate),
            "effective_rate_hz": cls._json_float(effective_rate),
            "resampled": resampled,
            "gaze_input_units": gaze_units,
            "gaze_input_unit_resolved": gaze_units,
            "time_input_unit": time_unit,
            "sample_distance_used": sample_distance_used,
            "fixation_source": "raw_gaze",
            **transform_provenance,
            "physical_screen_geometry": cls._physical_geometry_snapshot(
                metadata.screen_geometry
            ),
            "warnings": list(warnings),
            "fixation_warnings": warning_json,
        }
        return FixationDetectionResult(samples, event_frame, result_metadata)

    @classmethod
    def _validate_contract(
        cls,
        block: pd.DataFrame,
        metadata: FixationDetectionMetadata,
        config: FixationDetectionConfig,
    ) -> None:
        missing = [column for column in cls.REQUIRED_COLUMNS if column not in block]
        if missing:
            raise ValueError("Missing required gaze columns: " + ", ".join(missing))

        coordinate_mode = config.coordinate_mode.lower()
        if coordinate_mode not in {"auto", "normalized", "angular"}:
            raise ValueError("coordinate_mode must be auto, normalized, or angular")
        if metadata.screen_geometry is not None:
            cls._validate_geometry(metadata.screen_geometry)
        if metadata.screen_pixel_size is not None:
            cls._validate_pixel_size(metadata.screen_pixel_size)
        placements = cls._resolved_placement_map(
            metadata.stimulus_placements_by_scenario
        )
        if (
            metadata.screen_geometry is not None
            and metadata.screen_pixel_size is not None
            and (
                float(metadata.screen_geometry.width_px)
                != float(metadata.screen_pixel_size.width_px)
                or float(metadata.screen_geometry.height_px)
                != float(metadata.screen_pixel_size.height_px)
            )
        ):
            raise ValueError(
                "physical screen geometry and screen pixel size must match"
            )
        for placement in placements.values():
            for size in (metadata.screen_geometry, metadata.screen_pixel_size):
                if size is not None and (
                    placement.screen_width_px != float(size.width_px)
                    or placement.screen_height_px != float(size.height_px)
                ):
                    raise ValueError(
                        "stimulus placement and screen calibration pixel dimensions "
                        "must match"
                    )
        if coordinate_mode == "angular":
            if metadata.screen_geometry is None:
                raise ValueError("angular mode requires complete screen geometry")

        if metadata.gaze_units.lower() not in {
            "auto",
            "normalized",
            "percent",
            "pixels",
        }:
            raise ValueError("gaze_units must be auto, normalized, percent, or pixels")
        if metadata.gaze_units.lower() == "pixels":
            if (
                metadata.screen_geometry is None
                and metadata.screen_pixel_size is None
                and not placements
            ):
                raise ValueError(
                    "pixel gaze units require screen pixel dimensions or a stimulus placement"
                )
        if metadata.time_unit.lower() not in {
            "auto",
            "seconds",
            "milliseconds",
            "microseconds",
        }:
            raise ValueError(
                "time_unit must be auto, seconds, milliseconds, or microseconds"
            )
        if metadata.distance_unit.lower() not in {"auto", "mm", "cm", "m"}:
            raise ValueError("distance_unit must be auto, mm, cm, or m")

        cls._positive_optional_rate(metadata.eye_sampling_rate_hz, raise_on_bad=True)
        cls._positive_optional_rate(metadata.grid_sampling_rate_hz, raise_on_bad=True)
        for name, value in (
            ("normalized_dispersion_threshold", config.normalized_dispersion_threshold),
            (
                "angular_dispersion_threshold_deg",
                config.angular_dispersion_threshold_deg,
            ),
            (
                "velocity_fallback_threshold_deg_s",
                config.velocity_fallback_threshold_deg_s,
            ),
            ("velocity_hysteresis_ratio", config.velocity_hysteresis_ratio),
            (
                "velocity_max_for_adaptation_deg_s",
                config.velocity_max_for_adaptation_deg_s,
            ),
        ):
            if not math.isfinite(float(value)) or float(value) <= 0.0:
                raise ValueError(f"{name} must be finite and positive")
        validate_fixation_min_duration_ms(config.min_fixation_duration_ms)
        if config.velocity_hysteresis_ratio < 1.0:
            raise ValueError("velocity_hysteresis_ratio must be at least 1")
        if int(config.adaptive_min_local_maxima) < 3:
            raise ValueError("adaptive_min_local_maxima must be at least 3")
        if (
            not math.isfinite(float(config.max_bridge_gap_ms))
            or config.max_bridge_gap_ms < 0.0
        ):
            raise ValueError("max_bridge_gap_ms must be finite and non-negative")
        if (
            not math.isfinite(float(config.resample_rate_tolerance))
            or config.resample_rate_tolerance < 0.0
        ):
            raise ValueError("resample_rate_tolerance must be finite and non-negative")

    @staticmethod
    def _validate_geometry(geometry: ScreenGeometry) -> None:
        for name in (
            "width_px",
            "height_px",
            "width_mm",
            "height_mm",
            "viewing_distance_mm",
        ):
            value = float(getattr(geometry, name))
            if not math.isfinite(value) or value <= 0.0:
                raise ValueError(f"screen geometry {name} must be finite and positive")

    @staticmethod
    def _validate_pixel_size(size: ScreenPixelSize) -> None:
        for name in ("width_px", "height_px"):
            value = float(getattr(size, name))
            if not math.isfinite(value) or value <= 0.0:
                raise ValueError(
                    f"screen pixel size {name} must be finite and positive"
                )

    @staticmethod
    def _positive_optional_rate(
        value: Optional[float], raise_on_bad: bool = False
    ) -> Optional[float]:
        if value is None:
            return None
        number = float(value)
        if not math.isfinite(number) or number <= 0.0:
            if raise_on_bad:
                raise ValueError("sampling rates must be finite and positive")
            return None
        return number

    @staticmethod
    def _scenario_keys(series: pd.Series) -> np.ndarray:
        # A dedicated marker makes consecutive missing scenarios deterministic.
        return series.astype("string").fillna("<missing-scenario>").to_numpy(str)

    @classmethod
    def _resolved_placement_map(
        cls, values: Optional[Mapping[str, Any]]
    ) -> Dict[str, _StimulusPlacementMetadata]:
        if values is None:
            return {}
        if not isinstance(values, Mapping):
            raise ValueError("stimulus_placements_by_scenario must be a mapping")

        resolved: Dict[str, _StimulusPlacementMetadata] = {}
        labels_by_key: Dict[str, str] = {}
        for raw_label, raw_placement in values.items():
            label = str(raw_label).strip()
            key = scenario_key(label)
            if not key:
                raise ValueError("stimulus placement scenario key cannot be empty")
            previous = labels_by_key.get(key)
            if previous is not None:
                raise ScenarioAmbiguityError(
                    "Stimulus placement keys "
                    f"{previous!r} and {label!r} collapse to the same canonical "
                    "scenario identity"
                )
            labels_by_key[key] = label
            resolved[label] = cls._placement_from_value(raw_placement)
        return resolved

    @classmethod
    def _placement_from_value(cls, value: Any) -> _StimulusPlacementMetadata:
        fingerprint = getattr(value, "fingerprint", None)
        if hasattr(value, "to_dict") and callable(value.to_dict):
            source_value = value.to_dict()
        elif isinstance(value, Mapping):
            source_value = dict(value)
        else:
            try:
                source_value = vars(value)
            except TypeError as exc:
                raise ValueError("invalid stimulus placement payload") from exc
        if not isinstance(source_value, Mapping):
            raise ValueError("stimulus placement must resolve to an object")
        source = dict(source_value)
        fingerprint = (
            fingerprint
            or source.get("contract_fingerprint")
            or source.get("fingerprint")
        )
        fingerprint_text = fingerprint.strip() if isinstance(fingerprint, str) else ""
        if len(fingerprint_text) != 64 or any(
            character not in "0123456789abcdef" for character in fingerprint_text
        ):
            raise ValueError(
                "resolved stimulus placement requires a lowercase SHA-256 fingerprint"
            )

        def finite_number(name: str, *, positive: bool = False) -> float:
            if name not in source or source[name] is None:
                raise ValueError(f"stimulus placement is missing {name}")
            try:
                number = float(source[name])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"stimulus placement {name} must be numeric") from exc
            if not math.isfinite(number) or (positive and number <= 0.0):
                qualifier = "finite and positive" if positive else "finite"
                raise ValueError(f"stimulus placement {name} must be {qualifier}")
            return number

        contract_version = str(source.get("contract_version") or "")
        if contract_version != "screen-stimulus-v1":
            raise ValueError("unsupported stimulus placement contract version")
        if str(source.get("geometry_stability") or "") != "static":
            raise ValueError("dynamic_stimulus_geometry_not_supported")
        display_mode = str(source.get("display_mode") or "")
        if display_mode not in {"contain", "cover", "crop", "fullscreen"}:
            raise ValueError("invalid stimulus placement display_mode")
        placement_source = source.get("source")
        if placement_source not in {"user_config", "acquisition_metadata"}:
            raise ValueError("invalid resolved stimulus placement source")

        screen_width = finite_number("screen_width_px", positive=True)
        screen_height = finite_number("screen_height_px", positive=True)
        stimulus_left = finite_number("stimulus_left_px")
        stimulus_top = finite_number("stimulus_top_px")
        stimulus_width = finite_number("stimulus_width_px", positive=True)
        stimulus_height = finite_number("stimulus_height_px", positive=True)

        viewport_value = source.get("viewport")
        if viewport_value is None:
            viewport_source: Dict[str, Any] = {
                "left_px": 0.0,
                "top_px": 0.0,
                "width_px": screen_width,
                "height_px": screen_height,
                "scroll_x_px": 0.0,
                "scroll_y_px": 0.0,
            }
        elif hasattr(viewport_value, "to_dict") and callable(viewport_value.to_dict):
            viewport_source = dict(viewport_value.to_dict())
        elif isinstance(viewport_value, Mapping):
            viewport_source = dict(viewport_value)
        else:
            try:
                viewport_source = dict(vars(viewport_value))
            except TypeError as exc:
                raise ValueError(
                    "stimulus placement viewport must be an object"
                ) from exc

        def viewport_number(name: str, *, positive: bool = False) -> float:
            if name not in viewport_source or viewport_source[name] is None:
                raise ValueError(f"stimulus placement viewport is missing {name}")
            try:
                number = float(viewport_source[name])
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"stimulus placement viewport {name} must be numeric"
                ) from exc
            if not math.isfinite(number) or (positive and number <= 0.0):
                qualifier = "finite and positive" if positive else "finite"
                raise ValueError(
                    f"stimulus placement viewport {name} must be {qualifier}"
                )
            return number

        viewport_left = viewport_number("left_px")
        viewport_top = viewport_number("top_px")
        viewport_width = viewport_number("width_px", positive=True)
        viewport_height = viewport_number("height_px", positive=True)
        scroll_x = float(viewport_source.get("scroll_x_px", 0.0))
        scroll_y = float(viewport_source.get("scroll_y_px", 0.0))
        if (
            not math.isfinite(scroll_x)
            or not math.isfinite(scroll_y)
            or scroll_x < 0.0
            or scroll_y < 0.0
        ):
            raise ValueError("stimulus placement viewport scroll must be non-negative")
        if (
            viewport_left < 0.0
            or viewport_top < 0.0
            or viewport_left + viewport_width > screen_width
            or viewport_top + viewport_height > screen_height
        ):
            raise ValueError("stimulus placement viewport must lie within the screen")

        screen_intersects = (
            stimulus_left < screen_width
            and stimulus_left + stimulus_width > 0.0
            and stimulus_top < screen_height
            and stimulus_top + stimulus_height > 0.0
        )
        viewport_intersects = (
            stimulus_left < viewport_left + viewport_width
            and stimulus_left + stimulus_width > viewport_left
            and stimulus_top < viewport_top + viewport_height
            and stimulus_top + stimulus_height > viewport_top
        )
        if not screen_intersects or not viewport_intersects:
            raise ValueError(
                "stimulus placement must intersect its screen and viewport"
            )

        if display_mode == "fullscreen" and (
            stimulus_left != 0.0
            or stimulus_top != 0.0
            or stimulus_width != screen_width
            or stimulus_height != screen_height
            or viewport_left != 0.0
            or viewport_top != 0.0
            or viewport_width != screen_width
            or viewport_height != screen_height
            or scroll_x != 0.0
            or scroll_y != 0.0
        ):
            raise ValueError("fullscreen placement must exactly match the screen")

        resolved_payload: Dict[str, Any] = {
            "geometry_stability": "static",
            "contract_version": contract_version,
            "screen_width_px": screen_width,
            "screen_height_px": screen_height,
            "stimulus_left_px": stimulus_left,
            "stimulus_top_px": stimulus_top,
            "stimulus_width_px": stimulus_width,
            "stimulus_height_px": stimulus_height,
            "display_mode": display_mode,
            "viewport": {
                "left_px": viewport_left,
                "top_px": viewport_top,
                "width_px": viewport_width,
                "height_px": viewport_height,
                "scroll_x_px": scroll_x,
                "scroll_y_px": scroll_y,
            },
            "source": placement_source,
            "contract_fingerprint": fingerprint_text,
        }
        return _StimulusPlacementMetadata(
            contract_version=contract_version,
            screen_width_px=screen_width,
            screen_height_px=screen_height,
            stimulus_left_px=stimulus_left,
            stimulus_top_px=stimulus_top,
            stimulus_width_px=stimulus_width,
            stimulus_height_px=stimulus_height,
            display_mode=display_mode,
            viewport_left_px=viewport_left,
            viewport_top_px=viewport_top,
            viewport_width_px=viewport_width,
            viewport_height_px=viewport_height,
            source=str(placement_source),
            fingerprint=fingerprint_text,
            resolved_payload=resolved_payload,
        )

    @classmethod
    def _placements_for_scenarios(
        cls,
        scenario_values: np.ndarray,
        placements: Mapping[str, _StimulusPlacementMetadata],
    ) -> Tuple[
        List[Optional[_StimulusPlacementMetadata]],
        Dict[str, _StimulusPlacementMetadata],
    ]:
        stored_labels: Dict[str, str] = {}
        for raw_value in scenario_values:
            if pd.isna(raw_value):
                continue
            label = str(raw_value).strip()
            key = scenario_key(label)
            if not key:
                continue
            previous = stored_labels.get(key)
            if previous is not None and previous != label:
                raise ScenarioAmbiguityError(
                    f"CSV scenarios {previous!r} and {label!r} collapse to the same "
                    "canonical scenario identity"
                )
            stored_labels[key] = label

        placement_labels = list(placements)
        placement_by_stored_key: Dict[str, _StimulusPlacementMetadata] = {}
        used: Dict[str, _StimulusPlacementMetadata] = {}
        for key, stored_label in stored_labels.items():
            resolution = resolve_scenario(stored_label, placement_labels)
            if resolution is None:
                continue
            placement = placements[resolution.value]
            placement_by_stored_key[key] = placement
            used[resolution.value] = placement

        rows: List[Optional[_StimulusPlacementMetadata]] = []
        for raw_value in scenario_values:
            if pd.isna(raw_value):
                rows.append(None)
                continue
            rows.append(placement_by_stored_key.get(scenario_key(raw_value)))
        return rows, used

    @classmethod
    def _coordinate_pixel_size(
        cls,
        metadata: FixationDetectionMetadata,
        used_placements: Mapping[str, _StimulusPlacementMetadata],
    ) -> Optional[ScreenPixelSize]:
        if metadata.screen_pixel_size is not None:
            return metadata.screen_pixel_size
        if metadata.screen_geometry is not None:
            return ScreenPixelSize(
                width_px=float(metadata.screen_geometry.width_px),
                height_px=float(metadata.screen_geometry.height_px),
            )
        sizes = {
            (placement.screen_width_px, placement.screen_height_px)
            for placement in used_placements.values()
        }
        if len(sizes) == 1:
            width, height = next(iter(sizes))
            return ScreenPixelSize(width_px=width, height_px=height)
        return None

    @staticmethod
    def _resolve_coordinate_spaces(
        gx: np.ndarray,
        gy: np.ndarray,
        units: str,
        row_placements: Sequence[Optional[_StimulusPlacementMetadata]],
        fallback_pixel_size: Optional[ScreenPixelSize],
    ) -> Dict[str, np.ndarray]:
        row_count = len(gx)
        screen_width = np.full(row_count, np.nan, dtype=float)
        screen_height = np.full(row_count, np.nan, dtype=float)
        display_width = np.full(row_count, np.nan, dtype=float)
        display_height = np.full(row_count, np.nan, dtype=float)
        transform_applied = np.zeros(row_count, dtype=bool)
        transform_status = np.full(
            row_count, "legacy_passthrough_missing", dtype=object
        )
        transform_version = np.full(row_count, None, dtype=object)
        transform_fingerprint = np.full(row_count, None, dtype=object)
        fixation_coordinate_space = np.full(
            row_count, "legacy_screen_percent", dtype=object
        )

        for index, placement in enumerate(row_placements):
            if placement is not None:
                screen_width[index] = placement.screen_width_px
                screen_height[index] = placement.screen_height_px
                display_width[index] = placement.stimulus_width_px
                display_height[index] = placement.stimulus_height_px
                transform_applied[index] = True
                transform_status[index] = "applied"
                transform_version[index] = placement.contract_version
                transform_fingerprint[index] = placement.fingerprint
                fixation_coordinate_space[index] = "stimulus_percent"
            elif fallback_pixel_size is not None:
                screen_width[index] = float(fallback_pixel_size.width_px)
                screen_height[index] = float(fallback_pixel_size.height_px)

        if units == "normalized":
            x_screen_norm = gx.copy()
            y_screen_norm = gy.copy()
            x_screen_px = gx * screen_width
            y_screen_px = gy * screen_height
        elif units == "percent":
            x_screen_norm = gx / 100.0
            y_screen_norm = gy / 100.0
            x_screen_px = x_screen_norm * screen_width
            y_screen_px = y_screen_norm * screen_height
        else:
            x_screen_px = gx.copy()
            y_screen_px = gy.copy()
            if (~np.isfinite(screen_width) | ~np.isfinite(screen_height)).any():
                raise ValueError(
                    "pixel gaze units require screen dimensions for every scenario"
                )
            x_screen_norm = gx / screen_width
            y_screen_norm = gy / screen_height

        x_stimulus = np.full(row_count, np.nan, dtype=float)
        y_stimulus = np.full(row_count, np.nan, dtype=float)
        in_viewport = np.zeros(row_count, dtype=bool)
        in_stimulus = np.zeros(row_count, dtype=bool)
        x_centroid = x_screen_norm.copy()
        y_centroid = y_screen_norm.copy()
        for index, placement in enumerate(row_placements):
            if placement is None:
                continue
            x_stimulus[index] = (
                x_screen_px[index] - placement.stimulus_left_px
            ) / placement.stimulus_width_px
            y_stimulus[index] = (
                y_screen_px[index] - placement.stimulus_top_px
            ) / placement.stimulus_height_px
            in_viewport[index] = bool(
                math.isfinite(float(x_screen_px[index]))
                and math.isfinite(float(y_screen_px[index]))
                and placement.viewport_left_px
                <= x_screen_px[index]
                <= placement.viewport_left_px + placement.viewport_width_px
                and placement.viewport_top_px
                <= y_screen_px[index]
                <= placement.viewport_top_px + placement.viewport_height_px
            )
            in_stimulus[index] = bool(
                math.isfinite(float(x_stimulus[index]))
                and math.isfinite(float(y_stimulus[index]))
                and 0.0 <= x_stimulus[index] <= 1.0
                and 0.0 <= y_stimulus[index] <= 1.0
            )
            x_centroid[index] = x_stimulus[index]
            y_centroid[index] = y_stimulus[index]

        return {
            "x_screen_px": x_screen_px,
            "y_screen_px": y_screen_px,
            "x_screen_norm": x_screen_norm,
            "y_screen_norm": y_screen_norm,
            "x_stimulus_norm": x_stimulus,
            "y_stimulus_norm": y_stimulus,
            "x_centroid_norm": x_centroid,
            "y_centroid_norm": y_centroid,
            "in_viewport": in_viewport,
            "in_stimulus": in_stimulus,
            "transform_applied": transform_applied,
            "transform_status": transform_status,
            "transform_version": transform_version,
            "transform_fingerprint": transform_fingerprint,
            "fixation_coordinate_space": fixation_coordinate_space,
            "screen_width_px": screen_width,
            "screen_height_px": screen_height,
            "stimulus_display_width_px": display_width,
            "stimulus_display_height_px": display_height,
        }

    @staticmethod
    def _gaze_validity(
        gx: np.ndarray,
        gy: np.ndarray,
        time_s: np.ndarray,
        non_increasing: np.ndarray,
        x_screen_norm: np.ndarray,
        y_screen_norm: np.ndarray,
        in_viewport: np.ndarray,
        in_stimulus: np.ndarray,
        transform_applied: np.ndarray,
        zero_pair_is_invalid: bool,
    ) -> Tuple[np.ndarray, np.ndarray]:
        reasons = np.full(len(gx), None, dtype=object)
        signal_missing = ~np.isfinite(gx) | ~np.isfinite(gy)
        if zero_pair_is_invalid:
            signal_missing |= (gx == 0.0) & (gy == 0.0)
        time_invalid = ~np.isfinite(time_s) | non_increasing
        outside_screen = (
            ~np.isfinite(x_screen_norm)
            | ~np.isfinite(y_screen_norm)
            | (x_screen_norm < 0.0)
            | (x_screen_norm > 1.0)
            | (y_screen_norm < 0.0)
            | (y_screen_norm > 1.0)
        )

        for index in range(len(gx)):
            if signal_missing[index]:
                reasons[index] = "signal_missing"
            elif time_invalid[index]:
                reasons[index] = "time_invalid"
            elif outside_screen[index]:
                reasons[index] = "outside_screen"
            elif transform_applied[index] and not in_viewport[index]:
                reasons[index] = "outside_viewport"
            elif transform_applied[index] and not in_stimulus[index]:
                reasons[index] = "outside_stimulus"
        return reasons, pd.isna(reasons)

    @classmethod
    def _resolve_time_unit(
        cls,
        time_raw: np.ndarray,
        scenario_keys: np.ndarray,
        requested: str,
        reference_rate: Optional[float],
        warnings: List[str],
    ) -> str:
        requested = requested.lower()
        if requested != "auto":
            return requested
        positive_diffs = cls._positive_diffs(time_raw, scenario_keys)
        if positive_diffs.size == 0:
            warnings.append("time_unit_assumed_seconds")
            return "seconds"
        median_dt = float(np.median(positive_diffs))
        reference = cls._positive_optional_rate(reference_rate)
        candidates = {
            "seconds": 1.0,
            "milliseconds": 1e-3,
            "microseconds": 1e-6,
        }
        if reference is not None:
            expected_dt_s = 1.0 / reference
            chosen = min(
                candidates,
                key=lambda unit: abs(
                    math.log(max(median_dt * candidates[unit], 1e-15) / expected_dt_s)
                ),
            )
        elif median_dt <= 0.5:
            chosen = "seconds"
        elif median_dt <= 500.0:
            chosen = "milliseconds"
        else:
            chosen = "microseconds"
        warnings.append(f"time_unit_inferred:{chosen}")
        return chosen

    @staticmethod
    def _time_factor(unit: str) -> float:
        return {"seconds": 1.0, "milliseconds": 1e-3, "microseconds": 1e-6}[unit]

    @staticmethod
    def _positive_diffs(time_s: np.ndarray, scenario_keys: np.ndarray) -> np.ndarray:
        if len(time_s) < 2:
            return np.empty(0, dtype=float)
        diffs = np.diff(time_s)
        same_scenario = scenario_keys[1:] == scenario_keys[:-1]
        keep = same_scenario & np.isfinite(diffs) & (diffs > 0.0)
        return diffs[keep]

    @classmethod
    def _infer_rate(
        cls, time_s: np.ndarray, scenario_keys: np.ndarray
    ) -> Optional[float]:
        positive_diffs = cls._positive_diffs(time_s, scenario_keys)
        if positive_diffs.size == 0:
            return None
        median_dt = float(np.median(positive_diffs))
        return 1.0 / median_dt if median_dt > 0.0 else None

    @staticmethod
    def _fallback_rate(time_s: np.ndarray) -> float:
        finite = time_s[np.isfinite(time_s)]
        if finite.size < 2:
            return 0.0
        diffs = np.diff(finite)
        diffs = diffs[diffs > 0.0]
        return 1.0 / float(np.median(diffs)) if diffs.size else 0.0

    @staticmethod
    def _resolve_gaze_units(
        gx: np.ndarray,
        gy: np.ndarray,
        requested: str,
        geometry: Optional[ScreenPixelSize],
        zero_pair_is_invalid: bool,
        warnings: List[str],
    ) -> str:
        requested = requested.lower()
        if requested != "auto":
            return requested
        finite = np.isfinite(gx) & np.isfinite(gy) & (gx >= 0.0) & (gy >= 0.0)
        if zero_pair_is_invalid:
            finite &= ~((gx == 0.0) & (gy == 0.0))
        if not finite.any():
            warnings.append("gaze_units_assumed_percent")
            return "percent"
        max_x = float(np.max(gx[finite]))
        max_y = float(np.max(gy[finite]))
        if max_x <= 1.25 and max_y <= 1.25:
            chosen = "normalized"
        elif max_x <= 100.5 and max_y <= 100.5:
            chosen = "percent"
        elif (
            geometry is not None
            and max_x <= float(geometry.width_px) * 1.01
            and max_y <= float(geometry.height_px) * 1.01
        ):
            chosen = "pixels"
        else:
            # Percent is safest: out-of-range values then become invalid instead of
            # being silently scaled into the screen.
            chosen = "percent"
            warnings.append("gaze_units_ambiguous_assumed_percent")
        warnings.append(f"gaze_units_inferred:{chosen}")
        return chosen

    @staticmethod
    def _to_normalized(
        gx: np.ndarray,
        gy: np.ndarray,
        units: str,
        geometry: Optional[ScreenPixelSize],
    ) -> Tuple[np.ndarray, np.ndarray]:
        if units == "normalized":
            return gx.copy(), gy.copy()
        if units == "percent":
            return gx / 100.0, gy / 100.0
        if geometry is None:  # guarded by contract validation
            raise ValueError("pixel gaze units require screen pixel dimensions")
        return gx / float(geometry.width_px), gy / float(geometry.height_px)

    @staticmethod
    def _distance_mm(
        samples: pd.DataFrame,
        metadata: FixationDetectionMetadata,
        valid: np.ndarray,
        warnings: List[str],
    ) -> np.ndarray:
        fallback = (
            float(metadata.screen_geometry.viewing_distance_mm)
            if metadata.screen_geometry is not None
            else math.nan
        )
        result = np.full(len(samples), fallback, dtype=float)
        if "distance" not in samples:
            return result

        raw = pd.to_numeric(samples["distance"], errors="coerce").to_numpy(float)
        usable = np.isfinite(raw) & (raw > 0.0) & valid
        if not usable.any():
            warnings.append("sample_distance_unavailable_using_geometry_fallback")
            return result

        unit = metadata.distance_unit.lower()
        if unit == "auto":
            median = float(np.median(raw[usable]))
            if median <= 2.0:
                unit = "m"
            elif median <= 200.0:
                unit = "cm"
            else:
                unit = "mm"
            warnings.append(f"distance_unit_inferred:{unit}")
        factor = {"mm": 1.0, "cm": 10.0, "m": 1000.0}[unit]
        converted = raw * factor
        use_converted = np.isfinite(converted) & (converted > 0.0) & valid
        result[use_converted] = converted[use_converted]
        if (~use_converted & valid).any():
            warnings.append("invalid_sample_distance_using_geometry_fallback")
        return result

    @staticmethod
    def _segment_ids(
        time_s: np.ndarray,
        scenario_keys: np.ndarray,
        rate_hz: float,
        max_bridge_gap_ms: float,
        hard_spatial_invalid: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        result = np.full(len(time_s), -1, dtype=np.int64)
        hard_invalid = (
            np.asarray(hard_spatial_invalid, dtype=bool)
            if hard_spatial_invalid is not None
            else np.zeros(len(time_s), dtype=bool)
        )
        next_id = 1
        previous_position: Optional[int] = None
        period = 1.0 / rate_hz if rate_hz > 0.0 else math.nan
        for position in range(len(time_s)):
            # Off-screen, clipped, and off-stimulus rows are omitted from the
            # analysis blocks. Resetting the predecessor makes the following
            # valid row start a new segment, so the internal short-gap bridge
            # can never join events across a spatial boundary.
            if hard_invalid[position] or not np.isfinite(time_s[position]):
                previous_position = None
                continue
            new_segment = previous_position is None
            if previous_position is not None:
                dt = time_s[position] - time_s[previous_position]
                scenario_changed = (
                    scenario_keys[position] != scenario_keys[previous_position]
                )
                non_monotonic = not math.isfinite(dt) or dt <= 0.0
                missing_duration = (
                    max(0.0, dt - period) if math.isfinite(period) else 0.0
                )
                discontinuity = missing_duration * 1000.0 > max_bridge_gap_ms + 1e-9
                new_segment = scenario_changed or non_monotonic or discontinuity
            if new_segment:
                current_id = next_id
                next_id += 1
            result[position] = current_id
            previous_position = position
        return result

    @staticmethod
    def _ordered_segment_ids(segment_ids: np.ndarray) -> Sequence[int]:
        return list(dict.fromkeys(int(value) for value in segment_ids if value >= 0))

    @staticmethod
    def _initialize_output_columns(
        samples: pd.DataFrame,
        segment_ids: np.ndarray,
        method: str,
        effective_rate_hz: float,
        valid: np.ndarray,
        *,
        gaze_units: str,
        coordinates: Mapping[str, np.ndarray],
        invalid_reason: np.ndarray,
    ) -> None:
        segment_values = [value if value >= 0 else pd.NA for value in segment_ids]
        samples["fix_x"] = NO_FIXATION_VALUE
        samples["fix_y"] = NO_FIXATION_VALUE
        samples["fixation_id"] = pd.array([pd.NA] * len(samples), dtype="Int64")
        samples["fixation_segment_id"] = pd.array(segment_values, dtype="Int64")
        samples["segment_id"] = pd.array(segment_values, dtype="Int64")
        samples["fixation_method"] = method
        samples["method"] = method
        samples["fixation_detector_version"] = FIXATION_DETECTOR_VERSION
        samples["version"] = FIXATION_DETECTOR_VERSION
        samples["is_valid_gaze"] = valid.astype(bool)
        samples["fixation_detector_sample_count"] = np.zeros(
            len(samples), dtype=np.int64
        )
        samples["fixation_source_row_count"] = np.zeros(len(samples), dtype=np.int64)
        samples["fixation_effective_rate_hz"] = (
            float(effective_rate_hz) if effective_rate_hz > 0.0 else math.nan
        )
        samples["fixation_coordinate_unit"] = "percent"
        samples["fixation_coordinate_space"] = coordinates["fixation_coordinate_space"]
        samples["fixation_source"] = "raw_gaze"
        samples["gaze_input_unit_resolved"] = gaze_units
        samples["gaze_x_screen_px"] = coordinates["x_screen_px"]
        samples["gaze_y_screen_px"] = coordinates["y_screen_px"]
        samples["gaze_x_stimulus_norm"] = coordinates["x_stimulus_norm"]
        samples["gaze_y_stimulus_norm"] = coordinates["y_stimulus_norm"]
        samples["is_in_viewport"] = pd.array(
            [
                bool(value) if applied else pd.NA
                for value, applied in zip(
                    coordinates["in_viewport"], coordinates["transform_applied"]
                )
            ],
            dtype="boolean",
        )
        samples["is_in_stimulus"] = pd.array(
            [
                bool(value) if applied else pd.NA
                for value, applied in zip(
                    coordinates["in_stimulus"], coordinates["transform_applied"]
                )
            ],
            dtype="boolean",
        )
        samples["gaze_invalid_reason"] = pd.array(invalid_reason, dtype="string")
        samples["stimulus_transform_status"] = coordinates["transform_status"]
        samples["stimulus_transform_version"] = pd.array(
            coordinates["transform_version"], dtype="string"
        )
        samples["stimulus_transform_fingerprint"] = pd.array(
            coordinates["transform_fingerprint"], dtype="string"
        )
        samples["screen_width_px"] = coordinates["screen_width_px"]
        samples["screen_height_px"] = coordinates["screen_height_px"]
        samples["stimulus_display_width_px"] = coordinates["stimulus_display_width_px"]
        samples["stimulus_display_height_px"] = coordinates[
            "stimulus_display_height_px"
        ]

    @staticmethod
    def _build_analysis_block(
        segment_id: int,
        positions: np.ndarray,
        scenario: Any,
        time_s: np.ndarray,
        x_screen_norm: np.ndarray,
        y_screen_norm: np.ndarray,
        x_centroid_norm: np.ndarray,
        y_centroid_norm: np.ndarray,
        distance_mm: np.ndarray,
        valid: np.ndarray,
        effective_rate_hz: float,
        resample: bool,
        fixation_coordinate_space: str,
        stimulus_transform_status: str,
        stimulus_transform_version: Optional[str],
        stimulus_transform_fingerprint: Optional[str],
        screen_width_px: Optional[float],
        screen_height_px: Optional[float],
        stimulus_display_width_px: Optional[float],
        stimulus_display_height_px: Optional[float],
    ) -> _AnalysisBlock:
        if not resample or effective_rate_hz <= 0.0:
            source_positions = [[int(position)] for position in positions]
            valid_positions = [
                [int(position)] if valid[position] else [] for position in positions
            ]
            return _AnalysisBlock(
                segment_id=segment_id,
                scenario=scenario,
                time_s=time_s[positions].copy(),
                x_screen_norm=x_screen_norm[positions].copy(),
                y_screen_norm=y_screen_norm[positions].copy(),
                x_centroid_norm=x_centroid_norm[positions].copy(),
                y_centroid_norm=y_centroid_norm[positions].copy(),
                distance_mm=distance_mm[positions].copy(),
                source_positions=source_positions,
                valid_source_positions=valid_positions,
                original_valid=valid[positions].copy(),
                effective_rate_hz=effective_rate_hz,
                fixation_coordinate_space=fixation_coordinate_space,
                stimulus_transform_status=stimulus_transform_status,
                stimulus_transform_version=stimulus_transform_version,
                stimulus_transform_fingerprint=stimulus_transform_fingerprint,
                screen_width_px=screen_width_px,
                screen_height_px=screen_height_px,
                stimulus_display_width_px=stimulus_display_width_px,
                stimulus_display_height_px=stimulus_display_height_px,
            )

        start = float(time_s[positions[0]])
        relative = (time_s[positions] - start) * effective_rate_hz
        bins = np.floor(relative + 0.5 + 1e-12).astype(np.int64)
        max_bin = int(bins.max()) if bins.size else -1
        analysis_time = start + np.arange(max_bin + 1, dtype=float) / effective_rate_hz
        analysis_screen_x = np.full(max_bin + 1, np.nan, dtype=float)
        analysis_screen_y = np.full(max_bin + 1, np.nan, dtype=float)
        analysis_centroid_x = np.full(max_bin + 1, np.nan, dtype=float)
        analysis_centroid_y = np.full(max_bin + 1, np.nan, dtype=float)
        analysis_distance = np.full(max_bin + 1, np.nan, dtype=float)
        source_groups: List[List[int]] = [[] for _ in range(max_bin + 1)]
        valid_groups: List[List[int]] = [[] for _ in range(max_bin + 1)]

        for source_position, bin_number in zip(positions, bins):
            source_groups[int(bin_number)].append(int(source_position))
            if valid[source_position]:
                valid_groups[int(bin_number)].append(int(source_position))

        original_valid = np.zeros(max_bin + 1, dtype=bool)
        for bin_number, valid_positions in enumerate(valid_groups):
            if not valid_positions:
                continue
            original_valid[bin_number] = True
            analysis_screen_x[bin_number] = float(
                np.median(x_screen_norm[valid_positions])
            )
            analysis_screen_y[bin_number] = float(
                np.median(y_screen_norm[valid_positions])
            )
            analysis_centroid_x[bin_number] = float(
                np.median(x_centroid_norm[valid_positions])
            )
            analysis_centroid_y[bin_number] = float(
                np.median(y_centroid_norm[valid_positions])
            )
            finite_distance = distance_mm[valid_positions]
            finite_distance = finite_distance[np.isfinite(finite_distance)]
            if finite_distance.size:
                analysis_distance[bin_number] = float(np.median(finite_distance))

        return _AnalysisBlock(
            segment_id=segment_id,
            scenario=scenario,
            time_s=analysis_time,
            x_screen_norm=analysis_screen_x,
            y_screen_norm=analysis_screen_y,
            x_centroid_norm=analysis_centroid_x,
            y_centroid_norm=analysis_centroid_y,
            distance_mm=analysis_distance,
            source_positions=source_groups,
            valid_source_positions=valid_groups,
            original_valid=original_valid,
            effective_rate_hz=effective_rate_hz,
            fixation_coordinate_space=fixation_coordinate_space,
            stimulus_transform_status=stimulus_transform_status,
            stimulus_transform_version=stimulus_transform_version,
            stimulus_transform_fingerprint=stimulus_transform_fingerprint,
            screen_width_px=screen_width_px,
            screen_height_px=screen_height_px,
            stimulus_display_width_px=stimulus_display_width_px,
            stimulus_display_height_px=stimulus_display_height_px,
        )

    @classmethod
    def _normalized_duration_variant_samples(
        cls,
        *,
        source_index: pd.Index,
        analysis_blocks: Sequence[_AnalysisBlock],
        geometry: Optional[ScreenGeometry],
        config: FixationDetectionConfig,
        time_raw: np.ndarray,
        method: str,
        classification_units: str,
    ) -> pd.DataFrame:
        """Run only duration-dependent I-DT classification on prepared blocks."""

        variant_samples = pd.DataFrame(index=source_index.copy())
        variant_samples["fix_x"] = np.full(
            len(source_index), NO_FIXATION_VALUE, dtype=float
        )
        variant_samples["fix_y"] = np.full(
            len(source_index), NO_FIXATION_VALUE, dtype=float
        )
        variant_samples["fixation_id"] = pd.array(
            [pd.NA] * len(source_index), dtype="Int64"
        )
        variant_samples["fixation_detector_sample_count"] = np.zeros(
            len(source_index), dtype=np.int64
        )
        variant_samples["fixation_source_row_count"] = np.zeros(
            len(source_index), dtype=np.int64
        )

        next_fixation_id = 1
        for analysis in analysis_blocks:
            detected, bridged, detector_diagnostics = cls._detect_analysis_events(
                analysis,
                geometry,
                config,
                "normalized",
            )
            for analysis_indices in detected:
                event, mapped_positions = cls._materialize_event(
                    fixation_id=next_fixation_id,
                    analysis=analysis,
                    analysis_indices=analysis_indices,
                    bridged=bridged,
                    time_raw=time_raw,
                    method=method,
                    classification_threshold=float(detector_diagnostics["threshold"]),
                    classification_units=classification_units,
                    threshold_source=str(detector_diagnostics["threshold_source"]),
                )
                if not mapped_positions:
                    continue
                cls._write_event_to_samples(
                    variant_samples,
                    mapped_positions,
                    event,
                )
                next_fixation_id += 1
        return variant_samples

    @classmethod
    def _detect_analysis_events(
        cls,
        analysis: _AnalysisBlock,
        geometry: Optional[ScreenGeometry],
        config: FixationDetectionConfig,
        coordinate_mode: str,
    ) -> Tuple[List[np.ndarray], np.ndarray, Dict[str, Any]]:
        detection_x, detection_y = cls._detection_coordinates(
            analysis, geometry, coordinate_mode
        )
        classifiable = (
            analysis.original_valid
            & np.isfinite(detection_x)
            & np.isfinite(detection_y)
        )
        if coordinate_mode == "angular":
            initial_velocity = cls._angular_velocity(
                detection_x, detection_y, analysis.time_s, classifiable
            )
            velocity_threshold, threshold_source = cls._adaptive_velocity_threshold(
                initial_velocity, config
            )
            classifiable, bridged = cls._bridge_short_gaps(
                detection_x=detection_x,
                detection_y=detection_y,
                time_s=analysis.time_s,
                classifiable=classifiable,
                effective_rate_hz=analysis.effective_rate_hz,
                max_gap_ms=config.max_bridge_gap_ms,
                compatibility_threshold=velocity_threshold,
                angular_velocity=True,
            )
            velocity = cls._angular_velocity(
                detection_x, detection_y, analysis.time_s, classifiable
            )
            fixation_samples = cls._velocity_hysteresis_mask(
                velocity,
                classifiable,
                velocity_threshold,
                config.velocity_hysteresis_ratio,
            )
            events = cls._duration_filtered_runs(
                fixation_samples,
                analysis.original_valid,
                analysis.time_s,
                analysis.effective_rate_hz,
                config.min_fixation_duration_ms,
            )
            return (
                events,
                bridged,
                {
                    "threshold": float(velocity_threshold),
                    "threshold_source": threshold_source,
                },
            )

        threshold = float(config.normalized_dispersion_threshold)
        classifiable, bridged = cls._bridge_short_gaps(
            detection_x=detection_x,
            detection_y=detection_y,
            time_s=analysis.time_s,
            classifiable=classifiable,
            effective_rate_hz=analysis.effective_rate_hz,
            max_gap_ms=config.max_bridge_gap_ms,
            compatibility_threshold=threshold,
            angular_velocity=False,
        )
        events: List[np.ndarray] = []
        for run_start, run_end in cls._true_runs(classifiable):
            events.extend(
                cls._idt_run(
                    detection_x,
                    detection_y,
                    analysis.original_valid,
                    analysis.time_s,
                    run_start,
                    run_end,
                    analysis.effective_rate_hz,
                    config.min_fixation_duration_ms,
                    threshold,
                )
            )
        return (
            events,
            bridged,
            {
                "threshold": threshold,
                "threshold_source": "configured",
            },
        )

    @staticmethod
    def _bridge_short_gaps(
        detection_x: np.ndarray,
        detection_y: np.ndarray,
        time_s: np.ndarray,
        classifiable: np.ndarray,
        effective_rate_hz: float,
        max_gap_ms: float,
        compatibility_threshold: float,
        angular_velocity: bool,
    ) -> Tuple[np.ndarray, np.ndarray]:
        classifiable = classifiable.copy()
        bridged = np.zeros(len(time_s), dtype=np.int64)
        next_bridge_id = 1
        index = 0
        period = 1.0 / effective_rate_hz if effective_rate_hz > 0.0 else 0.0
        while index < len(classifiable):
            if classifiable[index]:
                index += 1
                continue
            run_start = index
            while index < len(classifiable) and not classifiable[index]:
                index += 1
            run_end = index
            if run_start == 0 or run_end >= len(classifiable):
                continue
            left = run_start - 1
            right = run_end
            missing_by_samples = (run_end - run_start) * period
            missing_by_clock = max(0.0, time_s[right] - time_s[left] - period)
            gap_ms = max(missing_by_samples, missing_by_clock) * 1000.0
            dx = float(detection_x[right] - detection_x[left])
            dy = float(detection_y[right] - detection_y[left])
            if angular_velocity:
                elapsed = float(time_s[right] - time_s[left])
                endpoint_measure = (
                    math.hypot(dx, dy) / elapsed if elapsed > 0.0 else math.inf
                )
            else:
                endpoint_measure = abs(dx) + abs(dy)
            if (
                gap_ms <= max_gap_ms + 1e-9
                and endpoint_measure <= compatibility_threshold + 1e-12
            ):
                span = right - left
                for offset, fill_index in enumerate(range(run_start, run_end), start=1):
                    alpha = offset / span
                    detection_x[fill_index] = detection_x[left] + alpha * (
                        detection_x[right] - detection_x[left]
                    )
                    detection_y[fill_index] = detection_y[left] + alpha * (
                        detection_y[right] - detection_y[left]
                    )
                    classifiable[fill_index] = True
                    bridged[fill_index] = next_bridge_id
                next_bridge_id += 1
        return classifiable, bridged

    @staticmethod
    def _detection_coordinates(
        analysis: _AnalysisBlock,
        geometry: Optional[ScreenGeometry],
        coordinate_mode: str,
    ) -> Tuple[np.ndarray, np.ndarray]:
        if coordinate_mode == "normalized":
            return analysis.x_screen_norm.copy(), analysis.y_screen_norm.copy()
        if geometry is None:  # guarded by contract validation
            raise ValueError("angular mode requires complete screen geometry")
        distance = analysis.distance_mm.copy()
        invalid_distance = ~np.isfinite(distance) | (distance <= 0.0)
        distance[invalid_distance] = float(geometry.viewing_distance_mm)
        x_mm = (analysis.x_screen_norm - 0.5) * float(geometry.width_mm)
        y_mm = (analysis.y_screen_norm - 0.5) * float(geometry.height_mm)
        return (
            np.degrees(np.arctan2(x_mm, distance)),
            np.degrees(np.arctan2(y_mm, distance)),
        )

    @classmethod
    def _angular_velocity(
        cls,
        x_deg: np.ndarray,
        y_deg: np.ndarray,
        time_s: np.ndarray,
        classifiable: np.ndarray,
    ) -> np.ndarray:
        """Central angular velocity using actual timestamps, in degrees/second."""

        velocity = np.full(len(time_s), np.nan, dtype=float)
        for start, end in cls._true_runs(classifiable):
            if end - start == 1:
                velocity[start] = 0.0
                continue
            for index in range(start, end):
                left = max(start, index - 1)
                right = min(end - 1, index + 1)
                dt = float(time_s[right] - time_s[left])
                if dt <= 0.0 or not math.isfinite(dt):
                    continue
                velocity[index] = (
                    math.hypot(
                        float(x_deg[right] - x_deg[left]),
                        float(y_deg[right] - y_deg[left]),
                    )
                    / dt
                )
        return velocity

    @staticmethod
    def _adaptive_velocity_threshold(
        velocity: np.ndarray, config: FixationDetectionConfig
    ) -> Tuple[float, str]:
        """Estimate a Mould-inspired non-parametric local-maxima threshold.

        The empirical CDF of local speed maxima is compared with its uniform-null
        CDF.  The largest positive gap marks the upper edge of the dense,
        low-velocity (fixational-noise) cluster.  Short or unimodal segments use
        the documented 30 deg/s default (configurable via ``velocity_fallback``).
        """

        local_maxima: List[float] = []
        for index in range(1, len(velocity) - 1):
            previous = velocity[index - 1]
            current = velocity[index]
            following = velocity[index + 1]
            if not (
                math.isfinite(float(previous))
                and math.isfinite(float(current))
                and math.isfinite(float(following))
            ):
                continue
            if current >= previous and current > following:
                if 0.0 < current <= config.velocity_max_for_adaptation_deg_s:
                    local_maxima.append(float(current))

        fallback = float(config.velocity_fallback_threshold_deg_s)
        if len(local_maxima) < int(config.adaptive_min_local_maxima):
            return fallback, "fallback"

        ordered = np.sort(np.asarray(local_maxima, dtype=float))
        lower = float(ordered[0])
        upper = float(ordered[-1])
        spread = upper - lower
        if spread <= max(1e-9, abs(upper) * 1e-6):
            return fallback, "fallback"

        empirical_cdf = np.arange(1, len(ordered) + 1, dtype=float) / len(ordered)
        uniform_cdf = (ordered - lower) / spread
        gap_statistic = empirical_cdf - uniform_cdf
        # The last point always has zero gap and cannot separate two clusters.
        split_index = int(np.argmax(gap_statistic[:-1]))
        gap_strength = float(gap_statistic[split_index])
        candidate = float(ordered[split_index])
        has_upper_cluster = split_index < len(ordered) - 1
        separated = ordered[split_index + 1] > candidate * 1.05
        if (
            gap_strength < 0.10
            or not has_upper_cluster
            or not separated
            or candidate <= 0.0
            or candidate >= config.velocity_max_for_adaptation_deg_s
        ):
            return fallback, "fallback"
        return candidate, "adaptive_gap_statistic"

    @classmethod
    def _velocity_hysteresis_mask(
        cls,
        velocity: np.ndarray,
        classifiable: np.ndarray,
        low_threshold: float,
        hysteresis_ratio: float,
    ) -> np.ndarray:
        fixation = np.zeros(len(velocity), dtype=bool)
        high_threshold = low_threshold * hysteresis_ratio
        for start, end in cls._true_runs(classifiable):
            in_saccade = bool(velocity[start] > high_threshold)
            for index in range(start, end):
                speed = float(velocity[index])
                if not math.isfinite(speed):
                    in_saccade = True
                elif in_saccade:
                    if speed <= low_threshold:
                        in_saccade = False
                elif speed > high_threshold:
                    in_saccade = True
                fixation[index] = not in_saccade
        return fixation

    @classmethod
    def _duration_filtered_runs(
        cls,
        fixation_mask: np.ndarray,
        original_valid: np.ndarray,
        time_s: np.ndarray,
        rate_hz: float,
        min_duration_ms: float,
    ) -> List[np.ndarray]:
        result: List[np.ndarray] = []
        tolerance_ms = max(1e-6, abs(min_duration_ms) * 1e-9)
        for start, end in cls._true_runs(fixation_mask):
            indices = np.arange(start, end, dtype=np.int64)
            support_ms = (
                cls._valid_support_seconds(
                    time_s,
                    indices,
                    original_valid,
                    rate_hz,
                )
                * 1000.0
            )
            if support_ms + tolerance_ms >= min_duration_ms:
                result.append(indices)
        return result

    @staticmethod
    def _true_runs(mask: np.ndarray) -> List[Tuple[int, int]]:
        runs: List[Tuple[int, int]] = []
        index = 0
        while index < len(mask):
            if not mask[index]:
                index += 1
                continue
            start = index
            while index < len(mask) and mask[index]:
                index += 1
            runs.append((start, index))
        return runs

    @staticmethod
    def _valid_support_seconds(
        time_s: np.ndarray,
        indices: np.ndarray,
        original_valid: np.ndarray,
        rate_hz: float,
    ) -> float:
        """Measure valid support without charging bridged or missing intervals.

        Consecutive valid timestamps contribute their real interval, capped at
        one detector period so a missing interval cannot become dwell time. The
        final sample of every valid run contributes the local median supported
        interval, or one detector period when it is the run's only sample.
        """

        valid_indices = np.asarray(indices, dtype=np.int64)
        valid_indices = valid_indices[original_valid[valid_indices]]
        if valid_indices.size == 0:
            return 0.0

        period = 1.0 / rate_hz if rate_hz > 0.0 else 0.0
        total = 0.0
        run_start = 0
        split_offsets = np.flatnonzero(np.diff(valid_indices) != 1) + 1
        run_boundaries = [*split_offsets.tolist(), int(valid_indices.size)]
        for run_end in run_boundaries:
            run_indices = valid_indices[run_start:run_end]
            diffs = np.diff(time_s[run_indices])
            diffs = diffs[np.isfinite(diffs) & (diffs > 0.0)]
            terminal_support = period
            if diffs.size:
                supported_diffs = np.minimum(diffs, period) if period > 0.0 else diffs
                total += float(supported_diffs.sum())
                terminal_support = float(np.median(supported_diffs))
            total += max(0.0, terminal_support)
            run_start = run_end
        return total

    @staticmethod
    def _idt_run(
        x: np.ndarray,
        y: np.ndarray,
        original_valid: np.ndarray,
        time_s: np.ndarray,
        run_start: int,
        run_end: int,
        rate_hz: float,
        min_duration_ms: float,
        threshold: float,
    ) -> List[np.ndarray]:
        if rate_hz <= 0.0:
            return []
        required_support_s = min_duration_ms / 1000.0
        support_tolerance_s = max(1e-9, abs(required_support_s) * 1e-9)
        detected: List[np.ndarray] = []
        start = run_start
        while start < run_end:
            end = start
            support_s = 0.0
            while (
                end < run_end and support_s + support_tolerance_s < required_support_s
            ):
                end += 1
                support_s = FixationDetectionService._valid_support_seconds(
                    time_s,
                    np.arange(start, end, dtype=np.int64),
                    original_valid,
                    rate_hz,
                )
            if support_s + support_tolerance_s < required_support_s:
                break

            window_x = x[start:end]
            window_y = y[start:end]
            dispersion = (float(np.max(window_x)) - float(np.min(window_x))) + (
                float(np.max(window_y)) - float(np.min(window_y))
            )
            if dispersion > threshold + 1e-12:
                start += 1
                continue

            event_end = end
            min_x = float(np.min(window_x))
            max_x = float(np.max(window_x))
            min_y = float(np.min(window_y))
            max_y = float(np.max(window_y))
            while event_end < run_end:
                candidate_x = float(x[event_end])
                candidate_y = float(y[event_end])
                candidate_min_x = min(min_x, candidate_x)
                candidate_max_x = max(max_x, candidate_x)
                candidate_min_y = min(min_y, candidate_y)
                candidate_max_y = max(max_y, candidate_y)
                candidate_dispersion = (candidate_max_x - candidate_min_x) + (
                    candidate_max_y - candidate_min_y
                )
                if candidate_dispersion > threshold + 1e-12:
                    break
                min_x, max_x = candidate_min_x, candidate_max_x
                min_y, max_y = candidate_min_y, candidate_max_y
                event_end += 1

            event_indices = np.arange(start, event_end, dtype=np.int64)
            event_support_s = FixationDetectionService._valid_support_seconds(
                time_s,
                event_indices,
                original_valid,
                rate_hz,
            )
            if event_support_s + support_tolerance_s >= required_support_s:
                detected.append(event_indices)
            start = event_end
        return detected

    @staticmethod
    def _materialize_event(
        fixation_id: int,
        analysis: _AnalysisBlock,
        analysis_indices: np.ndarray,
        bridged: np.ndarray,
        time_raw: np.ndarray,
        method: str,
        classification_threshold: float,
        classification_units: str,
        threshold_source: str,
    ) -> Tuple[Dict[str, Any], List[int]]:
        valid_analysis_indices = analysis_indices[
            analysis.original_valid[analysis_indices]
        ]
        mapped_positions: List[int] = []
        for analysis_index in valid_analysis_indices:
            mapped_positions.extend(
                analysis.valid_source_positions[int(analysis_index)]
            )
        mapped_positions = sorted(set(mapped_positions))

        centroid_x = float(
            np.median(analysis.x_centroid_norm[valid_analysis_indices]) * 100.0
        )
        centroid_y = float(
            np.median(analysis.y_centroid_norm[valid_analysis_indices]) * 100.0
        )
        detector_count = int(len(valid_analysis_indices))
        source_count = int(len(mapped_positions))
        period_ms = (
            1000.0 / analysis.effective_rate_hz
            if analysis.effective_rate_hz > 0.0
            else 0.0
        )
        duration_ms = (
            FixationDetectionService._valid_support_seconds(
                analysis.time_s,
                analysis_indices,
                analysis.original_valid,
                analysis.effective_rate_hz,
            )
            * 1000.0
        )
        wall_duration_ms = (
            analysis.time_s[int(analysis_indices[-1])]
            - analysis.time_s[int(analysis_indices[0])]
        ) * 1000.0 + period_ms
        bridge_ids = set(int(value) for value in bridged[analysis_indices] if value > 0)
        start_time = (
            float(np.nanmin(time_raw[mapped_positions]))
            if mapped_positions
            else math.nan
        )
        end_time = (
            float(np.nanmax(time_raw[mapped_positions]))
            if mapped_positions
            else math.nan
        )
        event = {
            "fixation_id": int(fixation_id),
            "fixation_segment_id": int(analysis.segment_id),
            "segment_id": int(analysis.segment_id),
            "scenario": analysis.scenario,
            "start_time": start_time,
            "end_time": end_time,
            "duration_ms": float(duration_ms),
            "wall_duration_ms": float(wall_duration_ms),
            "centroid_x": centroid_x,
            "centroid_y": centroid_y,
            "fix_x": centroid_x,
            "fix_y": centroid_y,
            "bridged_gap_count": int(len(bridge_ids)),
            "classification_threshold": float(classification_threshold),
            "classification_units": classification_units,
            "threshold_source": threshold_source,
            "dispersion_threshold": (
                float(classification_threshold)
                if method == "i-dt-normalized"
                else math.nan
            ),
            "dispersion_units": ("normalized" if method == "i-dt-normalized" else None),
            "velocity_threshold_deg_s": (
                float(classification_threshold)
                if method == "adaptive-ivt-angular"
                else math.nan
            ),
            "fixation_detector_sample_count": detector_count,
            "fixation_source_row_count": source_count,
            "fixation_effective_rate_hz": float(analysis.effective_rate_hz),
            "fixation_coordinate_unit": "percent",
            "fixation_coordinate_space": analysis.fixation_coordinate_space,
            "fixation_source": "raw_gaze",
            "stimulus_transform_status": analysis.stimulus_transform_status,
            "stimulus_transform_version": analysis.stimulus_transform_version,
            "stimulus_transform_fingerprint": analysis.stimulus_transform_fingerprint,
            "screen_width_px": analysis.screen_width_px,
            "screen_height_px": analysis.screen_height_px,
            "stimulus_display_width_px": analysis.stimulus_display_width_px,
            "stimulus_display_height_px": analysis.stimulus_display_height_px,
            "fixation_method": method,
            "method": method,
            "fixation_detector_version": FIXATION_DETECTOR_VERSION,
            "version": FIXATION_DETECTOR_VERSION,
        }
        return event, mapped_positions

    @staticmethod
    def _write_event_to_samples(
        samples: pd.DataFrame, mapped_positions: List[int], event: Dict[str, Any]
    ) -> None:
        values = {
            "fix_x": event["centroid_x"],
            "fix_y": event["centroid_y"],
            "fixation_id": event["fixation_id"],
            "fixation_detector_sample_count": event["fixation_detector_sample_count"],
            "fixation_source_row_count": event["fixation_source_row_count"],
        }
        for column, value in values.items():
            samples.iloc[mapped_positions, samples.columns.get_loc(column)] = value

    @classmethod
    def _event_frame(
        cls,
        events: List[Dict[str, Any]],
        warning_json: str,
        min_fixation_duration_ms: int,
    ) -> pd.DataFrame:
        columns = [
            "fixation_id",
            "fixation_segment_id",
            "segment_id",
            "scenario",
            "start_time",
            "end_time",
            "duration_ms",
            "wall_duration_ms",
            "centroid_x",
            "centroid_y",
            "fix_x",
            "fix_y",
            "bridged_gap_count",
            "classification_threshold",
            "classification_units",
            "threshold_source",
            "dispersion_threshold",
            "dispersion_units",
            "velocity_threshold_deg_s",
            "fixation_detector_sample_count",
            "fixation_source_row_count",
            FIXATION_MIN_DURATION_COLUMN,
            "fixation_effective_rate_hz",
            "fixation_coordinate_unit",
            "fixation_coordinate_space",
            "fixation_source",
            "stimulus_transform_status",
            "stimulus_transform_version",
            "stimulus_transform_fingerprint",
            "screen_width_px",
            "screen_height_px",
            "stimulus_display_width_px",
            "stimulus_display_height_px",
            "fixation_warnings",
            "fixation_method",
            "method",
            "fixation_detector_version",
            "version",
        ]
        frame = pd.DataFrame(events)
        if frame.empty:
            frame = pd.DataFrame(columns=columns)
        else:
            frame["fixation_warnings"] = warning_json
            frame[FIXATION_MIN_DURATION_COLUMN] = int(min_fixation_duration_ms)
            frame = frame.reindex(columns=columns)
        return frame

    @staticmethod
    def _finite_optional(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    @classmethod
    def _transform_provenance(
        cls,
        statuses: np.ndarray,
        versions: np.ndarray,
        fingerprints: np.ndarray,
        invalid_reason: np.ndarray,
        used_placements: Mapping[str, _StimulusPlacementMetadata],
    ) -> Dict[str, Any]:
        distinct_statuses = list(dict.fromkeys(str(value) for value in statuses))
        unique_versions = {
            str(value) for value in versions if value is not None and not pd.isna(value)
        }
        unique_fingerprints = {
            str(value)
            for value in fingerprints
            if value is not None and not pd.isna(value)
        }
        if not distinct_statuses:
            status = "legacy_passthrough_missing"
        elif (
            len(distinct_statuses) > 1
            or len(unique_versions) > 1
            or len(unique_fingerprints) > 1
        ):
            status = "mixed"
        else:
            status = distinct_statuses[0]

        applied_only = status == "applied"
        outside_by_reason: Optional[Dict[str, int]]
        rejected_outside_count: Optional[int]
        if applied_only:
            outside_by_reason = {
                reason: int(np.count_nonzero(invalid_reason == reason))
                for reason in (
                    "outside_screen",
                    "outside_viewport",
                    "outside_stimulus",
                )
            }
            rejected_outside_count = int(sum(outside_by_reason.values()))
        else:
            outside_by_reason = None
            rejected_outside_count = None

        placements_snapshot = {
            scenario: dict(placement.resolved_payload)
            for scenario, placement in used_placements.items()
        }
        return {
            "stimulus_transform_status": status,
            "stimulus_transform_version": (
                next(iter(unique_versions))
                if len(unique_versions) == 1 and status != "mixed"
                else None
            ),
            "stimulus_transform_fingerprint": (
                next(iter(unique_fingerprints))
                if len(unique_fingerprints) == 1 and status != "mixed"
                else None
            ),
            "fixation_coordinate_space": (
                "stimulus_percent"
                if status == "applied"
                else "legacy_screen_percent"
                if status == "legacy_passthrough_missing"
                else "mixed"
            ),
            "rejected_outside_count": rejected_outside_count,
            "rejected_outside_by_reason": outside_by_reason,
            "stimulus_placements_by_scenario": placements_snapshot,
        }

    @staticmethod
    def _physical_geometry_snapshot(
        geometry: Optional[ScreenGeometry],
    ) -> Optional[Dict[str, float]]:
        if geometry is None:
            return None
        return {
            "width_px": float(geometry.width_px),
            "height_px": float(geometry.height_px),
            "width_mm": float(geometry.width_mm),
            "height_mm": float(geometry.height_mm),
            "viewing_distance_mm": float(geometry.viewing_distance_mm),
        }

    @staticmethod
    def _json_float(value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        number = float(value)
        return number if math.isfinite(number) else None


__all__ = [
    "CANONICAL_FIXATION_MIN_DURATION_MS",
    "DEFAULT_FIXATION_MIN_DURATION_MS",
    "FIXATION_DETECTOR_VERSION",
    "FIXATION_DURATION_VARIANT_COLUMNS",
    "FIXATION_MIN_DURATION_COLUMN",
    "NO_FIXATION_VALUE",
    "SUPPORTED_FIXATION_MIN_DURATIONS_MS",
    "FixationDetectionConfig",
    "FixationDetectionMetadata",
    "FixationDetectionResult",
    "FixationDetectionService",
    "PhysicalScreenGeometry",
    "ScreenGeometry",
    "ScreenPixelSize",
    "fixation_duration_column",
    "validate_fixation_min_duration_ms",
]

"""Duration selection and canonical events share one fixation contract."""

from copy import deepcopy
import json
from typing import Optional
import numpy as np
import pandas as pd
from neurodatics.shared.fixation_contract import (
    CANONICAL_FIXATION_MIN_DURATION_MS,
    DEFAULT_FIXATION_MIN_DURATION_MS,
    FIXATION_DURATION_VARIANT_COLUMNS,
    FIXATION_MIN_DURATION_COLUMN,
    SUPPORTED_FIXATION_MIN_DURATIONS_MS,
    fixation_duration_column,
)
from ...domain.coordinate_transform import attach_transform_provenance
from .numeric_helpers import _infer_fs as _infer_fs
from .numeric_helpers import scope_to_scenario as scope_to_scenario
from .fixation_event_reconstruction import _event_from_run, _from_v2, _legacy_events


class FixationDurationVariantService:
    """Select and compare the persisted minimum-duration detector variants.

    Ingestion stores the 200 ms canonical variant under the historical column
    names and the other variants under deterministic suffixes.  This adapter
    presents any requested variant through the canonical names so downstream
    analytics do not need five parallel implementations.
    """

    AVAILABLE_DURATIONS_FIELD = "available_min_fixation_durations_ms"
    REQUESTED_DURATION_ATTR = "requested_min_fixation_duration_ms"
    VARIANT_WARNINGS_ATTR = "fixation_variant_warnings"

    @classmethod
    def validate_duration(cls, value: object = DEFAULT_FIXATION_MIN_DURATION_MS) -> int:
        """Return a supported integer duration or raise an API-friendly error."""

        if value is None:
            value = DEFAULT_FIXATION_MIN_DURATION_MS
        if isinstance(value, (bool, np.bool_)):
            parsed = None
        else:
            try:
                numeric = float(str(value).strip().replace(",", "."))
            except (TypeError, ValueError):
                parsed = None
            else:
                parsed = int(numeric) if np.isfinite(numeric) and numeric.is_integer() else None

        supported = tuple(int(item) for item in SUPPORTED_FIXATION_MIN_DURATIONS_MS)
        if parsed not in supported:
            choices = ", ".join(f"{item} ms" for item in supported)
            raise ValueError(
                f"Unsupported minimum fixation duration {value!r}. "
                f"Supported values are: {choices}."
            )
        return int(parsed)

    @classmethod
    def _attrs_containers(cls, df: pd.DataFrame) -> list[dict]:
        attrs = dict(getattr(df, "attrs", {}) or {})
        containers = [attrs]
        for key in ("fixation", "fixation_metadata", "processing_metadata", "metadata"):
            nested = attrs.get(key)
            if isinstance(nested, dict):
                containers.append(nested)
        return containers

    @classmethod
    def _metadata_value(cls, df: pd.DataFrame, name: str):
        for container in cls._attrs_containers(df):
            if name in container and container[name] is not None:
                return container[name]
        if name in df.columns:
            values = df[name].dropna()
            if not values.empty:
                return values.iloc[0]
        return None

    @classmethod
    def _is_variant_aware(cls, df: pd.DataFrame) -> bool:
        if FIXATION_MIN_DURATION_COLUMN in df.columns:
            return True
        if cls._metadata_value(df, FIXATION_MIN_DURATION_COLUMN) is not None:
            return True
        if cls._metadata_value(df, cls.AVAILABLE_DURATIONS_FIELD) is not None:
            return True
        return any(
            fixation_duration_column(base, duration) in df.columns
            for duration in SUPPORTED_FIXATION_MIN_DURATIONS_MS
            if int(duration) != int(CANONICAL_FIXATION_MIN_DURATION_MS)
            for base in FIXATION_DURATION_VARIANT_COLUMNS
        )

    @classmethod
    def available_durations(cls, df: pd.DataFrame) -> list[int]:
        """Discover complete persisted variants without trusting stale metadata."""

        if not cls._is_variant_aware(df):
            return []
        return [
            int(duration)
            for duration in SUPPORTED_FIXATION_MIN_DURATIONS_MS
            if all(
                fixation_duration_column(base, duration) in df.columns
                for base in FIXATION_DURATION_VARIANT_COLUMNS
            )
        ]

    @classmethod
    def select_variant(
        cls,
        df: pd.DataFrame,
        min_fixation_duration_ms: object = DEFAULT_FIXATION_MIN_DURATION_MS,
    ) -> pd.DataFrame:
        """Return a copied frame whose canonical columns expose one exact variant.

        Files created before duration variants existed are deliberately left
        untouched.  They do not contain enough provenance to claim that their
        unsuffixed columns represent any newly requested threshold.
        """

        requested = cls.validate_duration(min_fixation_duration_ms)
        # The frame can contain wide EEG/GSR channels.  A shallow structural
        # copy lets us replace only the five canonical fixation columns without
        # duplicating every unrelated signal buffer on each request.
        selected = df.copy(deep=False)
        selected.attrs = deepcopy(dict(getattr(df, "attrs", {}) or {}))
        selected.attrs[cls.REQUESTED_DURATION_ATTR] = requested

        if not cls._is_variant_aware(df):
            if requested != int(DEFAULT_FIXATION_MIN_DURATION_MS):
                raise ValueError(
                    f"Requested {requested} ms fixation variant is unavailable for "
                    "this legacy file. Reprocess the project to generate the "
                    "100, 150, 200, 250 and 300 ms variants."
                )
            warning = (
                "this legacy file does not advertise persisted duration variants; "
                "stored fixation columns were used unchanged and their minimum "
                "duration is unknown. Reprocess the project to enable comparison"
            )
            warnings = list(selected.attrs.get(cls.VARIANT_WARNINGS_ATTR, []) or [])
            selected.attrs[cls.VARIANT_WARNINGS_ATTR] = list(
                dict.fromkeys([*warnings, warning])
            )
            return selected

        available = cls.available_durations(df)
        if requested not in available:
            available_text = (
                ", ".join(f"{duration} ms" for duration in available)
                if available
                else "none (the persisted variant columns are incomplete)"
            )
            raise ValueError(
                f"Requested {requested} ms fixation variant is unavailable. "
                f"Available persisted variants: {available_text}."
            )

        for base in FIXATION_DURATION_VARIANT_COLUMNS:
            source = fixation_duration_column(base, requested)
            if source != base:
                selected[base] = selected[source].copy()

        selected[FIXATION_MIN_DURATION_COLUMN] = requested
        selected.attrs[FIXATION_MIN_DURATION_COLUMN] = requested
        selected.attrs[cls.AVAILABLE_DURATIONS_FIELD] = list(available)

        fixation_metadata = deepcopy(selected.attrs.get("fixation", {}))
        if not isinstance(fixation_metadata, dict):
            fixation_metadata = {}
        fixation_metadata[FIXATION_MIN_DURATION_COLUMN] = requested
        fixation_metadata[cls.AVAILABLE_DURATIONS_FIELD] = list(available)
        selected.attrs["fixation"] = fixation_metadata
        return selected

    @classmethod
    def compute_sensitivity(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
    ) -> dict:
        """Summarise fixation/dwell sensitivity for every persisted duration."""

        available = cls.available_durations(df)
        if available and 100 not in available:
            raise ValueError(
                "Cannot compute fixation-duration sensitivity because the required "
                "100 ms baseline variant is unavailable."
            )

        points: list[dict] = []
        metadata: Optional[dict] = None
        totals: dict[int, float] = {}
        for duration in available:
            events, point_metadata = FixationEventService.build_events(
                df,
                scenario=scenario,
                min_fixation_duration_ms=duration,
            )
            if duration == int(DEFAULT_FIXATION_MIN_DURATION_MS) or metadata is None:
                metadata = point_metadata

            durations_ms = events["duration_s"].to_numpy(dtype=float) * 1000.0
            total_duration_ms = float(durations_ms.sum()) if durations_ms.size else 0.0
            totals[duration] = total_duration_ms
            points.append(
                {
                    "min_fixation_duration_ms": duration,
                    "n_fixations": int(durations_ms.size),
                    "total_duration_ms": round(total_duration_ms, 2),
                    "mean_duration_ms": round(float(durations_ms.mean()), 2)
                    if durations_ms.size
                    else 0.0,
                    "median_duration_ms": round(float(np.median(durations_ms)), 2)
                    if durations_ms.size
                    else 0.0,
                    "max_duration_ms": round(float(durations_ms.max()), 2)
                    if durations_ms.size
                    else 0.0,
                }
            )

        baseline_total = totals.get(100, 0.0)
        for point in points:
            retained = (
                (totals[point["min_fixation_duration_ms"]] / baseline_total) * 100.0
                if baseline_total > 0.0
                else 0.0
            )
            point["retained_dwell_percent"] = round(float(retained), 2)

        if metadata is None:
            _, metadata = FixationEventService.build_events(df, scenario=scenario)
        metadata = dict(metadata)
        metadata["available_min_fixation_durations_ms"] = list(available)
        return {
            "points": points,
            "default_min_fixation_duration_ms": int(DEFAULT_FIXATION_MIN_DURATION_MS),
            **metadata,
        }


class FixationEventService:
    """Build one canonical fixation-event table for every spatial analytic.

    Detector-v2 Parquets are event-labelled sample streams.  Legacy Parquets are
    adapted through the old proximity semantics, but invalid rows always break an
    event so missing/saccade intervals are never charged to a neighbouring
    fixation.
    """

    EVENT_COLUMNS = [
        "id",
        "x_norm",
        "y_norm",
        "time_s",
        "t_end_s",
        "duration_s",
        "detector_sample_count",
        "source_row_count",
        "segment_id",
    ]
    V2_COLUMNS = {
        "time",
        "fix_x",
        "fix_y",
        "fixation_id",
        "fixation_segment_id",
        "fixation_method",
        "fixation_detector_version",
    }
    _GAP_FLOOR_S = 0.100
    _GAP_MULTIPLIER = 3.0
    _DEFAULT_BRIDGE_GAP_S = 0.075
    # A V2 export can never carry a detection rate above its own row grid, so a
    # declared rate that does is treated as stale metadata and is not used to
    # rebuild the detector duration.
    _RATE_CONSISTENCY_TOLERANCE = 0.05
    # Legacy containment: one isolated row proves a sample, not a fixation, so
    # it never becomes an event.  Documented in docs/FIXATION_V2.md.
    _LEGACY_MIN_SOURCE_ROWS = 2

    @classmethod
    def empty_events(cls) -> pd.DataFrame:
        return pd.DataFrame(columns=cls.EVENT_COLUMNS)

    @staticmethod
    def _scope(df: pd.DataFrame, scenario: Optional[str]) -> pd.DataFrame:
        attrs = dict(getattr(df, "attrs", {}) or {})
        scoped = scope_to_scenario(df, scenario)
        scoped = scoped.copy(deep=False)
        scoped.attrs.update(attrs)
        return scoped

    @staticmethod
    def _first_text(df: pd.DataFrame, names: tuple[str, ...]) -> Optional[str]:
        for name in names:
            if name not in df.columns:
                continue
            values = df[name].dropna().astype(str).str.strip()
            values = values[~values.str.lower().isin({"", "nan", "none", "null"})]
            if not values.empty:
                return str(values.iloc[0])
        return None

    @staticmethod
    def _metadata_value(df: pd.DataFrame, names: tuple[str, ...]):
        attrs = dict(getattr(df, "attrs", {}) or {})
        containers = [attrs]
        for key in ("fixation", "fixation_metadata", "processing_metadata", "metadata"):
            nested = attrs.get(key)
            if isinstance(nested, dict):
                containers.append(nested)

        for container in containers:
            for name in names:
                if name in container and container[name] is not None:
                    return container[name]

        for name in names:
            if name not in df.columns:
                continue
            values = df[name].dropna()
            if not values.empty:
                return values.iloc[0]
        return None

    @staticmethod
    def _as_positive_float(value) -> Optional[float]:
        if value is None:
            return None
        try:
            parsed = float(str(value).strip().replace(",", "."))
        except (TypeError, ValueError):
            return None
        return parsed if np.isfinite(parsed) and parsed > 0 else None

    @classmethod
    def _effective_rate(cls, df: pd.DataFrame) -> tuple[Optional[float], bool]:
        declared = cls._as_positive_float(
            cls._metadata_value(
                df,
                (
                    "fixation_effective_rate_hz",
                    "effective_sampling_rate_hz",
                    "effective_rate_hz",
                    "file_frequency_hz",
                    "sampling_frequency_hz",
                ),
            )
        )
        if declared is not None:
            return declared, False

        if "time" not in df.columns:
            return None, False
        times = pd.to_numeric(df["time"], errors="coerce").to_numpy(dtype=float)
        times = times[np.isfinite(times)]
        if times.size < 2:
            return None, False
        rate = _infer_fs(times, default=0.0)
        return (rate, True) if rate > 0 and np.isfinite(rate) else (None, False)

    @staticmethod
    def _warning_list(value) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            try:
                decoded = json.loads(text)
            except (TypeError, ValueError, json.JSONDecodeError):
                return [text]
            if isinstance(decoded, list):
                return [str(item) for item in decoded if str(item).strip()]
            return [str(decoded)] if str(decoded).strip() else []
        if isinstance(value, (list, tuple, set)):
            return [str(item) for item in value if str(item).strip()]
        return [str(value)]

    @classmethod
    def _metadata(cls, df: pd.DataFrame, *, is_v2: bool, fallback_source: str = "") -> dict:
        warnings = cls._warning_list(
            cls._metadata_value(
                df,
                ("fixation_warnings", "fixation_warning", "quality_warnings"),
            )
        )
        warnings.extend(
            cls._warning_list(
                cls._metadata_value(
                    df,
                    (FixationDurationVariantService.VARIANT_WARNINGS_ATTR,),
                )
            )
        )
        effective_rate, inferred = cls._effective_rate(df)
        if inferred:
            warnings.append("effective sampling rate inferred from timestamps")

        duration_value = cls._metadata_value(df, (FIXATION_MIN_DURATION_COLUMN,))
        try:
            min_fixation_duration_ms = (
                FixationDurationVariantService.validate_duration(duration_value)
                if duration_value is not None
                else None
            )
        except ValueError:
            min_fixation_duration_ms = None
            warnings.append(
                f"stored {FIXATION_MIN_DURATION_COLUMN} value is invalid and was ignored"
            )
        available_durations = FixationDurationVariantService.available_durations(df)

        if is_v2:
            version = cls._first_text(df, ("fixation_detector_version",)) or str(
                cls._metadata_value(df, ("fixation_detector_version", "algorithm_version"))
                or "fixation-v2"
            )
            method = cls._first_text(df, ("fixation_method",)) or str(
                cls._metadata_value(df, ("fixation_method", "method")) or "unknown"
            )
            source = "raw_gaze"
        else:
            version = "legacy-adapter-v1"
            method = "legacy_proximity"
            source = fallback_source or "legacy_fixation_columns"
            warnings.append(
                "legacy adapter: these fixation events and their durations are "
                "estimates rebuilt from stored samples, not detector output"
            )

        return {
            "algorithm_version": version,
            "method": method,
            "source": source,
            # False only when the events come from a detector-v2 export; every
            # legacy event is inferred and must be read as an estimate.
            "estimated": not is_v2,
            "effective_sampling_rate_hz": (
                float(effective_rate) if effective_rate is not None else None
            ),
            "min_fixation_duration_ms": min_fixation_duration_ms,
            "available_min_fixation_durations_ms": available_durations,
            "warnings": list(dict.fromkeys(warnings)),
        }

    @staticmethod
    def _normalise_identifier(value) -> Optional[str]:
        if value is None or pd.isna(value):
            return None
        if isinstance(value, (int, np.integer)):
            return str(int(value))
        if isinstance(value, (float, np.floating)) and np.isfinite(value) and float(value).is_integer():
            return str(int(value))
        text = str(value).strip()
        return text if text and text.lower() not in {"nan", "none", "null"} else None

    @classmethod
    def _normalised_coordinates(
        cls,
        df: pd.DataFrame,
        x_col: str,
        y_col: str,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
        """Normalise stored fixation coordinates and reject off-screen rows.

        A coordinate outside the screen is evidence that the row is not a
        usable fixation sample, so it is dropped.  Clamping it to the border
        instead would move real attention onto an edge it never visited, and
        the edge would then win AOI hits and heatmap weight.
        """

        x = pd.to_numeric(df[x_col], errors="coerce").to_numpy(dtype=float)
        y = pd.to_numeric(df[y_col], errors="coerce").to_numpy(dtype=float)
        finite = np.isfinite(x) & np.isfinite(y)
        sentinel = np.isclose(x, -100.0, atol=1e-6) & np.isclose(y, -100.0, atol=1e-6)

        unit = str(
            cls._metadata_value(
                df,
                ("fixation_coordinate_unit", "fixation_coordinate_scale", "coordinate_unit"),
            )
            or ""
        ).strip().lower()
        if unit in {"normalized", "normalised", "0-1", "fraction"}:
            scale = 1.0
        elif unit in {"percent", "percentage", "0-100", "%"}:
            scale = 100.0
        else:
            usable = np.concatenate([np.abs(x[finite & ~sentinel]), np.abs(y[finite & ~sentinel])])
            scale = 1.0 if usable.size and float(np.nanmax(usable)) <= 1.1 else 100.0

        x_norm = x / scale
        y_norm = y / scale
        on_screen = (
            (x_norm >= 0.0) & (x_norm <= 1.0) & (y_norm >= 0.0) & (y_norm <= 1.0)
        )
        candidate = finite & ~sentinel
        rejected = int(np.count_nonzero(candidate & ~on_screen))
        return x_norm, y_norm, candidate & on_screen, rejected

    @classmethod
    def _cadence_by_segment(
        cls,
        times: np.ndarray,
        segments: list[Optional[str]],
        effective_rate: Optional[float],
    ) -> dict[Optional[str], float]:
        fallback = 1.0 / effective_rate if effective_rate and effective_rate > 0 else 0.0
        cadence: dict[Optional[str], float] = {}
        for segment in dict.fromkeys(segments):
            segment_times = np.asarray(
                [time for time, key in zip(times, segments) if key == segment and np.isfinite(time)],
                dtype=float,
            )
            diffs = np.diff(segment_times)
            diffs = diffs[(diffs > 0) & np.isfinite(diffs)]
            cadence[segment] = float(np.median(diffs)) if diffs.size else fallback
        return cadence

    @staticmethod
    def _support_runs(
        positions: np.ndarray,
        times: np.ndarray,
        gap_limit_s: Optional[float],
    ) -> list[tuple[int, int]]:
        """Split an event wherever its rows stop proving continuous support.

        A dropped source row, a backwards clock and a gap longer than the
        bridge limit all end a run.  A repeated timestamp does not: it is an
        export-grid artefact, and restarting a run there would pay its closing
        period twice.
        """

        starts = [0]
        for offset in range(1, int(positions.size)):
            dt = float(times[positions[offset]] - times[positions[offset - 1]])
            source_discontinuity = positions[offset] != positions[offset - 1] + 1
            time_discontinuity = (
                not np.isfinite(dt)
                or dt < 0.0
                or (gap_limit_s is not None and dt > gap_limit_s)
            )
            if source_discontinuity or time_discontinuity:
                starts.append(offset)
        starts.append(int(positions.size))
        return list(zip(starts[:-1], starts[1:]))

    @staticmethod
    def _row_support_seconds(
        positions: np.ndarray,
        times: np.ndarray,
        runs: list[tuple[int, int]],
        cadence_s: float,
    ) -> float:
        """Sum only the support the surviving rows prove, as the detector does.

        Every interval between two consecutive rows contributes at most one
        sampling period, so a short stretch of absent rows cannot be charged
        back as dwell, and each run closes with one period for its last row.
        """

        cadence = max(0.0, float(cadence_s))
        total = 0.0
        for start_offset, end_offset in runs:
            window = positions[start_offset:end_offset]
            for previous, current in zip(window[:-1], window[1:]):
                dt = float(times[current] - times[previous])
                if not np.isfinite(dt) or dt <= 0.0:
                    continue
                total += min(dt, cadence) if cadence > 0.0 else dt
            total += cadence
        return total

    _event_from_run = classmethod(_event_from_run)

    _from_v2 = classmethod(_from_v2)

    _legacy_events = classmethod(_legacy_events)

    @classmethod
    def build_events(
        cls,
        df: pd.DataFrame,
        scenario: Optional[str] = None,
        proximity_threshold: float = 0.03,
        min_fixation_duration_ms: Optional[int] = None,
    ) -> tuple[pd.DataFrame, dict]:
        selected = (
            FixationDurationVariantService.select_variant(
                df,
                min_fixation_duration_ms=min_fixation_duration_ms,
            )
            if min_fixation_duration_ms is not None
            else df
        )
        scoped = cls._scope(selected, scenario)
        if cls.V2_COLUMNS.issubset(scoped.columns):
            events, metadata = cls._from_v2(scoped)
        else:
            events, metadata = cls._legacy_events(scoped, proximity_threshold)
        return events, attach_transform_provenance(metadata, scoped)

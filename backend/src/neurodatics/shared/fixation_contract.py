"""Shared persisted fixation version, duration and column-name contract."""

import math
from typing import Any, Tuple

FIXATION_DETECTOR_VERSION = "fixation-v2"
NO_FIXATION_VALUE = -100.0

# New raw-gaze imports are materialized once at the canonical duration and carry
# only the event-defining columns for the other supported durations.  Keeping
# this contract here gives ingestion and analytics one source of truth for both
# validation and Parquet column names.
SUPPORTED_FIXATION_MIN_DURATIONS_MS: Tuple[int, ...] = (100, 150, 200, 250, 300)
DEFAULT_FIXATION_MIN_DURATION_MS = 200
CANONICAL_FIXATION_MIN_DURATION_MS = DEFAULT_FIXATION_MIN_DURATION_MS
FIXATION_MIN_DURATION_COLUMN = "fixation_min_duration_ms"
FIXATION_DURATION_VARIANT_COLUMNS: Tuple[str, ...] = (
    "fix_x",
    "fix_y",
    "fixation_id",
    "fixation_detector_sample_count",
    "fixation_source_row_count",
)


def validate_fixation_min_duration_ms(value: Any) -> int:
    """Return a supported duration as an integer number of milliseconds."""

    if isinstance(value, bool):
        raise ValueError(
            "minimum fixation duration must be one of 100, 150, 200, 250, 300 ms"
        )
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "minimum fixation duration must be one of 100, 150, 200, 250, 300 ms"
        ) from exc
    if not math.isfinite(numeric) or numeric not in SUPPORTED_FIXATION_MIN_DURATIONS_MS:
        raise ValueError(
            "minimum fixation duration must be one of 100, 150, 200, 250, 300 ms"
        )
    return int(numeric)


def fixation_duration_column(base_column: str, min_duration_ms: Any) -> str:
    """Resolve a persisted event column for a supported duration.

    The canonical 200 ms variant deliberately stays unsuffixed for backwards
    compatibility.  Other variants use a deterministic ``__{duration}ms``
    suffix, for example ``fixation_id__150ms``.
    """

    if base_column not in FIXATION_DURATION_VARIANT_COLUMNS:
        raise ValueError(f"unsupported fixation duration column: {base_column!r}")
    duration_ms = validate_fixation_min_duration_ms(min_duration_ms)
    if duration_ms == CANONICAL_FIXATION_MIN_DURATION_MS:
        return base_column
    return f"{base_column}__{duration_ms}ms"

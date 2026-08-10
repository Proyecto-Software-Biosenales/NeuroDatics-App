"""Read the persisted screen-to-stimulus transform contract in analytics.

The ingestion pipeline owns coordinate conversion.  Analytics deliberately does
not recompute geometry from mutable SQL rows: it consumes the additive Parquet
columns and reports exactly which persisted contract produced the coordinates.
Old Parquets have none of these columns and therefore take the explicit warned
legacy path; they are never guessed to be fullscreen.
"""

from __future__ import annotations

import hashlib
import json
from typing import Optional

import numpy as np
import pandas as pd


APPLIED_STATUS = "applied"
LEGACY_MISSING_STATUS = "legacy_passthrough_missing"
MIXED_STATUS = "mixed"
CONTRACT_VERSION = "screen-stimulus-v1"

STATUS_COLUMN = "stimulus_transform_status"
VERSION_COLUMN = "stimulus_transform_version"
FINGERPRINT_COLUMN = "stimulus_transform_fingerprint"
VALID_GAZE_COLUMN = "is_valid_gaze"
INVALID_REASON_COLUMN = "gaze_invalid_reason"
LOCAL_X_COLUMN = "gaze_x_stimulus_norm"
LOCAL_Y_COLUMN = "gaze_y_stimulus_norm"
DISPLAY_WIDTH_COLUMN = "stimulus_display_width_px"
DISPLAY_HEIGHT_COLUMN = "stimulus_display_height_px"

OUTSIDE_REASONS = ("outside_screen", "outside_viewport", "outside_stimulus")
LEGACY_WARNING_CODE = "stimulus_placement_missing"
LEGACY_WARNING = "stimulus_placement_missing; legacy screen-normalized coordinates used"
MIXED_WARNING_CODE = "mixed_stimulus_coordinate_transforms"
MIXED_WARNING = (
    "mixed stimulus coordinate transforms are present in this response scope"
)
INCOMPLETE_WARNING_CODE = "stimulus_transform_metadata_incomplete"


def _normalised_text(series: pd.Series) -> pd.Series:
    values = series.astype("string").fillna("").str.strip()
    return values.mask(values.str.lower().isin({"nan", "none", "null"}), "")


def _first_text(df: pd.DataFrame, column: str) -> Optional[str]:
    if column not in df.columns:
        return None
    values = _normalised_text(df[column])
    values = values[values != ""]
    return str(values.iloc[0]) if not values.empty else None


def _status_series(df: pd.DataFrame) -> pd.Series:
    """Return one normalized status per row, defaulting absence to legacy."""

    if STATUS_COLUMN not in df.columns:
        return pd.Series(LEGACY_MISSING_STATUS, index=df.index, dtype="string")
    values = _normalised_text(df[STATUS_COLUMN]).str.lower()
    return values.mask(values == "", LEGACY_MISSING_STATUS)


def applied_transform_mask(df: pd.DataFrame) -> pd.Series:
    return _status_series(df).eq(APPLIED_STATUS)


def _boolean_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_bool_dtype(series.dtype):
        return series.fillna(False).astype(bool)
    numeric = pd.to_numeric(series, errors="coerce")
    text = _normalised_text(series).str.lower()
    return numeric.eq(1) | text.isin({"true", "t", "yes", "y"})


def valid_stimulus_gaze_mask(df: pd.DataFrame) -> pd.Series:
    """Rows eligible for stimulus analytics, without clipping coordinates.

    Legacy rows retain their historical eligibility because old artifacts do
    not carry a stimulus mask.  Applied rows must carry a valid local pair in
    ``[0,1]`` and, when present, must also pass the persisted combined mask.
    """

    applied = applied_transform_mask(df)
    eligible = pd.Series(True, index=df.index, dtype=bool)
    if not applied.any():
        return eligible

    if LOCAL_X_COLUMN not in df.columns or LOCAL_Y_COLUMN not in df.columns:
        eligible.loc[applied] = False
        return eligible

    x = pd.to_numeric(df[LOCAL_X_COLUMN], errors="coerce")
    y = pd.to_numeric(df[LOCAL_Y_COLUMN], errors="coerce")
    local_valid = (
        np.isfinite(x)
        & np.isfinite(y)
        & x.between(0.0, 1.0, inclusive="both")
        & y.between(0.0, 1.0, inclusive="both")
    )
    if VALID_GAZE_COLUMN in df.columns:
        local_valid &= _boolean_series(df[VALID_GAZE_COLUMN])
    eligible.loc[applied] = local_valid.loc[applied]
    return eligible


def hard_stimulus_boundary_mask(df: pd.DataFrame) -> np.ndarray:
    """Identify off-screen/viewport/stimulus rows that events may not bridge."""

    hard = pd.Series(False, index=df.index, dtype=bool)
    if INVALID_REASON_COLUMN in df.columns:
        reasons = _normalised_text(df[INVALID_REASON_COLUMN]).str.lower()
        hard |= reasons.isin(OUTSIDE_REASONS)

    # Defensive parity with the equation: even a malformed artifact that lost
    # its reason code cannot bridge a finite coordinate outside [0,1].
    if LOCAL_X_COLUMN in df.columns and LOCAL_Y_COLUMN in df.columns:
        applied = applied_transform_mask(df)
        x = pd.to_numeric(df[LOCAL_X_COLUMN], errors="coerce")
        y = pd.to_numeric(df[LOCAL_Y_COLUMN], errors="coerce")
        finite = np.isfinite(x) & np.isfinite(y)
        outside = finite & ~(
            x.between(0.0, 1.0, inclusive="both")
            & y.between(0.0, 1.0, inclusive="both")
        )
        hard |= applied & outside
    return hard.to_numpy(dtype=bool)


def _rejection_counts(df: pd.DataFrame) -> tuple[int, dict[str, int]]:
    if INVALID_REASON_COLUMN not in df.columns:
        counts = {reason: 0 for reason in OUTSIDE_REASONS}
        return 0, counts
    reasons = _normalised_text(df[INVALID_REASON_COLUMN]).str.lower()
    counts = {reason: int(reasons.eq(reason).sum()) for reason in OUTSIDE_REASONS}
    return int(sum(counts.values())), counts


def _legacy_provenance() -> dict:
    return {
        "status": LEGACY_MISSING_STATUS,
        "applied": False,
        "contract_version": None,
        "source_space": "legacy_screen",
        "output_space": "legacy_screen_normalized",
        "contract_fingerprint": None,
        "rejected_outside_count": None,
        "rejected_outside_by_reason": None,
        "warning_codes": [LEGACY_WARNING_CODE],
    }


def _applied_provenance(df: pd.DataFrame) -> dict:
    warning_codes: list[str] = []
    version = _first_text(df, VERSION_COLUMN)
    fingerprint = _first_text(df, FINGERPRINT_COLUMN)
    if version is None or fingerprint is None:
        warning_codes.append(INCOMPLETE_WARNING_CODE)
    rejected_count, rejected_by_reason = _rejection_counts(df)
    return {
        "status": APPLIED_STATUS,
        "applied": True,
        "contract_version": version or CONTRACT_VERSION,
        "source_space": "screen_px",
        "output_space": "stimulus_normalized",
        "contract_fingerprint": fingerprint,
        "rejected_outside_count": rejected_count,
        "rejected_outside_by_reason": rejected_by_reason,
        "warning_codes": warning_codes,
    }


def _concrete_provenance(df: pd.DataFrame) -> dict:
    statuses = _status_series(df)
    unique_statuses = sorted(set(statuses.astype(str)))
    applied_rows = df.loc[statuses.eq(APPLIED_STATUS)]
    fingerprints: list[str] = []
    if not applied_rows.empty and FINGERPRINT_COLUMN in applied_rows.columns:
        values = _normalised_text(applied_rows[FINGERPRINT_COLUMN])
        fingerprints = sorted(set(values[values != ""].astype(str)))

    if unique_statuses == [LEGACY_MISSING_STATUS]:
        return _legacy_provenance()
    if unique_statuses == [APPLIED_STATUS] and len(fingerprints) <= 1:
        return _applied_provenance(df)

    # Conflicting statuses/fingerprints inside one scenario indicate a mixed
    # artifact.  Do not collapse it to whichever row happened to come first.
    return {
        "status": MIXED_STATUS,
        "applied": None,
        "contract_version": None,
        "source_space": "mixed",
        "output_space": "mixed",
        "contract_fingerprint": None,
        "rejected_outside_count": None,
        "rejected_outside_by_reason": None,
        "warning_codes": [MIXED_WARNING_CODE],
    }


def coordinate_transform_provenance(df: pd.DataFrame) -> dict:
    """Build the approved concrete or mixed provenance object for ``df``."""

    if df.empty:
        # An empty scoped frame cannot prove that placement was applied.  Old
        # behavior is retained and warned rather than guessed as fullscreen.
        return _legacy_provenance()

    if "scenario" not in df.columns:
        return _concrete_provenance(df)

    scenario_values = _normalised_text(df["scenario"])
    scenario_names = list(dict.fromkeys(value for value in scenario_values if value))
    if not scenario_names:
        return _concrete_provenance(df)

    scenario_entries: list[dict] = []
    signatures: set[tuple[object, object]] = set()
    for scenario in scenario_names:
        scoped = df.loc[scenario_values.eq(scenario)]
        provenance = _concrete_provenance(scoped)
        signatures.add((provenance["status"], provenance["contract_fingerprint"]))
        scenario_entries.append({"scenario": scenario, **provenance})

    if len(signatures) == 1:
        concrete = _concrete_provenance(df)
        # Multiple applied scenarios with the same contract can safely expose
        # one concrete transform and aggregate their disjoint rejection counts.
        if concrete["status"] != MIXED_STATUS:
            return concrete

    all_measurable = all(
        entry["status"] == APPLIED_STATUS for entry in scenario_entries
    )
    if all_measurable:
        rejected_by_reason = {
            reason: sum(
                int((entry.get("rejected_outside_by_reason") or {}).get(reason, 0))
                for entry in scenario_entries
            )
            for reason in OUTSIDE_REASONS
        }
        rejected_count: Optional[int] = int(sum(rejected_by_reason.values()))
    else:
        rejected_by_reason = None
        rejected_count = None

    return {
        "status": MIXED_STATUS,
        "applied": None,
        "contract_version": None,
        "source_space": "mixed",
        "output_space": "mixed",
        "contract_fingerprint": None,
        "rejected_outside_count": rejected_count,
        "rejected_outside_by_reason": rejected_by_reason,
        "warning_codes": [MIXED_WARNING_CODE],
        "scenario_transforms": scenario_entries,
    }


def transform_warning_messages(provenance: dict) -> list[str]:
    status = provenance.get("status")
    messages: list[str] = []
    if status == LEGACY_MISSING_STATUS:
        messages.append(LEGACY_WARNING)
    elif status == MIXED_STATUS:
        messages.append(MIXED_WARNING)
    if INCOMPLETE_WARNING_CODE in (provenance.get("warning_codes") or []):
        messages.append("stimulus transform metadata is incomplete")
    return messages


def attach_transform_provenance(payload: dict, df: pd.DataFrame) -> dict:
    provenance = coordinate_transform_provenance(df)
    warnings = list(payload.get("warnings") or [])
    warnings.extend(transform_warning_messages(provenance))
    payload["warnings"] = list(
        dict.fromkeys(str(item) for item in warnings if str(item))
    )
    payload["coordinate_transform"] = provenance
    return payload


def transform_cache_token(df: pd.DataFrame) -> str:
    """Short deterministic key component for the persisted transform snapshot."""

    provenance = coordinate_transform_provenance(df)

    def compact(item: dict) -> dict:
        return {
            "scenario": item.get("scenario"),
            "status": item.get("status"),
            "fingerprint": item.get("contract_fingerprint"),
        }

    material = {
        "status": provenance.get("status"),
        "fingerprint": provenance.get("contract_fingerprint"),
        "scenarios": [
            compact(item) for item in provenance.get("scenario_transforms", [])
        ],
    }
    encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()[:20]


def displayed_stimulus_size(df: pd.DataFrame) -> Optional[tuple[float, float]]:
    """Return one stable displayed acquisition size for a concrete scope."""

    if DISPLAY_WIDTH_COLUMN in df.columns and DISPLAY_HEIGHT_COLUMN in df.columns:
        width = pd.to_numeric(df[DISPLAY_WIDTH_COLUMN], errors="coerce")
        height = pd.to_numeric(df[DISPLAY_HEIGHT_COLUMN], errors="coerce")
        valid = np.isfinite(width) & np.isfinite(height) & (width > 0) & (height > 0)
        pairs = list(
            dict.fromkeys(zip(width[valid].astype(float), height[valid].astype(float)))
        )
        if len(pairs) == 1:
            return pairs[0]

    attrs = dict(getattr(df, "attrs", {}) or {})
    candidates = [attrs.get("stimulus_placement"), attrs.get("placement")]
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        placement = candidate.get("placement", candidate)
        try:
            width = float(placement["stimulus_width_px"])
            height = float(placement["stimulus_height_px"])
        except (KeyError, TypeError, ValueError):
            continue
        if np.isfinite(width) and np.isfinite(height) and width > 0 and height > 0:
            return width, height
    return None

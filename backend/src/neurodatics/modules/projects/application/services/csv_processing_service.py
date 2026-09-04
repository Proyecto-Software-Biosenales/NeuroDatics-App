import csv
import json
import logging
import math
import pathlib
import re
import statistics
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

import numpy as np
import pandas as pd

from neurodatics.shared.scenario_identity import resolve_scenario

from .fixation_detection_service import (
    FixationDetectionMetadata,
    FixationDetectionService,
    ScreenGeometry,
)

logger = logging.getLogger(__name__)


def _canonical_text(value: str) -> str:
    """Normalize labels without losing meaningful punctuation or accents."""

    text = unicodedata.normalize("NFKC", value or "").replace("\u00a0", " ")
    text = text.strip().strip('"').strip("'")
    text = re.sub(r"\s*/\s*", " / ", text)
    text = re.sub(r"\s+", " ", text)
    return text.casefold()


_ALIASES: Dict[str, Sequence[str]] = {
    "time": ("time", "timestamp", "tiempo", "time (s)", "tiempo (s)"),
    "gsr": ("gsr / gsr", "gsr", "galvanic skin response"),
    "le": (
        "electroencefalografia (eeg) / le",
        "electroencefalografía (eeg) / le",
        "eeg / le",
    ),
    "f4": (
        "electroencefalografia (eeg) / f4",
        "electroencefalografía (eeg) / f4",
        "eeg / f4",
    ),
    "c4": (
        "electroencefalografia (eeg) / c4",
        "electroencefalografía (eeg) / c4",
        "eeg / c4",
    ),
    "p4": (
        "electroencefalografia (eeg) / p4",
        "electroencefalografía (eeg) / p4",
        "eeg / p4",
    ),
    "p3": (
        "electroencefalografia (eeg) / p3",
        "electroencefalografía (eeg) / p3",
        "eeg / p3",
    ),
    "c3": (
        "electroencefalografia (eeg) / c3",
        "electroencefalografía (eeg) / c3",
        "eeg / c3",
    ),
    "f3": (
        "electroencefalografia (eeg) / f3",
        "electroencefalografía (eeg) / f3",
        "eeg / f3",
    ),
    "trg": (
        "electroencefalografia (eeg) / trg",
        "electroencefalografía (eeg) / trg",
        "eeg / trg",
    ),
    "distance": ("bandwidth / distance", "eye tracker / distance", "distance"),
    "lx_pupil": (
        "bandwidth / lefteyepupildiameter",
        "left eye pupil diameter",
        "left pupil diameter",
    ),
    "rx_pupil": (
        "bandwidth / righteyepupildiameter",
        "right eye pupil diameter",
        "right pupil diameter",
    ),
    "gx": ("bandwidth / x", "gaze / x", "gaze x", "eye tracker / x"),
    "gy": ("bandwidth / y", "gaze / y", "gaze y", "eye tracker / y"),
    "fix_x": (
        "fixations / x",
        "fixation / x",
        "fixation x",
        "vendor fixation x",
    ),
    "fix_y": (
        "fixations / y",
        "fixation / y",
        "fixation y",
        "vendor fixation y",
    ),
    "scenario": ("scenario 1", "scenario / scenario 1", "scenario"),
    "arousal": ("arousal",),
}


# Kept as a module-level mapping for callers that imported the old constant.
STD_MAP = {
    _canonical_text(alias): canonical
    for canonical, aliases in _ALIASES.items()
    for alias in aliases
}

_EEG_COLUMNS = {"le", "f4", "c4", "p4", "p3", "c3", "f3", "trg"}
_EYE_COLUMNS = {
    "distance",
    "lx_pupil",
    "rx_pupil",
    "gx",
    "gy",
    "fix_x",
    "fix_y",
    "vendor_fix_x",
    "vendor_fix_y",
}
_KNOWN_NUMERIC_COLUMNS = {
    "time",
    "gsr",
    *_EEG_COLUMNS,
    *_EYE_COLUMNS,
}
# Arousal exports may contain categorical labels (Low/Med/High) or numeric values.
# Leave its type inference to _convert_numeric_columns instead of validating it
# as a sensor channel that must always be numeric.
_STANDARD_COLUMNS = _KNOWN_NUMERIC_COLUMNS | {"scenario", "arousal"}
_NULL_TOKENS = {"", "na", "n/a", "nan", "null", "none"}


@dataclass
class ParticipantInfo:
    participant_code: str
    user_index: int


@dataclass
class ChannelMetadata:
    raw_name: str = ""
    canonical_name: str = ""
    start_time: Optional[str] = None
    declared_frequency_hz: Optional[float] = None
    unit: Optional[str] = None


@dataclass
class BlockMetadata:
    user_index: int = 0
    participant_code: str = ""
    recording_label: Optional[str] = None
    source_start_line: int = 0
    header_line: int = 0
    source_end_line: int = 0
    delimiter: str = ";"
    original_columns: List[str] = field(default_factory=list)
    normalized_columns: List[str] = field(default_factory=list)
    extra_columns: List[str] = field(default_factory=list)
    detected_sensors: List[str] = field(default_factory=list)
    declared_file_rate_hz: Optional[float] = None
    observed_grid_rate_hz: Optional[float] = None
    declared_gaze_rate_hz: Optional[float] = None
    effective_detection_rate_hz: Optional[float] = None
    resampled_for_detection: bool = False
    sample_count: int = 0
    time_start: Optional[float] = None
    time_end: Optional[float] = None
    fixation_available: bool = False
    fixation_method: Optional[str] = None
    fixation_detector_version: Optional[str] = None
    fixation_source: Optional[str] = None
    stimulus_transform_status: Optional[str] = None
    stimulus_transform_version: Optional[str] = None
    stimulus_transform_fingerprint: Optional[str] = None
    fixation_coordinate_space: Optional[str] = None
    stimulus_placements_by_scenario: Dict[str, Dict[str, Any]] = field(
        default_factory=dict
    )
    physical_screen_geometry: Optional[Dict[str, float]] = None
    channels: List[ChannelMetadata] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class ProcessingResult:
    detected_sensors: List[str]
    participants: List[ParticipantInfo]
    user_parquet_paths: List[Tuple[int, str]] = field(default_factory=list)
    scenario_parquet_paths: List[Tuple[int, str, str]] = field(default_factory=list)
    encoding: Optional[str] = None
    block_metadata: List[BlockMetadata] = field(default_factory=list)
    stimulus_placements_by_scenario: Dict[str, Dict[str, Any]] = field(
        default_factory=dict
    )
    physical_screen_geometry: Optional[Dict[str, float]] = None
    warnings: List[str] = field(default_factory=list)


@dataclass
class _BlockSpec:
    source_start: int
    header_index: int
    block_end: int
    metadata_lines: List[str]


@dataclass
class _ParsedFrame:
    dataframe: pd.DataFrame
    original_columns: List[str]
    normalized_columns: List[str]
    extra_columns: List[str]
    warnings: List[str]
    vendor_fixation_axes: Set[str]


class CsvProcessingError(Exception):
    pass


class CsvProcessingService:
    _PARTICIPANT_RE = re.compile(
        r"grabaci[oó]n\s*:\s*([^|;\r\n]+)",
        flags=re.IGNORECASE,
    )
    _SCENARIO_CLEAN_RE = re.compile(r"[\\/\s]+")

    @staticmethod
    def _norm(value: str) -> str:
        return _canonical_text(value)

    @classmethod
    def _clean_cell(cls, value: str) -> Optional[str]:
        text = unicodedata.normalize("NFKC", value or "").replace("\u00a0", " ")
        text = text.strip().strip('"').strip("'").strip()
        if cls._norm(text) in _NULL_TOKENS:
            return None
        return text

    @staticmethod
    def _choose_delimiter(header_line: str) -> str:
        candidates = [";", "\t", ","]
        return max(candidates, key=lambda delimiter: header_line.count(delimiter))

    @classmethod
    def _parse_localized_float(cls, value: str) -> float:
        text = unicodedata.normalize("NFKC", str(value)).replace("\u00a0", " ")
        text = text.strip().strip('"').strip("'").replace(" ", "")
        if not text:
            raise ValueError("empty numeric value")

        if "," in text and "." in text:
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            text = text.replace(",", ".")

        parsed = float(text)
        if not math.isfinite(parsed):
            raise ValueError("numeric value is not finite")
        return parsed

    @classmethod
    def _to_float(cls, cell: str) -> Optional[float]:
        cleaned = cls._clean_cell(cell)
        if cleaned is None:
            return None
        try:
            return cls._parse_localized_float(cleaned)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _canonical_column(
        cls, column: str, rename_vendor_fixations: bool = True
    ) -> str:
        key = cls._norm(column)
        mapped = STD_MAP.get(key, key)
        if rename_vendor_fixations and mapped in {"fix_x", "fix_y"}:
            return f"vendor_{mapped}"
        return mapped

    @classmethod
    def _header_cells(cls, line: str) -> Tuple[str, List[str]]:
        delimiter = cls._choose_delimiter(line)
        cells = next(csv.reader([line], delimiter=delimiter))
        return delimiter, cells

    @classmethod
    def _is_header_line(cls, line: str) -> bool:
        if not line.strip():
            return False
        _, cells = cls._header_cells(line)
        return any(cls._canonical_column(cell) == "time" for cell in cells)

    @classmethod
    def _is_recording_marker(cls, line: str) -> bool:
        normalized = cls._norm(line)
        return normalized.startswith("grabación") or normalized.startswith("grabacion")

    @classmethod
    def _find_block_specs(cls, lines: List[str]) -> List[_BlockSpec]:
        header_indices = [
            idx for idx, line in enumerate(lines) if cls._is_header_line(line)
        ]
        if not header_indices:
            return []

        recording_indices = [
            idx for idx, line in enumerate(lines) if cls._is_recording_marker(line)
        ]
        if not recording_indices:
            return [
                _BlockSpec(
                    source_start=0 if pos == 0 else header_indices[pos],
                    header_index=header_idx,
                    block_end=(
                        header_indices[pos + 1]
                        if pos + 1 < len(header_indices)
                        else len(lines)
                    ),
                    metadata_lines=lines[:header_idx] if pos == 0 else [],
                )
                for pos, header_idx in enumerate(header_indices)
            ]

        specs: List[_BlockSpec] = []
        for marker_pos, marker_idx in enumerate(recording_indices):
            block_end = (
                recording_indices[marker_pos + 1]
                if marker_pos + 1 < len(recording_indices)
                else len(lines)
            )
            headers = [idx for idx in header_indices if marker_idx < idx < block_end]
            if not headers:
                raise CsvProcessingError(
                    f"Bloque de grabación en línea {marker_idx + 1} no contiene encabezado con Time"
                )
            if len(headers) > 1:
                raise CsvProcessingError(
                    f"Bloque de grabación en línea {marker_idx + 1} contiene varios encabezados Time"
                )
            header_idx = headers[0]
            specs.append(
                _BlockSpec(
                    source_start=marker_idx,
                    header_index=header_idx,
                    block_end=block_end,
                    metadata_lines=lines[marker_idx:header_idx],
                )
            )

        unassigned = [
            header_idx
            for header_idx in header_indices
            if not any(spec.header_index == header_idx for spec in specs)
        ]
        if unassigned:
            raise CsvProcessingError(
                "Se encontraron encabezados Time fuera de un bloque Grabación: "
                + ", ".join(str(idx + 1) for idx in unassigned)
            )
        return specs

    @classmethod
    def _find_user_blocks(cls, lines: List[str]) -> List[Tuple[int, int, List[str]]]:
        """Compatibility wrapper around the recording-aware block parser."""

        return [
            (spec.header_index, spec.block_end, spec.metadata_lines)
            for spec in cls._find_block_specs(lines)
        ]

    @classmethod
    def _extract_participant_code(cls, metadata_lines: List[str]) -> Optional[str]:
        for line in metadata_lines:
            normalized = unicodedata.normalize("NFKC", line).replace("\u00a0", " ")
            match = cls._PARTICIPANT_RE.search(normalized)
            if match:
                code = match.group(1).strip()
                if code:
                    return code
        return None

    @classmethod
    def _extract_recording_label(cls, metadata_lines: List[str]) -> Optional[str]:
        for line in metadata_lines:
            if cls._is_recording_marker(line) and ":" in line:
                return (
                    unicodedata.normalize("NFKC", line.split(":", 1)[1])
                    .replace("\u00a0", " ")
                    .strip()
                )
        return None

    @classmethod
    def _detect_sensors(cls, columns: Sequence[str]) -> List[str]:
        canonical = {cls._canonical_column(column) for column in columns}
        sensors: List[str] = []
        if canonical & _EEG_COLUMNS:
            sensors.append("EEG")
        if "gsr" in canonical:
            sensors.append("GSR")
        if canonical & _EYE_COLUMNS:
            sensors.append("EyeTracker")
        return sensors

    @classmethod
    def _normalize_columns(
        cls,
        columns: List[str],
        rename_vendor_fixations: bool = True,
    ) -> List[str]:
        normalized: List[str] = []
        seen: Dict[str, int] = {}
        for index, column in enumerate(columns):
            mapped = cls._canonical_column(column, rename_vendor_fixations)
            if not mapped:
                mapped = f"unnamed_{index + 1}"
            count = seen.get(mapped, 0) + 1
            seen[mapped] = count
            normalized.append(mapped if count == 1 else f"{mapped}_{count}")
        return normalized

    @classmethod
    def _metadata_value(cls, line: str) -> Tuple[str, str]:
        if ":" not in line:
            return cls._norm(line), ""
        label, value = line.split(":", 1)
        return cls._norm(label), (
            unicodedata.normalize("NFKC", value).replace("\u00a0", " ").strip()
        )

    @classmethod
    def _parse_metadata(
        cls,
        metadata_lines: List[str],
        rename_vendor_fixations: bool,
    ) -> Tuple[List[ChannelMetadata], Optional[float], List[str]]:
        channels: List[ChannelMetadata] = []
        current: Optional[ChannelMetadata] = None
        declared_file_rate_hz: Optional[float] = None
        warnings: List[str] = []

        for line in metadata_lines:
            label, value = cls._metadata_value(line)
            if label == "nombre":
                current = ChannelMetadata(
                    raw_name=value,
                    canonical_name=cls._canonical_column(
                        value, rename_vendor_fixations=rename_vendor_fixations
                    ),
                )
                channels.append(current)
            elif label == "frecuencia del archivo":
                match = re.search(r"[-+]?\d+(?:[.,]\d+)?", value)
                if not match:
                    warnings.append(f"invalid declared file frequency: {value!r}")
                else:
                    parsed_rate = cls._parse_localized_float(match.group(0))
                    if parsed_rate <= 0:
                        warnings.append(
                            f"declared file frequency must be positive: {parsed_rate}"
                        )
                        declared_file_rate_hz = None
                    else:
                        declared_file_rate_hz = parsed_rate
                current = None
            elif label == "tiempo de inicio" and current is not None:
                current.start_time = value or None
            elif label == "frecuencia" and current is not None:
                match = re.search(r"[-+]?\d+(?:[.,]\d+)?", value)
                if not match:
                    warnings.append(
                        f"invalid channel frequency for {current.raw_name!r}: {value!r}"
                    )
                else:
                    parsed_rate = cls._parse_localized_float(match.group(0))
                    if parsed_rate <= 0:
                        warnings.append(
                            f"channel frequency for {current.raw_name!r} must be positive: "
                            f"{parsed_rate}"
                        )
                    else:
                        current.declared_frequency_hz = parsed_rate
            elif label == "unidad tobii" and current is not None:
                current.unit = value or None

        if declared_file_rate_hz is None:
            warnings.append("declared file frequency is missing")
        return channels, declared_file_rate_hz, warnings

    @classmethod
    def _values_equivalent(cls, first: str, second: str) -> bool:
        first_number = cls._to_float(first)
        second_number = cls._to_float(second)
        if first_number is not None and second_number is not None:
            return math.isclose(
                first_number, second_number, rel_tol=1e-12, abs_tol=1e-12
            )
        return cls._norm(first) == cls._norm(second)

    @classmethod
    def _convert_numeric_columns(cls, df: pd.DataFrame) -> pd.DataFrame:
        converted_df = df.copy()
        for column in converted_df.columns:
            series = converted_df[column]
            if pd.api.types.is_numeric_dtype(series):
                continue
            non_null = series.notna()
            if not non_null.any():
                continue
            parsed = series.map(
                lambda value: cls._to_float(str(value)) if pd.notna(value) else None
            )
            conversion_ratio = float(parsed[non_null].notna().mean())
            if conversion_ratio == 1.0:
                converted_df[column] = pd.to_numeric(parsed, errors="coerce")
        return converted_df

    @classmethod
    def _build_dataframe_with_info(
        cls,
        lines: List[str],
        delimiter: str,
        *,
        source_header_line: int = 1,
        rename_vendor_fixations: bool = True,
    ) -> _ParsedFrame:
        if not lines:
            raise CsvProcessingError("Bloque CSV sin encabezado")
        original_columns = next(csv.reader([lines[0]], delimiter=delimiter))
        if not original_columns:
            raise CsvProcessingError(f"Encabezado vacío en línea {source_header_line}")

        parsed_rows: List[List[Optional[str]]] = []
        row_lines: List[int] = []
        for offset, line in enumerate(lines[1:], start=1):
            source_line = source_header_line + offset
            if not line.strip():
                continue
            row = next(csv.reader([line], delimiter=delimiter))
            if len(row) != len(original_columns):
                raise CsvProcessingError(
                    f"Fila malformada en línea {source_line}: se esperaban "
                    f"{len(original_columns)} campos y llegaron {len(row)}"
                )
            parsed_rows.append([cls._clean_cell(value) for value in row])
            row_lines.append(source_line)

        if not parsed_rows:
            raise CsvProcessingError(
                f"Bloque sin filas de datos en línea {source_header_line}"
            )

        active_indices = list(range(len(original_columns)))
        while active_indices:
            index = active_indices[-1]
            if cls._norm(original_columns[index]):
                break
            if any(row[index] is not None for row in parsed_rows):
                break
            active_indices.pop()

        groups: Dict[str, List[int]] = {}
        ordered_names: List[str] = []
        vendor_fixation_axes: Set[str] = set()
        for index in active_indices:
            base_name = cls._canonical_column(
                original_columns[index],
                rename_vendor_fixations=rename_vendor_fixations,
            )
            raw_mapped = cls._canonical_column(original_columns[index], False)
            if raw_mapped in {"fix_x", "fix_y"}:
                vendor_fixation_axes.add(raw_mapped)
            if not base_name:
                base_name = f"unnamed_{index + 1}"
            if base_name not in groups:
                groups[base_name] = []
                ordered_names.append(base_name)
            groups[base_name].append(index)

        warnings: List[str] = []
        coalesced: Dict[str, List[Optional[str]]] = {}
        for name in ordered_names:
            indices = groups[name]
            values: List[Optional[str]] = []
            if len(indices) > 1:
                warnings.append(
                    f"coalesced duplicate column {name!r} from positions "
                    + ", ".join(str(index + 1) for index in indices)
                )
            for row_index, row in enumerate(parsed_rows):
                candidates = [row[index] for index in indices if row[index] is not None]
                if len(candidates) > 1 and any(
                    not cls._values_equivalent(candidates[0], value)
                    for value in candidates[1:]
                ):
                    raise CsvProcessingError(
                        f"Columnas duplicadas en conflicto para {name!r}, "
                        f"línea {row_lines[row_index]}"
                    )
                values.append(candidates[0] if candidates else None)
            coalesced[name] = values

        dataframe = pd.DataFrame(coalesced)
        if "time" not in dataframe.columns:
            raise CsvProcessingError(
                f"Encabezado en línea {source_header_line} no contiene columna Time"
            )

        for column in dataframe.columns:
            if column not in _KNOWN_NUMERIC_COLUMNS:
                continue
            converted: List[Optional[float]] = []
            for row_index, value in enumerate(dataframe[column].tolist()):
                if value is None or pd.isna(value):
                    if column == "time":
                        raise CsvProcessingError(
                            f"Timestamp vacío en línea {row_lines[row_index]}"
                        )
                    converted.append(None)
                    continue
                try:
                    converted.append(cls._parse_localized_float(str(value)))
                except (TypeError, ValueError) as exc:
                    raise CsvProcessingError(
                        f"Valor numérico inválido en columna {column!r}, "
                        f"línea {row_lines[row_index]}: {value!r}"
                    ) from exc
            dataframe[column] = pd.to_numeric(converted, errors="coerce")

        dataframe = cls._convert_numeric_columns(dataframe)
        times = pd.to_numeric(dataframe["time"], errors="coerce")
        if times.isna().any():
            bad_position = int(np.flatnonzero(times.isna().to_numpy())[0])
            raise CsvProcessingError(
                f"Timestamp inválido en línea {row_lines[bad_position]}"
            )
        if len(times) > 1:
            deltas = np.diff(times.to_numpy(dtype=float))
            invalid = np.flatnonzero(deltas <= 0)
            if invalid.size:
                row_position = int(invalid[0]) + 1
                raise CsvProcessingError(
                    f"Timestamps no crecientes en línea {row_lines[row_position]}"
                )

        normalized_columns = list(dataframe.columns)
        extra_columns = [
            column for column in normalized_columns if column not in _STANDARD_COLUMNS
        ]
        return _ParsedFrame(
            dataframe=dataframe,
            original_columns=original_columns,
            normalized_columns=normalized_columns,
            extra_columns=extra_columns,
            warnings=warnings,
            vendor_fixation_axes=vendor_fixation_axes,
        )

    @classmethod
    def _build_dataframe(cls, lines: List[str], delimiter: str) -> pd.DataFrame:
        """Compatibility helper retained for existing internal callers."""

        return cls._build_dataframe_with_info(lines, delimiter).dataframe

    @classmethod
    def _clean_dataframe(cls, df: pd.DataFrame) -> pd.DataFrame:
        cleaned = df.copy()

        # A gaze blackout must never erase independently sampled EEG/GSR/extra sensors.
        if {"gx", "gy"}.issubset(cleaned.columns):
            gx = pd.to_numeric(cleaned["gx"], errors="coerce")
            gy = pd.to_numeric(cleaned["gy"], errors="coerce")
            blackout_mask = (gx == 0) & (gy == 0)
            blackout_targets = [
                column for column in ("fix_x", "fix_y") if column in cleaned.columns
            ]
            if blackout_targets:
                cleaned.loc[blackout_mask, blackout_targets] = pd.NA

        # vendor_fix_* is source evidence and is deliberately never rewritten.
        for fix_x_name, fix_y_name in (("fix_x", "fix_y"),):
            if not {fix_x_name, fix_y_name}.issubset(cleaned.columns):
                continue
            fix_x = pd.to_numeric(cleaned[fix_x_name], errors="coerce")
            fix_y = pd.to_numeric(cleaned[fix_y_name], errors="coerce")
            original_sentinel_mask = (fix_x == -100) & (fix_y == -100)
            negative_mask = (fix_x < 0) | (fix_y < 0)
            cleaned.loc[negative_mask, [fix_x_name, fix_y_name]] = -100

            sentinel_positions = np.flatnonzero(original_sentinel_mask.to_numpy())
            if not sentinel_positions.size:
                continue
            candidate_positions = np.unique(
                np.concatenate([sentinel_positions - 1, sentinel_positions + 1])
            )
            candidate_positions = candidate_positions[
                (candidate_positions >= 0) & (candidate_positions < len(cleaned))
            ]
            if not candidate_positions.size:
                continue
            row_index = cleaned.index.to_numpy()
            target_rows = row_index[candidate_positions]
            for column in (fix_x_name, fix_y_name):
                current_values = pd.to_numeric(
                    cleaned.loc[target_rows, column], errors="coerce"
                )
                updatable_mask = current_values.notna() & (current_values != -100)
                if updatable_mask.any():
                    cleaned.loc[target_rows[updatable_mask.to_numpy()], column] = -100

        return cleaned

    @classmethod
    def _derive_observed_rate(
        cls,
        dataframe: pd.DataFrame,
        declared_file_rate_hz: Optional[float],
    ) -> Tuple[Optional[float], List[str]]:
        warnings: List[str] = []
        times = pd.to_numeric(dataframe["time"], errors="coerce").to_numpy(dtype=float)
        if len(times) < 2:
            return None, ["observed grid rate unavailable: fewer than two rows"]
        deltas = np.diff(times)
        median_delta = float(statistics.median(deltas.tolist()))
        observed = 1.0 / median_delta
        relative_jitter = float(np.max(np.abs(deltas - median_delta)) / median_delta)
        if relative_jitter > 0.02:
            warnings.append(
                f"irregular timestamp grid: maximum interval deviation {relative_jitter:.2%}"
            )
        if declared_file_rate_hz is not None:
            relative_difference = abs(observed - declared_file_rate_hz) / max(
                observed, declared_file_rate_hz
            )
            if relative_difference > 0.01:
                warnings.append(
                    "declared file rate differs from observed grid rate by "
                    f"{relative_difference:.2%}"
                )
        return observed, warnings

    @classmethod
    def _derive_gaze_rate(
        cls,
        channels: Sequence[ChannelMetadata],
    ) -> Tuple[Optional[float], List[str]]:
        warnings: List[str] = []
        rates: Dict[str, float] = {}
        for channel in channels:
            if (
                channel.canonical_name in {"gx", "gy"}
                and channel.declared_frequency_hz is not None
            ):
                rates[channel.canonical_name] = channel.declared_frequency_hz
        if not rates:
            return None, ["declared gaze rate is missing"]
        if len(rates) == 1:
            warnings.append(
                "partial gaze frequency metadata: only one gaze axis has a rate"
            )
            return next(iter(rates.values())), warnings
        x_rate, y_rate = rates["gx"], rates["gy"]
        relative_difference = abs(x_rate - y_rate) / max(x_rate, y_rate)
        if relative_difference > 0.02:
            warnings.append(
                "gaze X/Y declared rates differ by more than 2%; "
                "using the lower rate"
            )
            return min(x_rate, y_rate), warnings
        return statistics.fmean([x_rate, y_rate]), warnings

    @classmethod
    def _channel_unit(
        cls,
        channels: Sequence[ChannelMetadata],
        canonical_name: str,
    ) -> Optional[str]:
        for channel in channels:
            if channel.canonical_name == canonical_name and channel.unit:
                return cls._norm(channel.unit)
        return None

    @classmethod
    def _gaze_units(cls, channels: Sequence[ChannelMetadata]) -> str:
        units = {
            unit for name in ("gx", "gy") if (unit := cls._channel_unit(channels, name))
        }
        aliases = {
            "percent": {"%", "percent", "percentage", "porcentaje"},
            "pixels": {"px", "pixel", "pixels", "píxel", "píxeles"},
            "normalized": {"normalized", "normalised", "normalizado", "0-1"},
        }
        resolved = set()
        for unit in units:
            canonical = next((key for key, values in aliases.items() if unit in values), None)
            if canonical is None:
                raise CsvProcessingError(f"Unidad de coordenadas no soportada: {unit}")
            resolved.add(canonical)
        if len(resolved) > 1:
            raise CsvProcessingError("Unidades incompatibles entre las coordenadas X e Y")
        return next(iter(resolved), "auto")

    @classmethod
    def _distance_unit(cls, channels: Sequence[ChannelMetadata]) -> str:
        unit = cls._channel_unit(channels, "distance")
        if unit in {"mm", "cm", "m"}:
            return str(unit)
        return "auto"

    @classmethod
    def _normalize_declared_units(
        cls, dataframe: pd.DataFrame, channels: Sequence[ChannelMetadata]
    ) -> Tuple[pd.DataFrame, Dict[str, Any], str]:
        """New storage uses seconds/mm; undeclared exports retain legacy assumptions.

        Source channel metadata remains unchanged for provenance. Existing parquet
        files are never rewritten or reinterpreted by this ingestion boundary.
        """
        source = {name: cls._channel_unit(channels, name) for name in ("time", "distance")}
        time_factors = {
            "s": 1.0, "sec": 1.0, "second": 1.0, "seconds": 1.0,
            "segundo": 1.0, "segundos": 1.0,
            "ms": 1e-3, "millisecond": 1e-3, "milliseconds": 1e-3,
            "milisegundo": 1e-3, "milisegundos": 1e-3,
            "us": 1e-6, "µs": 1e-6, "μs": 1e-6,
            "microsecond": 1e-6, "microseconds": 1e-6,
            "microsegundo": 1e-6, "microsegundos": 1e-6,
        }
        distance_factors = {"mm": 1.0, "cm": 10.0, "m": 1000.0}
        normalized = dataframe.copy()
        for name, factors in (("time", time_factors), ("distance", distance_factors)):
            if name not in normalized.columns:
                continue
            unit = source[name]
            if unit is not None and unit not in factors:
                raise CsvProcessingError(f"Unidad de {name} no soportada: {unit}")
            factor = factors.get(unit, 1.0)
            if factor != 1.0:
                converted = pd.to_numeric(normalized[name], errors="coerce") * factor
                if np.isinf(converted.to_numpy(dtype=float)).any():
                    raise CsvProcessingError(f"Normalizacion de unidades fuera de rango: {name}")
                normalized[name] = converted
        if (np.diff(normalized["time"].to_numpy(dtype=float)) <= 0).any():
            raise CsvProcessingError("Normalizacion de unidades produjo tiempos no crecientes")
        contract = {
            "version": 1,
            "source": source,
            "stored": {name: unit for name, unit in (("time", "seconds"), ("distance", "mm")) if name in normalized},
            "undeclared_policy": "legacy_seconds_mm",
        }
        return normalized, contract, "mm" if source["distance"] else "auto"

    @staticmethod
    def _screen_geometry(
        value: Optional[Any],
    ) -> Tuple[Optional[ScreenGeometry], List[str]]:
        if value is None:
            return None, []
        if isinstance(value, ScreenGeometry):
            return value, []

        names = (
            "width_px",
            "height_px",
            "width_mm",
            "height_mm",
            "viewing_distance_mm",
        )
        try:
            source = value if isinstance(value, dict) else vars(value)
            if not all(name in source and source[name] is not None for name in names):
                return None, [
                    "incomplete screen geometry ignored; normalized fixation detection used"
                ]
            geometry = ScreenGeometry(**{name: float(source[name]) for name in names})
            if not all(
                math.isfinite(getattr(geometry, name)) and getattr(geometry, name) > 0
                for name in names
            ):
                raise ValueError("geometry values must be finite and positive")
            return geometry, []
        except (TypeError, ValueError, AttributeError):
            return None, [
                "invalid screen geometry ignored; normalized fixation detection used"
            ]

    @staticmethod
    def _physical_screen_geometry_snapshot(
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

    @classmethod
    def _clean_scenario_name(cls, scenario_name: str) -> str:
        normalized = cls._SCENARIO_CLEAN_RE.sub("_", scenario_name.strip())
        normalized = re.sub(r"_+", "_", normalized).strip("_")
        return normalized or "scenario"

    @classmethod
    def _write_parquets(
        cls,
        df: pd.DataFrame,
        user_index: int,
        output_dir: str,
        stimulus_placements_by_scenario: Optional[
            Mapping[str, Mapping[str, Any]]
        ] = None,
        physical_screen_geometry: Optional[Mapping[str, float]] = None,
        recording_units: Optional[Mapping[str, Any]] = None,
    ) -> Tuple[List[Tuple[int, str]], List[Tuple[int, str, str]]]:
        base_dir = pathlib.Path(output_dir).resolve() / f"user{user_index}"
        base_dir.mkdir(parents=True, exist_ok=True)

        user_path = (base_dir / f"user{user_index}.parquet").resolve()
        placement_map = {
            str(scenario): dict(payload)
            for scenario, payload in (stimulus_placements_by_scenario or {}).items()
        }
        user_metadata: Dict[str, Any] = {
            "stimulus_placements_by_scenario": placement_map
        }
        if physical_screen_geometry is not None:
            user_metadata["physical_screen_geometry"] = dict(physical_screen_geometry)
        if recording_units is not None:
            user_metadata["recording_units"] = dict(recording_units)
        cls._write_parquet_with_metadata(df, user_path, user_metadata)

        user_parquet_paths: List[Tuple[int, str]] = [(user_index, str(user_path))]
        scenario_parquet_paths: List[Tuple[int, str, str]] = []

        if "scenario" in df.columns:
            scenarios_dir = base_dir / "escenarios"
            scenarios_dir.mkdir(parents=True, exist_ok=True)

            scenario_series = df["scenario"]
            valid_scenarios = scenario_series.dropna().astype("string").str.strip()
            unique_scenarios = [
                value for value in pd.unique(valid_scenarios) if value and value != ""
            ]

            for scenario_name in unique_scenarios:
                clean_name = cls._clean_scenario_name(str(scenario_name))
                scenario_path = (scenarios_dir / f"{clean_name}.parquet").resolve()

                scenario_df = df[
                    scenario_series.astype("string").str.strip() == scenario_name
                ]
                scenario_metadata: Dict[str, Any] = {}
                if recording_units is not None:
                    scenario_metadata["recording_units"] = dict(recording_units)
                placement_resolution = resolve_scenario(
                    scenario_name, placement_map.keys()
                )
                if placement_resolution is not None:
                    scenario_metadata["stimulus_placement"] = placement_map[
                        placement_resolution.value
                    ]
                if physical_screen_geometry is not None:
                    scenario_metadata["physical_screen_geometry"] = dict(
                        physical_screen_geometry
                    )
                cls._write_parquet_with_metadata(
                    scenario_df,
                    scenario_path,
                    scenario_metadata,
                )
                scenario_parquet_paths.append(
                    (user_index, str(scenario_name), str(scenario_path))
                )

        return user_parquet_paths, scenario_parquet_paths

    @staticmethod
    def _write_parquet_with_metadata(
        df: pd.DataFrame,
        path: pathlib.Path,
        metadata: Mapping[str, Any],
    ) -> None:
        """Write a pandas-readable Parquet with JSON contract snapshots."""

        import pyarrow as pa
        import pyarrow.parquet as pq

        table = pa.Table.from_pandas(df, preserve_index=False)
        schema_metadata = dict(table.schema.metadata or {})
        for key, value in metadata.items():
            schema_metadata[str(key).encode("utf-8")] = json.dumps(
                value,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        table = table.replace_schema_metadata(schema_metadata)
        pq.write_table(table, path, compression="snappy")

    @classmethod
    def _decode_bytes(cls, raw_bytes: bytes) -> Tuple[str, str]:
        if raw_bytes.startswith((b"\xff\xfe", b"\xfe\xff")):
            candidates = ["utf-16"]
        elif raw_bytes.startswith(b"\xef\xbb\xbf"):
            candidates = ["utf-8-sig"]
        else:
            candidates = ["utf-8", "latin-1"]

        for encoding in candidates:
            try:
                return raw_bytes.decode(encoding), encoding
            except UnicodeDecodeError:
                continue
        raise CsvProcessingError(
            "No fue posible decodificar el CSV con utf-16, utf-8 o latin-1"
        )

    @classmethod
    def process(
        cls,
        csv_path: str,
        output_dir: str,
        screen_geometry: Optional[Any] = None,
        *,
        stimulus_placements_by_scenario: Optional[Mapping[str, Any]] = None,
        rename_vendor_fixations: bool = True,
    ) -> ProcessingResult:
        try:
            detector_geometry, geometry_warnings = cls._screen_geometry(screen_geometry)
            file_path = pathlib.Path(csv_path)
            if not file_path.exists() or not file_path.is_file():
                raise CsvProcessingError(f"CSV no encontrado: {csv_path}")

            decoded_text, detected_encoding = cls._decode_bytes(file_path.read_bytes())
            lines = decoded_text.splitlines()
            if not lines:
                raise CsvProcessingError("El CSV esta vacio")

            block_specs = cls._find_block_specs(lines)
            if not block_specs:
                raise CsvProcessingError(
                    "No se encontraron bloques de usuarios (encabezados con 'time')"
                )

            logger.info(
                "Starting CSV processing: csv_path=%s, output_dir=%s, users=%d, encoding=%s",
                csv_path,
                output_dir,
                len(block_specs),
                detected_encoding,
            )

            participants: List[ParticipantInfo] = []
            all_user_paths: List[Tuple[int, str]] = []
            all_scenario_paths: List[Tuple[int, str, str]] = []
            all_detected_sensors: List[str] = []
            all_block_metadata: List[BlockMetadata] = []
            all_warnings: List[str] = []
            all_stimulus_placements: Dict[str, Dict[str, Any]] = {}
            physical_geometry_snapshot = cls._physical_screen_geometry_snapshot(
                detector_geometry
            )

            for user_index, spec in enumerate(block_specs, start=1):
                delimiter, _ = cls._header_cells(lines[spec.header_index])
                parsed = cls._build_dataframe_with_info(
                    lines[spec.header_index : spec.block_end],
                    delimiter,
                    source_header_line=spec.header_index + 1,
                    rename_vendor_fixations=rename_vendor_fixations,
                )
                (
                    channels,
                    declared_file_rate_hz,
                    metadata_warnings,
                ) = cls._parse_metadata(
                    spec.metadata_lines,
                    rename_vendor_fixations=rename_vendor_fixations,
                )
                normalized_df, recording_units, detector_distance_unit = cls._normalize_declared_units(
                    parsed.dataframe, channels
                )
                gaze_units = cls._gaze_units(channels)

                participant_code = cls._extract_participant_code(spec.metadata_lines)
                if not participant_code:
                    participant_code = f"participante_{user_index}"
                participants.append(
                    ParticipantInfo(
                        participant_code=participant_code,
                        user_index=user_index,
                    )
                )

                detected_sensors = cls._detect_sensors(parsed.normalized_columns)
                for sensor in detected_sensors:
                    if sensor not in all_detected_sensors:
                        all_detected_sensors.append(sensor)

                observed_grid_rate_hz, rate_warnings = cls._derive_observed_rate(
                    normalized_df,
                    declared_file_rate_hz,
                )
                declared_gaze_rate_hz, gaze_warnings = cls._derive_gaze_rate(channels)

                warnings = [
                    *metadata_warnings,
                    *parsed.warnings,
                    *rate_warnings,
                    *gaze_warnings,
                    *geometry_warnings,
                ]
                if len(parsed.vendor_fixation_axes) == 1:
                    found = next(iter(parsed.vendor_fixation_axes))
                    warnings.append(
                        f"partial vendor fixation columns: found {found} without its paired axis"
                    )
                if (
                    declared_gaze_rate_hz is not None
                    and observed_grid_rate_hz is not None
                    and abs(declared_gaze_rate_hz - observed_grid_rate_hz)
                    / max(declared_gaze_rate_hz, observed_grid_rate_hz)
                    > 0.02
                ):
                    warnings.append(
                        "gaze channel rate differs from observed file grid; values may be resampled"
                    )

                cleaned_df = normalized_df
                fixation_available = False
                fixation_method: Optional[str] = None
                fixation_detector_version: Optional[str] = None
                fixation_source: Optional[str] = None
                stimulus_transform_status: Optional[str] = None
                stimulus_transform_version: Optional[str] = None
                stimulus_transform_fingerprint: Optional[str] = None
                fixation_coordinate_space: Optional[str] = None
                block_stimulus_placements: Dict[str, Dict[str, Any]] = {}
                effective_detection_rate_hz: Optional[float] = None
                resampled_for_detection = False

                has_gx = "gx" in cleaned_df.columns
                has_gy = "gy" in cleaned_df.columns
                if has_gx and has_gy:
                    detector_result = FixationDetectionService.detect_duration_variants(
                        cleaned_df,
                        metadata=FixationDetectionMetadata(
                            eye_sampling_rate_hz=declared_gaze_rate_hz,
                            grid_sampling_rate_hz=observed_grid_rate_hz,
                            gaze_units=gaze_units,
                            distance_unit=detector_distance_unit,
                            screen_geometry=detector_geometry,
                            stimulus_placements_by_scenario=(
                                stimulus_placements_by_scenario
                            ),
                        ),
                    )
                    cleaned_df = detector_result.samples
                    detector_metadata = detector_result.metadata
                    detector_warnings = [
                        str(item) for item in detector_metadata.get("warnings", [])
                    ]
                    warnings.extend(detector_warnings)
                    fixation_available = True
                    fixation_method = str(detector_metadata.get("method") or "") or None
                    fixation_detector_version = (
                        str(detector_metadata.get("version") or "") or None
                    )
                    fixation_source = "raw_gaze"
                    stimulus_transform_status = (
                        str(detector_metadata.get("stimulus_transform_status") or "")
                        or None
                    )
                    stimulus_transform_version = (
                        str(detector_metadata.get("stimulus_transform_version") or "")
                        or None
                    )
                    stimulus_transform_fingerprint = (
                        str(
                            detector_metadata.get("stimulus_transform_fingerprint")
                            or ""
                        )
                        or None
                    )
                    fixation_coordinate_space = (
                        str(detector_metadata.get("fixation_coordinate_space") or "")
                        or None
                    )
                    snapshot_value = detector_metadata.get(
                        "stimulus_placements_by_scenario"
                    )
                    if isinstance(snapshot_value, Mapping):
                        block_stimulus_placements = {
                            str(scenario): dict(payload)
                            for scenario, payload in snapshot_value.items()
                            if isinstance(payload, Mapping)
                        }
                        for scenario, payload in block_stimulus_placements.items():
                            previous = all_stimulus_placements.get(scenario)
                            if previous is not None and previous != payload:
                                raise CsvProcessingError(
                                    "conflicting stimulus placement snapshots for "
                                    f"scenario {scenario!r}"
                                )
                            all_stimulus_placements[scenario] = payload
                    effective_value = detector_metadata.get("effective_rate_hz")
                    effective_detection_rate_hz = (
                        float(effective_value) if effective_value is not None else None
                    )
                    resampled_for_detection = bool(detector_metadata.get("resampled"))
                elif has_gx or has_gy:
                    missing_axis = "gy" if has_gx else "gx"
                    warnings.append(
                        f"partial raw gaze columns: missing {missing_axis}; fixation-v2 unavailable"
                    )

                user_paths, scenario_paths = cls._write_parquets(
                    cleaned_df,
                    user_index=user_index,
                    output_dir=output_dir,
                    stimulus_placements_by_scenario=block_stimulus_placements,
                    physical_screen_geometry=physical_geometry_snapshot,
                    recording_units=recording_units,
                )
                all_user_paths.extend(user_paths)
                all_scenario_paths.extend(scenario_paths)

                times = pd.to_numeric(cleaned_df["time"], errors="coerce")
                block_metadata = BlockMetadata(
                    user_index=user_index,
                    participant_code=participant_code,
                    recording_label=cls._extract_recording_label(spec.metadata_lines),
                    source_start_line=spec.source_start + 1,
                    header_line=spec.header_index + 1,
                    source_end_line=spec.block_end,
                    delimiter=delimiter,
                    original_columns=parsed.original_columns,
                    normalized_columns=list(cleaned_df.columns),
                    extra_columns=parsed.extra_columns,
                    detected_sensors=detected_sensors,
                    declared_file_rate_hz=declared_file_rate_hz,
                    observed_grid_rate_hz=observed_grid_rate_hz,
                    declared_gaze_rate_hz=declared_gaze_rate_hz,
                    effective_detection_rate_hz=effective_detection_rate_hz,
                    resampled_for_detection=resampled_for_detection,
                    sample_count=len(cleaned_df),
                    time_start=float(times.iloc[0]) if len(times) else None,
                    time_end=float(times.iloc[-1]) if len(times) else None,
                    fixation_available=fixation_available,
                    fixation_method=fixation_method,
                    fixation_detector_version=fixation_detector_version,
                    fixation_source=fixation_source,
                    stimulus_transform_status=stimulus_transform_status,
                    stimulus_transform_version=stimulus_transform_version,
                    stimulus_transform_fingerprint=stimulus_transform_fingerprint,
                    fixation_coordinate_space=fixation_coordinate_space,
                    stimulus_placements_by_scenario=block_stimulus_placements,
                    physical_screen_geometry=physical_geometry_snapshot,
                    channels=channels,
                    warnings=warnings,
                )
                all_block_metadata.append(block_metadata)
                all_warnings.extend(
                    f"block {user_index}: {warning}" for warning in warnings
                )

            return ProcessingResult(
                detected_sensors=all_detected_sensors,
                participants=participants,
                user_parquet_paths=all_user_paths,
                scenario_parquet_paths=all_scenario_paths,
                encoding=detected_encoding,
                block_metadata=all_block_metadata,
                stimulus_placements_by_scenario=all_stimulus_placements,
                physical_screen_geometry=physical_geometry_snapshot,
                warnings=all_warnings,
            )
        except CsvProcessingError:
            raise
        except Exception as exc:
            logger.exception("CSV processing failed for csv_path=%s", csv_path)
            raise CsvProcessingError(
                f"Error procesando CSV '{csv_path}': {exc}"
            ) from exc

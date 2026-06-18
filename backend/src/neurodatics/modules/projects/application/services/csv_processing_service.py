import io
import logging
import pathlib
import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


STD_MAP = {
    "time": "time",
    # GSR
    "gsr / gsr": "gsr",
    # EEG - DSI-7
    "electroencefalografía (eeg) / le": "le",
    "electroencefalografía (eeg) / f4": "f4",
    "electroencefalografía (eeg) / c4": "c4",
    "electroencefalografía (eeg) / p4": "p4",
    "electroencefalografía (eeg) / p3": "p3",
    "electroencefalografía (eeg) / c3": "c3",
    "electroencefalografía (eeg) / f3": "f3",
    "electroencefalografía (eeg) / trg": "trg",
    # Eye tracker - VT3 mini
    "bandwidth / distance": "distance",
    "bandwidth / lefteyepupildiameter": "lx_pupil",
    "bandwidth / righteyepupildiameter": "rx_pupil",
    "bandwidth / x": "gx",
    "bandwidth / y": "gy",
    "fixations / x": "fix_x",
    "fixations / y": "fix_y",
    # Scenarios
    "scenario 1": "scenario",
    "scenario / scenario 1": "scenario",
    # Arousal
    "arousal": "arousal",
}


@dataclass
class ParticipantInfo:
    participant_code: str
    user_index: int


@dataclass
class ProcessingResult:
    detected_sensors: List[str]
    participants: List[ParticipantInfo]
    user_parquet_paths: List[Tuple[int, str]] = field(default_factory=list)
    scenario_parquet_paths: List[Tuple[int, str, str]] = field(default_factory=list)


class CsvProcessingError(Exception):
    pass


class CsvProcessingService:
    _HEADER_SPLIT_PATTERN = re.compile(r"[;,\t]")
    _PARTICIPANT_RE = re.compile(r"[Gg]rabaci[oó]n\s*[:]\s*(\d+)")
    _SCENARIO_CLEAN_RE = re.compile(r"[\\/\s]+")

    @staticmethod
    def _norm(s: str) -> str:
        return (s or "").strip().strip('"').strip("'").lower()

    @staticmethod
    def _choose_delimiter(header_line: str) -> str:
        candidates = [";", ",", "\t"]
        best = ";"
        best_count = 1
        for delimiter in candidates:
            col_count = len(header_line.split(delimiter))
            if col_count > best_count:
                best = delimiter
                best_count = col_count
        return best

    @classmethod
    def _to_float(cls, cell: str) -> Optional[float]:
        value = cls._norm(cell)
        if value in {"", "na", "nan", "null", "none"}:
            return None
        value = value.replace(",", ".")
        try:
            return float(value)
        except ValueError:
            return None

    @classmethod
    def _find_user_blocks(cls, lines: List[str]) -> List[Tuple[int, int, List[str]]]:
        header_indices: List[int] = []

        for idx, line in enumerate(lines):
            first_cell = cls._HEADER_SPLIT_PATTERN.split(line, maxsplit=1)[0]
            if cls._norm(first_cell) == "time":
                header_indices.append(idx)

        blocks: List[Tuple[int, int, List[str]]] = []
        if not header_indices:
            return blocks

        for pos, header_idx in enumerate(header_indices):
            block_end = header_indices[pos + 1] if pos + 1 < len(header_indices) else len(lines)

            # Scan backwards from header to isolate metadata section for each user block.
            # Metadata is expected to be the non-empty run just above the "time" header.
            meta_start = 0 if pos == 0 else (header_indices[pos - 1] + 1)
            if pos == 0:
                metadata_lines = lines[:header_idx]
            else:
                meta_begin = header_idx
                for i in range(header_idx - 1, meta_start - 1, -1):
                    if not lines[i].strip():
                        break
                    meta_begin = i
                metadata_lines = lines[meta_begin:header_idx]

            blocks.append((header_idx, block_end, metadata_lines))

        return blocks

    @classmethod
    def _extract_participant_code(cls, metadata_lines: List[str]) -> Optional[str]:
        for line in metadata_lines:
            match = cls._PARTICIPANT_RE.search(line)
            if match:
                return match.group(1)
        return None

    @classmethod
    def _detect_sensors(cls, raw_header_cells: List[str]) -> List[str]:
        lowered_cells = [cell.lower() for cell in raw_header_cells]
        sensors: List[str] = []

        if any(
            "electroencefalografía (eeg)" in cell or re.search(r"\beeg\b", cell)
            for cell in lowered_cells
        ):
            sensors.append("EEG")
        if any("gsr / gsr" in cell for cell in lowered_cells):
            sensors.append("GSR")
        if any("bandwidth / distance" in cell for cell in lowered_cells):
            sensors.append("EyeTracker")

        return sensors

    @classmethod
    def _normalize_columns(cls, columns: List[str]) -> List[str]:
        normalized: List[str] = []
        seen: dict[str, int] = {}

        for col in columns:
            key = cls._norm(col)
            mapped = STD_MAP.get(key, key)
            count = seen.get(mapped, 0) + 1
            seen[mapped] = count
            if count == 1:
                normalized.append(mapped)
            else:
                normalized.append(f"{mapped}_{count}")

        return normalized

    @classmethod
    def _convert_numeric_columns(cls, df: pd.DataFrame) -> pd.DataFrame:
        converted_df = df.copy()

        for col in converted_df.columns:
            series = converted_df[col]

            if pd.api.types.is_numeric_dtype(series):
                continue

            text_series = series.astype("string").str.strip()
            non_empty_mask = text_series.notna() & (text_series != "")
            if not non_empty_mask.any():
                continue

            numeric_candidate = pd.to_numeric(
                text_series.str.replace(",", ".", regex=False),
                errors="coerce",
            )

            conversion_ratio = float(numeric_candidate[non_empty_mask].notna().mean())
            if conversion_ratio >= 0.8:
                converted_df[col] = numeric_candidate

        return converted_df

    @classmethod
    def _build_dataframe(cls, lines: List[str], delimiter: str) -> pd.DataFrame:
        csv_text = "\n".join(lines)
        df = pd.read_csv(
            io.StringIO(csv_text),
            sep=delimiter,
            decimal=",",
            engine="python",
            on_bad_lines="skip",
            skipinitialspace=True,
        )

        df.columns = cls._normalize_columns([str(col) for col in df.columns])
        df = df.dropna(how="all").reset_index(drop=True)
        df = cls._convert_numeric_columns(df)
        return df

    @classmethod
    def _clean_dataframe(cls, df: pd.DataFrame) -> pd.DataFrame:
        cleaned = df.copy()

        # a) Eye tracker blackout
        if {"gx", "gy"}.issubset(cleaned.columns):
            gx = pd.to_numeric(cleaned["gx"], errors="coerce")
            gy = pd.to_numeric(cleaned["gy"], errors="coerce")
            blackout_mask = (gx == 0) & (gy == 0)

            keep_columns = {"time", "distance", "lx_pupil", "rx_pupil", "scenario"}
            blackout_targets = [c for c in cleaned.columns if c not in keep_columns]
            if blackout_targets:
                cleaned.loc[blackout_mask, blackout_targets] = pd.NA

        # b) Negative fixation clamp
        if {"fix_x", "fix_y"}.issubset(cleaned.columns):
            fix_x = pd.to_numeric(cleaned["fix_x"], errors="coerce")
            fix_y = pd.to_numeric(cleaned["fix_y"], errors="coerce")

            # Capture rows that are original sentinels before clamping negatives.
            original_sentinel_mask = (fix_x == -100) & (fix_y == -100)

            negative_mask = (fix_x < 0) | (fix_y < 0)
            cleaned.loc[negative_mask, ["fix_x", "fix_y"]] = -100

            # c) Sentinel propagation (single pass from original sentinel rows)
            sentinel_positions = np.flatnonzero(original_sentinel_mask.to_numpy())

            if sentinel_positions.size:
                candidate_positions = np.unique(
                    np.concatenate([sentinel_positions - 1, sentinel_positions + 1])
                )
                candidate_positions = candidate_positions[
                    (candidate_positions >= 0) & (candidate_positions < len(cleaned))
                ]

                if candidate_positions.size:
                    row_index = cleaned.index.to_numpy()
                    target_rows = row_index[candidate_positions]
                    for col in ["fix_x", "fix_y"]:
                        current_values = pd.to_numeric(cleaned.loc[target_rows, col], errors="coerce")
                        updatable_mask = current_values.notna() & (current_values != -100)
                        if updatable_mask.any():
                            cleaned.loc[target_rows[updatable_mask.to_numpy()], col] = -100

        return cleaned

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
    ) -> Tuple[List[Tuple[int, str]], List[Tuple[int, str, str]]]:
        base_dir = pathlib.Path(output_dir).resolve() / f"user{user_index}"
        base_dir.mkdir(parents=True, exist_ok=True)

        user_path = (base_dir / f"user{user_index}.parquet").resolve()
        df.to_parquet(user_path, engine="pyarrow", index=False, compression="snappy")

        user_parquet_paths: List[Tuple[int, str]] = [(user_index, str(user_path))]
        scenario_parquet_paths: List[Tuple[int, str, str]] = []

        if "scenario" in df.columns:
            scenarios_dir = base_dir / "escenarios"
            scenarios_dir.mkdir(parents=True, exist_ok=True)

            scenario_series = df["scenario"]
            valid_scenarios = scenario_series.dropna().astype("string").str.strip()
            unique_scenarios = [value for value in pd.unique(valid_scenarios) if value and value != ""]

            for scenario_name in unique_scenarios:
                clean_name = cls._clean_scenario_name(str(scenario_name))
                scenario_path = (scenarios_dir / f"{clean_name}.parquet").resolve()

                scenario_df = df[scenario_series.astype("string").str.strip() == scenario_name]
                scenario_df.to_parquet(
                    scenario_path,
                    engine="pyarrow",
                    index=False,
                    compression="snappy",
                )
                scenario_parquet_paths.append((user_index, str(scenario_name), str(scenario_path)))

        return user_parquet_paths, scenario_parquet_paths

    @classmethod
    def process(cls, csv_path: str, output_dir: str) -> ProcessingResult:
        try:
            file_path = pathlib.Path(csv_path)
            if not file_path.exists() or not file_path.is_file():
                raise CsvProcessingError(f"CSV no encontrado: {csv_path}")

            raw_bytes = file_path.read_bytes()
            decoded_text: Optional[str] = None
            detected_encoding: Optional[str] = None
            for encoding in ("utf-16", "utf-8", "latin-1"):
                try:
                    decoded_text = raw_bytes.decode(encoding)
                    detected_encoding = encoding
                    break
                except UnicodeDecodeError:
                    continue

            if decoded_text is None:
                raise CsvProcessingError("No fue posible decodificar el CSV con utf-16, utf-8 o latin-1")

            lines = decoded_text.splitlines()
            if not lines:
                raise CsvProcessingError("El CSV esta vacio")

            user_blocks = cls._find_user_blocks(lines)
            if not user_blocks:
                raise CsvProcessingError("No se encontraron bloques de usuarios (encabezados con 'time')")

            first_header_idx, _, _ = user_blocks[0]
            first_header_line = lines[first_header_idx]
            first_delimiter = cls._choose_delimiter(first_header_line)
            first_raw_header_cells = [cell.strip() for cell in first_header_line.split(first_delimiter)]
            detected_sensors = cls._detect_sensors(first_raw_header_cells)

            logger.info(
                "Starting CSV processing: csv_path=%s, output_dir=%s, users=%d, encoding=%s, sensors=%s",
                csv_path,
                output_dir,
                len(user_blocks),
                detected_encoding,
                detected_sensors,
            )

            participants: List[ParticipantInfo] = []
            all_user_paths: List[Tuple[int, str]] = []
            all_scenario_paths: List[Tuple[int, str, str]] = []

            for user_index, (header_idx, block_end, metadata_lines) in enumerate(user_blocks, start=1):
                delimiter = cls._choose_delimiter(lines[header_idx])
                block_lines = lines[header_idx:block_end]

                participant_code = cls._extract_participant_code(metadata_lines)
                if not participant_code:
                    participant_code = f"participante_{user_index}"

                participants.append(
                    ParticipantInfo(
                        participant_code=participant_code,
                        user_index=user_index,
                    )
                )

                df = cls._build_dataframe(block_lines, delimiter)
                if df.empty:
                    logger.warning("User block %d generated an empty DataFrame; parquet will still be written", user_index)

                cleaned_df = cls._clean_dataframe(df)
                user_paths, scenario_paths = cls._write_parquets(
                    cleaned_df,
                    user_index=user_index,
                    output_dir=output_dir,
                )
                all_user_paths.extend(user_paths)
                all_scenario_paths.extend(scenario_paths)

            return ProcessingResult(
                detected_sensors=detected_sensors,
                participants=participants,
                user_parquet_paths=all_user_paths,
                scenario_parquet_paths=all_scenario_paths,
            )
        except CsvProcessingError:
            raise
        except Exception as exc:
            logger.exception("CSV processing failed for csv_path=%s", csv_path)
            raise CsvProcessingError(f"Error procesando CSV '{csv_path}': {exc}") from exc

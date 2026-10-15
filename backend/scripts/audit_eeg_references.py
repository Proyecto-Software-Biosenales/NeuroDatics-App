"""Offline EEG audit: hashes and anonymous aggregate evidence, never raw samples.

Usage: .venv/Scripts/python.exe backend/scripts/audit_eeg_references.py
       docs/RefererenceExperiments --report output/eeg-reference-audit.json
Binary decoding below is an explicitly inferred diagnostic, not an importer.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import runpy
import sys

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "src"))
runpy.run_path(str(BACKEND / "tests/conftest.py"))
from neurodatics.modules.projects.application.services.csv_processing_service import (  # noqa: E402
    CsvProcessingService as CSV,
    CsvProcessingError,
)
from neurodatics.modules.analytics.application.services.eeg_analytics_service import (  # noqa: E402
    EegAnalyticsService as EEG,
    EEG_CHANNELS,
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def channel_summary(values):
    raw = np.asarray(values, dtype=float)
    valid = np.flatnonzero(np.isfinite(raw))
    if not valid.size:
        return {"valid": 0, "missing": len(raw)}
    x = raw[valid]
    steps = np.diff(raw)
    steps = steps[np.isfinite(steps)]
    return {
        "valid": len(valid),
        "missing": len(raw) - len(valid),
        "leading_missing": int(valid[0]),
        "trailing_missing": int(len(raw) - 1 - valid[-1]),
        "internal_missing": int(valid[-1] - valid[0] + 1 - len(valid)),
        "min": float(x.min()),
        "max": float(x.max()),
        "median": float(np.median(x)),
        "std": float(x.std()),
        "rms": float(np.sqrt(np.mean(x * x))),
        "p99_absolute_step": float(np.percentile(np.abs(steps), 99))
        if len(steps)
        else None,
        "max_absolute_step": float(np.max(np.abs(steps))) if len(steps) else None,
        "identical_adjacent": int((steps == 0).sum()),
    }


def audit_csv(path, file_index):
    text, encoding = CSV._decode_bytes(path.read_bytes())
    lines = text.splitlines()
    specs = CSV._find_block_specs(lines)
    report = {
        "id": f"csv-{file_index:02d}",
        "sha256": digest(path),
        "bytes": path.stat().st_size,
        "encoding": encoding,
        "blocks": [],
    }
    native_header = next((i for i, line in enumerate(lines) if line.startswith("Time,LE,F4,")), None)
    if native_header is not None:
        header = next(csv.reader([lines[native_header]]))
        rows = [next(csv.reader([line])) for line in lines[native_header + 1:] if line.strip()]
        counts = {str(n): sum(len(row) == n for row in rows) for n in sorted({len(row) for row in rows})}
        diagnostic = {"header_fields": len(header), "row_field_counts": counts,
                      "policy": "diagnostic_only_not_importable"}
        # This exact malformed schema has 8 unquoted decimal-comma fields,
        # followed by 7 ordinary fields. Reject any other layout even for audit.
        if header == ["Time", "LE", "F4", "C4", "P4", "P3", "C3", "F3", "Pz",
                      "Trigger", "Time_Offset", "ADC_Status", "ADC_Sequence", "Event", "Comments"] and all(len(row) == 23 for row in rows):
            recovered = [[float(row[i] + "." + row[i + 1]) for i in range(0, 16, 2)]
                         + [float(value) for value in row[16:21]] for row in rows]
            samples = np.array(recovered)
            sequence = samples[:, 12].astype(int)
            diagnostic.update({"rows": len(samples), "nonpositive_time_steps": int((np.diff(samples[:, 0]) <= 0).sum()),
                               "initial_same_timestamp_rows": int((samples[:, 0] == samples[0, 0]).sum()),
                               "adc_status_values": np.unique(samples[:, 11]).tolist(),
                               "sequence_discontinuities_mod256": int((np.diff(sequence) % 256 != 1).sum()),
                               "reference_column_all_zero": bool((samples[:, 8] == 0).all())})
        report["native_diagnostic"] = diagnostic
    if not specs:
        report["status"] = "unsupported_native_csv"
        # DSI raw export diagnostic: never guess column alignment using pandas.
        header_index = next(
            (i for i, line in enumerate(lines) if line.startswith("Time,")), None
        )
        if header_index is not None:
            header = next(csv.reader([lines[header_index]]))
            counts = {}
            for line in lines[header_index + 1 :]:
                if line.strip() and not line.startswith("#"):
                    n = len(next(csv.reader([line])))
                    counts[str(n)] = counts.get(str(n), 0) + 1
            report.update({"header_fields": len(header), "row_field_counts": counts})
        return report
    for index, spec in enumerate(specs, 1):
        block = {"index": index}
        report["blocks"].append(block)
        delimiter, _ = CSV._header_cells(lines[spec.header_index])
        try:
            raw = CSV._build_dataframe_with_info(
                lines[spec.header_index : spec.block_end], delimiter
            ).dataframe
            channels, declared, _ = CSV._parse_metadata(
                spec.metadata_lines, rename_vendor_fixations=True
            )
            frame, units, _ = CSV._normalize_declared_units(raw, channels)
        except CsvProcessingError as error:
            block.update({"status": "rejected", "reason": str(error).split(":")[0]})
            continue
        names = [c for c in EEG_CHANNELS if c in frame]
        if not names:
            block.update({"status": "no_eeg", "rows": len(frame)})
            continue
        times = frame.time.to_numpy(dtype=float)
        dt = np.diff(times)
        vector = frame[names].to_numpy(dtype=float)
        all_valid = np.isfinite(vector).all(axis=1)
        held = (
            all_valid[1:] & all_valid[:-1] & (np.diff(vector, axis=0) == 0).all(axis=1)
        )
        psd = EEG.compute_psd(frame)
        json.dumps(psd, allow_nan=False)
        scenarios = list(pd.unique(frame.scenario)) if "scenario" in frame else [None]
        scenario_results = []
        for number, scenario in enumerate(scenarios, 1):
            p = EEG.compute_psd(frame, scenario)
            sp = EEG.compute_spectrogram(frame, scenario)
            topo = EEG.compute_topography(frame, scenario)
            for item in [p, sp, topo]:
                json.dumps(item, allow_nan=False)
            scenario_results.append(
                {
                    "index": number,
                    "rows": int((frame.scenario == scenario).sum())
                    if scenario is not None
                    else len(frame),
                    "psd_channels": len(p["channels"]),
                    "spectrogram_frames": len(sp["time"]),
                    "topography_frames": len(topo["time"]),
                }
            )
        block.update(
            {
                "status": "analyzed",
                "rows": len(frame),
                "duration_s": float(times[-1] - times[0]),
                "grid_hz": float(1 / np.median(dt)),
                "declared_file_hz": declared,
                "interval_relative_max_deviation": float(
                    np.max(abs(dt - np.median(dt))) / np.median(dt)
                ),
                "nonpositive_intervals": int((dt <= 0).sum()),
                "held_eeg_vectors": int(held.sum()),
                "eeg_acquisition": units.get("eeg"),
                "channels": {c: channel_summary(frame[c]) for c in names},
                "source_channel_ranges": {c: channel_summary(raw[c]) for c in names},
                "trigger_nonzero": int((frame.trg.fillna(0) != 0).sum())
                if "trg" in frame
                else None,
                "band_power": psd["band_power"],
                "quality": psd["metadata"],
                "scenarios": scenario_results,
            }
        )
        # Compare exported range/scale to the matching acquisition file, retaining
        # only hashes and aggregates; participant identity is never serialized.
        code = CSV._extract_participant_code(spec.metadata_lines)
        candidates = (
            list((path.parent / "Acquisition").glob(f"Sujet_{code}_*/[01]_DSI.dat"))
            if code
            else []
        )
        if candidates:
            anchor = max(candidates, key=lambda p: p.stat().st_size)
            binary = np.fromfile(anchor, dtype="<f4")
            if binary.size % 9 == 0:
                matrix = binary.reshape(-1, 9).astype(float)
                block["binary_anchor"] = {
                    "sha256": digest(anchor),
                    "schema": "inferred_float32_le_time_7eeg_trigger",
                    "rows": len(matrix),
                    "duration_s": float(matrix[-1, 0] - matrix[0, 0]),
                    "span_hz": float(
                        (len(matrix) - 1) / (matrix[-1, 0] - matrix[0, 0])
                    ),
                    "channels": {
                        c: channel_summary(matrix[:, i + 1])
                        for i, c in enumerate(EEG_CHANNELS)
                    },
                }
    report["status"] = "inspected"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    reports = []
    for i, path in enumerate(sorted(args.directory.rglob("*.csv")), 1):
        print(f"Auditing CSV {i}", flush=True)
        reports.append(audit_csv(path, i))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps({"method": "eeg-v2", "files": reports}, indent=2, allow_nan=False)
        + "\n",
        encoding="utf8",
    )
    print(f"Wrote aggregate evidence for {len(reports)} CSVs")


if __name__ == "__main__":
    main()

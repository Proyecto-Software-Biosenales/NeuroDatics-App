"""Offline descriptive comparison: a small I-DT baseline versus the current app.

No source samples or identities are exported. One recording block is one local
analysis unit, not proof of a unique person. This is not an accuracy benchmark.
"""

import argparse
import csv
import hashlib
import json
import logging
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend/src"))
runpy.run_path(str(ROOT / "backend/tests/conftest.py"))

from neurodatics.modules.projects.application.services.csv_processing_service import (  # noqa: E402
    CsvProcessingService,
)
from neurodatics.modules.analytics.application.services.fixation_analytics_service import (  # noqa: E402
    FixationDurationVariantService,
    FixationEventService,
)


def read_basic_blocks(path):
    """Independent limited reader: Time tables separated by recording metadata.

    Supports the local export's semicolon, tab or comma delimiter and decimal
    comma. Rejects ambiguous duplicate clocks or malformed rows. No repair.
    """
    raw = path.read_bytes()
    encoding = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
    try:
        lines = raw.decode(encoding).splitlines()
    except UnicodeDecodeError:
        lines = raw.decode("cp1252").splitlines()
    headers = [i for i, line in enumerate(lines)
               if line.strip().lower().startswith(("time;", "time\t", "time,"))]
    if not headers:
        raise ValueError("no_time_header")
    blocks = []
    aliases = {"time": "time", "bandwidth / x": "gx", "bandwidth / y": "gy",
               "gaze x": "gx", "gaze y": "gy", "gx": "gx", "gy": "gy",
               "fixations / x": "vendor_x", "fixations / y": "vendor_y",
               "scenario 1": "scenario", "scenario": "scenario"}
    for start in headers:
        delimiter = max((";", "\t", ","), key=lines[start].count)
        names = next(csv.reader([lines[start]], delimiter=delimiter))
        canonical = [aliases.get(name.strip().casefold(), name.strip().casefold()) for name in names]
        if canonical.count("time") != 1:
            raise ValueError("multiple_clocks")
        rows = []
        for line in lines[start + 1:]:
            if not line.strip():
                break
            cells = next(csv.reader([line], delimiter=delimiter))
            # A nonnumeric first field begins the next metadata section.
            try:
                float(cells[0].replace(",", "."))
            except (ValueError, IndexError):
                break
            if len(cells) != len(names):
                raise ValueError("malformed_row")
            rows.append(cells)
        frame = pd.DataFrame(rows, columns=canonical)
        if not {"time", "gx", "gy"}.issubset(frame.columns):
            raise ValueError("no_gaze_columns")
        for name in ("time", "gx", "gy", "vendor_x", "vendor_y"):
            if name in frame:
                frame[name] = pd.to_numeric(frame[name].str.replace(",", ".", regex=False)
                                           .replace("", np.nan), errors="raise")
        if "scenario" not in frame:
            frame["scenario"] = ""
        if frame.empty or not np.isfinite(frame.time).all() or not (np.diff(frame.time) > 0).all():
            raise ValueError("invalid_time")
        blocks.append(frame)
    return blocks


def valid_xy(x, y):
    return np.isfinite(x) & np.isfinite(y) & (x >= 0) & (x <= 1) & (y >= 0) & (y <= 1) & ~((x == 0) & (y == 0))


def basic_idt(frame, units="percent", min_ms=200, threshold=0.03):
    """I-DT on original rows, same spatial threshold and minimum as app.

    Invalid samples, scenario changes and >1.5-grid-period gaps split runs.
    No resampling, bridging or calibration. Duration = rows / observed rate.
    """
    scale = 100.0 if units == "percent" else 1.0
    x, y = frame.gx.to_numpy(float) / scale, frame.gy.to_numpy(float) / scale
    times = frame.time.to_numpy(float)
    period = float(np.median(np.diff(times)))
    valid = valid_xy(x, y)
    scenarios = frame.scenario.fillna("").to_numpy(str)
    labels = np.zeros(len(frame), dtype=bool)
    durations = []
    minimum = max(2, int(np.ceil(min_ms / 1000 / period - 1e-9)))
    i = 0
    while i < len(frame):
        if not valid[i]:
            i += 1
            continue
        end = i + 1
        while end < len(frame) and valid[end] and scenarios[end] == scenarios[end - 1] and times[end] - times[end - 1] <= 1.5 * period:
            end += 1
        while i + minimum <= end:
            j = i + minimum
            xmin, xmax = float(x[i:j].min()), float(x[i:j].max())
            ymin, ymax = float(y[i:j].min()), float(y[i:j].max())
            if xmax - xmin + ymax - ymin > threshold:
                i += 1
                continue
            while j < end:
                bounds = min(xmin, x[j]), max(xmax, x[j]), min(ymin, y[j]), max(ymax, y[j])
                if bounds[1] - bounds[0] + bounds[3] - bounds[2] > threshold:
                    break
                xmin, xmax, ymin, ymax = bounds
                j += 1
            labels[i:j] = True
            durations.append((j - i) * period)
            i = j
        i = end
    return np.array(durations), labels, valid


def summarize(durations):
    return {"events": len(durations), "total_s": float(np.sum(durations)),
            "mean_ms": float(np.mean(durations) * 1000) if len(durations) else None,
            "median_ms": float(np.median(durations) * 1000) if len(durations) else None}


def self_check():
    f = pd.DataFrame({"time": np.arange(100) / 100, "gx": 50., "gy": 50., "scenario": "a"})
    d, mask, _ = basic_idt(f)
    assert len(d) == 1 and abs(d.sum() - 1) < 1e-9 and mask.all()
    f.loc[40:59, ["gx", "gy"]] = np.nan
    d, mask, _ = basic_idt(f)
    assert len(d) == 2 and abs(d.sum() - .8) < 1e-9 and not mask[40:60].any()
    f.loc[60:, "scenario"] = "b"
    d, _, _ = basic_idt(f)
    assert len(d) == 2
    f.loc[:, "gx"] = -100
    assert len(basic_idt(f)[0]) == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    self_check()
    logging.disable(logging.CRITICAL)
    output = {"schema": "presentation-baseline-v1", "git_head": subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "method": {"baseline": "independent basic I-DT on export grid", "min_ms": 200,
                   "dispersion_normalized": .03, "app": "current ingestion + canonical event service",
                   "geometry": "not supplied; screen space only", "identity": "anonymous recording block",
                   "interpretation": "descriptive agreement; no ground truth or accuracy claim"},
        "files": []}
    durations_basic, durations_app = [], []
    for number, source in enumerate(sorted(args.directory.rglob("*.csv")), 1):
        item = {"id": f"csv-{number:02}", "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}
        output["files"].append(item)
        try:
            basics = read_basic_blocks(source)
        except ValueError as error:
            item.update(status="not_compared", reason=str(error))
            print(item["id"], item["status"], item["reason"], flush=True)
            continue
        workroot = ROOT / "output/presentation-baseline-work"
        workroot.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=workroot) as temporary:
            processed = CsvProcessingService.process(str(source), temporary)
            assert len(basics) == len(processed.user_parquet_paths)
            item.update(status="compared", blocks=[])
            for basic, (_, path), meta in zip(basics, processed.user_parquet_paths, processed.block_metadata):
                frame = pd.read_parquet(path)
                # Prove the independent reader and app are comparing the same samples.
                for name in ("time", "gx", "gy"):
                    np.testing.assert_allclose(basic[name], frame[name], rtol=0, atol=1e-12, equal_nan=True)
                assert basic.scenario.fillna("").tolist() == frame.scenario.fillna("").tolist()
                units = CsvProcessingService._gaze_units(meta.channels)
                if units not in ("percent", "normalized"):
                    raise ValueError("baseline requires explicit percent or normalized gaze")
                base_d, base_labels, valid = basic_idt(basic, units)
                np.testing.assert_array_equal(valid, frame.is_valid_gaze.to_numpy(bool))
                events, event_meta = FixationEventService.build_events(frame)
                app_d = events.duration_s.to_numpy(float)
                assert (app_d > 0).all()
                # Use canonical valid fixation coordinates, independent of ID null encoding.
                app_labels = valid & (frame.fix_x.to_numpy(float) >= 0) & (frame.fix_y.to_numpy(float) >= 0)
                durations_basic.extend(base_d)
                durations_app.extend(app_d)
                vendor = None
                if {"vendor_x", "vendor_y"}.issubset(basic.columns):
                    factor = 100 if units == "percent" else 1
                    present = valid_xy(basic.vendor_x.to_numpy(float) / factor, basic.vendor_y.to_numpy(float) / factor)
                    vendor = {"in_range_rows": int(present.sum()), "in_range_while_raw_gaze_invalid": int((present & ~valid).sum())}
                repeated = valid[1:] & valid[:-1] & (np.diff(basic.gx) == 0) & (np.diff(basic.gy) == 0)
                both_valid = valid[1:] & valid[:-1]
                block = {"id": f"B{meta.user_index:02}", "rows": len(frame),
                         "scenarios": int(frame.scenario.fillna("").nunique()),
                         "valid_gaze_rows": int(valid.sum()), "invalid_gaze_rows": int((~valid).sum()),
                         "export_grid_hz": meta.observed_grid_rate_hz, "gaze_declared_hz": meta.declared_gaze_rate_hz,
                         "effective_detection_hz": meta.effective_detection_rate_hz,
                         "resampled": meta.resampled_for_detection, "method": meta.fixation_method,
                         "exact_repeated_valid_gaze_pairs": int(repeated.sum()),
                         "adjacent_valid_pair_denominator": int(both_valid.sum()),
                         "baseline": summarize(base_d), "app": summarize(app_d), "vendor": vendor,
                         "app_events_under_200ms": int((app_d < .2 - 1e-6).sum()),
                         "app_short_event_durations_ms": (app_d[app_d < .2 - 1e-6] * 1000).tolist(),
                         "event_warning_count": len(event_meta.get("warnings", [])),
                         "event_warning_examples": event_meta.get("warnings", [])[:12],
                         "row_label_disagreements": int((base_labels != app_labels).sum()),
                         "app_only_fixation_rows": int((app_labels & ~base_labels).sum()),
                         "baseline_only_fixation_rows": int((base_labels & ~app_labels).sum()),
                         "sensitivity": FixationDurationVariantService.compute_sensitivity(frame)["points"],
                         "provenance": {"source": event_meta.get("source"), "version": meta.fixation_detector_version},
                         "scenario_results": []}
                for sidx, scenario in enumerate(frame.scenario.fillna("").unique(), 1):
                    selected = basic.scenario.fillna("") == scenario
                    # Keep whole chronology for baseline segmentation, masking other scenarios.
                    sf = basic.copy()
                    sf.loc[~selected, ["gx", "gy"]] = np.nan
                    bd, _, _ = basic_idt(sf, units)
                    # Scope exact raw labels explicitly: empty labels must not
                    # be interpreted as the API's request for all scenarios.
                    ae, _ = FixationEventService.build_events(frame.loc[selected.to_numpy()])
                    block["scenario_results"].append({"id": f"S{sidx:02}", "rows": int(selected.sum()),
                                                     "baseline": summarize(bd), "app": summarize(ae.duration_s.to_numpy(float))})
                item["blocks"].append(block)
            print(item["id"], "compared", len(item["blocks"]), "blocks", flush=True)
    blocks = [block for item in output["files"] for block in item.get("blocks", [])]
    if not blocks:
        raise ValueError("No compatible recordings compared")
    output["aggregate"] = {"recording_blocks_including_export_variants": len(blocks),
        "rows": sum(b["rows"] for b in blocks), "valid_gaze_rows": sum(b["valid_gaze_rows"] for b in blocks),
        "invalid_gaze_rows": sum(b["invalid_gaze_rows"] for b in blocks),
        "baseline": summarize(np.array(durations_basic)), "app": summarize(np.array(durations_app))}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(output, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(output["aggregate"], allow_nan=False), flush=True)


if __name__ == "__main__":
    main()

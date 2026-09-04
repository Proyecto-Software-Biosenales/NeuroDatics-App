"""Local, opt-in acceptance of private recordings; emits aggregate evidence only.

Run with the root virtual environment and a directory containing reference CSVs.
Source recordings and generated parquet files are never committed or uploaded.
"""

import argparse
import hashlib
import json
import logging
from pathlib import Path
import runpy
import sys
import tempfile
from types import SimpleNamespace
import zipfile

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "src"))
runpy.run_path(str(BACKEND / "tests/conftest.py"))

from neurodatics.modules.analytics.application.services.analytics_service import (  # noqa: E402
    AoiAnalyticsService, EegAnalyticsService, FixationDurationVariantService,
    FixationEventService, FixationHistogramService, GsrAnalyticsService,
    HeatmapAnalyticsService, PupilAnalyticsService, ScanpathAnalyticsService,
)
from neurodatics.modules.projects.application.services.csv_processing_service import CsvProcessingService  # noqa: E402
from neurodatics.modules.projects.application.services.zip_validation_service import UploadSelection, ZipValidationService  # noqa: E402


def validate_recording(csv_path, work):
    archive_path = work / "reference.zip"
    media = [p for folder in ("Images", "Videos") for p in (csv_path.parent / folder).glob("*") if p.is_file()]
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.write(csv_path, "recording.csv")
        for item in media:
            archive.write(item, item.relative_to(csv_path.parent).as_posix())
    _, counts, _, _, excluded = ZipValidationService.validate_and_analyze(
        filename=archive_path.name, mime_type="application/zip", zip_path=str(archive_path),
        selection=UploadSelection(allow_missing_images=True, allow_missing_videos=True),
    )
    assert counts["csv"] == 1 and not excluded
    extracted = work / "recording.csv"
    with zipfile.ZipFile(archive_path) as archive:
        extracted.write_bytes(archive.read("recording.csv"))
    result = CsvProcessingService.process(str(extracted), str(work / "parquet"))
    assert len(result.participants) >= 2
    text, _ = CsvProcessingService._decode_bytes(csv_path.read_bytes())
    lines = text.splitlines()
    specs = CsvProcessingService._find_block_specs(lines)
    scenarios_seen = set()
    total_rows = total_events = distance_converted_blocks = numerical_cases = 0
    aois = [SimpleNamespace(id="reference-screen", name="Screen", color="#2563EB", shape_type="rect",
                            shape={"x": 0, "y": 0, "width": 100, "height": 100})]
    for (index, path), block, spec in zip(result.user_parquet_paths, result.block_metadata, specs):
        frame = pd.read_parquet(path)
        assert len(frame) == block.sample_count and len(frame) > 0
        assert np.isfinite(frame.time).all() and (np.diff(frame.time) > 0).all()
        assert block.fixation_available and block.fixation_source == "raw_gaze"
        delimiter, _ = CsvProcessingService._header_cells(lines[spec.header_index])
        source = CsvProcessingService._build_dataframe_with_info(
            lines[spec.header_index:spec.block_end], delimiter,
            source_header_line=spec.header_index + 1, rename_vendor_fixations=True,
        ).dataframe
        contract = json.loads(pq.read_metadata(path).metadata[b"recording_units"])
        factor = {"mm": 1, "cm": 10, "m": 1000, None: 1}[contract["source"]["distance"]]
        np.testing.assert_allclose(frame.distance, source.distance * factor, equal_nan=True)
        distance = PupilAnalyticsService.compute_distance_timeseries(frame)
        np.testing.assert_allclose(distance["distance_cm"], np.round(frame.distance.dropna() / 10, 4))
        distance_converted_blocks += factor != 1
        total_rows += len(frame)
        scenarios = list(frame.scenario.dropna().unique())
        assert len(scenarios) >= 2
        scenarios_seen.update(scenarios)
        events, metadata = FixationEventService.build_events(frame)
        assert metadata["source"] == "raw_gaze" and not events.empty
        assert (events.duration_s > 0).all()
        total_events += len(events)
        # Four participant/scenario pairs per recording exercise every numerical
        # service; persistence and unit checks above still cover every participant.
        if index <= 2:
            # Use sustained recordings for spectral acceptance. The first SAIO
            # scenario has <1024 usable samples and correctly yields no spectrogram.
            sustained = sorted(scenarios, key=lambda value: int((frame.scenario == value).sum()), reverse=True)
            for scenario in sustained[:2]:
                outputs = [
                    PupilAnalyticsService.compute_timeseries(frame, scenario),
                    PupilAnalyticsService.compute_statistics(frame, scenario),
                    PupilAnalyticsService.compute_gaze_timeseries(frame, scenario),
                    PupilAnalyticsService.compute_distance_statistics(frame, scenario),
                    ScanpathAnalyticsService.compute_scanpath(frame, scenario),
                    FixationHistogramService.compute_histogram(frame, scenario),
                    FixationDurationVariantService.compute_sensitivity(frame, scenario),
                    AoiAnalyticsService.compute_metrics(frame, scenario, aois),
                ]
                if "GSR" in result.detected_sensors:
                    outputs += [GsrAnalyticsService.compute_timeseries(frame, scenario),
                                GsrAnalyticsService.compute_statistics(frame, scenario)]
                if "EEG" in result.detected_sensors:
                    outputs += [EegAnalyticsService.compute_timeseries(frame, scenario),
                                EegAnalyticsService.compute_psd(frame, scenario),
                                EegAnalyticsService.compute_spectrogram(frame, scenario),
                                EegAnalyticsService.compute_topography(frame, scenario)]
                    assert outputs[-3]["frequency"] and outputs[-2]["time"]
                # Reject NaN/Infinity in public JSON; no golden regeneration.
                for output in outputs:
                    json.dumps(output, allow_nan=False)
                png, _ = HeatmapAnalyticsService.compute_heatmap_overlay_with_metadata(frame, scenario, width=160, height=90)
                if png is not None:
                    assert png.startswith(b"\x89PNG\r\n\x1a\n")
                numerical_cases += len(outputs) + 1
    for _, _, path in result.scenario_parquet_paths:
        assert json.loads(pq.read_metadata(path).metadata[b"recording_units"])["stored"]["distance"] == "mm"
    return {
        "file": csv_path.name, "sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
        "participants": len(result.participants), "scenarios": len(scenarios_seen),
        "rows": total_rows, "fixation_events": total_events, "sensors": sorted(result.detected_sensors),
        "distance_converted_blocks": distance_converted_blocks, "numerical_service_calls": numerical_cases,
        "scenario_parquets": len(result.scenario_parquet_paths), "zip_counts": counts,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    sources = sorted(args.directory.resolve().rglob("*.csv"))
    assert sources, "No reference CSVs found"
    logging.disable(logging.CRITICAL)
    output_root = (BACKEND.parent / "output" / "reference-validation").resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    reports = []
    for source in sources:
        print(f"Validating reference {len(reports) + 1}/{len(sources)}", flush=True)
        with tempfile.TemporaryDirectory(prefix="recording-", dir=output_root) as temp:
            work = Path(temp).resolve()
            assert work.parent == output_root  # Bounds automatic temporary cleanup.
            reports.append(validate_recording(source, work))
    assert any(set(report["sensors"]) == {"EEG", "GSR", "EyeTracker"} for report in reports)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({"status": "passed", "experiments": reports}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "passed", "experiments": len(reports), "participants": sum(r["participants"] for r in reports)}))


if __name__ == "__main__":
    main()

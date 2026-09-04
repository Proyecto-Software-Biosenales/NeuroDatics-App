"""Declared CSV units survive ingestion as seconds/mm, including old-reader use."""

import json

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest

from neurodatics.modules.analytics.application.services.analytics_service import PupilAnalyticsService
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingError,
    CsvProcessingService,
)


def recording(tmp_path, *, time_unit="seconds", time_scale=1, distance_unit="mm", distance=600, y_unit="%"):
    csv_path = tmp_path / "units.csv"
    lines = [
        "Grabacion : SYN-UNITS | Rec 1",
        "Nombre : Time", f"Unidad Tobii : {time_unit}",
        "Nombre : Bandwidth / X", "Unidad Tobii : %", "Frecuencia : 100 Hz",
        "Nombre : Bandwidth / Y", f"Unidad Tobii : {y_unit}", "Frecuencia : 100 Hz",
        "Nombre : Bandwidth / Distance", f"Unidad Tobii : {distance_unit}",
        "Frecuencia del archivo : 100 Hz",
        "Time;Bandwidth / X;Bandwidth / Y;Bandwidth / Distance;Scenario 1",
    ]
    lines += [f"{i / 100 * time_scale};20;30;{distance};scene" for i in range(100)]
    csv_path.write_text("\n".join(lines), encoding="utf-8")
    return CsvProcessingService.process(str(csv_path), str(tmp_path / "parquet"))


@pytest.mark.parametrize(("unit", "value"), [("mm", 600), ("cm", 60), ("m", 0.6)])
def test_distance_is_canonical_for_existing_analytics_readers(tmp_path, unit, value):
    result = recording(tmp_path, distance_unit=unit, distance=value)
    for _, path in result.user_parquet_paths:
        frame = pd.read_parquet(path)
        assert frame.distance.to_numpy() == pytest.approx(np.full(100, 600.0))
        series = PupilAnalyticsService.compute_distance_timeseries(frame)
        assert series["distance_cm"] == pytest.approx(np.full(100, 60.0))
    for _, _, path in result.scenario_parquet_paths:
        assert pd.read_parquet(path).distance.iloc[0] == pytest.approx(600)


@pytest.mark.parametrize(("unit", "scale"), [("seconds", 1), ("milliseconds", 1000), ("microseconds", 1_000_000)])
def test_time_is_normalized_before_rate_detection_and_persistence(tmp_path, unit, scale):
    result = recording(tmp_path, time_unit=unit, time_scale=scale)
    block = result.block_metadata[0]
    assert block.observed_grid_rate_hz == pytest.approx(100)
    assert block.effective_detection_rate_hz == pytest.approx(100)
    assert block.time_end == pytest.approx(0.99)
    frame = pd.read_parquet(result.user_parquet_paths[0][1])
    assert frame.time.to_numpy() == pytest.approx(np.arange(100) / 100)


@pytest.mark.parametrize("changes", [
    {"y_unit": "px"}, {"y_unit": "degrees"},
    {"distance_unit": "feet"}, {"time_unit": "ticks"},
])
def test_incompatible_or_unsupported_explicit_units_are_rejected(tmp_path, changes):
    with pytest.raises(CsvProcessingError, match="[Uu]nid|unit"):
        recording(tmp_path, **changes)
    assert not list((tmp_path / "parquet").rglob("*.parquet"))


def test_parquet_records_source_and_storage_units_without_reinterpreting_old_files(tmp_path):
    result = recording(tmp_path, time_unit="ms", time_scale=1000, distance_unit="m", distance=0.6)
    for path in [result.user_parquet_paths[0][1], result.scenario_parquet_paths[0][2]]:
        contract = json.loads(pq.read_metadata(path).metadata[b"recording_units"])
        assert contract["version"] == 1
        assert contract["stored"] == {"time": "seconds", "distance": "mm"}
        assert contract["source"]["time"] == "ms"
        assert contract["source"]["distance"] == "m"
    legacy = tmp_path / "old.parquet"
    pd.DataFrame({"time": [0, 0.01], "distance": [600.0, 620.0]}).to_parquet(legacy)
    assert b"recording_units" not in pq.read_metadata(legacy).metadata
    assert PupilAnalyticsService.compute_distance_timeseries(pd.read_parquet(legacy))["distance_cm"] == [60, 62]

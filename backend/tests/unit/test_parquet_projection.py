"""Real Parquet reads: projection, metadata, legacy absence and cache identity."""

from types import SimpleNamespace as NS
from uuid import UUID

import numpy as np
import pandas as pd
import pyarrow as pa
import pytest

from neurodatics.modules.analytics.domain.parquet_projection import (
    ParquetProjection, GSR_PROJECTION, PUPIL_PROJECTION, DISTANCE_PROJECTION,
    TIMING_PROJECTION, EEG_PROJECTION,
)
from neurodatics.modules.analytics.infrastructure.parquet_cache import (
    ParquetCacheService, read_parquet_frame,
)
from neurodatics.modules.analytics.application.services.parquet_reader_service import ParquetReaderService


PROFILES = [GSR_PROJECTION, PUPIL_PROJECTION, DISTANCE_PROJECTION, TIMING_PROJECTION, EEG_PROJECTION]


@pytest.mark.parametrize("projection", PROFILES)
@pytest.mark.parametrize("legacy", [False, True])
@pytest.mark.parametrize("stored_index", [False, True])
def test_real_projection_preserves_values_attrs_index_and_missing_columns(tmp_path, projection, legacy, stored_index):
    frame = pd.DataFrame({
        "time": [0.0, np.nan, 0.008, 0.008, -1.0],
        "scenario": ["b", "a", None, "b", "a"],
        "gsr": [1.0, 2.0, np.nan, 3.0, np.inf],
        "le": [0.123456789123, np.nan, 2.0, 3.0, 4.0],
        "segment_id": ["s1", "s1", "s2", "s2", "s3"],
        "unused": [9.0] * 5,
    }, index=pd.Index([3, 7, 9, 10, 21], name="sample"))
    if not legacy:
        frame["lx_pupil"] = [1.0, np.nan, 3.0, 4.0, 5.0]
        frame["rx_pupil"] = 2.0
        frame["distance"] = 600.123456789123
        frame["participant_code"] = "P/01"
        frame.attrs = {"eeg_acquisition": {"source_units": {"le": "uV"}}, "quality": {"gaps": 2}}
    path = tmp_path / "source.parquet"
    frame.to_parquet(path, index=stored_index)
    full = pd.read_parquet(path)
    projected = read_parquet_frame(path, projection)
    pd.testing.assert_frame_equal(projected, full[projection.resolve(full.columns)])
    assert projected.attrs == full.attrs == frame.attrs
    assert "unused" not in projected


def test_required_columns_and_corruption_fail_without_full_read_fallback(tmp_path, monkeypatch):
    path = tmp_path / "source.parquet"
    pd.DataFrame({"other": [1, 2]}).to_parquet(path, index=False)
    projection = ParquetProjection("strict", required=("time",), optional=("gsr",))
    monkeypatch.setattr(pd, "read_parquet", lambda *a, **kw: pytest.fail("decoder must not run"))
    with pytest.raises(ValueError, match="requires missing columns"):
        read_parquet_frame(path, projection)
    path.write_bytes(b"malformed")
    with pytest.raises(pa.ArrowInvalid):
        read_parquet_frame(path, GSR_PROJECTION)


@pytest.mark.parametrize("stored_index", [False, True, None])
def test_no_matching_optional_columns_preserves_row_count(tmp_path, stored_index):
    path = tmp_path / "legacy.parquet"
    source = pd.DataFrame({"other": [1, 2, 3]}, index=pd.RangeIndex(3, 9, 2, name="sample"))
    source.attrs = {"participant": "synthetic"}
    source.to_parquet(path, index=stored_index)
    frame = read_parquet_frame(path, PUPIL_PROJECTION)
    assert len(frame) == 3 and len(frame.columns) == 0
    pd.testing.assert_index_equal(frame.index, pd.read_parquet(path).index)
    assert frame.attrs == source.attrs


@pytest.mark.asyncio
async def test_cold_hit_cache_only_same_projection_and_identity(tmp_path, monkeypatch):
    project = UUID(int=501)
    cache = ParquetCacheService()
    cache._cache_dir = tmp_path / "cache"
    reader = ParquetReaderService(None)
    reader._cache = cache
    payloads = {}
    for code, value in [("P/01", 1.0), ("P 01", 7.0)]:
        source = tmp_path / f"{value}.parquet"
        frame = pd.DataFrame({"time": [0.0], "scenario": ["a"], "gsr": [value], "unused": [99]})
        frame.attrs = {"participant": code}
        frame.to_parquet(source, index=False)
        payloads[code] = source.read_bytes()
    downloads = []

    class Storage:
        def download_file_content(self, code):
            downloads.append(code)
            return payloads[code]

    async def resolve(project_id, participant_code):
        return NS(project_file=NS(external_id=participant_code))

    async def storage():
        return Storage()

    monkeypatch.setattr(reader, "resolve_user_parquet", resolve)
    monkeypatch.setattr(reader, "_build_drive_client", storage)
    cold = await reader.read(project, "P/01", 3, projection=GSR_PROJECTION)
    hit = await reader.read(project, "P/01", 3, projection=GSR_PROJECTION)
    only = await reader.read_from_cache_only(project, "P/01", 3, projection=GSR_PROJECTION)
    pd.testing.assert_frame_equal(cold, hit)
    pd.testing.assert_frame_equal(cold, only)
    assert len(downloads) == 1 and cold.attrs == {"participant": "P/01"}
    assert await reader.read_from_cache_only(project, "P/01", 4, projection=GSR_PROJECTION) is None
    other = await reader.read(project, "P 01", 3, projection=GSR_PROJECTION)
    assert other.gsr.tolist() == [7.0] and len(downloads) == 2
    full = await reader.read(project, "P/01", 3)
    assert "unused" in full and len(downloads) == 2
    await reader.read(project, "P/01", 4, projection=GSR_PROJECTION)
    assert len(downloads) == 3

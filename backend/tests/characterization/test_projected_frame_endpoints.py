"""Full vs projected HTTP responses through the real on-disk reader."""

import pandas as pd
import pytest

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.parquet_reader_service import ParquetReaderService
from neurodatics.modules.analytics.infrastructure.parquet_cache import ParquetCacheService

PREFIX = "/api/projects/00000000-0000-0000-0000-000000000101/analytics"
ENDPOINTS = [
    "/scenario-timing", "/timeseries/pupil", "/statistics/pupil",
    "/timeseries/distance", "/statistics/distance", "/timeseries/gsr",
    "/statistics/gsr", "/timeseries/eeg", "/psd/eeg", "/spectrogram/eeg", "/topography/eeg",
]


@pytest.mark.parametrize("legacy", [False, True])
@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("scenario", ["all", "stimulus-a", "stimulus-b"])
def test_real_disk_read_same_http_contract_and_hit_skips_parquet(http_client, corpus, tmp_path, monkeypatch, endpoint, scenario, legacy):
    cache = ParquetCacheService()
    cache._cache_dir = tmp_path / "cache"
    reader = ParquetReaderService(None)
    reader._cache = cache
    project = corpus.frames["SYN-01"].copy(deep=True)
    if legacy:
        project = project.drop(columns=[c for c in project if c.startswith("stimulus_") or c in {"lx_pupil", "rx_pupil", "distance", "gsr", "segment_id"}])
        project.attrs = {}
    path = tmp_path / "synthetic.parquet"
    project.to_parquet(path, index=False)
    from uuid import UUID
    cache.put(UUID(int=257), "SYN-01", path.read_bytes(), 0)
    selections = []
    decode = pd.read_parquet

    def counted(*args, **kwargs):
        selections.append(kwargs.get("columns"))
        return decode(*args, **kwargs)

    class FullReader:
        def __init__(self, db):
            pass

        async def read(self, project_id, participant_code, generation=None, **kwargs):
            return await reader.read(project_id, participant_code, generation)

    monkeypatch.setattr(pd, "read_parquet", counted)
    monkeypatch.setattr(routes, "ParquetReaderService", FullReader)
    params = {"participant_code": "SYN-01", "scenario": scenario}
    if legacy and endpoint in {"/timeseries/eeg", "/psd/eeg", "/spectrogram/eeg", "/topography/eeg"}:
        params.update(channels="f3,f4", reference="common_average", bandpass_low_hz=1, bandpass_high_hz=30, notch_hz=50)
    full = http_client.get(PREFIX + endpoint, params=params)
    assert full.status_code == 200, full.text
    routes._redis.values.clear()
    selections.clear()
    monkeypatch.setattr(routes, "ParquetReaderService", lambda db: reader)
    projected = http_client.get(PREFIX + endpoint, params=params)
    assert projected.status_code == 200, projected.text
    assert projected.content == full.content
    assert len(selections) == 1 and selections[0] is not None
    assert len(selections[0]) < len(project.columns)
    monkeypatch.setattr(pd, "read_parquet", lambda *a, **kw: pytest.fail("response hit opened Parquet"))
    assert http_client.get(PREFIX + endpoint, params=params).content == full.content

"""Re-ingesting a project has to change what the heatmap URL answers with.

The overlay used to be served ``public, max-age=900``: a shared cache could
store one participant's authenticated PNG, and a browser kept the previous
ingestion's overlay for a quarter of an hour after a re-upload. Freshness now
rides on an ETag derived from the cache key, and that key embeds the project's
own ingestion generation - never the one the client asked for.
"""

from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
from starlette.datastructures import Headers

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.infrastructure.redis_cache import AnalyticsRedisCache

pytest.importorskip("PIL.Image", reason="heatmap rendering needs Pillow")

PROJECT_ID = uuid4()
CURRENT_USER = str(uuid4())
SCENARIO = "Scenario canonical"


def _request(if_none_match=None):
    headers = {} if if_none_match is None else {"if-none-match": if_none_match}
    return SimpleNamespace(headers=Headers(headers))


class FakeRedis:
    """In-memory store that builds real keys, so the ETag stays realistic."""

    def __init__(self):
        self.keys = []
        self._bytes = {}
        self._json = {}

    def build_key(self, project_id, participant_code, endpoint, scenario="all", generation=0):
        key = AnalyticsRedisCache.build_key(
            project_id,
            participant_code,
            endpoint,
            scenario,
            generation,
        )
        self.keys.append(key)
        return key

    def get_bytes(self, key):
        return self._bytes.get(key)

    def set_bytes(self, key, value, ttl=None):
        self._bytes[key] = value

    def get_json(self, key):
        return self._json.get(key)

    def set_json(self, key, data, ttl=None):
        self._json[key] = data


class FakeReader:
    def __init__(self, _db):
        pass

    async def read(self, _project_id, _participant_code, generation=None):
        samples = 20
        return pd.DataFrame(
            {
                "time": np.arange(samples, dtype=float) / 100.0,
                "fix_x": [50.0] * samples,
                "fix_y": [20.0] * samples,
                "scenario": [SCENARIO] * samples,
            }
        )


@pytest.fixture
def wired(monkeypatch):
    cache = FakeRedis()
    state = SimpleNamespace(cache=cache, generation=5)

    async def owned_project(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID, ingestion_generation=state.generation)

    async def resolve(*args, **kwargs):
        return SimpleNamespace(name=SCENARIO, file_id=None, width=800, height=800)

    monkeypatch.setattr(routes, "_verify_ownership", owned_project)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", resolve)
    monkeypatch.setattr(routes, "ParquetReaderService", FakeReader)
    monkeypatch.setattr(routes, "_redis", cache)
    return state


async def _overlay(request, generation=None, min_fixation_duration_ms=200):
    return await routes.heatmap_overlay(
        request,
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        min_fixation_duration_ms=min_fixation_duration_ms,
        generation=generation,
        db=object(),
        current_user=CURRENT_USER,
    )


@pytest.mark.asyncio
async def test_the_overlay_is_never_stored_by_a_shared_cache(wired):
    response = await _overlay(_request())

    assert "public" not in response.headers["cache-control"]
    assert response.headers["cache-control"] == "private, max-age=0, must-revalidate"
    assert response.headers["etag"]
    assert response.headers["vary"] == "Authorization"


@pytest.mark.asyncio
async def test_a_matching_etag_is_answered_with_an_empty_304(wired):
    etag = (await _overlay(_request())).headers["etag"]

    revalidated = await _overlay(_request(if_none_match=etag))

    assert revalidated.status_code == 304
    assert revalidated.body == b""
    assert revalidated.headers["etag"] == etag


@pytest.mark.asyncio
async def test_a_re_ingested_project_invalidates_the_client_s_etag(wired):
    stale_etag = (await _overlay(_request())).headers["etag"]

    wired.generation = 6
    response = await _overlay(_request(if_none_match=stale_etag))

    # The client asked to be told "unchanged" and must be told otherwise, or the
    # re-upload stays invisible until the browser drops the entry on its own.
    assert response.status_code == 200
    assert response.headers["etag"] != stale_etag


@pytest.mark.asyncio
async def test_a_client_supplied_generation_cannot_pin_the_cache_key(wired):
    await _overlay(_request(), generation=1)

    key = wired.cache.keys[-1]
    assert ":g5:" in key
    assert ":g1:" not in key


@pytest.mark.asyncio
async def test_fixation_duration_changes_the_heatmap_identity(wired, monkeypatch):
    # This route-level test isolates cache identity; duration variant selection
    # is covered with detector-v2 frames in test_fixation_duration_variants.py.
    monkeypatch.setattr(
        routes.HeatmapAnalyticsService,
        "compute_heatmap_overlay_with_metadata",
        lambda *args, **kwargs: (b"png", {}),
    )

    first = await _overlay(_request(), min_fixation_duration_ms=100)
    second = await _overlay(_request(), min_fixation_duration_ms=200)

    assert first.headers["etag"] != second.headers["etag"]
    assert any("min-duration-100ms" in key for key in wired.cache.keys)
    assert any("min-duration-200ms" in key for key in wired.cache.keys)

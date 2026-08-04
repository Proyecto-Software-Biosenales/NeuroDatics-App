from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.correlation_service import (
    CORRELATION_SIGNAL_IDS,
    CorrelationAnalyticsService,
)


PROJECT_ID = uuid4()
CURRENT_USER = str(uuid4())


class FakeCache:
    def __init__(self, cached=None):
        self.cached = cached
        self.key_args = None
        self.writes = []

    def build_key(self, *args):
        self.key_args = args
        return "|".join(str(value) for value in args)

    def get_json(self, key):
        return self.cached

    def set_json(self, key, data, ttl=None):
        self.writes.append((key, data, ttl))


def _partial_df(scenario="Scenario canonical"):
    return pd.DataFrame(
        {
            "time": np.arange(12, dtype=float),
            "scenario": [scenario] * 12,
            "lx_pupil": np.arange(12, dtype=float) + 2.0,
        }
    )


def _cached_payload(scenario="Scenario canonical"):
    result = CorrelationAnalyticsService.compute(_partial_df(scenario), scenario)
    return {
        "participant_code": "P-01",
        "scenario": scenario,
        **result,
    }


async def _allow_ownership(*args, **kwargs):
    return SimpleNamespace(id=PROJECT_ID)


async def _canonical_scenario(*args, **kwargs):
    return SimpleNamespace(name="Scenario canonical")


@pytest.mark.asyncio
async def test_correlations_rejects_all_after_ownership_check(monkeypatch):
    ownership_checked = False

    async def allow(*args, **kwargs):
        nonlocal ownership_checked
        ownership_checked = True
        return SimpleNamespace(id=PROJECT_ID)

    async def should_not_resolve(*args, **kwargs):
        raise AssertionError("scenario lookup must not run for scenario=all")

    monkeypatch.setattr(routes, "_verify_ownership", allow)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", should_not_resolve)

    with pytest.raises(HTTPException) as exc_info:
        await routes.correlations(
            PROJECT_ID,
            participant_code="P-01",
            scenario=" ALL ",
            db=object(),
            current_user=CURRENT_USER,
        )

    assert ownership_checked is True
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_correlations_preserves_ownership_404(monkeypatch):
    async def reject(*args, **kwargs):
        raise HTTPException(status_code=404, detail="Project not found")

    async def should_not_resolve(*args, **kwargs):
        raise AssertionError("scenario lookup must not run without project ownership")

    monkeypatch.setattr(routes, "_verify_ownership", reject)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", should_not_resolve)

    with pytest.raises(HTTPException) as exc_info:
        await routes.correlations(
            PROJECT_ID,
            participant_code="P-01",
            scenario="Scenario",
            db=object(),
            current_user=CURRENT_USER,
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Project not found"


@pytest.mark.asyncio
async def test_correlations_returns_404_for_unknown_scenario(monkeypatch):
    async def missing(*args, **kwargs):
        return None

    monkeypatch.setattr(routes, "_verify_ownership", _allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", missing)

    with pytest.raises(HTTPException) as exc_info:
        await routes.correlations(
            PROJECT_ID,
            participant_code="P-01",
            scenario="Missing",
            db=object(),
            current_user=CURRENT_USER,
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Scenario not found"


@pytest.mark.asyncio
async def test_scenario_resolver_accepts_normalized_name_and_file_stem():
    candidate = SimpleNamespace(name="Instruction 1.png", file_id=None)

    class Result:
        def __init__(self, exact=None, candidates=None):
            self._exact = exact
            self._candidates = candidates or []

        def scalar_one_or_none(self):
            return self._exact

        def scalars(self):
            return self

        def all(self):
            return self._candidates

    class FakeDb:
        def __init__(self):
            self.results = [Result(), Result(candidates=[candidate])]

        async def execute(self, statement):
            return self.results.pop(0)

    resolved = await routes._resolve_scenary_for_analytics(
        FakeDb(),
        PROJECT_ID,
        "instruction1",
    )

    assert resolved is candidate


@pytest.mark.asyncio
async def test_correlations_uses_canonical_scenario_and_writes_versioned_15_minute_cache(
    monkeypatch,
):
    cache = FakeCache()

    class Reader:
        def __init__(self, db):
            pass

        async def read(self, project_id, participant_code):
            return _partial_df()

    monkeypatch.setattr(routes, "_verify_ownership", _allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", _canonical_scenario)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", cache)

    response = await routes.correlations(
        PROJECT_ID,
        participant_code="P-01",
        scenario="scenario canonical",
        db=object(),
        current_user=CURRENT_USER,
    )

    assert response.participant_code == "P-01"
    assert response.scenario == "Scenario canonical"
    assert [signal.id for signal in response.signals] == list(CORRELATION_SIGNAL_IDS)
    assert response.signals[0].available is True
    assert any(not signal.available for signal in response.signals[1:])
    assert cache.key_args == (
        PROJECT_ID,
        "P-01",
        "correlations:v2",
        "Scenario canonical",
    )
    assert len(cache.writes) == 1
    assert cache.writes[0][2] == 900


@pytest.mark.asyncio
async def test_correlations_cache_hit_skips_parquet_loading(monkeypatch):
    cache = FakeCache(cached=_cached_payload())

    class Reader:
        def __init__(self, db):
            raise AssertionError("reader must not be constructed on a cache hit")

    monkeypatch.setattr(routes, "_verify_ownership", _allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", _canonical_scenario)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", cache)

    response = await routes.correlations(
        PROJECT_ID,
        participant_code="P-01",
        scenario="Scenario canonical",
        db=object(),
        current_user=CURRENT_USER,
    )

    assert response.scenario == "Scenario canonical"
    assert cache.writes == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reader_error", "expected_status"),
    [
        (ValueError("participant missing"), 404),
        (FileNotFoundError("parquet missing"), 404),
        (RuntimeError("drive unavailable"), 503),
    ],
)
async def test_correlations_maps_parquet_errors(
    monkeypatch, reader_error, expected_status
):
    class Reader:
        def __init__(self, db):
            pass

        async def read(self, project_id, participant_code):
            raise reader_error

    monkeypatch.setattr(routes, "_verify_ownership", _allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", _canonical_scenario)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", FakeCache())

    with pytest.raises(HTTPException) as exc_info:
        await routes.correlations(
            PROJECT_ID,
            participant_code="P-01",
            scenario="Scenario canonical",
            db=object(),
            current_user=CURRENT_USER,
        )

    assert exc_info.value.status_code == expected_status
    assert str(reader_error) in exc_info.value.detail

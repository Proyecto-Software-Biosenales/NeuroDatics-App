"""Actual ASGI dependency teardown, routes, reader and atomic disk publication.

Only DB transport and object storage are synthetic. Each request receives a
distinct AsyncSession subclass; SQL statements, auth and session teardown use
the application's real path. No Drive/Redis/PostgreSQL claim is made.
"""

import asyncio
import io
import math
import threading
import time
from types import SimpleNamespace as NS
from uuid import UUID

import httpx
import pandas as pd
import pytest
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from neurodatics.api.deps import get_db
from neurodatics.config.security import create_access_token
from neurodatics.main import app
from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.parquet_reader_service import ParquetReaderService
from neurodatics.modules.analytics.domain.parquet_projection import GSR_PROJECTION, PUPIL_PROJECTION
from neurodatics.modules.analytics.infrastructure.parquet_cache import ParquetCacheService
from neurodatics.modules.analytics.infrastructure.singleflight import SingleFlight
from neurodatics.modules.projects.domain.entities import Project, ProjectFile
from neurodatics.modules.scenaries.domain.entities import Scenaries

PROJECT = UUID("00000000-0000-0000-0000-000000000101")
OWNER = UUID("00000000-0000-0000-0000-000000000102")
PREFIX = f"/api/projects/{PROJECT}/analytics"
PARAMS = {"participant_code": "SYN-01", "scenario": "stimulus-a"}


class NoRedis:
    build_key = staticmethod(routes.AnalyticsRedisCache.build_key)

    def get_json(self, key):
        return None

    def set_json(self, *args, **kwargs):
        pass

    get_bytes = get_json
    set_bytes = set_json


@pytest.fixture
def shared_harness(corpus, http_client, monkeypatch, tmp_path):
    project = NS(id=PROJECT, owner_id=OWNER, ingestion_generation=3)
    cache = ParquetCacheService()
    cache._cache_dir = tmp_path
    payloads = {}
    for code, frame in corpus.frames.items():
        buffer = io.BytesIO()
        frame.to_parquet(buffer, index=False)
        payloads[code] = buffer.getvalue()
    files = [NS(id=UUID(int=401 + i), filename=f"user{i+1}.parquet", external_id=code,
                file_metadata={"type": "user_parquet", "participant_code": code})
             for i, code in enumerate(payloads)]
    scenarios = [NS(name=name, type="image", file_id=UUID(int=301+i), width=1280, height=720)
                 for i, name in enumerate(["stimulus-a", "stimulus-b"])]
    sessions, downloads, reads = [], [], []
    trace = []

    class DB(AsyncSession):
        def __init__(self):
            super().__init__()
            self.closed, self.executing = False, False
            self.index = len(sessions)
            sessions.append(self)

        async def execute(self, statement, *args, **kwargs):
            assert not self.closed and not self.executing
            self.executing = True
            try:
                await asyncio.sleep(0)
                params = statement.compile().params
                entity = statement.column_descriptions[0]["entity"]
                if entity is Project:
                    values = [project] if params.get("owner_id_1", OWNER) == OWNER else []
                elif entity is ProjectFile:
                    values = files
                elif entity is Scenaries:
                    values = scenarios
                else:
                    raise AssertionError(entity)
                trace.append((self.index, entity.__name__))
                return NS(scalar_one_or_none=lambda: values[0] if values else None,
                          scalars=lambda: NS(all=lambda: values))
            finally:
                self.executing = False

        async def close(self):
            assert not self.executing
            self.closed = True
            trace.append((self.index, "close"))
            await super().close()

    class Storage:
        def download_file_content(self, external_id):
            downloads.append(external_id)
            time.sleep(0.02)
            return payloads[external_id]

    class Reader(ParquetReaderService):
        def __init__(self, db):
            super().__init__(db)
            self._cache = cache

        async def _build_drive_client(self):
            # Assert OAuth configuration would run with a live request DB.
            assert not self._db.closed and not self._db.executing
            return Storage()

        async def read(self, *args, **kwargs):
            reads.append(kwargs.get("projection"))
            return await super().read(*args, **kwargs)

    async def database():
        session = DB()
        try:
            yield session
        finally:
            await session.close()

    async def token(*args, **kwargs):
        return "persisted-token", None

    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", NoRedis())
    monkeypatch.setattr(routes, "response_flights", SingleFlight())
    monkeypatch.setattr(routes, "_resolve_transform_token", token)
    app.dependency_overrides[get_db] = database
    return NS(project=project, cache=cache, sessions=sessions, downloads=downloads,
              reads=reads, trace=trace, db_factory=DB, headers=dict(http_client.headers))


def client(harness):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test",
                             headers=harness.headers)


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint,service,method", [
    ("/timeseries/pupil", "PupilAnalyticsService", "compute_timeseries"),
    ("/gaze-at", "PupilAnalyticsService", "find_gaze_at"),
    ("/heatmap", "HeatmapAnalyticsService", "compute_heatmap_overlay_with_metadata"),
])
async def test_ten_http_requests_one_response_one_file_no_redis(shared_harness, monkeypatch,
                                                              endpoint, service, method):
    harness = shared_harness
    calls = []
    target = getattr(routes, service)
    compute = getattr(target, method)

    def tracked(*args, **kwargs):
        calls.append(1)
        time.sleep(0.02)
        return compute(*args, **kwargs)

    monkeypatch.setattr(target, method, tracked)
    params = {**PARAMS, **({"t_s": 0.5} if endpoint == "/gaze-at" else {})}
    async with client(harness) as http:
        responses = await asyncio.gather(*(http.get(PREFIX + endpoint, params=params) for _ in range(10)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert all(r.content == responses[0].content for r in responses)
    assert len(calls) == len(harness.downloads) == len(harness.reads) == 1
    assert len(harness.sessions) == 10 and all(s.closed for s in harness.sessions)
    assert routes.response_flights.stats() == {"entries": 0, "running": 0, "consumers": 0}


@pytest.mark.asyncio
async def test_distinct_responses_share_only_complete_file_projection_and_mutability(shared_harness):
    harness = shared_harness
    async with client(harness) as http:
        responses = await asyncio.gather(
            http.get(PREFIX + "/timeseries/pupil", params=PARAMS),
            http.get(PREFIX + "/timeseries/gsr", params=PARAMS),
            http.get(PREFIX + "/statistics/pupil", params=PARAMS),
        )
    assert all(r.status_code == 200 for r in responses)
    assert len(harness.reads) == 3 and len(harness.downloads) == 1
    assert GSR_PROJECTION in harness.reads and PUPIL_PROJECTION in harness.reads
    reader = ParquetReaderService(None)
    reader._cache = harness.cache
    frames = await asyncio.gather(*(reader.read(PROJECT, "SYN-01", 3, projection=PUPIL_PROJECTION) for _ in range(2)))
    before = frames[1].copy(deep=True)
    frames[0].iloc[0, 0] = -999
    pd.testing.assert_frame_equal(frames[1], before)


@pytest.mark.asyncio
async def test_every_request_authorized_before_join_and_generation_filters_participants_isolated(shared_harness):
    harness = shared_harness
    wrong_token = create_access_token(str(UUID(int=999)), "other@example.invalid", "Other")
    async with client(harness) as http:
        valid, denied = await asyncio.gather(
            http.get(PREFIX + "/timeseries/pupil", params=PARAMS),
            http.get(PREFIX + "/timeseries/pupil", params=PARAMS,
                     headers={"Authorization": f"Bearer {wrong_token}"}),
        )
        assert valid.status_code == 200 and denied.status_code == 404
        responses = await asyncio.gather(
            http.get(PREFIX + "/timeseries/pupil", params={**PARAMS, "participant_code": "SYN-02"}),
            http.get(PREFIX + "/timeseries/pupil", params={**PARAMS, "max_points": 7}),
            http.get(PREFIX + "/timeseries/pupil", params={**PARAMS, "start_time_s": 0.5}),
            http.get(PREFIX + "/timeseries/pupil", params={**PARAMS, "scenario": "stimulus-b"}),
        )
        assert all(r.status_code == 200 for r in responses)
        harness.project.ingestion_generation = 4
        newer = await http.get(PREFIX + "/timeseries/pupil", params=PARAMS)
        assert newer.status_code == 200
    assert len(harness.reads) == 6
    assert sorted(harness.downloads) == ["SYN-01", "SYN-01", "SYN-02"]
    assert all(s.closed for s in harness.sessions)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["leader", "follower", "last", "timeout"])
async def test_asgi_dependency_lives_until_worker_and_enrichment_settle(shared_harness, monkeypatch, mode):
    harness = shared_harness
    started, release, finished = threading.Event(), threading.Event(), threading.Event()
    compute = routes.ScanpathAnalyticsService.compute_scanpath
    if mode == "timeout":
        monkeypatch.setattr(routes, "response_flights", SingleFlight(timeout=0.1))

    def tracked(*args, **kwargs):
        started.set()
        assert release.wait(2)
        result = compute(*args, **kwargs)
        finished.set()
        return result

    monkeypatch.setattr(routes.ScanpathAnalyticsService, "compute_scanpath", tracked)
    async with client(harness) as http:
        leader = asyncio.create_task(http.get(PREFIX + "/scanpath", params=PARAMS))
        assert await asyncio.to_thread(started.wait, 1)
        follower = None
        if mode in ("leader", "follower"):
            follower = asyncio.create_task(http.get(PREFIX + "/scanpath", params=PARAMS))
            while routes.response_flights.stats()["consumers"] < 2:
                await asyncio.sleep(0)
        cancelled = follower if mode == "follower" else leader
        if mode == "timeout":
            await asyncio.sleep(0.15)
        else:
            cancelled.cancel()
            await asyncio.sleep(0)
            cancelled.cancel()
            await asyncio.sleep(0)
        assert not harness.sessions[0].closed and not leader.done() and not finished.is_set()
        assert routes.response_flights.stats()["running"] == 1
        release.set()
        if mode == "timeout":
            assert (await leader).status_code == 503
        else:
            with pytest.raises(asyncio.CancelledError):
                await cancelled
            if follower is not None:
                survivor = leader if mode == "follower" else follower
                assert (await survivor).status_code == 200
                # Enrichment executed SQL on owner's DB AFTER abort and worker.
                assert (0, "Scenaries") in harness.trace
        assert finished.is_set() and all(s.closed for s in harness.sessions)
        assert not routes.response_flights._states
        # Same key can be retried after cancellation/timeout settlement.
        assert (await http.get(PREFIX + "/scanpath", params=PARAMS)).status_code == 200


@pytest.mark.asyncio
async def test_live_result_not_shared_mutable_and_projections_have_distinct_flights(monkeypatch):
    class Payload(BaseModel):
        values: list[int]

    class Reader:
        db = None

        async def read(self, *args, **kwargs):
            await asyncio.sleep(0.02)
            return pd.DataFrame()

    monkeypatch.setattr(routes, "_redis", NoRedis())
    monkeypatch.setattr(routes, "response_flights", SingleFlight())
    calls = []

    def compute(frame):
        calls.append(1)
        return {"values": [1, 2]}

    async def run(owner=OWNER, projection=PUPIL_PROJECTION):
        return await routes.cached_frame_endpoint(
            reader=Reader(), project=NS(id=PROJECT, owner_id=owner, ingestion_generation=3),
            participant_code="SYN-01", scenario="a", endpoint="same",
            response_model=Payload, compute=compute, projection=projection,
        )

    a, b, other_projection, other_owner = await asyncio.gather(run(), run(), run(projection=GSR_PROJECTION), run(owner=UUID(int=999)))
    assert len(calls) == 3
    a.values.append(9)
    assert b.values == other_projection.values == other_owner.values == [1, 2]


@pytest.mark.asyncio
async def test_file_flight_leader_abort_preserves_follower_and_no_request_db_in_download(shared_harness, monkeypatch):
    harness = shared_harness
    started, release = threading.Event(), threading.Event()
    source = harness.cache._cache_dir / "source.parquet"
    pd.DataFrame({"time": [0.0], "gsr": [1.0], "pupil_left": [2.0]}).to_parquet(source)
    payload = source.read_bytes()
    downloads = []

    class Storage:
        def download_file_content(self, external_id):
            downloads.append(external_id)
            started.set()
            assert release.wait(2)
            return payload

    async def storage(self):
        assert not self._db.closed
        return Storage()

    monkeypatch.setattr(routes.ParquetReaderService, "_build_drive_client", storage)

    async def request(projection):
        db = harness.db_factory()
        try:
            return await routes.ParquetReaderService(db).read(PROJECT, "SYN-01", 3, projection=projection)
        finally:
            await db.close()

    owner = asyncio.create_task(request(GSR_PROJECTION))
    assert await asyncio.to_thread(started.wait, 1)
    follower = asyncio.create_task(request(PUPIL_PROJECTION))
    from neurodatics.modules.analytics.application.services import parquet_reader_service as module
    while module.parquet_flights.stats()["consumers"] < 2:
        await asyncio.sleep(0)
    owner.cancel()
    await asyncio.sleep(0)
    owner.cancel()
    await asyncio.sleep(0)
    assert not harness.sessions[0].closed and not owner.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await owner
    frame = await follower
    assert "gsr" not in frame and len(downloads) == 1
    assert all(s.closed for s in harness.sessions)
    assert not module.parquet_flights._states
    assert not list(harness.cache._cache_dir.rglob("*.tmp"))


@pytest.mark.asyncio
async def test_oversized_json_shared_live_without_redis_write(monkeypatch):
    class Payload(BaseModel):
        values: list[str]

    class Redis:
        writes = 0

        def get(self, key):
            return None

        def set(self, *args, **kwargs):
            self.writes += 1

    cache = routes.AnalyticsRedisCache()
    redis = Redis()
    cache._client = redis
    monkeypatch.setattr(routes, "_redis", cache)
    monkeypatch.setattr(routes, "response_flights", SingleFlight())
    huge = "x" * (cache.MAX_JSON_BYTES + 1)
    calls = []

    class Reader:
        db = None

        async def read(self, *args, **kwargs):
            await asyncio.sleep(0.02)
            return pd.DataFrame()

    def compute(frame):
        calls.append(1)
        return {"values": [huge]}

    async def run():
        return await routes.cached_frame_endpoint(
            reader=Reader(), project=NS(id=PROJECT, owner_id=OWNER, ingestion_generation=3),
            participant_code="SYN-01", scenario="a", endpoint="oversize",
            response_model=Payload, compute=compute,
        )

    results = await asyncio.gather(*(run() for _ in range(10)))
    assert len(calls) == 1 and redis.writes == 0
    results[0].values.append("mine")
    assert all(result.values == [huge] for result in results[1:])
    await run()
    assert len(calls) == 2 and not routes.response_flights._states


@pytest.mark.asyncio
async def test_response_cache_rechecked_after_admission_before_reader(monkeypatch):
    class Payload(BaseModel):
        value: int
        generation: int

    class Cache(NoRedis):
        gets = 0

        def get_json(self, key):
            self.gets += 1
            return None if self.gets == 1 else {"value": 8}

    cache = Cache()
    monkeypatch.setattr(routes, "_redis", cache)

    class Reader:
        db = None

        async def read(self, *args, **kwargs):
            pytest.fail("cache was populated before shared work began")

    result = await routes.cached_frame_endpoint(
        reader=Reader(), project=NS(id=PROJECT, owner_id=OWNER, ingestion_generation=3),
        participant_code="SYN-01", scenario="a", endpoint="cache-fill",
        response_model=Payload, compute=lambda frame: pytest.fail("unexpected compute"),
        cached_fields={"generation": 3},
    )
    assert result.value == 8 and result.generation == 3 and cache.gets == 2


@pytest.mark.asyncio
async def test_abort_during_actual_request_db_await_keeps_dependency_until_followers_finish(shared_harness, monkeypatch):
    harness = shared_harness
    started, release = asyncio.Event(), asyncio.Event()
    execute = harness.db_factory.execute

    async def delayed(self, statement, *args, **kwargs):
        if statement.column_descriptions[0]["entity"] is ProjectFile:
            started.set()
            await release.wait()
            assert not self.closed
        return await execute(self, statement, *args, **kwargs)

    monkeypatch.setattr(harness.db_factory, "execute", delayed)
    async with client(harness) as http:
        owner = asyncio.create_task(http.get(PREFIX + "/scanpath", params=PARAMS))
        await asyncio.wait_for(started.wait(), 1)
        follower = asyncio.create_task(http.get(PREFIX + "/scanpath", params=PARAMS))
        while routes.response_flights.stats()["consumers"] < 2:
            await asyncio.sleep(0)
        owner.cancel()
        await asyncio.sleep(0)
        owner.cancel()
        await asyncio.sleep(0)
        assert not owner.done() and not harness.sessions[0].closed
        release.set()
        assert (await follower).status_code == 200
        with pytest.raises(asyncio.CancelledError):
            await owner
    assert all(session.closed for session in harness.sessions)
    assert harness.trace.index((0, "Scenaries")) < harness.trace.index((0, "close"))


@pytest.mark.asyncio
async def test_file_download_failure_shared_and_retry_after_settlement(shared_harness, monkeypatch):
    harness = shared_harness
    attempts = []
    payload_buffer = io.BytesIO()
    pd.DataFrame({"time": [0.0], "gsr": [2.0]}).to_parquet(payload_buffer)

    class Storage:
        def download_file_content(self, external_id):
            attempts.append(external_id)
            time.sleep(0.02)
            if len(attempts) == 1:
                raise OSError("synthetic disconnected store")
            return payload_buffer.getvalue()

    async def storage(self):
        assert not self._db.closed
        return Storage()

    monkeypatch.setattr(routes.ParquetReaderService, "_build_drive_client", storage)

    async def request():
        db = harness.db_factory()
        try:
            return await routes.ParquetReaderService(db).read(PROJECT, "SYN-01", 3, projection=GSR_PROJECTION)
        finally:
            await db.close()

    failures = await asyncio.gather(*(request() for _ in range(10)), return_exceptions=True)
    assert len(attempts) == 1 and all(isinstance(item, RuntimeError) for item in failures)
    assert (await request()).gsr.tolist() == [2.0]
    assert len(attempts) == 2 and all(s.closed for s in harness.sessions)
    assert not list(harness.cache._cache_dir.rglob("*.tmp"))


@pytest.mark.asyncio
async def test_live_model_roundtrip_preserves_nonfinite_precision_and_nested_any(monkeypatch):
    class ScientificPayload(BaseModel):
        precise: float
        nan: float
        infinity: float
        metadata: dict

    data = {"precise": 0.12345678901234568, "nan": float("nan"), "infinity": float("inf"),
            "metadata": {"units": "μS", "array": [float("nan"), 1.0000000000000002]}}
    expected = ScientificPayload(**data)
    monkeypatch.setattr(routes, "response_flights", SingleFlight())
    gate = asyncio.Event()

    async def calculate():
        await gate.wait()
        return data

    a = asyncio.create_task(routes._shared_model_response("science", calculate, ScientificPayload))
    b = asyncio.create_task(routes._shared_model_response("science", calculate, ScientificPayload))
    await asyncio.sleep(0)
    gate.set()
    first, second = await asyncio.gather(a, b)
    assert first.precise == second.precise == expected.precise
    assert math.isnan(first.nan) and math.isnan(second.nan)
    assert first.infinity == second.infinity == expected.infinity
    assert first.metadata["units"] == second.metadata["units"] == "μS"
    assert first.metadata["array"][1] == expected.metadata["array"][1]
    assert math.isnan(first.metadata["array"][0])
    first.metadata["array"].append(9)
    assert len(second.metadata["array"]) == 2

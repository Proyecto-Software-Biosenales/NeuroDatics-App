import asyncio
import json

import pytest

from neurodatics.infra.health import readiness


class FakeConnection:
    def __init__(self, statements):
        self.statements = statements

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def execute(self, statement):
        self.statements.append(str(statement))


class FakeEngine:
    def __init__(self):
        self.statements = []

    def connect(self):
        return FakeConnection(self.statements)


@pytest.mark.asyncio
async def test_database_readiness_executes_a_minimal_query(monkeypatch):
    fake_engine = FakeEngine()
    monkeypatch.setattr(readiness, "engine", fake_engine)

    assert await readiness.check_database() is True
    assert fake_engine.statements == ["SELECT 1"]


@pytest.mark.asyncio
async def test_database_readiness_times_out_while_opening_connection(monkeypatch):
    class HangingConnection:
        async def __aenter__(self):
            await asyncio.Event().wait()

        async def __aexit__(self, exc_type, exc, traceback):
            return False

    class HangingEngine:
        def connect(self):
            return HangingConnection()

    monkeypatch.setattr(readiness, "engine", HangingEngine())
    monkeypatch.setattr(readiness.settings, "readiness_timeout_seconds", 0.01)

    assert await readiness.check_database() is False


@pytest.mark.asyncio
async def test_redis_readiness_returns_false_when_ping_fails(monkeypatch):
    class FailingRedis:
        def ping(self):
            raise OSError("unavailable")

    monkeypatch.setattr(readiness, "get_redis_client", lambda: FailingRedis())

    assert await readiness.check_redis() is False


@pytest.mark.asyncio
async def test_collect_readiness_reports_each_dependency(monkeypatch):
    async def database_ok():
        return True

    async def redis_unavailable():
        return False

    monkeypatch.setattr(readiness, "check_database", database_ok)
    monkeypatch.setattr(readiness, "check_redis", redis_unavailable)

    assert await readiness.collect_readiness() == {
        "database": "ok",
        "redis": "error",
    }


@pytest.mark.asyncio
async def test_readiness_endpoint_returns_sanitized_service_unavailable(monkeypatch):
    from neurodatics import main

    async def unavailable_dependencies():
        return {"database": "error", "redis": "ok"}

    monkeypatch.setattr(main, "collect_readiness", unavailable_dependencies)
    response = await main.readiness_check()

    assert response.status_code == 503
    assert json.loads(response.body) == {
        "status": "not_ready",
        "dependencies": {"database": "error", "redis": "ok"},
    }

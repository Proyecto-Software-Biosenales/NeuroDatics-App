import pytest

from neurodatics.diagnostics import network_preflight


def test_database_target_omits_credentials():
    target = network_preflight.database_target(
        "postgresql+psycopg://postgres:super-secret@"
        "aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require"
    )

    assert target == {
        "host": "aws-1-us-east-2.pooler.supabase.com",
        "port": 6543,
        "sslmode": "require",
    }
    assert "super-secret" not in str(target)


@pytest.mark.asyncio
async def test_preflight_treats_any_http_response_as_reachable(monkeypatch):
    class FakeResponse:
        status_code = 401

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, url):
            return FakeResponse()

    monkeypatch.setattr(network_preflight.httpx, "AsyncClient", lambda **kwargs: FakeClient())

    assert await network_preflight.probe_https("openidconnect.googleapis.com", 1) == {
        "ok": True,
        "status_code": 401,
    }

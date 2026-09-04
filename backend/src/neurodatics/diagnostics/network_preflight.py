"""Check the required external connectivity without printing credentials or tokens.

Run inside either runtime container:
    python -m neurodatics.diagnostics.network_preflight
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict
from urllib.parse import parse_qs, urlsplit

import httpx
from sqlalchemy import text

from ..config.settings import settings
from ..infra.db.session import engine

logger = logging.getLogger(__name__)

GOOGLE_SERVER_HTTPS_HOSTS = (
    "oauth2.googleapis.com",
    "openidconnect.googleapis.com",
    "www.googleapis.com",
)


def database_target(database_url: str) -> Dict[str, Any]:
    """Extract only non-sensitive connection metadata for diagnostic output."""
    parsed_url = urlsplit(database_url)
    if not parsed_url.hostname:
        raise ValueError("DATABASE_URL does not contain a hostname.")

    query_params = parse_qs(parsed_url.query, keep_blank_values=True)
    return {
        "host": parsed_url.hostname,
        "port": parsed_url.port or 5432,
        "sslmode": query_params.get("sslmode", ["not-set"])[-1],
    }


def proxy_environment() -> Dict[str, bool]:
    """Expose only whether proxy variables are configured, never their values."""
    return {
        "http_proxy": bool(os.getenv("HTTP_PROXY") or os.getenv("http_proxy")),
        "https_proxy": bool(os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")),
        "no_proxy": bool(os.getenv("NO_PROXY") or os.getenv("no_proxy")),
    }


async def probe_tcp(host: str, port: int, timeout_seconds: float) -> Dict[str, Any]:
    """Test DNS and TCP reachability while returning a sanitized error class."""
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout_seconds,
        )
        writer.close()
        try:
            await writer.wait_closed()
        except Exception as exc:
            logger.warning("TCP probe stream cleanup failed (%s)", type(exc).__name__)
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__}


async def _execute_database_query() -> None:
    """Open a connection and execute the minimum query used by the preflight."""
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def probe_database(timeout_seconds: float) -> Dict[str, Any]:
    """Run a real query, covering credentials, TLS and the selected pooler."""
    try:
        await asyncio.wait_for(
            _execute_database_query(),
            timeout=timeout_seconds,
        )
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__}


async def probe_https(host: str, timeout_seconds: float) -> Dict[str, Any]:
    """Validate DNS, TCP, TLS and an HTTPS response, including configured proxies."""
    try:
        async with httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=True,
            trust_env=True,
        ) as client:
            response = await client.get(f"https://{host}/")
        # 4xx responses are expected for some OAuth/API roots and still prove
        # successful HTTPS connectivity.
        return {"ok": True, "status_code": response.status_code}
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__}


async def run_preflight() -> Dict[str, Any]:
    """Return a JSON-safe report and a boolean suitable for automation."""
    target = database_target(settings.database_url)
    tcp_result, database_result, *google_results = await asyncio.gather(
        probe_tcp(target["host"], target["port"], settings.network_preflight_timeout_seconds),
        probe_database(settings.network_preflight_timeout_seconds),
        *[
            probe_https(host, settings.network_preflight_timeout_seconds)
            for host in GOOGLE_SERVER_HTTPS_HOSTS
        ],
    )

    google = dict(zip(GOOGLE_SERVER_HTTPS_HOSTS, google_results))
    checks_ok = tcp_result["ok"] and database_result["ok"] and all(
        result["ok"] for result in google.values()
    )
    return {
        "status": "ok" if checks_ok else "failed",
        "database": {
            "target": target,
            "tcp": tcp_result,
            "query": database_result,
        },
        "google_https": google,
        "proxy_configured": proxy_environment(),
    }


def main() -> int:
    report = asyncio.run(run_preflight())
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())

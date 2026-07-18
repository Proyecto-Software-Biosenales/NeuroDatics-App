"""Dependency readiness checks kept separate from the lightweight liveness endpoint."""

from __future__ import annotations

import asyncio
import logging
from typing import Dict

from sqlalchemy import text

from ...config.settings import settings
from ..db.session import engine
from ..queue.redis_connection import get_redis_client

logger = logging.getLogger(__name__)


async def _execute_database_query() -> None:
    """Open a connection and execute the minimum database readiness query."""
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def check_database() -> bool:
    """Return whether the configured database accepts a minimal query."""
    try:
        await asyncio.wait_for(
            _execute_database_query(),
            timeout=settings.readiness_timeout_seconds,
        )
        return True
    except Exception as exc:  # A readiness endpoint must never leak connection details.
        logger.warning("Database readiness check failed: %s", type(exc).__name__)
        return False


async def check_redis() -> bool:
    """Return whether Redis responds without blocking the FastAPI event loop."""
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(get_redis_client().ping),
            timeout=settings.readiness_timeout_seconds,
        )
        return bool(result)
    except Exception as exc:  # A readiness endpoint must never leak connection details.
        logger.warning("Redis readiness check failed: %s", type(exc).__name__)
        return False


async def collect_readiness() -> Dict[str, str]:
    """Collect sanitized status for every dependency required by the API."""
    database_ok, redis_ok = await asyncio.gather(check_database(), check_redis())
    return {
        "database": "ok" if database_ok else "error",
        "redis": "ok" if redis_ok else "error",
    }

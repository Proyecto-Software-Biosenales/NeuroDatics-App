import json
import logging
from typing import Optional
from uuid import UUID

import redis as redis_lib

from ....infra.queue.redis_connection import get_redis_client

logger = logging.getLogger(__name__)


class AnalyticsRedisCache:
    """Cache for computed analytics results. Sync Redis wrapped for async callers."""

    TTL_SECONDS = 900  # 15 minutes, overridable from settings

    def __init__(self):
        self._client: Optional[redis_lib.Redis] = None

    @property
    def client(self) -> redis_lib.Redis:
        if self._client is None:
            self._client = get_redis_client()
        return self._client

    @staticmethod
    def build_key(project_id: UUID, participant_code: str, endpoint: str, scenario: str = "all") -> str:
        return f"analytics:{project_id}:{participant_code}:{endpoint}:{scenario}"

    def get_json(self, key: str) -> Optional[dict]:
        """Returns parsed JSON or None. Silently returns None if Redis unavailable."""
        try:
            raw = self.client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.warning("Redis read failed for key %s", key, exc_info=True)
            return None

    def set_json(self, key: str, data: dict, ttl: int | None = None) -> None:
        """Stores JSON. Silently skips if Redis unavailable."""
        try:
            from ....config.settings import settings

            _ttl = ttl or getattr(settings, "analytics_redis_ttl_seconds", self.TTL_SECONDS)
            self.client.set(key, json.dumps(data), ex=_ttl)
        except Exception:
            logger.warning("Redis write failed for key %s", key, exc_info=True)

    def get_bytes(self, key: str) -> Optional[bytes]:
        """Returns raw bytes or None. Silently returns None if Redis unavailable."""
        try:
            return self.client.get(key)
        except Exception:
            logger.warning("Redis read failed for key %s", key, exc_info=True)
            return None

    def set_bytes(self, key: str, data: bytes, ttl: int | None = None) -> None:
        """Stores raw bytes. Silently skips if Redis unavailable."""
        try:
            from ....config.settings import settings

            _ttl = ttl or getattr(settings, "analytics_redis_ttl_seconds", self.TTL_SECONDS)
            self.client.set(key, data, ex=_ttl)
        except Exception:
            logger.warning("Redis write failed for key %s", key, exc_info=True)

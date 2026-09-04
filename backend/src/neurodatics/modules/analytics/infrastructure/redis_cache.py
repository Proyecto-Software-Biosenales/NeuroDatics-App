import json
import logging
from typing import Optional
from uuid import UUID

import redis as redis_lib

from ....infra.queue.redis_connection import get_redis_client
from neurodatics.shared.cache_generation import (
    CACHE_GENERATION_PREFIX,
    generation_token,
    is_generation_token,
    normalize_generation,
)

logger = logging.getLogger(__name__)


def _escape_key_part(value: object) -> str:
    """Make a request-supplied value safe to place in a colon-separated key.

    ``participant_code`` and ``scenario`` arrive straight from query
    parameters, so a colon in either lets two different requests build the same
    key and read each other's cached analytics — participant "A" asking for
    scenario "x:y" would otherwise collide with participant "A:x" asking for
    "y". Escaping ``%`` first keeps the mapping reversible, so no pair of
    distinct inputs can produce the same escaped output.
    """

    return str(value).replace("%", "%25").replace(":", "%3A")


class AnalyticsRedisCache:
    """Cache for computed analytics results. Sync Redis wrapped for async callers."""

    TTL_SECONDS = 900  # 15 minutes, overridable from settings
    # Namespace bump retires the responses written before cache keys carried an
    # ingestion generation: those keys have nothing a re-ingestion can move away
    # from, so they would keep serving the previous upload's numbers.
    NAMESPACE = "screen-stimulus-v2"
    INVALIDATION_BATCH_SIZE = 500

    def __init__(self):
        self._client: Optional[redis_lib.Redis] = None

    @property
    def client(self) -> redis_lib.Redis:
        if self._client is None:
            self._client = get_redis_client()
        return self._client

    @staticmethod
    def build_key(
        project_id: UUID,
        participant_code: str,
        endpoint: str,
        scenario: str = "all",
        generation: object = 0,
    ) -> str:
        # The generation sits directly after the project id so the project-wide
        # invalidation pattern still matches every generation of this project,
        # and still cannot match another project's keys. Only the two
        # request-supplied fields are escaped; the endpoint is built here and
        # its colons are structural.
        return (
            f"analytics:{AnalyticsRedisCache.NAMESPACE}:{project_id}:"
            f"{generation_token(generation)}:{_escape_key_part(participant_code)}:"
            f"{endpoint}:{_escape_key_part(scenario)}"
        )

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

            _ttl = ttl or settings.analytics_redis_ttl_seconds
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

            _ttl = ttl or settings.analytics_redis_ttl_seconds
            self.client.set(key, data, ex=_ttl)
        except Exception:
            logger.warning("Redis write failed for key %s", key, exc_info=True)

    def invalidate_project(self, project_id: UUID) -> int:
        """Best-effort SCAN/delete of this namespace's keys for one project."""

        pattern = f"analytics:{self.NAMESPACE}:{project_id}:*"
        deleted = 0
        batch: list[bytes | str] = []
        try:
            for key in self.client.scan_iter(
                match=pattern,
                count=self.INVALIDATION_BATCH_SIZE,
            ):
                batch.append(key)
                if len(batch) >= self.INVALIDATION_BATCH_SIZE:
                    deleted += int(self.client.delete(*batch) or 0)
                    batch.clear()
            if batch:
                deleted += int(self.client.delete(*batch) or 0)
        except Exception:
            logger.warning(
                "Failed to invalidate Redis analytics cache for project %s",
                project_id,
                exc_info=True,
            )
        return deleted

    @staticmethod
    def _is_stale_generation_key(key: bytes | str, floor: int) -> bool:
        text = key.decode("utf-8", "replace") if isinstance(key, bytes) else str(key)
        fields = text.split(":")
        if len(fields) < 4 or not is_generation_token(fields[3]):
            # Written before the keys carried a generation, so nothing will ever
            # look it up again.
            return True
        return normalize_generation(fields[3][len(CACHE_GENERATION_PREFIX) :]) < floor

    def invalidate_stale_generations(
        self,
        project_id: UUID,
        keep_generation: object,
        *,
        keep_previous: int = 1,
        max_deletions: int = 5000,
    ) -> int:
        """Best-effort SCAN/delete of one project's superseded generation keys.

        The current generation survives, and so do the ``keep_previous``
        generations below it: a request that resolved the previous generation
        just before the swap still reads and writes those keys. Keys above the
        current generation are left alone, since they can only come from a bump
        this caller has not observed. The sweep stops after ``max_deletions`` so
        one re-ingestion cannot issue an unbounded number of deletes, and it
        returns a partial count rather than failing the upload behind it.
        """

        floor = normalize_generation(keep_generation) - max(0, int(keep_previous))
        pattern = f"analytics:{self.NAMESPACE}:{project_id}:*"
        deleted = 0
        selected = 0
        batch: list[bytes | str] = []
        try:
            for key in self.client.scan_iter(
                match=pattern,
                count=self.INVALIDATION_BATCH_SIZE,
            ):
                if selected >= max_deletions:
                    break
                if not self._is_stale_generation_key(key, floor):
                    continue
                batch.append(key)
                selected += 1
                if len(batch) >= self.INVALIDATION_BATCH_SIZE:
                    deleted += int(self.client.delete(*batch) or 0)
                    batch.clear()
            if batch:
                deleted += int(self.client.delete(*batch) or 0)
        except Exception:
            logger.warning(
                "Failed to prune stale Redis analytics generations for project %s",
                project_id,
                exc_info=True,
            )
        return deleted

from typing import Optional

import redis
from redis import ConnectionPool

from ...config.settings import settings


class RedisConnectionPool:
    """Singleton Redis connection pool."""

    _instance: Optional[redis.Redis] = None
    _pool: Optional[ConnectionPool] = None

    @classmethod
    def get_connection(cls) -> redis.Redis:
        if cls._instance is None:
            cls._pool = ConnectionPool.from_url(
                settings.redis_url,
                decode_responses=True,
                max_connections=10,
                socket_keepalive=True,
                socket_connect_timeout=settings.redis_socket_connect_timeout_seconds,
                socket_timeout=settings.redis_socket_timeout_seconds,
            )
            cls._instance = redis.Redis(connection_pool=cls._pool)
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Close and reset the connection pool. Useful for testing."""
        if cls._instance is not None:
            cls._instance.close()
        if cls._pool is not None:
            cls._pool.disconnect()
        cls._instance = None
        cls._pool = None


def get_redis_client() -> redis.Redis:
    """Convenience function to get a Redis client from the singleton pool."""
    return RedisConnectionPool.get_connection()

from typing import Optional

import redis
from redis import ConnectionPool

from ...config.settings import settings


def _create_redis_client(socket_timeout_seconds: Optional[float]) -> tuple[redis.Redis, ConnectionPool]:
    pool = ConnectionPool.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=10,
        socket_keepalive=True,
        socket_connect_timeout=settings.redis_socket_connect_timeout_seconds,
        socket_timeout=socket_timeout_seconds,
    )
    return redis.Redis(connection_pool=pool), pool


class RedisConnectionPool:
    """Singleton Redis connection pool."""

    _instance: Optional[redis.Redis] = None
    _pool: Optional[ConnectionPool] = None

    @classmethod
    def get_connection(cls) -> redis.Redis:
        if cls._instance is None:
            cls._instance, cls._pool = _create_redis_client(
                settings.redis_socket_timeout_seconds
            )
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


class RedisWorkerConnectionPool:
    """Redis connection pool for RQ's blocking dequeue loop."""

    _instance: Optional[redis.Redis] = None
    _pool: Optional[ConnectionPool] = None

    @classmethod
    def get_connection(cls) -> redis.Redis:
        if cls._instance is None:
            cls._instance, cls._pool = _create_redis_client(
                settings.redis_worker_socket_timeout_seconds
            )
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Close and reset the worker connection pool. Useful for testing."""
        if cls._instance is not None:
            cls._instance.close()
        if cls._pool is not None:
            cls._pool.disconnect()
        cls._instance = None
        cls._pool = None


def get_redis_client() -> redis.Redis:
    """Convenience function to get a Redis client from the singleton pool."""
    return RedisConnectionPool.get_connection()


def get_redis_worker_client() -> redis.Redis:
    """Return a Redis client suitable for RQ's long blocking reads."""
    return RedisWorkerConnectionPool.get_connection()

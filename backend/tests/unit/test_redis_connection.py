from neurodatics.infra.queue import redis_connection


class FakePool:
    def disconnect(self):
        pass


class FakeRedis:
    def __init__(self, connection_pool):
        self.connection_pool = connection_pool

    def close(self):
        pass


def test_api_and_worker_redis_clients_use_separate_read_timeouts(monkeypatch):
    calls = []

    def fake_from_url(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        return FakePool()

    monkeypatch.setattr(redis_connection.ConnectionPool, "from_url", fake_from_url)
    monkeypatch.setattr(redis_connection.redis, "Redis", FakeRedis)
    monkeypatch.setattr(redis_connection.settings, "redis_socket_connect_timeout_seconds", 3.0)
    monkeypatch.setattr(redis_connection.settings, "redis_socket_timeout_seconds", 3.0)
    monkeypatch.setattr(redis_connection.settings, "redis_worker_socket_timeout_seconds", 450.0)
    redis_connection.RedisConnectionPool.reset()
    redis_connection.RedisWorkerConnectionPool.reset()

    try:
        redis_connection.get_redis_client()
        redis_connection.get_redis_worker_client()

        assert calls[0]["kwargs"]["socket_connect_timeout"] == 3.0
        assert calls[0]["kwargs"]["socket_timeout"] == 3.0
        assert calls[1]["kwargs"]["socket_connect_timeout"] == 3.0
        assert calls[1]["kwargs"]["socket_timeout"] == 450.0
    finally:
        redis_connection.RedisConnectionPool.reset()
        redis_connection.RedisWorkerConnectionPool.reset()

from uuid import uuid4

from neurodatics.modules.analytics.infrastructure.parquet_cache import (
    ParquetCacheService,
)
from neurodatics.modules.analytics.infrastructure.redis_cache import AnalyticsRedisCache


def test_parquet_cache_invalidation_removes_only_the_requested_project(tmp_path):
    cache = ParquetCacheService()
    cache._cache_dir = tmp_path
    requested = uuid4()
    untouched = uuid4()
    cache.put(requested, "P-01", b"one")
    cache.put(requested, "P-02", b"two", 3)
    untouched_file = cache.put(untouched, "P-03", b"three")

    assert cache.invalidate_project(requested) is True

    assert not (tmp_path / str(requested)).exists()
    assert untouched_file.read_bytes() == b"three"


def test_parquet_cache_put_without_a_generation_stays_on_generation_zero(tmp_path):
    cache = ParquetCacheService()
    cache._cache_dir = tmp_path
    project_id = uuid4()

    default_path = cache.put(project_id, "P-01", b"one")
    explicit_path = cache.put(project_id, "P-01", b"two", 2)

    assert default_path.parent == tmp_path / str(project_id) / "g0"
    assert explicit_path.parent == tmp_path / str(project_id) / "g2"
    assert cache.get(project_id, "P-01") == default_path
    assert cache.get(project_id, "P-01", 2) == explicit_path
    assert default_path.read_bytes() == b"one"


def test_parquet_cache_invalidation_is_best_effort(tmp_path, monkeypatch):
    cache = ParquetCacheService()
    cache._cache_dir = tmp_path
    project_id = uuid4()
    cache.put(project_id, "P-01", b"one")

    def fail(_path):
        raise OSError("locked")

    monkeypatch.setattr(
        "neurodatics.modules.analytics.infrastructure.parquet_cache.shutil.rmtree",
        fail,
    )

    assert cache.invalidate_project(project_id) is False
    assert (tmp_path / str(project_id)).exists()


class _RedisClient:
    def __init__(self, keys):
        self.keys = list(keys)
        self.scan_calls = []
        self.delete_calls = []

    def scan_iter(self, *, match, count):
        self.scan_calls.append((match, count))
        yield from self.keys

    def delete(self, *keys):
        self.delete_calls.append(keys)
        return len(keys)


def test_redis_cache_uses_versioned_namespace_and_scan_batches_project_keys():
    project_id = uuid4()
    cache = AnalyticsRedisCache()
    client = _RedisClient([f"key-{index}" for index in range(505)])
    cache._client = client

    key = cache.build_key(project_id, "P-01", "fixations", "A", generation=3)
    deleted = cache.invalidate_project(project_id)

    # The generation token sits between the project id and the participant code,
    # so the project-wide pattern still matches every generation of this project.
    assert key == f"analytics:screen-stimulus-v2:{project_id}:g3:P-01:fixations:A"
    assert deleted == 505
    assert client.scan_calls == [
        (
            f"analytics:screen-stimulus-v2:{project_id}:*",
            cache.INVALIDATION_BATCH_SIZE,
        )
    ]
    assert [len(batch) for batch in client.delete_calls] == [500, 5]


def test_redis_cache_invalidation_is_best_effort():
    project_id = uuid4()
    cache = AnalyticsRedisCache()

    class BrokenClient:
        def scan_iter(self, **_kwargs):
            raise ConnectionError("offline")

    cache._client = BrokenClient()

    assert cache.invalidate_project(project_id) == 0

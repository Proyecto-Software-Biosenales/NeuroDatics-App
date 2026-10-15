"""The in-process cache answers the Redis calls the analytics cache makes."""

from neurodatics.infra.cache.memory_cache import InProcessCache


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_values_round_trip_with_the_type_they_were_stored_with():
    cache = InProcessCache()

    cache.set("json", '{"a": 1}')
    cache.set("png", b"\x89PNG")

    assert cache.get("json") == '{"a": 1}'
    assert cache.get("png") == b"\x89PNG"
    assert cache.get("missing") is None


def test_entries_expire_after_their_ttl():
    clock = Clock()
    cache = InProcessCache(clock=clock)

    cache.set("k", "v", ex=10)
    clock.now += 9
    assert cache.get("k") == "v"
    clock.now += 2
    assert cache.get("k") is None
    assert list(cache.scan_iter(match="*")) == []


def test_scan_matches_a_project_prefix_and_survives_deleting_while_iterating():
    cache = InProcessCache()
    for key in ("analytics:v2:P1:0:a", "analytics:v2:P1:1:b", "analytics:v2:P2:0:a"):
        cache.set(key, "x")

    matched = list(cache.scan_iter(match="analytics:v2:P1:*", count=500))
    deleted = cache.delete(*matched)

    assert sorted(matched) == ["analytics:v2:P1:0:a", "analytics:v2:P1:1:b"]
    assert deleted == 2
    assert cache.get("analytics:v2:P2:0:a") == "x"


def test_oldest_untouched_entries_are_evicted_to_stay_under_the_byte_limit():
    cache = InProcessCache(max_bytes=10)

    cache.set("old", "aaaa")
    cache.set("kept", "bbbb")
    cache.get("old")  # reading makes "old" the most recently used
    cache.set("new", "cccc")

    assert cache.get("kept") is None
    assert cache.get("old") == "aaaa" and cache.get("new") == "cccc"


def test_a_single_value_larger_than_the_limit_is_not_stored():
    cache = InProcessCache(max_bytes=4)

    assert cache.set("big", "12345") is False
    assert cache.get("big") is None


def test_replacing_a_key_does_not_double_count_its_bytes():
    cache = InProcessCache(max_bytes=10)

    for _ in range(5):
        cache.set("k", "12345678")

    assert cache.get("k") == "12345678"


def test_analytics_cache_works_on_top_of_it(monkeypatch):
    from neurodatics.modules.analytics.infrastructure import redis_cache

    cache = InProcessCache()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: cache)
    analytics = redis_cache.AnalyticsRedisCache()
    project = "00000000-0000-4000-8000-000000000009"
    key = analytics.build_key(project, "P1", "gsr", "S1", 3)

    analytics.set_json(key, {"value": 1})
    analytics.set_bytes(key + ":png", b"\x89PNG")

    assert analytics.get_json(key) == {"value": 1}
    assert analytics.get_bytes(key + ":png") == b"\x89PNG"
    assert analytics.invalidate_project(project) == 2
    assert analytics.get_json(key) is None

"""Cache identity is the whole freshness mechanism, so it has to be exact.

A generation that silently normalizes to the wrong number lets a superseded
entry answer for the current upload, and a participant path that escapes its
project directory hands one project's Parquet to another. Both failures are
invisible from a route, so they are pinned down here at the identity level.
"""

import fnmatch
import os
import shutil
from types import SimpleNamespace
from uuid import uuid4

import pytest

from neurodatics.modules.analytics.domain.cache_generation import (
    generation_token,
    is_generation_token,
    normalize_generation,
    project_cache_generation,
)
from neurodatics.modules.analytics.infrastructure.parquet_cache import (
    ParquetCacheService,
)
from neurodatics.modules.analytics.infrastructure.redis_cache import AnalyticsRedisCache


class _Unintable:
    """A database row can hand back anything; int() on it must not escape."""

    def __int__(self):
        raise TypeError("not a generation")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, 0),
        ("", 0),
        ("7", 7),
        (7, 7),
        (7.0, 7),
        (-3, 0),
        ("-3", 0),
        ("nonsense", 0),
        (_Unintable(), 0),
    ],
)
def test_normalize_generation_never_raises_and_never_goes_negative(value, expected):
    assert normalize_generation(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, "g0"), (0, "g0"), ("7", "g7"), (-3, "g0"), (7.0, "g7")],
)
def test_generation_token_renders_a_path_and_key_safe_token(value, expected):
    assert generation_token(value) == expected


@pytest.mark.parametrize("value", ["g0", "g7", "g07", "g4294967296"])
def test_is_generation_token_accepts_what_the_module_produces(value):
    assert is_generation_token(value) is True


@pytest.mark.parametrize(
    "value",
    ["", "g", "7", "gx", "g-1", "g1x", " g1", "g1 ", "g٧", None, 7],
)
def test_is_generation_token_rejects_everything_else(value):
    assert is_generation_token(value) is False


def test_project_cache_generation_tolerates_a_row_without_the_column():
    assert project_cache_generation(SimpleNamespace()) == 0
    assert project_cache_generation(SimpleNamespace(ingestion_generation=None)) == 0
    assert project_cache_generation(SimpleNamespace(ingestion_generation="4")) == 4


@pytest.fixture
def cache(tmp_path):
    service = ParquetCacheService()
    service._cache_dir = tmp_path
    return service


def test_two_generations_of_one_participant_are_readable_side_by_side(cache, tmp_path):
    project_id = uuid4()

    first = cache.put(project_id, "P-01", b"generation one", 1)
    second = cache.put(project_id, "P-01", b"generation two", 2)

    assert first != second
    # Writing the newer generation must not disturb the older one: a request that
    # resolved generation 1 just before the swap is still reading from it.
    assert first.read_bytes() == b"generation one"
    assert second.read_bytes() == b"generation two"
    assert cache.get(project_id, "P-01", 1) == first
    assert cache.get(project_id, "P-01", 2) == second


def test_a_traversing_participant_code_stays_inside_its_generation_directory(
    cache, tmp_path
):
    project_id = uuid4()

    path = cache.put(project_id, "../../evil", b"x")

    generation_dir = (tmp_path / str(project_id) / "g0").resolve()
    assert path.resolve().parent == generation_dir
    assert tmp_path.resolve() in path.resolve().parents


def test_two_projects_sharing_a_participant_code_cannot_read_each_other(cache):
    first_project = uuid4()
    second_project = uuid4()

    first = cache.put(first_project, "P-01", b"first project", 3)
    second = cache.put(second_project, "P-01", b"second project", 3)

    assert first != second
    assert first.read_bytes() == b"first project"
    assert second.read_bytes() == b"second project"


def test_participant_codes_that_slug_identically_do_not_collide(cache):
    project_id = uuid4()

    slashed = cache.put(project_id, "a/b", b"slashed")
    coloned = cache.put(project_id, "a:b", b"coloned")

    assert slashed != coloned
    assert slashed.read_bytes() == b"slashed"
    assert coloned.read_bytes() == b"coloned"


def test_a_failed_publish_leaves_neither_an_entry_nor_a_temp_file(
    cache, tmp_path, monkeypatch
):
    project_id = uuid4()

    def failing_replace(_source, _destination):
        raise OSError("publish failed")

    monkeypatch.setattr(os, "replace", failing_replace)

    with pytest.raises(OSError):
        cache.put(project_id, "P-01", b"one", 4)

    generation_dir = tmp_path / str(project_id) / "g4"
    assert generation_dir.is_dir()
    # A half-written entry would be read as a valid Parquet, and a leftover temp
    # file would accumulate on every failed publish.
    assert list(generation_dir.iterdir()) == []


def _generation_dirs(cache, project_id, numbers):
    return {
        number: cache.put(project_id, "P-01", f"gen {number}".encode(), number).parent
        for number in numbers
    }


def test_pruning_keeps_the_current_generation_and_the_one_below_it(cache):
    project_id = uuid4()
    directories = _generation_dirs(cache, project_id, range(1, 6))

    removed = cache.prune_stale_generations(project_id, 5, keep_previous=1)

    assert removed == 3
    assert [number for number, path in sorted(directories.items()) if path.exists()] == [
        4,
        5,
    ]


def test_a_capped_prune_removes_the_oldest_generation_first(cache):
    project_id = uuid4()
    directories = _generation_dirs(cache, project_id, range(1, 6))

    removed = cache.prune_stale_generations(
        project_id,
        5,
        keep_previous=1,
        max_removals=1,
    )

    assert removed == 1
    assert not directories[1].exists()
    assert all(directories[number].exists() for number in (2, 3, 4, 5))


def test_pruning_never_touches_a_directory_it_did_not_create(cache, tmp_path):
    project_id = uuid4()
    _generation_dirs(cache, project_id, range(1, 4))
    sibling = tmp_path / str(project_id) / "scratch"
    sibling.mkdir()
    (sibling / "keep.txt").write_text("keep", encoding="utf-8")

    cache.prune_stale_generations(project_id, 3, keep_previous=0)

    assert (sibling / "keep.txt").read_text(encoding="utf-8") == "keep"


def test_a_failed_removal_returns_the_partial_count(cache, monkeypatch):
    project_id = uuid4()
    directories = _generation_dirs(cache, project_id, range(1, 6))
    real_rmtree = shutil.rmtree
    attempts = []

    def flaky_rmtree(path, *args, **kwargs):
        attempts.append(path)
        if len(attempts) > 1:
            raise OSError("locked")
        real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(
        "neurodatics.modules.analytics.infrastructure.parquet_cache.shutil.rmtree",
        flaky_rmtree,
    )

    assert cache.prune_stale_generations(project_id, 5, keep_previous=1) == 1
    assert not directories[1].exists()
    assert directories[2].exists()
    assert directories[3].exists()


def _key(project_id, generation, participant="P-01"):
    return AnalyticsRedisCache.build_key(
        project_id,
        participant,
        "fixations",
        "all",
        generation,
    )


class _RecordingRedis:
    """SCAN/DELETE client that honours the match pattern the way Redis does."""

    def __init__(self, keys, fail_after_delete_calls=None):
        self.keys = list(keys)
        self.deleted = []
        self.delete_calls = 0
        self._fail_after_delete_calls = fail_after_delete_calls

    def scan_iter(self, *, match, count):
        for key in list(self.keys):
            if fnmatch.fnmatchcase(key, match):
                yield key

    def delete(self, *keys):
        self.delete_calls += 1
        if (
            self._fail_after_delete_calls is not None
            and self.delete_calls > self._fail_after_delete_calls
        ):
            raise ConnectionError("offline")
        self.deleted.extend(keys)
        return len(keys)


def test_build_key_separates_generations_and_projects():
    first_project = uuid4()
    second_project = uuid4()

    assert _key(first_project, 1) == (
        f"analytics:{AnalyticsRedisCache.NAMESPACE}:{first_project}"
        ":g1:P-01:fixations:all"
    )
    assert _key(first_project, 1) != _key(first_project, 2)
    assert _key(first_project, 1) != _key(second_project, 1)
    assert (
        len(
            {
                _key(first_project, 1),
                _key(first_project, 2),
                _key(second_project, 1),
                _key(second_project, 2),
            }
        )
        == 4
    )


def test_stale_generation_sweep_keeps_the_current_and_previous_generation():
    project_id = uuid4()
    other_project = uuid4()
    pre_generation_key = (
        f"analytics:{AnalyticsRedisCache.NAMESPACE}:{project_id}:P-01:fixations:all"
    )
    client = _RecordingRedis(
        [_key(project_id, generation) for generation in (1, 2, 3, 4, 5, 6)]
        + [pre_generation_key, _key(other_project, 1)]
    )
    cache = AnalyticsRedisCache()
    cache._client = client

    deleted = cache.invalidate_stale_generations(project_id, 5, keep_previous=1)

    assert deleted == 4
    assert set(client.deleted) == {
        _key(project_id, 1),
        _key(project_id, 2),
        _key(project_id, 3),
        # Written before the keys carried a generation, so nothing can reach it.
        pre_generation_key,
    }


def test_stale_generation_sweep_stops_at_max_deletions():
    project_id = uuid4()
    client = _RecordingRedis([_key(project_id, generation) for generation in (1, 2, 3)])
    cache = AnalyticsRedisCache()
    cache._client = client

    deleted = cache.invalidate_stale_generations(
        project_id,
        5,
        keep_previous=1,
        max_deletions=2,
    )

    assert deleted == 2
    assert len(client.deleted) == 2


def test_stale_generation_sweep_returns_a_partial_count_when_redis_dies():
    project_id = uuid4()
    client = _RecordingRedis(
        [_key(project_id, 1, f"P-{index:03d}") for index in range(505)],
        fail_after_delete_calls=1,
    )
    cache = AnalyticsRedisCache()
    cache._client = client

    deleted = cache.invalidate_stale_generations(project_id, 5, keep_previous=1)

    assert deleted == 500


def test_stale_generation_sweep_never_raises_when_scanning_fails():
    class BrokenClient:
        def scan_iter(self, **_kwargs):
            raise ConnectionError("offline")

    cache = AnalyticsRedisCache()
    cache._client = BrokenClient()

    assert cache.invalidate_stale_generations(uuid4(), 5) == 0


def _symlink_or_skip(link: os.PathLike, target: os.PathLike) -> None:
    """Windows needs developer mode or elevation to create directory links."""

    try:
        os.symlink(target, link, target_is_directory=True)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"cannot create a directory symlink here: {exc}")


def test_a_redirected_project_directory_cannot_invalidate_another_project(cache, tmp_path):
    victim = uuid4()
    attacker = uuid4()
    kept = cache.put(victim, "P-01", b"victim bytes", 0)
    _symlink_or_skip(tmp_path / str(attacker), tmp_path / str(victim))

    # Resolving only proves the target sits inside the cache root; it never
    # proves the target is the entry that was named, so a sibling link would
    # otherwise let one project rmtree another's cache.
    assert cache.invalidate_project(attacker) is False
    assert kept.read_bytes() == b"victim bytes"


def test_a_redirected_generation_directory_cannot_delete_the_live_one(cache, tmp_path):
    project_id = uuid4()
    live = cache.put(project_id, "P-01", b"live", 9)
    stale = cache.put(project_id, "P-01", b"stale", 2)
    _symlink_or_skip(tmp_path / str(project_id) / "g1", live.parent)

    removed = cache.prune_stale_generations(project_id, 9, keep_previous=1)

    # The name says g1 and the target is the current generation; deleting by
    # name would reclaim the only directory still being served.
    assert live.read_bytes() == b"live"
    assert not stale.parent.exists()
    assert removed == 1


def test_pruning_protects_the_numeric_window_not_merely_the_highest_survivor(cache):
    project_id = uuid4()
    directories = _generation_dirs(cache, project_id, [3, 10])

    removed = cache.prune_stale_generations(project_id, 10, keep_previous=1)

    # g9 is the only generation a reader can still be holding. Keeping g3 just
    # because it is the highest that happens to exist would also disagree with
    # the Redis sweep, which drops everything below the same numeric floor.
    assert removed == 1
    assert not directories[3].exists()
    assert directories[10].exists()


def test_a_generation_reclaimed_mid_read_reports_a_miss(cache, monkeypatch):
    project_id = uuid4()
    path = cache.put(project_id, "P-01", b"bytes", 4)

    def vanish(_path):
        raise OSError("directory removed by a concurrent sweep")

    monkeypatch.setattr(
        "neurodatics.modules.analytics.infrastructure.parquet_cache.pd.read_parquet",
        vanish,
    )

    # A miss sends the caller back to Drive; raising would turn a benign cache
    # race into a failed analytics request.
    assert cache.read_dataframe(project_id, "P-01", 4) is None
    assert path.exists()


def test_request_supplied_key_fields_cannot_forge_another_key():
    project_id = uuid4()

    collided = AnalyticsRedisCache.build_key(project_id, "A", "endpoint", "x:y", generation=3)
    genuine = AnalyticsRedisCache.build_key(project_id, "A", "endpoint:x", "y", generation=3)

    # participant_code and scenario arrive from query parameters, so an
    # unescaped colon would let one request read another's cached analytics.
    assert collided != genuine


def test_a_scenario_named_like_the_metadata_suffix_cannot_forge_that_key():
    project_id = uuid4()

    primary = AnalyticsRedisCache.build_key(project_id, "P-01", "heatmap", "X", generation=3)
    forged = AnalyticsRedisCache.build_key(
        project_id, "P-01", "heatmap", "X:metadata", generation=3
    )

    # The heatmap stores its metadata at f"{cache_key}:metadata".
    assert forged != f"{primary}:metadata"

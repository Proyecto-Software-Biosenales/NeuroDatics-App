"""Media caches are a space problem, so the sweep has to be bounded and blind.

Entries are keyed by file id or content, so a re-upload orphans the previous
copy instead of overwriting it and the directory grows forever. Reclaiming that
space runs behind a committed upload, which means it must never delete anything
it did not write, never remove more than its cap allows, and never raise at an
entry that is locked or already gone.
"""

import os
import time
from pathlib import Path
from uuid import uuid4

from neurodatics.config.settings import settings
from neurodatics.modules.projects.infrastructure.media_cache_janitor import (
    prune_media_cache_dir,
    prune_media_caches,
)


def _write(directory, name, *, size=100, age_seconds=0.0):
    path = directory / name
    path.write_bytes(b"x" * size)
    stamp = time.time() - age_seconds
    os.utime(path, (stamp, stamp))
    return path


def test_the_oldest_entries_go_first_until_the_directory_fits(tmp_path):
    oldest = _write(tmp_path, "oldest", age_seconds=300)
    middle = _write(tmp_path, "middle", age_seconds=200)
    newest = _write(tmp_path, "newest", age_seconds=100)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=150,
        max_age_seconds=3600,
        max_removals=10,
    )

    assert not oldest.exists()
    assert not middle.exists()
    assert newest.exists()
    assert result.scanned_files == 3
    assert result.removed_files == 2
    assert result.removed_bytes == 200
    assert result.truncated is False


def test_expired_entries_go_even_when_the_directory_is_inside_its_budget(tmp_path):
    expired = _write(tmp_path, "expired", age_seconds=7200)
    recent = _write(tmp_path, "recent", age_seconds=10)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=10**9,
        max_age_seconds=3600,
        max_removals=10,
    )

    assert not expired.exists()
    assert recent.exists()
    assert result.removed_files == 1
    assert result.truncated is False


def test_the_removal_cap_stops_the_sweep_and_is_reported(tmp_path):
    oldest = _write(tmp_path, "oldest", age_seconds=300)
    middle = _write(tmp_path, "middle", age_seconds=200)
    newest = _write(tmp_path, "newest", age_seconds=100)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=0,
        max_age_seconds=0,
        max_removals=1,
    )

    assert not oldest.exists()
    assert middle.exists()
    assert newest.exists()
    assert result.removed_files == 1
    # A directory still over budget has to be distinguishable from one that fits.
    assert result.truncated is True


def test_an_image_and_its_mime_sidecar_count_as_one_removal(tmp_path):
    name = str(uuid4())
    image = _write(tmp_path, name, size=100, age_seconds=7200)
    sidecar = _write(tmp_path, f"{name}.mime", size=10, age_seconds=7200)
    orphan_sidecar = _write(tmp_path, f"{uuid4()}.mime", size=10, age_seconds=7200)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=10**9,
        max_age_seconds=3600,
        max_removals=2,
    )

    assert not image.exists()
    assert not sidecar.exists()
    # A sidecar with no image left to describe is reaped on its own.
    assert not orphan_sidecar.exists()
    assert result.removed_files == 3
    assert result.removed_bytes == 120
    assert result.truncated is False


def test_subdirectories_are_never_removed(tmp_path):
    nested = tmp_path / "nested"
    nested.mkdir()
    protected = _write(nested, "inner", age_seconds=7200)
    stale = _write(tmp_path, "stale", age_seconds=7200)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=0,
        max_age_seconds=0,
        max_removals=10,
    )

    assert nested.is_dir()
    assert protected.exists()
    assert not stale.exists()
    assert result.scanned_files == 1


def test_a_missing_directory_returns_a_zeroed_result_and_is_not_created(tmp_path):
    missing = tmp_path / "not-there"

    result = prune_media_cache_dir(
        missing,
        max_bytes=0,
        max_age_seconds=0,
        max_removals=10,
    )

    assert not missing.exists()
    assert result.scanned_files == 0
    assert result.removed_files == 0
    assert result.removed_bytes == 0
    assert result.truncated is False


def test_an_unremovable_entry_is_skipped_rather_than_raising(tmp_path, monkeypatch):
    locked = _write(tmp_path, "locked", age_seconds=7200)
    removable = _write(tmp_path, "removable", age_seconds=7100)
    real_unlink = Path.unlink

    def flaky_unlink(self, *args, **kwargs):
        if self.name == "locked":
            raise PermissionError("in use")
        return real_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", flaky_unlink)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=0,
        max_age_seconds=0,
        max_removals=10,
    )

    assert locked.exists()
    assert not removable.exists()
    assert result.removed_files == 1
    assert result.removed_bytes == 100


def test_an_entry_that_vanishes_mid_sweep_does_not_raise(tmp_path, monkeypatch):
    _write(tmp_path, "vanishing", age_seconds=7200)
    real_unlink = Path.unlink

    def vanishing_unlink(self, *args, **kwargs):
        if self.name == "vanishing":
            raise FileNotFoundError("already gone")
        return real_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", vanishing_unlink)

    result = prune_media_cache_dir(
        tmp_path,
        max_bytes=0,
        max_age_seconds=0,
        max_removals=10,
    )

    assert result.scanned_files == 1
    assert result.removed_bytes == 0


def test_prune_media_caches_sweeps_every_configured_media_directory(
    tmp_path, monkeypatch
):
    directories = []
    for setting in ("image_cache_dir", "video_cache_dir", "video_frame_cache_dir"):
        directory = tmp_path / setting
        directory.mkdir()
        _write(directory, "stale", age_seconds=7200)
        monkeypatch.setattr(settings, setting, str(directory))
        directories.append(directory)
    monkeypatch.setattr(settings, "media_cache_max_bytes", 10**9)
    monkeypatch.setattr(settings, "media_cache_max_age_hours", 1)
    monkeypatch.setattr(settings, "media_cache_prune_max_removals", 10)

    results = prune_media_caches()

    assert [result.removed_files for result in results] == [1, 1, 1]
    assert all(not (directory / "stale").exists() for directory in directories)

from __future__ import annotations

import logging
import stat
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from ....config.settings import settings

logger = logging.getLogger(__name__)

_MIME_SIDECAR_SUFFIX = ".mime"


@dataclass(frozen=True)
class MediaCachePruneResult:
    directory: str
    scanned_files: int
    removed_files: int
    removed_bytes: int
    truncated: bool


def _empty_result(directory: object) -> MediaCachePruneResult:
    return MediaCachePruneResult(
        directory=str(directory),
        scanned_files=0,
        removed_files=0,
        removed_bytes=0,
        truncated=False,
    )


def _unlink(path: Path) -> Optional[int]:
    """Remove one file, returning the bytes freed, or None when it could not be removed."""

    try:
        size = path.lstat().st_size
    except FileNotFoundError:
        return 0
    except OSError as exc:
        logger.warning("Failed to stat media cache entry %s: %s", path, exc)
        return None

    try:
        path.unlink()
    except FileNotFoundError:
        return 0
    except OSError as exc:
        logger.warning("Failed to remove media cache entry %s: %s", path, exc)
        return None

    return size


def prune_media_cache_dir(
    directory: str | Path,
    *,
    max_bytes: int,
    max_age_seconds: int,
    max_removals: int,
) -> MediaCachePruneResult:
    """Reap oldest-first from one media cache directory until it is inside budget.

    Media entries are keyed by ProjectFile id or by a content cache key, so a
    re-upload orphans the previous generation instead of overwriting it: this is
    a space problem, not a freshness problem, and the sweep only ever removes
    direct children that are plain files. Symlinks and subdirectories are left
    alone so a tampered cache root cannot turn a budget sweep into a recursive
    delete somewhere else on the volume.
    """

    max_removals = max(0, int(max_removals))

    try:
        root = Path(directory).resolve()
    except OSError as exc:
        logger.warning("Failed to resolve media cache directory %s: %s", directory, exc)
        return _empty_result(directory)

    try:
        if not root.is_dir():
            return _empty_result(root)
        children = list(root.iterdir())
    except OSError as exc:
        logger.warning("Failed to list media cache directory %s: %s", root, exc)
        return _empty_result(root)

    entries: list[tuple[Path, int, float]] = []
    total_bytes = 0
    for child in children:
        try:
            info = child.lstat()
            if not stat.S_ISREG(info.st_mode):
                continue
            if child.resolve().parent != root:
                logger.warning("Skipping media cache entry outside %s: %s", root, child)
                continue
        except OSError:
            continue
        entries.append((child, info.st_size, info.st_mtime))
        total_bytes += info.st_size

    sizes_by_name = {path.name: size for path, size, _ in entries}
    entries.sort(key=lambda entry: entry[2])

    now = time.time()
    removed_files = 0
    removed_bytes = 0
    used_slots = 0
    truncated = False

    for path, size, mtime in entries:
        if path.name.endswith(_MIME_SIDECAR_SUFFIX):
            # Removed together with its image below; reaped on its own only when orphaned.
            if path.name[: -len(_MIME_SIDECAR_SUFFIX)] in sizes_by_name:
                continue

        # Entries are oldest first, so once one is young enough and the directory
        # fits the budget, everything after it is too.
        if (now - mtime) <= max_age_seconds and total_bytes <= max_bytes:
            break

        if used_slots >= max_removals:
            truncated = True
            break

        freed = _unlink(path)
        if freed is None:
            continue

        # One image plus its mime sidecar is a single logical removal, so the
        # sidecar never consumes a second slot; its bytes still count as freed.
        used_slots += 1
        removed_files += 1
        removed_bytes += freed
        total_bytes -= size

        sidecar_size = sizes_by_name.get(f"{path.name}{_MIME_SIDECAR_SUFFIX}")
        if sidecar_size is None:
            continue
        sidecar_freed = _unlink(root / f"{path.name}{_MIME_SIDECAR_SUFFIX}")
        if sidecar_freed is None:
            continue
        removed_files += 1
        removed_bytes += sidecar_freed
        total_bytes -= sidecar_size

    return MediaCachePruneResult(
        directory=str(root),
        scanned_files=len(entries),
        removed_files=removed_files,
        removed_bytes=removed_bytes,
        truncated=truncated,
    )


def prune_media_caches() -> list[MediaCachePruneResult]:
    """Sweep the image, video and video-frame caches. Each gets its own budget."""

    max_bytes = int(getattr(settings, "media_cache_max_bytes", 2 * 1024 * 1024 * 1024))
    max_age_seconds = int(getattr(settings, "media_cache_max_age_hours", 72)) * 3600
    max_removals = int(getattr(settings, "media_cache_prune_max_removals", 500))

    directories = (
        getattr(settings, "image_cache_dir", "/data/image_cache"),
        getattr(settings, "video_cache_dir", "/data/video_cache"),
        getattr(settings, "video_frame_cache_dir", "/data/video_frame_cache"),
    )

    results: list[MediaCachePruneResult] = []
    for directory in directories:
        try:
            result = prune_media_cache_dir(
                directory,
                max_bytes=max_bytes,
                max_age_seconds=max_age_seconds,
                max_removals=max_removals,
            )
        except Exception:
            logger.warning("Media cache prune failed for %s", directory, exc_info=True)
            continue
        if result.truncated:
            # An incomplete sweep must be visible: otherwise a directory that is
            # still over budget looks identical to one that fits.
            logger.warning(
                "Media cache prune hit the %s-removal cap for %s and left it over budget",
                max_removals,
                result.directory,
            )
        results.append(result)

    return results

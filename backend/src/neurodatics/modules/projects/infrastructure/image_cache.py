"""Shared cached access to authenticated project images.

HTTP routes and reports both resolve/authorize ``ProjectFile`` rows before
calling this module.  The cache accepts only immutable scalar file identity and
never imports a controller or touches the database.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Tuple
from uuid import UUID, uuid4

from ....config.settings import settings
from ...analytics.infrastructure.singleflight import SingleFlight, settled_thread

logger = logging.getLogger(__name__)

IMAGE_CACHE_TTL_SECONDS = 300
IMAGE_CACHE_MAX_ITEMS = 256
IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class ProjectImageRef:
    file_id: UUID
    external_id: str
    mime_type: str
    cache_key: str


@dataclass(frozen=True)
class CachedProjectImage:
    content: bytes
    mime_type: str
    etag: str
    cache_status: str


_cache_lock = asyncio.Lock()
_cache_total_bytes = 0
_cache_store: "OrderedDict[str, Tuple[float, bytes, str, str]]" = OrderedDict()
image_flights = SingleFlight(max_running=2, max_queued=16, max_consumers=128, timeout=120.0)


def project_file_cache_key(project_file: Any) -> str:
    updated_at = getattr(project_file, "updated_at", None)
    updated_at_part = updated_at.isoformat() if updated_at else "0"
    return f"{project_file.id}:{project_file.external_id}:{updated_at_part}"


def build_image_etag(cache_key: str) -> str:
    return f'"{hashlib.sha1(cache_key.encode("utf-8")).hexdigest()}"'


def project_image_ref(project_file: Any) -> ProjectImageRef:
    mime_type = str(getattr(project_file, "mime_type", "") or "")
    if not mime_type.startswith("image/"):
        raise ValueError("Requested file is not an image")
    external_id = str(getattr(project_file, "external_id", "") or "")
    if not external_id:
        raise FileNotFoundError("File storage reference not found")
    return ProjectImageRef(
        file_id=project_file.id,
        external_id=external_id,
        mime_type=mime_type,
        cache_key=project_file_cache_key(project_file),
    )


def _disk_cache_paths(cache_key: str) -> Tuple[Path, Path]:
    base = Path(settings.image_cache_dir)
    base.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()
    return base / f"{digest}.image", base / f"{digest}.json"


def _read_disk_cache(ref: ProjectImageRef) -> Optional[Tuple[bytes, str]]:
    try:
        image_path, metadata_path = _disk_cache_paths(ref.cache_key)
        if not image_path.exists() or not metadata_path.exists():
            return None
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if (
            metadata.get("version") != 1
            or metadata.get("cache_key") != ref.cache_key
            or metadata.get("mime_type") != ref.mime_type
        ):
            return None
        content = image_path.read_bytes()
        if (
            metadata.get("size") != len(content)
            or metadata.get("sha256") != hashlib.sha256(content).hexdigest()
        ):
            return None
        return content, ref.mime_type
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return None


def _write_disk_cache(ref: ProjectImageRef, content: bytes) -> None:
    image_temp = None
    metadata_temp = None
    try:
        image_path, metadata_path = _disk_cache_paths(ref.cache_key)
        token = uuid4().hex
        image_temp = image_path.with_name(f"{image_path.name}.{token}.part")
        metadata_temp = metadata_path.with_name(f"{metadata_path.name}.{token}.part")
        image_temp.write_bytes(content)
        metadata_temp.write_text(
            json.dumps(
                {
                    "version": 1,
                    "cache_key": ref.cache_key,
                    "mime_type": ref.mime_type,
                    "size": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        image_temp.replace(image_path)
        metadata_temp.replace(metadata_path)
    except OSError as exc:
        logger.warning("Failed to write image disk cache for %s: %s", ref.file_id, exc)
    finally:
        for temporary in (image_temp, metadata_temp):
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass


async def _get_memory_cached(cache_key: str) -> Optional[Tuple[bytes, str, str]]:
    global _cache_total_bytes

    now = time.time()
    async with _cache_lock:
        cached = _cache_store.get(cache_key)
        if not cached:
            return None
        expires_at, content, mime_type, etag = cached
        if expires_at <= now:
            _cache_total_bytes -= len(content)
            _cache_store.pop(cache_key, None)
            return None
        _cache_store.move_to_end(cache_key)
        return content, mime_type, etag


async def _set_memory_cached(
    cache_key: str,
    content: bytes,
    mime_type: str,
    etag: str,
) -> None:
    global _cache_total_bytes

    if len(content) > IMAGE_CACHE_MAX_BYTES // 2:
        return
    expires_at = time.time() + IMAGE_CACHE_TTL_SECONDS
    async with _cache_lock:
        previous = _cache_store.pop(cache_key, None)
        if previous:
            _cache_total_bytes -= len(previous[1])
        _cache_store[cache_key] = (expires_at, content, mime_type, etag)
        _cache_total_bytes += len(content)
        while _cache_store and (
            len(_cache_store) > IMAGE_CACHE_MAX_ITEMS
            or _cache_total_bytes > IMAGE_CACHE_MAX_BYTES
        ):
            _, evicted = _cache_store.popitem(last=False)
            _cache_total_bytes -= len(evicted[1])


async def get_cached_project_image(ref: ProjectImageRef) -> Optional[CachedProjectImage]:
    """Read the shared disk/memory tiers without accessing remote storage."""

    etag = build_image_etag(ref.cache_key)
    disk_cached = await settled_thread(lambda: _read_disk_cache(ref))
    if disk_cached:
        content, mime_type = disk_cached
        await _set_memory_cached(ref.cache_key, content, mime_type, etag)
        return CachedProjectImage(content, mime_type, etag, "DISK")

    memory_cached = await _get_memory_cached(ref.cache_key)
    if memory_cached:
        content, mime_type, cached_etag = memory_cached
        return CachedProjectImage(content, mime_type, cached_etag, "HIT")
    return None


async def load_project_image(
    ref: ProjectImageRef,
    storage_client: Any,
) -> CachedProjectImage:
    """Return cached bytes or download once per identity in this process."""

    cached = await get_cached_project_image(ref)
    if cached is not None:
        return cached
    if storage_client is None:
        raise RuntimeError("Storage integration not configured")

    async def download() -> CachedProjectImage:
        cached_after_admission = await get_cached_project_image(ref)
        if cached_after_admission is not None:
            return cached_after_admission
        content = await settled_thread(
            lambda: storage_client.download_file_content(ref.external_id)
        )
        await settled_thread(
            lambda: _write_disk_cache(ref, content)
        )
        etag = build_image_etag(ref.cache_key)
        await _set_memory_cached(ref.cache_key, content, ref.mime_type, etag)
        return CachedProjectImage(content, ref.mime_type, etag, "MISS")

    return await image_flights.run(ref.cache_key, download)

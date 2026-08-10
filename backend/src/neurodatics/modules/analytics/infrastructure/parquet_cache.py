import hashlib
import logging
import os
import re
import shutil
import time
from pathlib import Path
from typing import List, Optional, Tuple
from uuid import UUID, uuid4

import pandas as pd

from ....config.settings import settings
from ..domain.cache_generation import (
    CACHE_GENERATION_PREFIX,
    generation_token,
    is_generation_token,
    normalize_generation,
)

logger = logging.getLogger(__name__)

_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9_-]")


def _is_redirected(path: Path) -> bool:
    """True when ``path`` is a link that resolves somewhere other than itself.

    Containment checks that only ask "does the resolved target sit inside the
    cache root" accept a symlink or Windows junction pointing at a *sibling*,
    which is enough to make one project's invalidation delete another project's
    directory, or make a stale generation name redirect onto the live one.
    Comparing the resolved target against the literal path closes that gap.
    """

    try:
        return os.path.normcase(str(path.resolve())) != os.path.normcase(str(path))
    except OSError:
        return True


def _safe_participant_filename(participant_code: str) -> str:
    """Turn a participant code into a filename that stays inside its directory.

    The code comes from an uploaded CSV, so a "../" or a drive letter in it
    would resolve outside the project's cache directory and let one project
    read or overwrite another project's entry. The hash suffix keeps two
    distinct codes apart once the slug has flattened whatever made them differ
    ("P/01" and "P 01" both slugify to "P_01").
    """

    code = str(participant_code)
    slug = _UNSAFE_FILENAME_CHARS.sub("_", code)[:40]
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()[:16]
    return f"{slug}-{digest}.parquet"


class ParquetCacheService:
    """Local disk cache for participant Parquet files."""

    def __init__(self) -> None:
        self._cache_dir = Path(getattr(settings, "parquet_cache_dir", "/data/parquet_cache"))
        ttl_hours = getattr(settings, "parquet_cache_ttl_hours", 4)
        self._ttl_seconds = int(ttl_hours) * 3600

    def _generation_dir(self, project_id: UUID, generation: object = 0) -> Path:
        return self._cache_dir / str(project_id) / generation_token(generation)

    def _path_for(self, project_id: UUID, participant_code: str, generation: object = 0) -> Path:
        return self._generation_dir(project_id, generation) / _safe_participant_filename(
            participant_code
        )

    def get(
        self, project_id: UUID, participant_code: str, generation: object = 0
    ) -> Optional[Path]:
        path = self._path_for(project_id, participant_code, generation)
        if not path.exists():
            return None

        age_seconds = time.time() - path.stat().st_mtime
        if age_seconds > self._ttl_seconds:
            return None

        return path

    def put(
        self,
        project_id: UUID,
        participant_code: str,
        content: bytes,
        generation: object = 0,
    ) -> Path:
        path = self._path_for(project_id, participant_code, generation)
        path.parent.mkdir(parents=True, exist_ok=True)
        # A concurrent reader must never open a partially written Parquet, so
        # the bytes land on a sibling temp file and the rename publishes them
        # in one step. The temp file is a sibling so the rename stays on one
        # filesystem and cannot degrade into a copy.
        tmp_path = path.parent / f".{path.name}.{uuid4().hex}.tmp"
        try:
            tmp_path.write_bytes(content)
            os.replace(tmp_path, path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise
        return path

    def read_dataframe(
        self, project_id: UUID, participant_code: str, generation: object = 0
    ) -> Optional[pd.DataFrame]:
        path = self.get(project_id, participant_code, generation)
        if path is None:
            return None
        try:
            return pd.read_parquet(path)
        except OSError:
            # A sweep may have reclaimed this generation between the existence
            # check and the read. Report a miss so the caller re-downloads from
            # Drive instead of failing the request over a cache race.
            logger.info(
                "Parquet cache entry vanished while being read: %s", path, exc_info=True
            )
            return None

    def invalidate_project(self, project_id: UUID) -> bool:
        """Best-effort removal of one project's local Parquet cache directory.

        Refuses to act on a redirected path so a malformed directory or symlink
        cannot turn project-scoped invalidation into a recursive delete
        elsewhere. Callers may run this after a successful re-ingestion without
        making a cache outage fail the committed upload.
        """

        try:
            cache_root = self._cache_dir.resolve()
            project_dir = cache_root / str(project_id)
            if project_dir.parent != cache_root or _is_redirected(project_dir):
                logger.warning(
                    "Refusing Parquet cache invalidation outside cache root: %s",
                    project_dir,
                )
                return False
            if not project_dir.exists():
                return True
            if not project_dir.is_dir():
                logger.warning(
                    "Refusing Parquet cache invalidation because target is not a directory: %s",
                    project_dir,
                )
                return False
            shutil.rmtree(project_dir)
            return True
        except Exception:
            logger.warning(
                "Failed to invalidate Parquet cache for project %s",
                project_id,
                exc_info=True,
            )
            return False

    def prune_stale_generations(
        self,
        project_id: UUID,
        keep_generation: object,
        *,
        keep_previous: int = 1,
        max_removals: int = 32,
    ) -> int:
        """Best-effort removal of a project's superseded generation directories.

        The current generation stays, and so does every generation within
        ``keep_previous`` of it: a request that resolved the previous
        generation just before the swap is still reading from that directory
        and must not have it deleted underneath it. Anything numerically above
        the current generation is left alone too, since it can only come from a
        bump that has not been observed here yet. The retained window is
        numeric rather than "the highest that happen to exist", so it matches
        the floor :meth:`AnalyticsRedisCache.invalidate_stale_generations` uses
        and the two tiers cannot disagree about which generation is protected.

        The sweep is capped at ``max_removals`` directories so a project with a
        long ingestion history cannot stall the upload that triggers it, and it
        refuses redirected paths the way :meth:`invalidate_project` does so a
        symlinked generation directory cannot redirect the delete onto the live
        one. Returns how many directories were removed, including a partial
        count when the sweep fails halfway.
        """

        removed = 0
        try:
            cache_root = self._cache_dir.resolve()
            project_dir = cache_root / str(project_id)
            if project_dir.parent != cache_root or _is_redirected(project_dir):
                logger.warning(
                    "Refusing Parquet cache pruning outside cache root: %s",
                    project_dir,
                )
                return 0
            if not project_dir.is_dir():
                return 0

            keep = normalize_generation(keep_generation)
            floor = keep - max(0, int(keep_previous))
            stale: List[Tuple[int, Path]] = []
            for child in project_dir.iterdir():
                if not is_generation_token(child.name):
                    continue
                if _is_redirected(child) or not child.is_dir():
                    continue
                number = normalize_generation(child.name[len(CACHE_GENERATION_PREFIX) :])
                if number >= floor:
                    continue
                stale.append((number, child))

            stale.sort(key=lambda item: item[0], reverse=True)
            # Oldest first, so a capped sweep still reclaims the least useful
            # generations and the next one picks up where this left off.
            for _, directory in reversed(stale):
                if removed >= max_removals:
                    break
                shutil.rmtree(directory)
                removed += 1
        except Exception:
            logger.warning(
                "Failed to prune stale Parquet cache generations for project %s",
                project_id,
                exc_info=True,
            )
        return removed

"""Bounded process-local metadata used by authenticated video previews.

The caches never authorize a request and never retain ORM objects or frames.
Callers must resolve the current project/file identity and Parquet generation
before consulting them. Unknown generations are deliberately not cacheable.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import pandas as pd

from neurodatics.shared.scenario_identity import is_all_scenarios

from ....config.settings import settings
from ...analytics.application.services.numeric_helpers import scope_to_scenario


_MISSING = object()


class _BoundedTTLCache:
    def __init__(self, *, max_items: int, ttl_seconds: int):
        self.max_items = max(1, int(max_items))
        self.ttl_seconds = max(1, int(ttl_seconds))
        self._items: OrderedDict[object, tuple[float, object]] = OrderedDict()
        self._lock = threading.RLock()

    def get(self, key: object) -> tuple[bool, object]:
        now = time.monotonic()
        with self._lock:
            entry = self._items.get(key, _MISSING)
            if entry is _MISSING:
                return False, None
            expires_at, value = entry
            if expires_at <= now:
                self._items.pop(key, None)
                return False, None
            self._items.move_to_end(key)
            return True, value

    def put(self, key: object, value: object) -> None:
        with self._lock:
            self._items[key] = (time.monotonic() + self.ttl_seconds, value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)

    def discard_where(self, predicate: Callable[[object], bool]) -> None:
        with self._lock:
            for key in tuple(self._items):
                if predicate(key):
                    self._items.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._items)


@dataclass(frozen=True)
class _DurationMetadata:
    fingerprint: tuple[int, int, int, int]
    duration_s: float


_onsets = _BoundedTTLCache(
    max_items=settings.video_onset_cache_max_items,
    ttl_seconds=settings.video_onset_cache_ttl_seconds,
)
_durations = _BoundedTTLCache(
    max_items=settings.video_duration_cache_max_items,
    ttl_seconds=settings.video_duration_cache_ttl_seconds,
)


def compute_preview_scenario_onset_s(
    df: pd.DataFrame, scenario: Optional[str]
) -> Optional[float]:
    """Return the exact onset reference historically used by video preview.

    This intentionally differs from ScenarioTimingService: dropna precedes
    scenario scoping, a non-finite minimum (including -Inf) rejects the onset,
    and no rounding is applied here.
    """

    if (
        is_all_scenarios(scenario)
        or "time" not in df.columns
        or "scenario" not in df.columns
        or df.empty
    ):
        return None
    clean = df.dropna(subset=["time"])
    if clean.empty:
        return None
    subset = scope_to_scenario(clean, scenario)
    if subset.empty:
        return None
    times = pd.to_numeric(subset["time"], errors="coerce").dropna()
    if times.empty:
        return None
    onset = float(times.min())
    return onset if np.isfinite(onset) else None


def observe_project_generation(project_id: object, generation: object) -> bool:
    """Reject unknown generations; known generations isolate entries in the key.

    Generations are intentionally not ordered here. An older in-flight request
    may finish after re-ingestion and must not evict the newer generation.
    """

    if generation is None:
        invalidate_project_video_metadata(project_id)
        return False
    return True


def get_cached_preview_onset(
    project_id: object,
    generation: object,
    participant_code: str,
    scenario: str,
) -> tuple[bool, Optional[float]]:
    if generation is None:
        return False, None
    hit, value = _onsets.get(
        (str(project_id), str(generation), participant_code, scenario)
    )
    return hit, value if value is None else float(value)


def cache_preview_onset(
    project_id: object,
    generation: object,
    participant_code: str,
    scenario: str,
    onset_s: Optional[float],
) -> None:
    if generation is None:
        return
    _onsets.put(
        (str(project_id), str(generation), participant_code, scenario), onset_s
    )


def _file_fingerprint(path: Path) -> Optional[tuple[int, int, int, int]]:
    try:
        info = path.stat()
    except OSError:
        return None
    if info.st_size <= 0:
        return None
    return (int(info.st_dev), int(info.st_ino), int(info.st_size), int(info.st_mtime_ns))


def get_video_duration_s(
    video_identity: str,
    video_path: Path,
    probe: Callable[[Path], Optional[float]],
) -> Optional[float]:
    """Probe once per logical identity and unchanged local source file."""

    fingerprint = _file_fingerprint(video_path)
    if fingerprint is None:
        _durations.discard_where(lambda key: key == video_identity)
        return None
    hit, cached = _durations.get(video_identity)
    if hit and isinstance(cached, _DurationMetadata):
        if cached.fingerprint == fingerprint:
            return cached.duration_s
        _durations.discard_where(lambda key: key == video_identity)

    duration_s = probe(video_path)
    if duration_s is None or duration_s <= 0:
        return None
    if _file_fingerprint(video_path) != fingerprint:
        return None
    _durations.put(video_identity, _DurationMetadata(fingerprint, float(duration_s)))
    return float(duration_s)


def invalidate_project_video_metadata(project_id: object) -> None:
    project_key = str(project_id)
    _onsets.discard_where(lambda key: key[0] == project_key)


def clear_video_preview_metadata() -> None:
    _onsets.clear()
    _durations.clear()


def video_preview_metadata_stats() -> dict[str, int]:
    """Diagnostics for tests/docs; estimated bytes are not a process RSS bound."""

    onset_items = _onsets.size()
    duration_items = _durations.size()
    return {
        "onset_items": onset_items,
        "onset_max_items": _onsets.max_items,
        "onset_estimated_bytes": onset_items * 320,
        "duration_items": duration_items,
        "duration_max_items": _durations.max_items,
        "duration_estimated_bytes": duration_items * 256,
    }

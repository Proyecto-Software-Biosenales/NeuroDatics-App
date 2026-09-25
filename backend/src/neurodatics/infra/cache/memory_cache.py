"""In-process stand-in for the few Redis commands the analytics cache uses.

Local mode has no Redis server. The analytics cache already treats the cache as optional, so
this only has to answer the same calls: a bounded, expiring key/value map that lives and
dies with the process. A restart empties it, which costs one recomputation per request.
"""

from __future__ import annotations

import fnmatch
import threading
import time
from collections import OrderedDict
from typing import Callable, Iterator, Optional, Tuple, Union

Value = Union[str, bytes]


class InProcessCache:
    # Responses are capped at 8 MB each upstream; this bounds the total on a student laptop.
    DEFAULT_MAX_BYTES = 128 * 1024 * 1024

    def __init__(
        self,
        max_bytes: int = DEFAULT_MAX_BYTES,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_bytes = max_bytes
        self._clock = clock
        self._lock = threading.Lock()
        # name -> (expires_at or None, value); least recently used first.
        self._entries: "OrderedDict[str, Tuple[Optional[float], Value]]" = OrderedDict()
        self._total_bytes = 0

    def _drop(self, name: str) -> None:
        entry = self._entries.pop(name, None)
        if entry is not None:
            self._total_bytes -= len(entry[1])

    def _live(self, name: str) -> Optional[Value]:
        entry = self._entries.get(name)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at is not None and expires_at <= self._clock():
            self._drop(name)
            return None
        return value

    def get(self, name: str) -> Optional[Value]:
        with self._lock:
            value = self._live(name)
            if value is not None:
                self._entries.move_to_end(name)
            return value

    def set(self, name: str, value: Value, ex: Optional[int] = None) -> bool:
        with self._lock:
            self._drop(name)
            if len(value) > self._max_bytes:
                return False
            expires_at = self._clock() + ex if ex else None
            self._entries[name] = (expires_at, value)
            self._total_bytes += len(value)
            while self._total_bytes > self._max_bytes:
                self._drop(next(iter(self._entries)))
            return True

    def delete(self, *names: str) -> int:
        with self._lock:
            removed = 0
            for name in names:
                if self._live(name) is not None:
                    removed += 1
                self._drop(name)
            return removed

    def scan_iter(self, match: str = "*", count: Optional[int] = None) -> Iterator[str]:
        # A snapshot, so callers may delete what they were handed while iterating.
        with self._lock:
            names = [name for name in list(self._entries) if self._live(name) is not None]
        return iter([name for name in names if fnmatch.fnmatchcase(name, match)])

    def ping(self) -> bool:
        return True

    def close(self) -> None:
        with self._lock:
            self._entries.clear()
            self._total_bytes = 0


_shared_cache = InProcessCache()


def shared_in_process_cache() -> InProcessCache:
    return _shared_cache

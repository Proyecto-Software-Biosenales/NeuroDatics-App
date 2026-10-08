"""Bounded, event-loop-local operations. No distributed coordination or cache.

The caller that supplies a factory owns its resources until settlement. If it
is cancelled, its request stays suspended here until the factory settles, so
FastAPI cannot close its DB dependency underneath the shared operation. Other
callers may leave immediately. A synchronous worker must use settled_thread:
Python threads cannot be preempted, and their slot stays occupied until done.
"""

import asyncio
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass, field
from typing import TypeVar
from weakref import WeakKeyDictionary

import anyio

T = TypeVar("T")


class SingleFlightBusy(RuntimeError):
    pass


class SingleFlightTimeout(RuntimeError):
    pass


async def _drain(task: asyncio.Task) -> None:
    """Wait through repeated caller cancellation; consume orphan exceptions."""
    with anyio.CancelScope(shield=True):
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except Exception:
                break
    if not task.cancelled():
        task.exception()


async def settled_thread(operation: Callable[[], T]) -> T:
    task = asyncio.create_task(anyio.to_thread.run_sync(operation))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        await _drain(task)
        raise


@dataclass
class _Entry:
    task: asyncio.Task | None = None
    consumers: int = 0
    accepting: bool = True


@dataclass
class _State:
    slots: asyncio.Semaphore
    entries: dict[Hashable, _Entry] = field(default_factory=dict)
    consumers: int = 0
    running: int = 0


class SingleFlight:
    def __init__(self, *, max_running=4, max_queued=32, max_consumers=256, timeout=120.0):
        if max_running < 1 or max_queued < 0 or max_consumers < 1 or timeout <= 0:
            raise ValueError("Invalid singleflight budget")
        self.max_running = max_running
        self.max_queued = max_queued
        self.max_consumers = max_consumers
        self.timeout = timeout
        self._states: WeakKeyDictionary = WeakKeyDictionary()

    def stats(self) -> dict[str, int]:
        state = self._states.get(asyncio.get_running_loop())
        return {"entries": len(state.entries) if state else 0,
                "running": state.running if state else 0,
                "consumers": state.consumers if state else 0}

    async def run(self, key: Hashable, factory: Callable[[], Awaitable[T]]) -> T:
        # Admission and bookkeeping have no await: no global lock serializes
        # independent keys, and no task is created before bounded admission.
        loop = asyncio.get_running_loop()
        state = self._states.get(loop)
        if state is None:
            state = _State(asyncio.Semaphore(self.max_running))
            self._states[loop] = state
        entry = state.entries.get(key)
        if state.consumers >= self.max_consumers:
            raise SingleFlightBusy("Analytics consumer limit reached; retry later")
        owner = entry is None
        if owner:
            if len(state.entries) >= self.max_running + self.max_queued:
                raise SingleFlightBusy("Analytics operation queue full; retry later")
            entry = _Entry()
            state.entries[key] = entry

            async def operation():
                async with state.slots:
                    state.running += 1
                    try:
                        return await factory()
                    finally:
                        state.running -= 1

            async def execute():
                try:
                    # wait_for waits for cancellation to settle, including
                    # non-preemptible workers, before removing this entry.
                    return await asyncio.wait_for(operation(), self.timeout)
                except asyncio.TimeoutError as exc:
                    raise SingleFlightTimeout("Analytics operation timed out; retry later") from exc
                finally:
                    entry.accepting = False
                    state.entries.pop(key, None)
                    if not state.entries and not state.consumers:
                        self._states.pop(loop, None)

            entry.task = asyncio.create_task(execute(), name="analytics-singleflight")
        elif not entry.accepting:
            raise SingleFlightBusy("Analytics operation is settling; retry later")
        state.consumers += 1
        entry.consumers += 1
        left = False

        def leave():
            nonlocal left
            if not left:
                left = True
                state.consumers -= 1
                entry.consumers -= 1
                if entry.consumers == 0 and not entry.task.done():
                    entry.accepting = False
                    entry.task.cancel()
                if not state.entries and not state.consumers:
                    self._states.pop(loop, None)

        try:
            return await asyncio.shield(entry.task)
        except asyncio.CancelledError:
            leave()
            if owner:
                # Keep the factory owner's request-scoped resources alive.
                # Followers never operate on their own DB while waiting here.
                await _drain(entry.task)
            raise
        finally:
            leave()


response_flights = SingleFlight()
parquet_flights = SingleFlight(max_running=4, max_queued=32, timeout=120.0)

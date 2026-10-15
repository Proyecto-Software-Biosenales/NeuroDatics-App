"""Small process-local I/O budget for executive reports.

The budget does not create tasks.  Report callers create at most their configured
worker count and admission bounds how many of those workers may wait across the
event loop.  A slot is released only after the supplied coroutine has settled;
synchronous work inside it must therefore use ``settled_thread``.
"""

from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Deque, Generic, TypeVar
from weakref import WeakKeyDictionary

T = TypeVar("T")


class ReportIOBusy(RuntimeError):
    """The process-local report I/O waiting budget is full."""


@dataclass
class _State:
    running: int = 0
    waiters: Deque[asyncio.Future] = field(default_factory=deque)


class ReportIOBudget(Generic[T]):
    def __init__(self, *, max_running: int, max_waiting: int):
        if max_running < 1 or max_waiting < 0:
            raise ValueError("Invalid report I/O budget")
        self.max_running = max_running
        self.max_waiting = max_waiting
        self._states: WeakKeyDictionary = WeakKeyDictionary()

    def _state(self) -> _State:
        loop = asyncio.get_running_loop()
        state = self._states.get(loop)
        if state is None:
            state = _State()
            self._states[loop] = state
        return state

    def stats(self) -> dict[str, int]:
        state = self._states.get(asyncio.get_running_loop())
        return {
            "running": state.running if state else 0,
            "waiting": len(state.waiters) if state else 0,
        }

    def _release(self, state: _State) -> None:
        while state.waiters:
            waiter = state.waiters.popleft()
            if not waiter.done():
                # Transfer the occupied slot before the waiter is scheduled.
                # running intentionally stays unchanged during the handoff.
                waiter.set_result(None)
                return
        state.running -= 1

    def _cleanup(self, state: _State) -> None:
        if state.running == 0 and not state.waiters:
            self._states.pop(asyncio.get_running_loop(), None)

    async def run(self, operation: Callable[[], Awaitable[T]]) -> T:
        state = self._state()
        active = state.running < self.max_running
        waiter = None
        if active:
            state.running += 1
        else:
            if len(state.waiters) >= self.max_waiting:
                raise ReportIOBusy("Report I/O queue full; retry later")
            waiter = asyncio.get_running_loop().create_future()
            state.waiters.append(waiter)
            try:
                await waiter
            except BaseException:
                if waiter.done() and not waiter.cancelled():
                    # The slot was already transferred but this task was cancelled
                    # before it could start the operation. Hand it on again.
                    self._release(state)
                else:
                    try:
                        state.waiters.remove(waiter)
                    except ValueError:
                        pass
                self._cleanup(state)
                raise

        try:
            return await operation()
        finally:
            self._release(state)
            self._cleanup(state)

import asyncio
import threading

import anyio
import pytest

from neurodatics.modules.analytics.infrastructure.singleflight import (
    SingleFlight, SingleFlightBusy, SingleFlightTimeout, settled_thread,
)


async def tick():
    for _ in range(10):
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_ten_identical_one_operation_and_distinct_keys_advance():
    flight = SingleFlight(max_running=2)
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def work(key):
        calls.append(key)
        if len(calls) == 2:
            entered.set()
        await release.wait()
        return key

    tasks = [asyncio.create_task(flight.run("a", lambda: work("a"))) for _ in range(10)]
    other = asyncio.create_task(flight.run("b", lambda: work("b")))
    await asyncio.wait_for(entered.wait(), 1)
    assert sorted(calls) == ["a", "b"]
    release.set()
    assert await asyncio.gather(*tasks, other) == ["a"] * 10 + ["b"]
    assert flight.stats() == {"entries": 0, "running": 0, "consumers": 0}
    assert not flight._states


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel_owner", [False, True])
async def test_cancel_one_consumer_keeps_survivor_and_owner_lease(cancel_owner):
    flight = SingleFlight()
    started, release = asyncio.Event(), asyncio.Event()
    resources = {"closed": False}

    async def work():
        started.set()
        await release.wait()
        assert not resources["closed"]
        return 7

    async def owner_request():
        try:
            return await flight.run("a", work)
        finally:
            resources["closed"] = True

    owner = asyncio.create_task(owner_request())
    await started.wait()
    follower = asyncio.create_task(flight.run("a", work))
    await tick()
    cancelled, survivor = (owner, follower) if cancel_owner else (follower, owner)
    cancelled.cancel()
    await tick()
    cancelled.cancel()
    await tick()
    assert not resources["closed"]
    if cancel_owner:
        assert not owner.done()
    release.set()
    assert await survivor == 7
    with pytest.raises(asyncio.CancelledError):
        await cancelled
    assert flight.stats()["entries"] == 0


@pytest.mark.asyncio
async def test_error_and_timeout_allow_retry():
    flight = SingleFlight(timeout=0.02)

    async def fail():
        await asyncio.sleep(0)
        raise ValueError("bad input")

    results = await asyncio.gather(*(flight.run("a", fail) for _ in range(10)), return_exceptions=True)
    assert all(isinstance(result, ValueError) for result in results)

    async def slow():
        await asyncio.sleep(1)

    with pytest.raises(SingleFlightTimeout):
        await flight.run("a", slow)
    assert await flight.run("a", lambda: asyncio.sleep(0, result=3)) == 3
    assert not flight._states


@pytest.mark.asyncio
@pytest.mark.parametrize("timeout", [False, True])
async def test_last_consumer_or_timeout_retains_physical_worker_slot(timeout):
    flight = SingleFlight(max_running=1, max_queued=1, timeout=0.03 if timeout else 2)
    started, release, finished = threading.Event(), threading.Event(), threading.Event()

    def worker():
        started.set()
        assert release.wait(2)
        finished.set()

    owner = asyncio.create_task(flight.run("a", lambda: settled_thread(worker)))
    await asyncio.to_thread(started.wait, 1)
    if timeout:
        await asyncio.sleep(0.05)
    else:
        owner.cancel()
        await tick()
        owner.cancel()
    queued = asyncio.create_task(flight.run("b", lambda: asyncio.sleep(0, result=8)))
    await tick()
    assert not finished.is_set() and not owner.done() and not queued.done()
    assert flight.stats()["running"] == 1
    with pytest.raises(SingleFlightBusy):
        await flight.run("c", lambda: asyncio.sleep(0))
    release.set()
    with pytest.raises(SingleFlightTimeout if timeout else asyncio.CancelledError):
        await owner
    assert await queued == 8
    assert finished.is_set()
    assert not flight._states


@pytest.mark.asyncio
async def test_consumer_budget_and_queued_cancellation():
    flight = SingleFlight(max_running=1, max_queued=1, max_consumers=2)
    gate = asyncio.Event()
    owner = asyncio.create_task(flight.run("a", gate.wait))
    await tick()
    queued = asyncio.create_task(flight.run("b", gate.wait))
    await tick()
    with pytest.raises(SingleFlightBusy):
        await flight.run("a", gate.wait)
    queued.cancel()
    with pytest.raises(asyncio.CancelledError):
        await queued
    assert flight.stats() == {"entries": 1, "running": 1, "consumers": 1}
    gate.set()
    await owner
    assert not flight._states


@pytest.mark.asyncio
async def test_anyio_level_cancellation_drains_worker_without_busy_loop():
    flight = SingleFlight(max_running=1)
    started, release = threading.Event(), threading.Event()
    done = asyncio.Event()

    def worker():
        started.set()
        assert release.wait(2)

    async def request():
        with anyio.CancelScope() as scope:
            scopes.append(scope)
            try:
                await flight.run("a", lambda: settled_thread(worker))
            finally:
                done.set()

    scopes = []
    task = asyncio.create_task(request())
    await asyncio.to_thread(started.wait, 1)
    scopes[0].cancel()
    await tick()
    assert not done.is_set() and flight.stats()["running"] == 1
    release.set()
    await asyncio.wait_for(task, 1)
    assert done.is_set() and not flight._states

"""Advancing the generation is the swap, so it may not fail quietly.

The upload use case treats the number this returns as proof that the swap
happened and then sweeps every cache below that number. A bump that reports
success without having updated a row would point that sweep at generation 0.
"""

from uuid import uuid4

import pytest

from neurodatics.modules.projects.infrastructure.repository_impl import (
    ProjectIngestionGenerationError,
    SQLProjectRepository,
)


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Records whether the bump flushed, and never commits on its own."""

    def __init__(self, returned_generation):
        self._returned_generation = returned_generation
        self.flushes = 0
        self.commits = 0

    async def execute(self, _statement):
        return _FakeResult(self._returned_generation)

    async def flush(self):
        self.flushes += 1

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_a_bump_returns_the_new_generation_without_committing():
    session = _FakeSession(4)

    generation = await SQLProjectRepository(session).bump_ingestion_generation(uuid4())

    # Flushing rather than committing is what keeps the bump in the caller's
    # transaction alongside the READY status update.
    assert generation == 4
    assert session.flushes == 1
    assert session.commits == 0


@pytest.mark.asyncio
async def test_a_bump_that_matched_no_row_refuses_to_report_success():
    session = _FakeSession(None)

    with pytest.raises(ProjectIngestionGenerationError):
        await SQLProjectRepository(session).bump_ingestion_generation(uuid4())


@pytest.mark.asyncio
async def test_a_missing_generation_reads_as_zero():
    session = _FakeSession(None)

    # Unlike the bump, a read has a safe answer: generation 0 simply names an
    # identity nothing has cached under.
    assert await SQLProjectRepository(session).get_ingestion_generation(uuid4()) == 0

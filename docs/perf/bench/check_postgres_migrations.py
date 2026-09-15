"""Isolated PostgreSQL performance migration/token smoke; never uses application dotenv."""
import asyncio
import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys
import uuid

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--postgres-bin', type=Path, default=Path('C:/Program Files/PostgreSQL/18/bin'))
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / 'output/perf-postgres'
BIN = args.postgres_bin.resolve()
RUN = OUTPUT / ('run-' + uuid.uuid4().hex[:12])
RUN.mkdir(parents=True)
DATA = RUN / 'data'
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    PORT = sock.getsockname()[1]
URL = f'postgresql+psycopg://perf_smoke@127.0.0.1:{PORT}/postgres'
os.environ['DATABASE_URL'] = URL
os.environ['APP_ENV'] = 'test'
os.environ['AUTH_JWT_SECRET'] = 'isolated-local-smoke-value-no-live-credentials'
sys.path.insert(0, str(ROOT / 'backend/src'))

# Disable dotenv at its source before importing application settings. Explicit
# scratch DATABASE_URL is the only target; no app startup or external services.
from pydantic_settings.sources import DotEnvSettingsSource
DotEnvSettingsSource._read_env_files = lambda self: {}

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from neurodatics.config.settings import settings
assert settings.database_url == URL
from neurodatics.infra.db.base import Base
from neurodatics.modules.projects.domain.entities import Project
from neurodatics.modules.participants.domain.entities import Participant
from neurodatics.modules.scenaries.domain.entities import Scenaries, AOI
from neurodatics.modules.analytics.infrastructure.transform_token_store import (
    persist_transform_token, stored_transform_token, transform_token_update,
)
from neurodatics.modules.projects.infrastructure.repository_impl import SQLProjectRepository

asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
config = Config(str(ROOT / 'backend/alembic.ini'))
config.set_main_option('script_location', str(ROOT / 'backend/migrations'))
INDEXES = {
    'ix_project_files_project_id_kind', 'ix_projects_owner_id',
    'ix_participants_project_id', 'ix_scenaries_project_id',
    'ix_scenaries_file_id', 'ix_aois_scenaries_id',
}
PROJECT_ID = uuid.uuid4()


def pg_run(binary, *args):
    # File handles avoid waiting for inherited pipes held by the server process.
    command_log = RUN / ('command-' + uuid.uuid4().hex[:8] + '.log')
    with command_log.open('w', encoding='utf-8') as stream:
        result = subprocess.run(
            [str(BIN / binary), *map(str, args)], stdout=stream, stderr=stream,
            stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW,
            timeout=90,
        )
    print(command_log.read_text(encoding='utf-8', errors='replace'), end='', flush=True)
    result.check_returncode()


async def check_schema(revision, tokens, indexes):
    engine = create_async_engine(URL)
    try:
        async with engine.connect() as conn:
            assert await conn.scalar(text('SELECT version_num FROM alembic_version')) == revision
            cols = await conn.run_sync(lambda c: inspect(c).get_columns('projects'))
            token_cols = [c for c in cols if c['name'] == 'analytics_transform_tokens']
            assert bool(token_cols) == tokens
            if tokens:
                assert token_cols[0]['nullable']
            names = set((await conn.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname='public'"))).scalars())
            assert INDEXES.issubset(names) if indexes else INDEXES.isdisjoint(names)
        print(f'PASS schema revision={revision}, token_column={tokens}, six_indexes={indexes}')
    finally:
        await engine.dispose()


async def seed_project():
    engine = create_async_engine(URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(Project.__table__.insert().values(
                id=PROJECT_ID, owner_id=uuid.uuid4(), name='perf scratch preserved',
            ))
    finally:
        await engine.dispose()


async def create_022_fixture():
    engine = create_async_engine(URL)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text('ALTER TABLE projects DROP COLUMN analytics_transform_tokens'))
            for index in sorted(INDEXES):
                await conn.execute(text(f'DROP INDEX {index}'))
        print('Created explicit predecessor-schema fixture; this does not validate migrations000-022')
    finally:
        await engine.dispose()


async def assert_blocked(engine, pid):
    for _ in range(100):
        async with engine.connect() as observer:
            blocked = await observer.scalar(text('SELECT cardinality(pg_blocking_pids(:pid)) > 0'), {'pid': pid})
        if blocked:
            return
        await asyncio.sleep(.02)
    raise AssertionError('expected real PostgreSQL row-lock contention')


async def tokens_smoke():
    engine = create_async_engine(URL, pool_size=6)
    session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session() as a, session() as b:
            first = await a.get(Project, PROJECT_ID)
            second = await b.get(Project, PROJECT_ID)
            original_updated = first.updated_at
            assert first.analytics_transform_tokens is None
            generation = first.ingestion_generation
            pid = await b.scalar(text('SELECT pg_backend_pid()'))
            await a.execute(transform_token_update(PROJECT_ID, 'P:first', generation, 'a' * 20))
            writer = asyncio.create_task(persist_transform_token(b, second, 'P:second', generation, 'b' * 20))
            try:
                await assert_blocked(engine, pid)
            finally:
                await a.commit()
            await asyncio.wait_for(writer, 10)
        async with session() as db:
            current = await db.get(Project, PROJECT_ID)
            assert stored_transform_token(current, 'P:first', generation) == 'a' * 20
            assert stored_transform_token(current, 'P:second', generation) == 'b' * 20
            assert current.updated_at == original_updated
        print('PASS concurrent token merge: both participant entries survive actual lock contention; timestamp unchanged')

        async with session() as publisher, session() as reader:
            stale_project = await reader.get(Project, PROJECT_ID)
            pid = await reader.scalar(text('SELECT pg_backend_pid()'))
            new_generation = await SQLProjectRepository(publisher).bump_ingestion_generation(PROJECT_ID)
            assert new_generation == generation + 1
            writer = asyncio.create_task(persist_transform_token(reader, stale_project, 'P:stale', generation, 'c' * 20))
            try:
                await assert_blocked(engine, pid)
            finally:
                await publisher.commit()
            await asyncio.wait_for(writer, 10)
        async with session() as db:
            current = await db.get(Project, PROJECT_ID)
            assert current.ingestion_generation == new_generation
            assert 'P:stale' not in current.analytics_transform_tokens
            assert stored_transform_token(current, 'P:first', new_generation) is None
            await persist_transform_token(db, current, 'P:new', new_generation, 'd' * 20)
        async with session() as db:
            current = await db.get(Project, PROJECT_ID)
            assert stored_transform_token(current, 'P:new', new_generation) == 'd' * 20
        print('PASS stale generation write rejected after contended ingestion commit; fresh generation token persists')

        for malformed in [[], 'invalid']:
            async with session() as db:
                await db.execute(update(Project).where(Project.id == PROJECT_ID).values(analytics_transform_tokens=malformed))
                await db.commit()
                current = await db.get(Project, PROJECT_ID)
                await persist_transform_token(db, current, 'P:repaired', new_generation, 'e' * 20)
            async with session() as db:
                current = await db.get(Project, PROJECT_ID)
                assert stored_transform_token(current, 'P:repaired', new_generation) == 'e' * 20
        print('PASS malformed JSON array/scalar falls back to an object on PostgreSQL')
    finally:
        await engine.dispose()


async def check_preserved():
    engine = create_async_engine(URL)
    try:
        async with engine.connect() as conn:
            assert await conn.scalar(text('SELECT name FROM projects WHERE id=:id'), {'id': PROJECT_ID}) == 'perf scratch preserved'
        print('PASS existing project preserved across upgrades and downgrades')
    finally:
        await engine.dispose()


started = False
try:
    pg_run('initdb.exe', '-D', DATA, '-U', 'perf_smoke', '-A', 'trust', '--encoding=UTF8', '--locale=C')
    pg_run('pg_ctl.exe', '-D', DATA, '-l', RUN / 'server.log', '-o', f'-h 127.0.0.1 -p {PORT} -F', '-w', 'start')
    started = True
    print(f'Isolated PostgreSQL 18.3 scratch cluster on 127.0.0.1:{PORT}; dotenv disabled')
    # PostgreSQL18 full-chain bootstrap is blocked by pre-existing migration004;
    # see full-chain-pg18-failure.log. Isolate only the requested perf migrations.
    asyncio.run(create_022_fixture())
    command.stamp(config, '022')
    asyncio.run(check_schema('022', False, False))
    asyncio.run(seed_project())
    command.upgrade(config, 'head')
    asyncio.run(check_schema('024', True, True))
    asyncio.run(tokens_smoke())
    command.downgrade(config, '023')
    asyncio.run(check_schema('023', False, True))
    command.downgrade(config, '022')
    asyncio.run(check_schema('022', False, False))
    asyncio.run(check_preserved())
    command.upgrade(config, 'head')
    asyncio.run(check_schema('024', True, True))
    asyncio.run(check_preserved())
    print('ALL POSTGRES PERFORMANCE SMOKE CHECKS PASSED')
finally:
    if started or (DATA / 'postmaster.pid').exists():
        pg_run('pg_ctl.exe', '-D', DATA, '-m', 'fast', '-w', 'stop')
        print('Scratch PostgreSQL stopped; no live database was accessed')

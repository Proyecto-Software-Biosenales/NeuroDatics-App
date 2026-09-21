"""Single entry point for the frozen M1 spike: selftest | pg-lifecycle | pg-adopt | serve."""
from __future__ import annotations

import multiprocessing
import os
import sys

# Settings must exist before any neurodatics import; the database URL is replaced later.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:1/neurodatics")
os.environ.setdefault("AUTH_JWT_SECRET", "spike-only-jwt-secret-0123456789abcdef0123")

import argparse
import json
import pathlib
import subprocess
import threading
import time

import m1_selftest
import m1_pg


def package_dir(args) -> pathlib.Path:
    return pathlib.Path(args.pkg) if args.pkg else pathlib.Path(sys.executable).resolve().parent


def migrations_dir(args) -> pathlib.Path:
    if args.migrations:
        return pathlib.Path(args.migrations)
    return pathlib.Path(getattr(sys, "_MEIPASS", ".")) / "migrations"


def settle_environment(args, data_root: pathlib.Path) -> None:
    for name in ("parquet_cache", "image_cache", "video_cache", "video_frame_cache"):
        os.environ[name.upper() + "_DIR"] = str(data_root / "cache" / name)
    tools = package_dir(args) / "tools"
    if tools.is_dir():
        os.environ["PATH"] = str(tools) + os.pathsep + os.environ.get("PATH", "")


def make_pg(args) -> tuple[m1_pg.EmbeddedPostgres, pathlib.Path]:
    pkg = package_dir(args)
    root = pathlib.Path(args.data_root)
    pg = m1_pg.EmbeddedPostgres(pkg / "pgsql" / "bin", root / "pgdata", root / "logs")
    return pg, pkg / "pg-template"


def ensure_database(pg: m1_pg.EmbeddedPostgres, name: str = "neurodatics") -> None:
    import psycopg

    with psycopg.connect(host="127.0.0.1", port=pg.port, user="postgres", dbname="postgres", autocommit=True) as conn:
        exists = conn.execute("select 1 from pg_database where datname = %s", (name,)).fetchone()
        if not exists:
            conn.execute(f'create database "{name}"')


def migrate(args) -> dict:
    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config()
    cfg.set_main_option("script_location", str(migrations_dir(args)))
    head = ScriptDirectory.from_config(cfg).get_current_head()
    started = time.perf_counter()
    command.upgrade(cfg, "head")
    return {"head": head, "seconds": round(time.perf_counter() - started, 2)}


def query_one(pg: m1_pg.EmbeddedPostgres, sql: str, params=None):
    import psycopg

    with psycopg.connect(host="127.0.0.1", port=pg.port, user="postgres", dbname="neurodatics") as conn:
        row = conn.execute(sql, params).fetchone()
        return row[0] if row else None


def log_has(pg: m1_pg.EmbeddedPostgres, needle: str) -> bool:
    try:
        return needle in (pg.log_dir / "postgres.log").read_text(errors="replace")
    except OSError:
        return False


# ----------------------------------------------------------------------------------------
def cmd_pg_lifecycle(args) -> int:
    import psycopg

    RESULTS, stage = m1_selftest.RESULTS, m1_selftest.stage
    m1_selftest.install_tripwire()
    pg, template = make_pg(args)
    settle_environment(args, pathlib.Path(args.data_root))
    RESULTS["data_root"] = str(args.data_root)
    RESULTS["template_mb"] = round(sum(f.stat().st_size for f in template.rglob("*") if f.is_file()) / 1048576, 1)

    with stage("A1_first_start_from_template") as rec:
        rec["cluster"] = pg.ensure_cluster(template)
        rec["start"] = pg.start()
        rec["control_state_running"] = pg.control_state()
        ensure_database(pg)
        os.environ["DATABASE_URL"] = pg.url()
        rec["version"] = query_one(pg, "select version()")
        rec["encoding"] = query_one(pg, "show server_encoding")
        rec["listen_addresses"] = query_one(pg, "show listen_addresses")

    with stage("A2_migrations_to_head") as rec:
        rec.update(migrate(args))
        rec["alembic_version_in_db"] = query_one(pg, "select version_num from alembic_version")
        rec["public_tables"] = query_one(
            pg, "select count(*) from information_schema.tables where table_schema = 'public'"
        )
        assert rec["alembic_version_in_db"] == rec["head"]
        rec["migrate_again_seconds"] = migrate(args)["seconds"]

    with stage("A3_app_specific_sql") as rec:
        import asyncio
        import uuid

        async def exercise() -> dict:
            from neurodatics.infra.db.session import AsyncSessionLocal, engine
            from neurodatics.modules.analytics.infrastructure.transform_token_store import transform_token_update
            from neurodatics.modules.projects.domain.entities import Project
            from neurodatics.modules.projects.infrastructure.mutation_lock import (
                ProjectMutationConflict, project_mutation_lock,
            )
            from sqlalchemy import select

            out: dict = {}
            async with AsyncSessionLocal() as db1, AsyncSessionLocal() as db2:
                project = Project(id=uuid.uuid4(), owner_id=uuid.uuid4(), name="m1-spike-project")
                db1.add(project)
                await db1.commit()
                pid = project.id
                async with project_mutation_lock(db1, pid):
                    try:
                        async with project_mutation_lock(db2, pid):
                            out["advisory_lock_second_holder"] = "ACQUIRED (wrong)"
                    except ProjectMutationConflict:
                        out["advisory_lock_second_holder"] = "refused (correct)"
                async with project_mutation_lock(db2, pid):
                    out["advisory_lock_after_release"] = "acquired (correct)"
                await db1.execute(transform_token_update(pid, "P1", 0, "a" * 20))
                await db1.execute(transform_token_update(pid, "P2", 0, "b" * 20))
                await db1.execute(transform_token_update(pid, "P3", 7, "c" * 20))  # stale generation: no-op
                await db1.commit()
                row = (await db1.execute(select(Project.analytics_transform_tokens).where(Project.id == pid))).scalar_one()
                out["jsonb_merge_result"] = row
            await engine.dispose()
            return out

        rec.update(asyncio.run(exercise()))
        assert rec["advisory_lock_second_holder"].startswith("refused")
        assert set(rec["jsonb_merge_result"]) == {"P1", "P2"}

    with stage("A4_clean_stop") as rec:
        rec["stop"] = pg.stop()
        rec["control_state"] = pg.control_state()
        rec["pid_file_removed"] = not (pg.data / "postmaster.pid").exists()
        rec["data_dir_mb"] = pg.dir_mb()
        assert rec["control_state"] == "shut down"

    with stage("B_crash_and_recovery") as rec:
        rec["restart"] = pg.start()
        with psycopg.connect(host="127.0.0.1", port=pg.port, user="postgres", dbname="neurodatics") as conn:
            conn.execute("create table if not exists m1_probe(id int primary key, note text)")
            conn.execute("delete from m1_probe")
            conn.execute("insert into m1_probe select g, 'committed' from generate_series(1, 20000) g")
            conn.commit()
            dangling = psycopg.connect(host="127.0.0.1", port=pg.port, user="postgres", dbname="neurodatics")
            dangling.execute("insert into m1_probe values (999999, 'never committed')")
            rec["kill"] = pg.hard_kill()
        try:
            dangling.close()
        except Exception:
            pass
        rec["control_state_after_kill"] = pg.control_state()
        rec["recovery_start"] = pg.start()
        rec["recovery_logged"] = log_has(pg, "automatic recovery in progress")
        rec["committed_rows_survived"] = query_one(pg, "select count(*) from m1_probe where note = 'committed'")
        rec["uncommitted_rows_present"] = query_one(pg, "select count(*) from m1_probe where id = 999999")
        assert rec["committed_rows_survived"] == 20000 and rec["uncommitted_rows_present"] == 0

    with stage("C_second_launch_while_running") as rec:
        rec["launcher_start_again"] = pg.start()  # must adopt, not fight over the data directory
        raw = pg._run("pg_ctl", "start", "-w", "-t", "20", "-D", str(pg.data),
                      "-l", str(pg.log_dir / "postgres2.log"), "-o", "-p 1", timeout=60)
        rec["raw_second_pg_ctl_start_returncode"] = raw.returncode
        assert rec["launcher_start_again"]["how"] == "adopted-orphan"

    if args.leave_running:
        RESULTS["left_running_port"] = pg.port
        RESULTS["left_running_pid"] = pg.running_pid()
    else:
        with stage("D_final_clean_stop") as rec:
            rec["stop"] = pg.stop()
            rec["control_state"] = pg.control_state()

    RESULTS["network_attempts_blocked"] = list(m1_selftest.BLOCKED)
    RESULTS["all_ok"] = all(s["ok"] for s in RESULTS["stages"].values()) and not m1_selftest.BLOCKED
    pathlib.Path(args.out).write_text(json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"all_ok": RESULTS["all_ok"], "stages": {n: s["ok"] for n, s in RESULTS["stages"].items()}}))
    return 0 if RESULTS["all_ok"] else 1


def cmd_pg_adopt(args) -> int:
    """A previous launcher died leaving the server running: a new launch must adopt and stop it."""
    RESULTS, stage = m1_selftest.RESULTS, m1_selftest.stage
    pg, _ = make_pg(args)
    with stage("adopt_orphan") as rec:
        rec["start"] = pg.start()
        rec["rows"] = query_one(pg, "select count(*) from m1_probe")
        assert rec["start"]["how"] == "adopted-orphan", rec["start"]
    with stage("stop_adopted") as rec:
        rec["stop"] = pg.stop()
        rec["control_state"] = pg.control_state()
    RESULTS["all_ok"] = all(s["ok"] for s in RESULTS["stages"].values())
    pathlib.Path(args.out).write_text(json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"all_ok": RESULTS["all_ok"]}))
    return 0 if RESULTS["all_ok"] else 1


def cmd_serve(args) -> int:
    m1_selftest.install_tripwire()
    pg, template = make_pg(args)
    data_root = pathlib.Path(args.data_root)
    settle_environment(args, data_root)
    started = time.perf_counter()
    cluster = pg.ensure_cluster(template)
    start = pg.start()
    ensure_database(pg)
    os.environ["DATABASE_URL"] = pg.url()
    migration = migrate(args)
    print(json.dumps({"cluster": cluster, "pg": start, "migration": migration,
                      "ready_seconds": round(time.perf_counter() - started, 2), "api_port": args.port}), flush=True)

    import uvicorn
    from neurodatics.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.port, log_level="warning"))
    if args.exit_after:
        threading.Timer(args.exit_after, lambda: setattr(server, "should_exit", True)).start()
    try:
        server.run()
    finally:
        print(json.dumps({"pg_stop": pg.stop(), "blocked_network_attempts": m1_selftest.BLOCKED}), flush=True)
    return 0


def main() -> int:
    multiprocessing.freeze_support()
    if len(sys.argv) < 2 or sys.argv[1] not in {"selftest", "pg-lifecycle", "pg-adopt", "serve"}:
        print("usage: neurodatics-m1 selftest|pg-lifecycle|pg-adopt|serve [options]")
        return 2
    command = sys.argv[1]
    sys.argv = [sys.argv[0]] + sys.argv[2:]
    if command == "selftest":
        return m1_selftest.main()
    parser = argparse.ArgumentParser()
    parser.add_argument("--pkg")
    parser.add_argument("--migrations")
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--out", default="results.json")
    parser.add_argument("--leave-running", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--exit-after", type=float, default=0.0)
    args = parser.parse_args()
    return {"pg-lifecycle": cmd_pg_lifecycle, "pg-adopt": cmd_pg_adopt, "serve": cmd_serve}[command](args)


if __name__ == "__main__":
    sys.exit(main())

"""Embedded PostgreSQL lifecycle checks, run with the real binaries (frozen or not).

Uses the product launcher class, so what passes here is what students run. Each stage is
independent, and the last two prove what the M1 spike could not: the loopback password and the
recovery of a cluster copy that was interrupted.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time

from selftest import RESULTS, stage  # the same stage recorder the self-test uses


def kill_server(pg) -> dict:
    """Simulate a crash or power loss: terminate the postmaster and every child at once."""
    from neurodatics.local.postgres import pid_is_postgres

    pid = pg.running_pid()
    if pid is None:
        return {"killed": False}
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, check=False)
    deadline = time.time() + 15
    while time.time() < deadline and pid_is_postgres(pid, pg.bin):
        time.sleep(0.1)
    return {"killed": True, "pid": pid, "pid_file_left_behind": (pg.data / "postmaster.pid").exists()}


def query_one(pg, sql: str, params=None):
    import psycopg

    with psycopg.connect(**pg.connect_kwargs()) as conn:
        row = conn.execute(sql, params).fetchone()
        return row[0] if row else None


def log_has(pg, needle: str) -> bool:
    try:
        return needle in (pg.log_dir / "postgres.log").read_text(errors="replace")
    except OSError:
        return False


def make_pg(pkg: pathlib.Path, root: pathlib.Path):
    from neurodatics.local.postgres import EmbeddedPostgres

    return EmbeddedPostgres(pkg / "pgsql" / "bin", root / "pgdata", root / "logs", root / "postgres.password")


def run(args) -> int:
    import psycopg

    pkg = pathlib.Path(args.pkg)
    root = pathlib.Path(args.data_root)
    template = pkg / "pg-template"
    pg = make_pg(pkg, root)

    with stage("A1_first_start_from_template") as rec:
        rec["cluster"] = pg.ensure_cluster(template)
        rec["start"] = pg.start()
        rec["control_state_running"] = pg.control_state()
        pg.ensure_database()
        os.environ["DATABASE_URL"] = pg.url()
        rec["version"] = query_one(pg, "select version()")
        rec["encoding"] = query_one(pg, "show server_encoding")
        rec["listen_addresses"] = query_one(pg, "show listen_addresses")
        rec["timezone"] = query_one(pg, "show timezone")
        assert rec["timezone"] == "UTC" and rec["listen_addresses"] == "127.0.0.1", rec

    with stage("A1b_loopback_requires_the_password") as rec:
        refused = {}
        for label, kwargs in (
            ("no_password", {"password": None}),
            ("wrong_password", {"password": "not-the-password"}),
        ):
            try:
                psycopg.connect(**{**pg.connect_kwargs(), **kwargs}, connect_timeout=5).close()
                refused[label] = "ACCEPTED (wrong)"
            except psycopg.OperationalError as exc:
                refused[label] = str(exc).strip().splitlines()[-1][:120]
        rec["attempts"] = refused
        assert not any("ACCEPTED" in outcome for outcome in refused.values()), refused
        rec["hba_lines"] = [
            line for line in (pg.data / "pg_hba.conf").read_text().splitlines() if line and not line.startswith("#")
        ]

    with stage("A2_migrations_to_head") as rec:
        from neurodatics.local.launcher import apply_environment, migrate

        apply_environment(pkg, root, pg.url())
        rec.update(migrate())
        rec["alembic_version_in_db"] = query_one(pg, "select version_num from alembic_version")
        rec["public_tables"] = query_one(
            pg, "select count(*) from information_schema.tables where table_schema = 'public'"
        )
        assert rec["alembic_version_in_db"] == rec["head"]
        rec["migrate_again_seconds"] = migrate()["seconds"]

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
                project = Project(id=uuid.uuid4(), owner_id=uuid.uuid4(), name="pg-check-project")
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

        rec.update(asyncio.run(exercise(), loop_factory=asyncio.SelectorEventLoop))
        assert rec["advisory_lock_second_holder"].startswith("refused")
        assert set(rec["jsonb_merge_result"]) == {"P1", "P2"}

    with stage("A4_clean_stop") as rec:
        rec["stop"] = pg.stop()
        rec["control_state"] = pg.control_state()
        rec["pid_file_removed"] = not (pg.data / "postmaster.pid").exists()
        assert rec["control_state"] == "shut down" and rec["pid_file_removed"], rec

    with stage("B_crash_and_recovery") as rec:
        rec["restart"] = pg.start()
        with psycopg.connect(**pg.connect_kwargs()) as conn:
            conn.execute("create table if not exists pg_check_probe(id int primary key, note text)")
            conn.execute("delete from pg_check_probe")
            conn.execute("insert into pg_check_probe select g, 'committed' from generate_series(1, 20000) g")
            conn.commit()
            dangling = psycopg.connect(**pg.connect_kwargs())
            dangling.execute("insert into pg_check_probe values (999999, 'never committed')")
            rec["kill"] = kill_server(pg)
        try:
            dangling.close()
        except Exception:
            pass
        rec["recovery_start"] = pg.start()
        rec["recovery_logged"] = log_has(pg, "automatic recovery in progress")
        rec["committed_rows_survived"] = query_one(pg, "select count(*) from pg_check_probe where note = 'committed'")
        rec["uncommitted_rows_present"] = query_one(pg, "select count(*) from pg_check_probe where id = 999999")
        assert rec["committed_rows_survived"] == 20000 and rec["uncommitted_rows_present"] == 0, rec

    with stage("C_second_start_adopts_the_running_server") as rec:
        again = make_pg(pkg, root)
        rec["second"] = again.start()
        assert rec["second"]["how"] == "adopted" and again.port == pg.port, rec

    with stage("D_interrupted_copy_leaves_no_cluster") as rec:
        from neurodatics.local.postgres import PostgresError

        with tempfile.TemporaryDirectory(prefix="pg-check-broken-") as scratch:
            broken = make_pg(pkg, pathlib.Path(scratch) / "root")
            empty_template = pathlib.Path(scratch) / "not-a-template"
            empty_template.mkdir()
            try:
                broken.ensure_cluster(empty_template)
                rec["outcome"] = "SUCCEEDED (wrong)"
            except PostgresError as exc:
                rec["outcome"] = f"refused: {str(exc)[:100]}"
            rec["cluster_present"] = (broken.data / "PG_VERSION").exists()
            rec["building_left_behind"] = broken.data.with_name(broken.data.name + ".building").exists()
            rec["password_file_left_behind"] = broken.password_file.exists()
            assert rec["outcome"].startswith("refused") and not rec["cluster_present"], rec
            assert not rec["building_left_behind"], rec

    if args.leave_running:
        RESULTS["left_running_port"] = pg.port
        RESULTS["left_running_pid"] = pg.running_pid()
    else:
        with stage("E_final_clean_stop") as rec:
            rec["stop"] = pg.stop()
            rec["control_state"] = pg.control_state()
            assert rec["control_state"] == "shut down", rec

    RESULTS["all_ok"] = all(s["ok"] for s in RESULTS["stages"].values())
    pathlib.Path(args.out).write_text(json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"all_ok": RESULTS["all_ok"], "stages": {n: s["ok"] for n, s in RESULTS["stages"].items()}}))
    return 0 if RESULTS["all_ok"] else 1


def adopt(args) -> int:
    """A previous launcher died leaving the server running: a new launch must adopt and stop it."""
    pkg, root = pathlib.Path(args.pkg), pathlib.Path(args.data_root)
    pg = make_pg(pkg, root)
    with stage("adopt_orphan") as rec:
        rec["start"] = pg.start()
        rec["rows"] = query_one(pg, "select count(*) from pg_check_probe")
        assert rec["start"]["how"] == "adopted", rec["start"]
    with stage("stop_adopted") as rec:
        rec["stop"] = pg.stop()
        rec["control_state"] = pg.control_state()
        assert rec["control_state"] == "shut down", rec
    RESULTS["all_ok"] = all(s["ok"] for s in RESULTS["stages"].values())
    pathlib.Path(args.out).write_text(json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"all_ok": RESULTS["all_ok"]}))
    return 0 if RESULTS["all_ok"] else 1


def main(command: str, argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pkg", default=str(pathlib.Path(sys.executable).resolve().parent))
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--out", default="pg-check.json")
    parser.add_argument("--leave-running", action="store_true")
    args = parser.parse_args(argv)
    return {"pg-check": run, "pg-adopt": adopt}[command](args)

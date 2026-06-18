"""
Direct fix: drop and recreate project_files_kind_allowed constraint.
Run with: python fix_kind_constraint.py
"""

import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql


ALLOWED_KINDS = (
    "experiment_zip",
    "scenario_image",
    "scenario_video",
    "raw_csv",
    "derived_csv",
    "report_pdf",
    "other_asset",
    "processed_parquet",
)


def _find_database_url() -> str | None:
    base_dir = Path(__file__).resolve().parent
    env_candidates = (
        base_dir / ".env",
        base_dir / "src" / "neurodatics" / "config" / ".env",
    )

    for env_path in env_candidates:
        if not env_path.exists():
            continue

        with env_path.open("r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("DATABASE_URL=") or line.startswith("database_url="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")

    return None


def _to_sync_url(database_url: str) -> str:
    return (
        database_url.replace("postgresql+psycopg://", "postgresql://")
        .replace("postgresql+asyncpg://", "postgresql://")
    )


def main() -> int:
    database_url = _find_database_url()
    if not database_url:
        print("ERROR: Could not find DATABASE_URL")
        return 1

    sync_url = _to_sync_url(database_url)
    print("Connecting...")

    with psycopg.connect(sync_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            # 1. Show current constraints on project_files.kind
            print("\n=== Current CHECK constraints on project_files ===")
            cur.execute(
                """
                SELECT con.conname, pg_get_constraintdef(con.oid)
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'project_files'
                  AND nsp.nspname = current_schema()
                  AND con.contype = 'c'
                """
            )
            rows = cur.fetchall()
            if not rows:
                print("  (no CHECK constraints found)")
            else:
                for name, definition in rows:
                    print(f"  {name}: {definition}")

            # 2. Check if processed_parquet is in any constraint
            has_processed_parquet = any(
                "processed_parquet" in (definition or "") for _, definition in rows
            )
            print(f"\n'processed_parquet' in constraints: {has_processed_parquet}")

            # 3. Force fix: drop ALL kind constraints and recreate
            print("\n=== Fixing: dropping all kind constraints and recreating ===")
            cur.execute(
                """
                SELECT con.conname
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'project_files'
                  AND nsp.nspname = current_schema()
                  AND con.contype = 'c'
                  AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
                """
            )
            kind_constraints = cur.fetchall()
            for (name,) in kind_constraints:
                print(f"  Dropping constraint: {name}")
                cur.execute(
                    sql.SQL("ALTER TABLE project_files DROP CONSTRAINT {}")
                    .format(sql.Identifier(name))
                )

            allowed_sql = ", ".join(f"'{kind}'" for kind in ALLOWED_KINDS)
            cur.execute(
                f"""
                ALTER TABLE project_files
                ADD CONSTRAINT project_files_kind_allowed
                CHECK (kind IN ({allowed_sql}))
                """
            )
            print("  Created new constraint with processed_parquet included.")

            # 4. Verify
            print("\n=== Verification ===")
            cur.execute(
                """
                SELECT con.conname, pg_get_constraintdef(con.oid)
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'project_files'
                  AND nsp.nspname = current_schema()
                  AND con.contype = 'c'
                  AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
                """
            )
            verification_rows = cur.fetchall()
            if not verification_rows:
                print("  (no kind constraints found after recreation)")
            else:
                for name, definition in verification_rows:
                    print(f"  {name}: {definition}")

            verified = any(
                "processed_parquet" in (definition or "")
                for _, definition in verification_rows
            )

    if verified:
        print("\nDone! Constraint fixed. Retry the upload now.")
        return 0

    print("\nWARNING: Constraint recreation finished, but 'processed_parquet' was not found in verification output.")
    return 2


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    raise SystemExit(main())

"""
Standalone script to apply migration 015 (add processed_parquet kind).
Run with: python apply_migration_015.py
"""
import os
import sys

# Load .env the same way settings does
env_path = os.path.join(os.path.dirname(__file__), "src", "neurodatics", "config", ".env")
if not os.path.exists(env_path):
    env_path = os.path.join(os.path.dirname(__file__), ".env")

database_url = None
for path in [env_path, os.path.join(os.path.dirname(__file__), ".env"),
             os.path.join(os.path.dirname(__file__), "src", "neurodatics", "config", ".env")]:
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL=") or line.startswith("database_url="):
                    database_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if database_url:
        break

if not database_url:
    print("ERROR: Could not find DATABASE_URL in .env files")
    sys.exit(1)

# Convert async URL to sync if needed
sync_url = database_url.replace("postgresql+psycopg://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://")

print(f"Connecting to database...")

try:
    import psycopg
    conn = psycopg.connect(sync_url, autocommit=True)
except ImportError:
    # Fallback to psycopg2
    import psycopg2
    conn = psycopg2.connect(sync_url)
    conn.autocommit = True

cur = conn.cursor()

# Check current alembic version
cur.execute("SELECT version_num FROM alembic_version")
row = cur.fetchone()
current_version = row[0] if row else None
print(f"Current alembic version: {current_version}")

if current_version == "015":
    print("Migration 015 already applied. Nothing to do.")
    conn.close()
    sys.exit(0)

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

allowed_values_sql = ", ".join(f"'{kind}'" for kind in ALLOWED_KINDS)

print("Applying migration 015: adding processed_parquet to project_files_kind_allowed...")

sql = f"""
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT con.conname AS name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'project_files'
          AND nsp.nspname = current_schema()
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
    LOOP
        EXECUTE format('ALTER TABLE project_files DROP CONSTRAINT %I', rec.name);
    END LOOP;

    ALTER TABLE project_files
    ADD CONSTRAINT project_files_kind_allowed
    CHECK (kind IN ({allowed_values_sql}));
END $$;
"""

cur.execute(sql)
print("Constraint updated successfully.")

# Update alembic version
cur.execute("UPDATE alembic_version SET version_num = '015'")
print("Alembic version updated to 015.")

cur.close()
conn.close()
print("Done! Migration 015 applied successfully.")
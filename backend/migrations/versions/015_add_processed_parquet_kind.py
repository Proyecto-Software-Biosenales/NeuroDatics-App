"""Add processed_parquet to project_files kind constraint

Revision ID: 015
Revises: 014
Create Date: 2026-04-09 12:00:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


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

PREVIOUS_ALLOWED_KINDS = (
    "experiment_zip",
    "scenario_image",
    "scenario_video",
    "raw_csv",
    "derived_csv",
    "report_pdf",
    "other_asset",
)


def upgrade() -> None:
    allowed_values_sql = ", ".join(f"'{kind}'" for kind in ALLOWED_KINDS)

    op.execute(
        f"""
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
    )


def downgrade() -> None:
    previous_values_sql = ", ".join(f"'{kind}'" for kind in PREVIOUS_ALLOWED_KINDS)

    op.execute(
        f"""
        DO $$
        DECLARE
            rec RECORD;
        BEGIN
            DELETE FROM project_files WHERE kind = 'processed_parquet';

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
            CHECK (kind IN ({previous_values_sql}));
        END $$;
        """
    )
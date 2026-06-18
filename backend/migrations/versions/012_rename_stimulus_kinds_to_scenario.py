"""Rename project_files kinds from stimulus_* to scenario_*

Revision ID: 012
Revises: 011
Create Date: 2026-03-24 12:10:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "012"
down_revision = "011"
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
)


def upgrade() -> None:
    allowed_values_sql = ", ".join(f"'{kind}'" for kind in ALLOWED_KINDS)

    op.execute(
        f"""
        DO $$
        DECLARE
            rec RECORD;
        BEGIN
            -- First, map legacy values to new canonical names.
            UPDATE project_files
            SET kind = 'scenario_image'
            WHERE kind = 'stimulus_image';

            UPDATE project_files
            SET kind = 'scenario_video'
            WHERE kind = 'stimulus_video';

            -- Drop previous check constraints on project_files.kind.
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
    op.execute(
        """
        DO $$
        DECLARE
            rec RECORD;
        BEGIN
            -- Revert canonical names to legacy values.
            UPDATE project_files
            SET kind = 'stimulus_image'
            WHERE kind = 'scenario_image';

            UPDATE project_files
            SET kind = 'stimulus_video'
            WHERE kind = 'scenario_video';

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
            CHECK (kind IN ('experiment_zip', 'stimulus_image', 'stimulus_video', 'raw_csv', 'derived_csv', 'report_pdf', 'other_asset'));
        END $$;
        """
    )

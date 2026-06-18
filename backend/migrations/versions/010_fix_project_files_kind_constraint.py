"""Fix project_files kind check constraint for ingestion kinds

Revision ID: 010
Revises: 009
Create Date: 2026-03-24 04:40:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


ALLOWED_KINDS = (
    "experiment_zip",
    "stimulus_image",
    "stimulus_video",
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
            -- Normalize pre-existing unexpected values to keep the constraint add safe.
            UPDATE project_files
            SET kind = 'other_asset'
            WHERE kind IS NOT NULL AND kind NOT IN ({allowed_values_sql});

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

            -- Add canonical kind constraint.
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
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'project_files'
                  AND nsp.nspname = current_schema()
                  AND con.conname = 'project_files_kind_allowed'
            ) THEN
                ALTER TABLE project_files DROP CONSTRAINT project_files_kind_allowed;
            END IF;

            -- Backward-compatible relaxed set for rollback.
            ALTER TABLE project_files
            ADD CONSTRAINT project_files_kind_allowed
            CHECK (kind IN ('experiment_zip', 'stimulus_image', 'stimulus_video', 'raw_csv', 'report_pdf'));
        END $$;
        """
    )

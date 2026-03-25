"""Restore draft project status and default for new projects

Revision ID: 014
Revises: 013
Create Date: 2026-03-25 11:30:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE projects
            DROP CONSTRAINT IF EXISTS project_status_allowed;

            ALTER TABLE projects
            ALTER COLUMN status SET DEFAULT 'DRAFT';

            ALTER TABLE projects
            ADD CONSTRAINT project_status_allowed
            CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'));
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
            UPDATE projects
            SET status = 'ACTIVE'
            WHERE status = 'DRAFT';

            ALTER TABLE projects
            ALTER COLUMN status SET DEFAULT 'ACTIVE';

            FOR rec IN
                SELECT con.conname AS name
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE rel.relname = 'projects'
                  AND nsp.nspname = current_schema()
                  AND con.contype = 'c'
                  AND pg_get_constraintdef(con.oid) ILIKE '%status%'
            LOOP
                EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', rec.name);
            END LOOP;

            ALTER TABLE projects
            ADD CONSTRAINT project_status_allowed
            CHECK (status IN ('ACTIVE', 'ARCHIVED'));
        END $$;
        """
    )

"""Fix project status CHECK constraint to allow DRAFT, ACTIVE, ARCHIVED

Revision ID: 001
Revises: 
Create Date: 2026-03-20 15:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = '000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop existing status-related CHECK constraints safely
    op.execute("""
        DO $$
        DECLARE
            rec RECORD;
        BEGIN
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
        END $$;
    """)
    

    # Add new constraint that allows UPPERCASE (how SQLAlchemy 2.0 stores Enum)
    op.execute("""
        ALTER TABLE projects
        ADD CONSTRAINT project_status_allowed
        CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
    """)


def downgrade() -> None:
    # Remove the constraint
    op.execute("""
        ALTER TABLE projects
        DROP CONSTRAINT IF EXISTS project_status_allowed
    """)


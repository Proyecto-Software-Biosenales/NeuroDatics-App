"""Fix project status CHECK constraint to allow DRAFT, ACTIVE, ARCHIVED

Revision ID: 001
Revises: 
Create Date: 2026-03-20 15:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop any existing constraint on status column (use system catalog to be safe)
    op.execute("""
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_name = 'projects'
                  AND constraint_type = 'CHECK'
            ) LOOP
                EXECUTE 'ALTER TABLE projects DROP CONSTRAINT ' || r.constraint_name;
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


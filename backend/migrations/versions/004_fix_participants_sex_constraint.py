"""Fix participants sex CHECK constraint to allow UPPERCASE enum values

Revision ID: 004
Revises: 003
Create Date: 2026-03-20 19:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop any existing constraint on sex column
    op.execute("""
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_name = 'participants'
                  AND constraint_type = 'CHECK'
            ) LOOP
                EXECUTE 'ALTER TABLE participants DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
            END LOOP;
        END $$;
    """)
    
    # Add new constraint that allows UPPERCASE (how SQLAlchemy 2.0 stores Enum)
    op.execute("""
        ALTER TABLE participants
        ADD CONSTRAINT participants_sex_allowed
        CHECK (sex IN ('MALE', 'FEMALE', 'OTHER') OR sex IS NULL)
    """)


def downgrade() -> None:
    # Remove the constraint
    op.execute("""
        ALTER TABLE participants
        DROP CONSTRAINT IF EXISTS participants_sex_allowed
    """)

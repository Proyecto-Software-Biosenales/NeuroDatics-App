"""Fix participants sex CHECK constraint to allow UPPERCASE enum values

Revision ID: 004
Revises: 003
Create Date: 2026-03-20 19:25:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Replace only single-column sex CHECKs. PostgreSQL 18 also exposes
    # NOT NULL constraints as CHECKs in information_schema.table_constraints.
    op.execute("""
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT c.conname AS constraint_name
                FROM pg_catalog.pg_constraint AS c
                JOIN pg_catalog.pg_attribute AS a
                  ON a.attrelid = c.conrelid AND a.attname = 'sex'
                WHERE c.conrelid = 'participants'::regclass
                  AND c.contype = 'c'
                  AND c.conkey = ARRAY[a.attnum]
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

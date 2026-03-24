"""Add file_id column to scenaries table

Revision ID: 006
Revises: 005
Create Date: 2026-03-24 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add file_id column to scenaries table (safely, checking if it exists)
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'scenaries' AND column_name = 'file_id'
            ) THEN
                ALTER TABLE scenaries ADD COLUMN file_id UUID REFERENCES project_files(id);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Remove file_id column from scenaries table (safely, checking if it exists)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'scenaries' AND column_name = 'file_id'
            ) THEN
                ALTER TABLE scenaries DROP COLUMN file_id;
            END IF;
        END $$;
    """)

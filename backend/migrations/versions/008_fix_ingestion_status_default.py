"""Fix projects.ingestion_status default and nullability

Revision ID: 008
Revises: 007
Create Date: 2026-03-24 04:10:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ingestion_status'
            ) THEN
                UPDATE projects
                SET ingestion_status = 'PENDING'
                WHERE ingestion_status IS NULL;

                ALTER TABLE projects
                ALTER COLUMN ingestion_status SET DEFAULT 'PENDING';

                ALTER TABLE projects
                ALTER COLUMN ingestion_status SET NOT NULL;
            END IF;
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
                FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ingestion_status'
            ) THEN
                ALTER TABLE projects
                ALTER COLUMN ingestion_status DROP NOT NULL;

                ALTER TABLE projects
                ALTER COLUMN ingestion_status DROP DEFAULT;
            END IF;
        END $$;
        """
    )

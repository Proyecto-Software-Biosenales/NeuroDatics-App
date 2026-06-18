"""Fix projects.storage_provider default and nullability

Revision ID: 009
Revises: 008
Create Date: 2026-03-24 04:25:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "009"
down_revision = "008"
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
                WHERE table_name = 'projects' AND column_name = 'storage_provider'
            ) THEN
                UPDATE projects
                SET storage_provider = 'gdrive'
                WHERE storage_provider IS NULL;

                ALTER TABLE projects
                ALTER COLUMN storage_provider SET DEFAULT 'gdrive';

                ALTER TABLE projects
                ALTER COLUMN storage_provider SET NOT NULL;
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
                WHERE table_name = 'projects' AND column_name = 'storage_provider'
            ) THEN
                ALTER TABLE projects
                ALTER COLUMN storage_provider DROP NOT NULL;

                ALTER TABLE projects
                ALTER COLUMN storage_provider DROP DEFAULT;
            END IF;
        END $$;
        """
    )

"""Record the picked folder name now that the browser-built ZIP is not stored.

Revision ID: 025
Revises: 024
"""

from alembic import op
import sqlalchemy as sa

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("source_folder_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "source_folder_name")

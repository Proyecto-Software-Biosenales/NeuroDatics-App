"""Persist participant transform tokens for analytics cache lookups.

Revision ID: 024
Revises: 023
"""

from alembic import op
import sqlalchemy as sa

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("analytics_transform_tokens", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "analytics_transform_tokens")

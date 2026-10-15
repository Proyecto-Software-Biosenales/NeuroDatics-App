"""Store each person's global settings, starting with the acquisition screen.

Revision ID: 028
Revises: 027
"""

from alembic import op
import sqlalchemy as sa

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("owner_id", sa.Uuid(), primary_key=True),
        sa.Column("screen", sa.JSON(), nullable=True),
        sa.Column("screen_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("user_settings")

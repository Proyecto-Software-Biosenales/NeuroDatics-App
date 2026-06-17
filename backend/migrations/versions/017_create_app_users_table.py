"""Create app users table

Revision ID: 017
Revises: 016
Create Date: 2026-06-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("app_users"):
        op.create_table(
            "app_users",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("google_sub", sa.String(255), nullable=False),
            sa.Column("email", sa.String(320), nullable=True),
            sa.Column("full_name", sa.String(255), nullable=True),
            sa.Column("picture_url", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("google_sub", name="uq_app_users_google_sub"),
        )

    indexes = {index["name"] for index in inspector.get_indexes("app_users")}
    if "ix_app_users_email" not in indexes:
        op.create_index("ix_app_users_email", "app_users", ["email"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if inspector.has_table("app_users"):
        indexes = {index["name"] for index in inspector.get_indexes("app_users")}
        if "ix_app_users_email" in indexes:
            op.drop_index("ix_app_users_email", table_name="app_users")
        op.drop_table("app_users")

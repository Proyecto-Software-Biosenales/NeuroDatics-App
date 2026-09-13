"""Record upload outcomes, cancellation and pending Drive cleanup.

Revision ID: 022
Revises: 021
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "upload_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("phase", sa.String(20), nullable=False, server_default="processing"),
        sa.Column(
            "cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("root_folder_id", sa.String(255)),
        sa.Column("cleanup_root_id", sa.String(255)),
        sa.Column("progress", sa.JSON()),
        sa.Column("error", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_upload_attempts_project_id", "upload_attempts", ["project_id"])
    op.create_table(
        "drive_cleanup_tasks",
        sa.Column("external_id", sa.String(255), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
    )


def downgrade():
    op.drop_table("drive_cleanup_tasks")
    op.drop_table("upload_attempts")

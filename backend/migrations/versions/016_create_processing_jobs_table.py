"""Create processing_jobs table

Revision ID: 016
Revises: 015
Create Date: 2026-04-10 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("processing_jobs"):
        op.create_table(
            "processing_jobs",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column(
                "project_id",
                UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("job_id", sa.String(length=255), nullable=True, unique=True),
            sa.Column("job_type", sa.String(length=100), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="QUEUED"),
            sa.Column("progress_percent", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("error_detail", sa.Text(), nullable=True),
            sa.Column("result_metadata", sa.JSON(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

        op.create_index(
            "ix_processing_jobs_project_status",
            "processing_jobs",
            ["project_id", "status"],
        )


def downgrade() -> None:
    op.drop_table("processing_jobs")

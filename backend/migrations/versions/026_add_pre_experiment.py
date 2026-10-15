"""Persist planning configuration and immutable questionnaire submissions.

Revision ID: 026
Revises: 025
"""

from alembic import op
import sqlalchemy as sa

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("pre_experiment", sa.JSON(), nullable=True))
    op.add_column("projects", sa.Column("pre_experiment_revision", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "pre_experiment_responses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("participant_id", sa.Uuid(), nullable=False),
        sa.Column("phase", sa.String(10), nullable=False),
        sa.Column("participant_snapshot", sa.JSON(), nullable=False),
        sa.Column("questionnaire_snapshot", sa.JSON(), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_pre_experiment_responses_project_id", "pre_experiment_responses", ["project_id"])


def downgrade() -> None:
    op.drop_table("pre_experiment_responses")
    op.drop_column("projects", "pre_experiment_revision")
    op.drop_column("projects", "pre_experiment")

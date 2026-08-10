"""Create static acquisition-time stimulus placements.

Revision ID: 020
Revises: 019
Create Date: 2026-08-09 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stimulus_placements",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "scenaries_id",
            UUID(as_uuid=True),
            sa.ForeignKey("scenaries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("contract_version", sa.String(40), nullable=False),
        sa.Column("geometry_stability", sa.String(20), nullable=False),
        sa.Column("screen_width_px", sa.Integer(), nullable=False),
        sa.Column("screen_height_px", sa.Integer(), nullable=False),
        sa.Column("stimulus_left_px", sa.Float(precision=53), nullable=False),
        sa.Column("stimulus_top_px", sa.Float(precision=53), nullable=False),
        sa.Column("stimulus_width_px", sa.Float(precision=53), nullable=False),
        sa.Column("stimulus_height_px", sa.Float(precision=53), nullable=False),
        sa.Column("display_mode", sa.String(20), nullable=False),
        sa.Column("viewport_left_px", sa.Float(precision=53), nullable=True),
        sa.Column("viewport_top_px", sa.Float(precision=53), nullable=True),
        sa.Column("viewport_width_px", sa.Float(precision=53), nullable=True),
        sa.Column("viewport_height_px", sa.Float(precision=53), nullable=True),
        sa.Column("scroll_x_px", sa.Float(precision=53), nullable=True),
        sa.Column("scroll_y_px", sa.Float(precision=53), nullable=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("contract_fingerprint", sa.CHAR(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "scenaries_id",
            name="uq_stimulus_placements_scenaries_id",
        ),
        sa.CheckConstraint(
            "contract_version = 'screen-stimulus-v1'",
            name="ck_stimulus_placements_contract_version",
        ),
        sa.CheckConstraint(
            "geometry_stability = 'static'",
            name="ck_stimulus_placements_geometry_stability",
        ),
        sa.CheckConstraint(
            "screen_width_px > 0 AND screen_height_px > 0",
            name="ck_stimulus_placements_screen_size_positive",
        ),
        sa.CheckConstraint(
            "stimulus_left_px BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308 "
            "AND stimulus_top_px BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308",
            name="ck_stimulus_placements_origin_finite",
        ),
        sa.CheckConstraint(
            "stimulus_width_px > 0 AND stimulus_width_px <= 1.7976931348623157e308 "
            "AND stimulus_height_px > 0 AND stimulus_height_px <= 1.7976931348623157e308",
            name="ck_stimulus_placements_display_size_positive_finite",
        ),
        sa.CheckConstraint(
            "display_mode IN ('contain', 'cover', 'crop', 'fullscreen')",
            name="ck_stimulus_placements_display_mode",
        ),
        sa.CheckConstraint(
            "((viewport_left_px IS NULL AND viewport_top_px IS NULL "
            "AND viewport_width_px IS NULL AND viewport_height_px IS NULL "
            "AND scroll_x_px IS NULL AND scroll_y_px IS NULL) "
            "OR (viewport_left_px IS NOT NULL AND viewport_top_px IS NOT NULL "
            "AND viewport_width_px IS NOT NULL AND viewport_height_px IS NOT NULL "
            "AND scroll_x_px IS NOT NULL AND scroll_y_px IS NOT NULL))",
            name="ck_stimulus_placements_viewport_atomic",
        ),
        sa.CheckConstraint(
            "viewport_left_px IS NULL OR ("
            "viewport_left_px >= 0 AND viewport_top_px >= 0 "
            "AND viewport_width_px > 0 AND viewport_height_px > 0 "
            "AND viewport_left_px + viewport_width_px <= screen_width_px "
            "AND viewport_top_px + viewport_height_px <= screen_height_px "
            "AND scroll_x_px >= 0 AND scroll_x_px <= 1.7976931348623157e308 "
            "AND scroll_y_px >= 0 AND scroll_y_px <= 1.7976931348623157e308)",
            name="ck_stimulus_placements_viewport_bounds",
        ),
        sa.CheckConstraint(
            "source IN ('user_config', 'acquisition_metadata')",
            name="ck_stimulus_placements_source",
        ),
        sa.CheckConstraint(
            "contract_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_stimulus_placements_fingerprint",
        ),
    )


def downgrade() -> None:
    op.drop_table("stimulus_placements")

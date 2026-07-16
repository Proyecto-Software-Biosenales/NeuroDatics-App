"""Align shared database head.

Revision ID: 018
Revises: 017
Create Date: 2026-07-16 00:00:00.000000

"""

# revision identifiers, used by Alembic.
revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Compatibility marker for shared databases already stamped at 018."""
    pass


def downgrade() -> None:
    """No schema changes to revert."""
    pass

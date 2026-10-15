"""Store an optional participant name and a corrected document.

The extracted ``participant_code`` stays as the immutable key of the recording;
``document`` overrides what the interface shows as the document and ``name``,
when present, replaces it as the participant label.

Revision ID: 027
Revises: 026
"""

from alembic import op
import sqlalchemy as sa

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("name", sa.String(120), nullable=True))
    op.add_column("participants", sa.Column("document", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "document")
    op.drop_column("participants", "name")

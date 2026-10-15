"""Index the project-scoping foreign keys.

PostgreSQL does not index a foreign key on its own, so every project-scoped
query was a sequential scan, including the Parquet resolution that runs on
every analytics read.

Revision ID: 023
Revises: 022
"""

from alembic import op


revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None

INDEXES = (
    ("ix_project_files_project_id_kind", "project_files", ["project_id", "kind"]),
    ("ix_projects_owner_id", "projects", ["owner_id"]),
    ("ix_participants_project_id", "participants", ["project_id"]),
    ("ix_scenaries_project_id", "scenaries", ["project_id"]),
    ("ix_scenaries_file_id", "scenaries", ["file_id"]),
    ("ix_aois_scenaries_id", "aois", ["scenaries_id"]),
)


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table)

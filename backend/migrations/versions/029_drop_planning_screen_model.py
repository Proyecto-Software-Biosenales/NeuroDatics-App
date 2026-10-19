"""Remove the screen name from the stored pre-experiment planning.

``screen.model`` was a label nothing used; the interface no longer asks for it
and the schema drops it on read. This removes it from what was already saved.
There is nothing to restore on downgrade.

Revision ID: 029
Revises: 028
"""

from alembic import op
import sqlalchemy as sa

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    projects = sa.table("projects", sa.column("id"), sa.column("pre_experiment", sa.JSON()))
    connection = op.get_bind()
    rows = connection.execute(sa.select(projects.c.id, projects.c.pre_experiment)).all()
    for project_id, config in rows:
        screen = config.get("screen") if isinstance(config, dict) else None
        if not isinstance(screen, dict) or "model" not in screen:
            continue
        cleaned = {**config, "screen": {key: value for key, value in screen.items() if key != "model"}}
        connection.execute(projects.update().where(projects.c.id == project_id).values(pre_experiment=cleaned))


def downgrade() -> None:
    pass

"""Fix project_sensors table schema to match ORM model

Revision ID: 002
Revises: 001
Create Date: 2026-03-20 16:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old table data
    op.execute("DROP TABLE IF EXISTS project_sensors CASCADE")

    # Create new project_sensors table with correct schema
    op.create_table(
        'project_sensors',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('sensor_type', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    
    # Create index on project_id for faster lookups
    op.create_index('ix_project_sensors_project_id', 'project_sensors', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_project_sensors_project_id', table_name='project_sensors')
    op.drop_table('project_sensors')

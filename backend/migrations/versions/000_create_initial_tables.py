"""Create initial database tables

This migration creates the base schema on a fresh database.
All subsequent numbered migrations chain from this one.

Revision ID: 000
Revises:
Create Date: 2026-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = '000'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── projects ──────────────────────────────────────────────────────────────
    # Minimal pre-001 state: no ingestion_*/storage_provider/drive_* columns.
    # Migration 007 adds those later via IF NOT EXISTS blocks.
    op.create_table(
        'projects',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('owner_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # ── project_files ─────────────────────────────────────────────────────────
    # No updated_at (migration 003 adds it).
    # No validation/processing/drive/zip fields (migrations 005, 007 add them).
    op.create_table(
        'project_files',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('kind', sa.String(50), nullable=False),
        sa.Column('storage_provider', sa.String(20), nullable=False),
        sa.Column('external_id', sa.String(255), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('checksum_sha256', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # ── project_sensors ───────────────────────────────────────────────────────
    # Migration 002 does DROP TABLE IF EXISTS project_sensors CASCADE then
    # recreates it with the correct schema. Any minimal schema here is fine.
    op.create_table(
        'project_sensors',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # ── participants ──────────────────────────────────────────────────────────
    # No updated_at (migration 003 adds it).
    # sex is plain VARCHAR — migration 004 adds the CHECK constraint.
    op.create_table(
        'participants',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('participant_code', sa.String(50), nullable=False),
        sa.Column('age', sa.Integer(), nullable=True),
        sa.Column('sex', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # ── scenaries ─────────────────────────────────────────────────────────────
    # No file_id (migration 006 adds it).
    # No source_entry_path / fps / duration_ms (migration 007 adds them).
    op.create_table(
        'scenaries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # ── aois ──────────────────────────────────────────────────────────────────
    # No later migration adds columns to this table — create with full schema.
    op.create_table(
        'aois',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('scenaries_id', UUID(as_uuid=True), sa.ForeignKey('scenaries.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('color', sa.String(7), nullable=False),
        sa.Column('shape_type', sa.String(20), nullable=False),
        sa.Column('shape', JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('aois')
    op.drop_table('scenaries')
    op.drop_table('participants')
    op.drop_table('project_sensors')
    op.drop_table('project_files')
    op.drop_table('projects')

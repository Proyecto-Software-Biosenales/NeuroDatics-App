"""Add ZIP validation and processing fields to project_files

Revision ID: 005
Revises: 004
Create Date: 2026-03-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to project_files table (safely, checking if they exist)
    # Using PostgreSQL conditional syntax to avoid errors if columns already exist
    
    migration_sqls = [
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'original_filename'
            ) THEN
                ALTER TABLE project_files ADD COLUMN original_filename VARCHAR(255);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'drive_web_view_link'
            ) THEN
                ALTER TABLE project_files ADD COLUMN drive_web_view_link VARCHAR(500);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'drive_download_link'
            ) THEN
                ALTER TABLE project_files ADD COLUMN drive_download_link VARCHAR(500);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'validation_status'
            ) THEN
                ALTER TABLE project_files ADD COLUMN validation_status VARCHAR(20);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'validation_errors'
            ) THEN
                ALTER TABLE project_files ADD COLUMN validation_errors JSONB;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'processing_status'
            ) THEN
                ALTER TABLE project_files ADD COLUMN processing_status VARCHAR(20);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'processed_at'
            ) THEN
                ALTER TABLE project_files ADD COLUMN processed_at TIMESTAMP;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'zip_manifest'
            ) THEN
                ALTER TABLE project_files ADD COLUMN zip_manifest JSONB;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'entry_count'
            ) THEN
                ALTER TABLE project_files ADD COLUMN entry_count INTEGER;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'root_folder_name'
            ) THEN
                ALTER TABLE project_files ADD COLUMN root_folder_name VARCHAR(255);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'deleted_at'
            ) THEN
                ALTER TABLE project_files ADD COLUMN deleted_at TIMESTAMP;
            END IF;
        END $$;
        """
    ]
    
    for sql in migration_sqls:
        op.execute(sql)


def downgrade() -> None:
    # Remove added columns (safely, checking if they exist)
    
    downgrade_sqls = [
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'deleted_at'
            ) THEN
                ALTER TABLE project_files DROP COLUMN deleted_at;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'root_folder_name'
            ) THEN
                ALTER TABLE project_files DROP COLUMN root_folder_name;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'entry_count'
            ) THEN
                ALTER TABLE project_files DROP COLUMN entry_count;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'zip_manifest'
            ) THEN
                ALTER TABLE project_files DROP COLUMN zip_manifest;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'processed_at'
            ) THEN
                ALTER TABLE project_files DROP COLUMN processed_at;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'processing_status'
            ) THEN
                ALTER TABLE project_files DROP COLUMN processing_status;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'validation_errors'
            ) THEN
                ALTER TABLE project_files DROP COLUMN validation_errors;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'validation_status'
            ) THEN
                ALTER TABLE project_files DROP COLUMN validation_status;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'drive_download_link'
            ) THEN
                ALTER TABLE project_files DROP COLUMN drive_download_link;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'drive_web_view_link'
            ) THEN
                ALTER TABLE project_files DROP COLUMN drive_web_view_link;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'project_files' AND column_name = 'original_filename'
            ) THEN
                ALTER TABLE project_files DROP COLUMN original_filename;
            END IF;
        END $$;
        """
    ]
    
    for sql in downgrade_sqls:
        op.execute(sql)

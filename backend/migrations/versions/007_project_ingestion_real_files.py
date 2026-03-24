"""Add real-file ingestion fields for projects, project_files and scenaries

Revision ID: 007
Revises: 006
Create Date: 2026-03-23 22:00:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_blocks = [
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ingestion_status'
            ) THEN
                ALTER TABLE projects ADD COLUMN ingestion_status VARCHAR(20);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ingestion_error'
            ) THEN
                ALTER TABLE projects ADD COLUMN ingestion_error TEXT;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'last_ingested_at'
            ) THEN
                ALTER TABLE projects ADD COLUMN last_ingested_at TIMESTAMP;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'storage_provider'
            ) THEN
                ALTER TABLE projects ADD COLUMN storage_provider VARCHAR(20);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'drive_root_folder_id'
            ) THEN
                ALTER TABLE projects ADD COLUMN drive_root_folder_id VARCHAR(255);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'drive_root_folder_name'
            ) THEN
                ALTER TABLE projects ADD COLUMN drive_root_folder_name VARCHAR(255);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'drive_root_folder_url'
            ) THEN
                ALTER TABLE projects ADD COLUMN drive_root_folder_url VARCHAR(500);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'source_zip_id'
            ) THEN
                ALTER TABLE project_files ADD COLUMN source_zip_id UUID REFERENCES project_files(id);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'drive_parent_external_id'
            ) THEN
                ALTER TABLE project_files ADD COLUMN drive_parent_external_id VARCHAR(255);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'source_entry_path'
            ) THEN
                ALTER TABLE project_files ADD COLUMN source_entry_path VARCHAR(1024);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'extension'
            ) THEN
                ALTER TABLE project_files ADD COLUMN extension VARCHAR(20);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'processing_errors'
            ) THEN
                ALTER TABLE project_files ADD COLUMN processing_errors JSONB;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'file_metadata'
            ) THEN
                ALTER TABLE project_files ADD COLUMN file_metadata JSONB;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scenaries' AND column_name = 'source_entry_path'
            ) THEN
                ALTER TABLE scenaries ADD COLUMN source_entry_path VARCHAR(1024);
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scenaries' AND column_name = 'fps'
            ) THEN
                ALTER TABLE scenaries ADD COLUMN fps INTEGER;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scenaries' AND column_name = 'duration_ms'
            ) THEN
                ALTER TABLE scenaries ADD COLUMN duration_ms INTEGER;
            END IF;
        END $$;
        """,
    ]

    for sql in sql_blocks:
        op.execute(sql)


def downgrade() -> None:
    sql_blocks = [
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scenaries' AND column_name = 'duration_ms'
            ) THEN
                ALTER TABLE scenaries DROP COLUMN duration_ms;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scenaries' AND column_name = 'fps'
            ) THEN
                ALTER TABLE scenaries DROP COLUMN fps;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scenaries' AND column_name = 'source_entry_path'
            ) THEN
                ALTER TABLE scenaries DROP COLUMN source_entry_path;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'file_metadata'
            ) THEN
                ALTER TABLE project_files DROP COLUMN file_metadata;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'processing_errors'
            ) THEN
                ALTER TABLE project_files DROP COLUMN processing_errors;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'extension'
            ) THEN
                ALTER TABLE project_files DROP COLUMN extension;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'source_entry_path'
            ) THEN
                ALTER TABLE project_files DROP COLUMN source_entry_path;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'drive_parent_external_id'
            ) THEN
                ALTER TABLE project_files DROP COLUMN drive_parent_external_id;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_files' AND column_name = 'source_zip_id'
            ) THEN
                ALTER TABLE project_files DROP COLUMN source_zip_id;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'drive_root_folder_url'
            ) THEN
                ALTER TABLE projects DROP COLUMN drive_root_folder_url;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'drive_root_folder_name'
            ) THEN
                ALTER TABLE projects DROP COLUMN drive_root_folder_name;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'drive_root_folder_id'
            ) THEN
                ALTER TABLE projects DROP COLUMN drive_root_folder_id;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'storage_provider'
            ) THEN
                ALTER TABLE projects DROP COLUMN storage_provider;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'last_ingested_at'
            ) THEN
                ALTER TABLE projects DROP COLUMN last_ingested_at;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ingestion_error'
            ) THEN
                ALTER TABLE projects DROP COLUMN ingestion_error;
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ingestion_status'
            ) THEN
                ALTER TABLE projects DROP COLUMN ingestion_status;
            END IF;
        END $$;
        """,
    ]

    for sql in sql_blocks:
        op.execute(sql)

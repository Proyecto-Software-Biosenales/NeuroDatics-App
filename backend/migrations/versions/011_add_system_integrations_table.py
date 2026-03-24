"""Add global system integrations table

Revision ID: 011
Revises: 010
Create Date: 2026-03-24 16:30:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS system_integrations (
            id UUID PRIMARY KEY,
            provider VARCHAR(100) NOT NULL UNIQUE,
            account_email VARCHAR(320),
            refresh_token TEXT,
            access_token TEXT,
            scope TEXT,
            token_type VARCHAR(50),
            expires_at TIMESTAMPTZ,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_system_integrations_provider
        ON system_integrations(provider);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS system_integrations;")

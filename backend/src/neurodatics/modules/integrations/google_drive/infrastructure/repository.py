import json
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SystemIntegrationRepository:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def get_by_provider(self, provider: str) -> Optional[dict[str, Any]]:
        result = await self._db.execute(
            text(
                """
                SELECT
                    id,
                    provider,
                    account_email,
                    refresh_token,
                    access_token,
                    scope,
                    token_type,
                    expires_at,
                    metadata,
                    created_at,
                    updated_at
                FROM system_integrations
                WHERE provider = :provider
                LIMIT 1
                """
            ),
            {"provider": provider},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def upsert_provider_connection(
        self,
        *,
        provider: str,
        account_email: Optional[str],
        refresh_token: str,
        access_token: Optional[str],
        scope: Optional[str],
        token_type: Optional[str],
        expires_at: Optional[datetime],
        metadata: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        metadata_payload = json.dumps(metadata) if metadata is not None else None

        await self._db.execute(
            text(
                """
                INSERT INTO system_integrations (
                    id,
                    provider,
                    account_email,
                    refresh_token,
                    access_token,
                    scope,
                    token_type,
                    expires_at,
                    metadata
                )
                VALUES (
                    :id,
                    :provider,
                    :account_email,
                    :refresh_token,
                    :access_token,
                    :scope,
                    :token_type,
                    :expires_at,
                    CAST(:metadata AS JSONB)
                )
                ON CONFLICT (provider)
                DO UPDATE
                SET
                    account_email = EXCLUDED.account_email,
                    refresh_token = EXCLUDED.refresh_token,
                    access_token = EXCLUDED.access_token,
                    scope = EXCLUDED.scope,
                    token_type = EXCLUDED.token_type,
                    expires_at = EXCLUDED.expires_at,
                    metadata = EXCLUDED.metadata,
                    updated_at = now()
                """
            ),
            {
                "id": uuid.uuid4(),
                "provider": provider,
                "account_email": account_email,
                "refresh_token": refresh_token,
                "access_token": access_token,
                "scope": scope,
                "token_type": token_type,
                "expires_at": expires_at,
                "metadata": metadata_payload,
            },
        )
        await self._db.commit()

        integration = await self.get_by_provider(provider)
        if not integration:
            raise RuntimeError("Global integration was not persisted")
        return integration

    async def delete_by_provider(self, provider: str) -> bool:
        result = await self._db.execute(
            text("DELETE FROM system_integrations WHERE provider = :provider"),
            {"provider": provider},
        )
        await self._db.commit()
        return result.rowcount > 0

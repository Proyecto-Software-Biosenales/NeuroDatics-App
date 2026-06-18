from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict
import json
import uuid

from ....config.settings import settings


@dataclass
class StoredUser:
    id: str
    email: str | None
    name: str | None
    google_sub: str | None
    provider: str
    updated_at: str


class JsonAuthUserStore:
    def __init__(self, file_path: str):
        self._path = Path(file_path)
        self._lock = Lock()

    def _read_payload(self) -> Dict[str, Any]:
        if not self._path.exists():
            return {"users": {}}

        raw = self._path.read_text(encoding="utf-8")
        if not raw.strip():
            return {"users": {}}

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {"users": {}}

        if not isinstance(parsed, dict):
            return {"users": {}}

        users = parsed.get("users")
        if not isinstance(users, dict):
            return {"users": {}}

        return {"users": users}

    def _write_payload(self, payload: Dict[str, Any]):
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    def get_user(self, user_id: str) -> StoredUser | None:
        """Retrieve a user by ID"""
        with self._lock:
            payload = self._read_payload()
            users = payload.get("users", {})
            user_data = users.get(user_id)
            
            if not user_data:
                return None
            
            return StoredUser(
                id=user_data.get("id"),
                email=user_data.get("email"),
                name=user_data.get("name"),
                google_sub=user_data.get("google_sub"),
                provider=user_data.get("provider", "unknown"),
                updated_at=user_data.get("updated_at", ""),
            )

    def upsert_google_user(
        self,
        email: str | None,
        name: str | None,
        google_sub: str | None = None,
        user_id_override: str | None = None,
    ) -> StoredUser:
        now = datetime.now(timezone.utc).isoformat()
        stable_key = (google_sub or email or name or "user").strip().lower()
        user_id = user_id_override or str(uuid.uuid5(uuid.NAMESPACE_URL, f"google:{stable_key}"))

        with self._lock:
            payload = self._read_payload()
            payload["users"][user_id] = {
                "id": user_id,
                "email": email,
                "name": name,
                "google_sub": google_sub,
                "provider": "google",
                "updated_at": now,
            }
            self._write_payload(payload)

        return StoredUser(
            id=user_id,
            email=email,
            name=name,
            google_sub=google_sub,
            provider="google",
            updated_at=now,
        )


auth_user_store = JsonAuthUserStore(settings.auth_user_store_path)

from __future__ import annotations

import os
from typing import Any, Literal, Optional
from urllib.parse import parse_qs, urlsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_LOCAL_DATABASE_HOSTS = {"db", "localhost", "127.0.0.1", "::1"}
_INSECURE_JWT_SECRETS = {
    "",
    "change-me-in-production",
    "neurodatics-local-development-secret-change-me",
    "change-this-neurodatics-local-secret-before-sharing",
    "replace-with-a-long-random-secret",
    "replace-this-with-a-unique-random-secret-of-at-least-32-characters",
}
_ACCEPTED_SSL_MODES = {"require", "verify-ca", "verify-full"}


class Settings(BaseSettings):
    """Runtime configuration with production safety checks."""

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"),
        case_sensitive=False,
        extra="ignore",
    )

    # Runtime
    app_env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    app_name: str = "NeuroDatics API"

    # Database
    database_url: str
    readiness_timeout_seconds: float = 3.0
    network_preflight_timeout_seconds: float = 10.0

    # Google OAuth
    google_oauth_client_id: Optional[str] = None
    google_oauth_client_secret: Optional[str] = None
    google_oauth_authorize_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_oauth_userinfo_url: str = "https://openidconnect.googleapis.com/v1/userinfo"
    google_oauth_redirect_uri: Optional[str] = None
    google_drive_oauth_redirect_uri: Optional[str] = None
    google_drive_oauth_state_ttl_seconds: int = 600

    # Auth JWT
    auth_jwt_secret: str
    auth_jwt_algorithm: str = "HS256"
    auth_jwt_issuer: str = "neurodatics-backend"
    auth_access_token_exp_minutes: int = 14 * 24 * 60
    auth_user_store_path: str = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "data", "auth_users.json"
    )

    # Browser access. Docker uses same-origin /api, so only explicit direct clients
    # need to be listed here.
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Google Drive
    google_application_credentials: Optional[str] = None
    gdrive_service_account_json: Optional[str] = None
    gdrive_folder_id: Optional[str] = None
    gdrive_refresh_token: Optional[str] = None
    gdrive_http_timeout_seconds: int = 300
    gdrive_request_retries: int = 5
    project_zip_max_size_mb: int = 500
    ingestion_save_original_zip: bool = True

    # Google Drive folder sync. Empty means the sync-folder endpoints are disabled;
    # any other value is the only directory tree they are allowed to read from.
    gdrive_sync_allowed_root: Optional[str] = None

    # ZIP decompression guards (zip-bomb defence). The compressed cap above is not
    # enough on its own: a small archive can expand without bound.
    project_zip_max_uncompressed_mb: int = 2000
    project_zip_max_entry_uncompressed_mb: int = 600
    project_zip_max_entries: int = 20000
    project_zip_max_compression_ratio: float = 100.0

    # Upload throttling. Ingestion is synchronous and memory-hungry, so a single
    # user must not be able to start several runs at once.
    upload_max_concurrent_per_user: int = 1
    upload_max_concurrent_global: int = 4
    upload_min_seconds_between_uploads: float = 5.0

    # Redis / Queue
    redis_url: str = "redis://localhost:6379"
    redis_socket_connect_timeout_seconds: float = 3.0
    redis_socket_timeout_seconds: float = 3.0
    redis_worker_socket_timeout_seconds: Optional[float] = 450.0

    # Analytics cache
    parquet_cache_dir: str = "/data/parquet_cache"
    parquet_cache_ttl_hours: int = 4
    analytics_redis_ttl_seconds: int = 900
    image_cache_dir: str = "/data/image_cache"
    video_cache_dir: str = "/data/video_cache"
    video_frame_cache_dir: str = "/data/video_frame_cache"
    parquet_cache_keep_previous_generations: int = 1
    parquet_cache_prune_max_removals: int = 32
    analytics_redis_stale_generation_max_deletions: int = 5000

    # Media disk caches. Re-uploads mint new file ids, so old entries are never
    # revisited and would otherwise grow without bound; the caps below bound the
    # janitor sweep so it can never stall a request path.
    media_cache_max_bytes: int = 2 * 1024 * 1024 * 1024
    media_cache_max_age_hours: int = 72
    media_cache_prune_max_removals: int = 500

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug_flag(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "production", "prod"}:
                return False
            if normalized in {"development", "dev"}:
                return True
        return value

    @field_validator("redis_worker_socket_timeout_seconds", mode="before")
    @classmethod
    def parse_optional_worker_redis_timeout(cls, value: Any) -> Any:
        if isinstance(value, str) and value.strip().lower() in {"", "none", "null"}:
            return None
        return value

    @property
    def cors_origins(self) -> list[str]:
        """Return normalized origins without allowing broad private-network ranges."""
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        secret = self.auth_jwt_secret.strip()
        if not secret:
            raise ValueError("AUTH_JWT_SECRET must be set.")

        if self.app_env != "production":
            return self

        if self.debug:
            raise ValueError("DEBUG must be false when APP_ENV=production.")

        if secret in _INSECURE_JWT_SECRETS or len(secret) < 32:
            raise ValueError(
                "AUTH_JWT_SECRET must be a unique production secret with at least 32 characters."
            )

        parsed_url = urlsplit(self.database_url)
        host = parsed_url.hostname
        if not parsed_url.scheme.startswith("postgresql") or not host:
            raise ValueError("DATABASE_URL must be a PostgreSQL connection URL in production.")

        # Docker's local PostgreSQL service stays on an internal network. Any
        # external database, including Supabase, must opt into encrypted transport.
        if host.lower() not in _LOCAL_DATABASE_HOSTS:
            query_params = {
                key.lower(): values
                for key, values in parse_qs(parsed_url.query, keep_blank_values=True).items()
            }
            sslmode = query_params.get("sslmode", [""])[-1].lower()
            if sslmode not in _ACCEPTED_SSL_MODES:
                raise ValueError(
                    "External DATABASE_URL values must set sslmode=require, "
                    "verify-ca, or verify-full in production."
                )

        return self


settings = Settings()

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # Database
    database_url: str

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
    auth_jwt_secret: str = "change-me-in-production"
    auth_jwt_algorithm: str = "HS256"
    auth_jwt_issuer: str = "neurodatics-backend"
    auth_access_token_exp_minutes: int = 60
    auth_refresh_token_exp_minutes: int = 43200
    auth_user_store_path: str = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "auth_users.json")
    
    # Google Drive
    google_application_credentials: Optional[str] = None
    gdrive_service_account_json: Optional[str] = None
    gdrive_folder_id: Optional[str] = None
    gdrive_refresh_token: Optional[str] = None
    gdrive_http_timeout_seconds: int = 300
    gdrive_request_retries: int = 5
    project_zip_max_size_mb: int = 500
    ingestion_save_original_zip: bool = True

    # Redis / Queue
    redis_url: str = "redis://localhost:6379"
    
    # App
    app_name: str = "NeuroDatics API"
    debug: bool = False

    # Analytics cache
    parquet_cache_dir: str = "/data/parquet_cache"
    parquet_cache_ttl_hours: int = 4
    analytics_redis_ttl_seconds: int = 900
    
    class Config:
        env_file = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
        case_sensitive = False
        extra = "ignore"


settings = Settings()

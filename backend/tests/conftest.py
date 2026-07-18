import os


# Keep imports deterministic without requiring a local .env or network services.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@db:5432/neurodatics",
)
os.environ.setdefault("REDIS_URL", "redis://redis:6379")
os.environ.setdefault("AUTH_JWT_SECRET", "test-secret-that-is-long-enough-for-unit-tests")

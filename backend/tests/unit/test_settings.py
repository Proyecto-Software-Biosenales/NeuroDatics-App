import pytest
from pydantic import ValidationError

from neurodatics.config.settings import Settings


def make_production_settings(**overrides):
    values = {
        "app_env": "production",
        "debug": False,
        "auth_jwt_secret": "a-unique-production-secret-with-more-than-thirty-two-characters",
        "database_url": "postgresql+psycopg://postgres:secret@db:5432/neurodatics",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_rejects_placeholder_jwt_secret():
    with pytest.raises(ValidationError, match="AUTH_JWT_SECRET"):
        make_production_settings(auth_jwt_secret="change-me-in-production")


def test_production_rejects_documented_example_jwt_secret():
    with pytest.raises(ValidationError, match="AUTH_JWT_SECRET"):
        make_production_settings(
            auth_jwt_secret=(
                "replace-this-with-a-unique-random-secret-of-at-least-32-characters"
            )
        )


def test_production_rejects_short_jwt_secret():
    with pytest.raises(ValidationError, match="AUTH_JWT_SECRET"):
        make_production_settings(auth_jwt_secret="too-short")


def test_production_requires_tls_for_remote_postgres():
    with pytest.raises(ValidationError, match="sslmode"):
        make_production_settings(
            database_url=(
                "postgresql+psycopg://postgres:secret@"
                "aws-1-us-east-2.pooler.supabase.com:5432/neurodatics"
            )
        )


def test_production_accepts_tls_for_remote_postgres():
    settings = make_production_settings(
        database_url=(
            "postgresql+psycopg://postgres:secret@"
            "aws-1-us-east-2.pooler.supabase.com:5432/neurodatics?sslmode=require"
        )
    )

    assert settings.database_url.endswith("sslmode=require")


def test_local_docker_database_remains_supported_in_production():
    settings = make_production_settings()

    assert settings.database_url.endswith("@db:5432/neurodatics")


def test_cors_origins_are_explicit_and_normalized():
    settings = make_production_settings(
        cors_allowed_origins="https://app.example.edu/, https://admin.example.edu"
    )

    assert settings.cors_origins == ["https://app.example.edu", "https://admin.example.edu"]


def test_worker_redis_socket_timeout_defaults_above_rq_dequeue_timeout():
    settings = make_production_settings()

    assert settings.redis_socket_timeout_seconds == 3.0
    assert settings.redis_worker_socket_timeout_seconds == 450.0


def test_worker_redis_socket_timeout_can_be_disabled():
    settings = make_production_settings(redis_worker_socket_timeout_seconds="none")

    assert settings.redis_worker_socket_timeout_seconds is None

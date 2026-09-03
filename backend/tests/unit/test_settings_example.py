"""Keep the public configuration template complete and runnable on its own."""

import os
from pathlib import Path

from neurodatics.config.settings import Settings


EXAMPLE_PATH = Path(__file__).parents[2] / ".env.example"


def test_environment_example_defines_every_setting_exactly_once():
    keys = [
        line.split("=", 1)[0].strip().lower()
        for line in EXAMPLE_PATH.read_text(encoding="utf-8").splitlines()
        if "=" in line and not line.lstrip().startswith("#")
    ]

    assert len(keys) == len(set(keys)), "Duplicate setting in .env.example"
    assert set(keys) == set(Settings.model_fields)


def test_environment_example_parses_without_machine_configuration(monkeypatch):
    fields = Settings.model_fields
    for name in tuple(os.environ):
        if name.lower() in fields:
            monkeypatch.delenv(name)

    example = Settings(_env_file=EXAMPLE_PATH)

    assert example.app_env == "development"
    assert example.debug is False
    assert example.database_url.endswith("@localhost:5432/neurodatics")
    assert example.auth_jwt_secret == "replace-with-a-long-random-secret"
    assert example.auth_user_store_path == "./data/auth_users.json"
    local_examples = {
        "database_url",
        "auth_jwt_secret",
        "auth_user_store_path",
        "google_oauth_redirect_uri",
        "google_drive_oauth_redirect_uri",
    }
    for name, field in fields.items():
        if name not in local_examples and field.default is not None:
            assert getattr(example, name) == field.default, name

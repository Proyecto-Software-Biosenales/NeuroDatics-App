"""Characterize local JWT, auth dependency and file-store behavior offline."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from neurodatics.api.deps import get_current_user
from neurodatics.config.security import create_access_token
from neurodatics.config.settings import settings
from neurodatics.modules.auth.infrastructure.user_store import JsonAuthUserStore


@pytest.fixture
def auth_client():
    app = FastAPI()

    @app.get('/protected')
    async def protected(user_id: str = Depends(get_current_user)):
        return {'user_id': user_id}

    with TestClient(app) as client:
        yield client


def _token(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        'sub': 'synthetic-user',
        'iss': settings.auth_jwt_issuer,
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(minutes=5)).timestamp()),
        'typ': 'access',
    }
    payload.update(overrides)
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm=settings.auth_jwt_algorithm)


def test_access_token_round_trip_preserves_identity(auth_client):
    token = create_access_token('synthetic-user', 'synthetic@example.test', 'Synthetic')
    payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=[settings.auth_jwt_algorithm])
    assert payload['email'] == 'synthetic@example.test'
    assert payload['name'] == 'Synthetic'
    assert payload['exp'] - payload['iat'] == settings.auth_access_token_exp_minutes * 60
    response = auth_client.get('/protected', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    assert response.json() == {'user_id': 'synthetic-user'}


@pytest.mark.parametrize('claims,detail', [
    ({'exp': 1}, 'expired'),
    ({'iss': 'another-issuer'}, 'issuer'),
    ({'typ': 'refresh'}, 'token type'),
    ({'sub': ''}, 'subject'),
])
def test_invalid_claims_are_rejected(auth_client, claims, detail):
    response = auth_client.get('/protected', headers={'Authorization': f'Bearer {_token(**claims)}'})
    assert response.status_code == 401
    assert detail in response.json()['detail'].lower()


@pytest.mark.parametrize('authorization', [None, 'Bearer', 'Basic abc', 'Bearer invalid.jwt.signature'])
def test_missing_or_malformed_credentials_are_rejected(auth_client, authorization):
    headers = {} if authorization is None else {'Authorization': authorization}
    assert auth_client.get('/protected', headers=headers).status_code == 401


def test_wrong_signing_key_is_rejected(auth_client):
    token = jwt.encode({'sub': 'attacker', 'iss': settings.auth_jwt_issuer, 'typ': 'access'},
                       'a-different-test-key', algorithm=settings.auth_jwt_algorithm)
    assert auth_client.get('/protected', headers={'Authorization': f'Bearer {token}'}).status_code == 401


def test_user_store_persists_and_updates_same_google_identity(tmp_path):
    path = tmp_path / 'auth' / 'users.json'
    store = JsonAuthUserStore(str(path))
    first = store.upsert_google_user('one@example.test', 'Before', 'google-synthetic')
    second = store.upsert_google_user('two@example.test', 'After', 'google-synthetic')
    assert second.id == first.id
    restored = JsonAuthUserStore(str(path)).get_user(first.id)
    assert restored.name == 'After'
    assert restored.email == 'two@example.test'
    assert restored.provider == 'google'
    assert len(json.loads(path.read_text())['users']) == 1


def test_user_store_respects_database_id_and_keeps_other_users(tmp_path):
    store = JsonAuthUserStore(str(tmp_path / 'users.json'))
    first = store.upsert_google_user(None, 'First', 'google-one', user_id_override='database-id')
    second = store.upsert_google_user(None, 'Second', 'google-two')
    assert first.id == 'database-id'
    assert store.get_user(first.id).name == 'First'
    assert store.get_user(second.id).name == 'Second'
    assert store.get_user('missing') is None


@pytest.mark.parametrize('content', ['', 'invalid json', '[]', '{"users": []}'])
def test_user_store_current_corrupt_file_fallback(tmp_path, content):
    path = tmp_path / 'users.json'
    path.write_text(content)
    assert JsonAuthUserStore(str(path)).get_user('missing') is None

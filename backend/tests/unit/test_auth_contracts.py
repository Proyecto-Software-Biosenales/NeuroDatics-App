"""Characterize local JWT and auth dependency behavior offline."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from neurodatics.api.deps import get_current_user
from neurodatics.config.security import create_access_token
from neurodatics.config.settings import settings


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

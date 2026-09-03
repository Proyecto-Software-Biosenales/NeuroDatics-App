"""Exercise Google auth HTTP contracts without Google, Postgres or user files."""

import uuid
from unittest.mock import AsyncMock, Mock
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient
from jose import jwt

from neurodatics.api.deps import get_db
from neurodatics.config.settings import settings
from neurodatics.main import app
from neurodatics.modules.auth.api import routes
from neurodatics.modules.auth.infrastructure.user_store import JsonAuthUserStore


@pytest.fixture
def google_auth(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, 'google_oauth_client_id', 'test-client')
    monkeypatch.setattr(settings, 'google_oauth_client_secret', 'test-client-secret')
    monkeypatch.setattr(settings, 'google_oauth_redirect_uri', 'http://localhost/auth/callback')
    monkeypatch.setattr(routes, 'auth_user_store', JsonAuthUserStore(str(tmp_path / 'users.json')))
    db = AsyncMock()
    db.execute.return_value = Mock(scalar_one_or_none=Mock(return_value=None))

    async def database():
        yield db

    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = database
    outbound = AsyncMock()
    outbound.__aenter__.return_value = outbound
    outbound.post.return_value = httpx.Response(200, json={'access_token': 'google-test-token'})
    outbound.get.return_value = httpx.Response(200, json={
        'sub': 'synthetic-google-sub', 'email': 'synthetic@example.test', 'name': 'Synthetic',
    })
    monkeypatch.setattr(routes.httpx, 'AsyncClient', Mock(return_value=outbound))
    try:
        with TestClient(app) as client:
            yield client, outbound, db
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def test_login_url_includes_required_oauth_parameters(google_auth):
    client, outbound, _ = google_auth
    response = client.get('/api/auth/google/login-url')
    assert response.status_code == 200
    query = parse_qs(urlparse(response.json()['authorization_url']).query)
    assert query['client_id'] == ['test-client']
    assert query['redirect_uri'] == ['http://localhost/auth/callback']
    assert query['scope'] == ['openid email profile']
    assert query['response_type'] == ['code']
    assert uuid.UUID(query['state'][0])
    outbound.post.assert_not_awaited()


@pytest.mark.parametrize('existing_id', [None, 'b6edbb6f-8d4b-4e16-9ce9-3ee9c02de720'])
def test_authorize_creates_local_identity_and_access_token(google_auth, existing_id):
    client, outbound, db = google_auth
    db.execute.return_value.scalar_one_or_none.return_value = existing_id
    response = client.post('/api/auth/google/authorize', json={'code': 'one-time-code'})
    assert response.status_code == 200
    data = response.json()
    expected_id = existing_id or str(uuid.uuid5(uuid.NAMESPACE_URL, 'google:synthetic-google-sub'))
    assert data['user'] == {'id': expected_id, 'email': 'synthetic@example.test', 'name': 'Synthetic'}
    assert data['token_type'] == 'Bearer'
    assert data['expires_in'] == settings.auth_access_token_exp_minutes * 60
    claims = jwt.decode(data['access_token'], settings.auth_jwt_secret,
                        algorithms=[settings.auth_jwt_algorithm], issuer=settings.auth_jwt_issuer)
    assert claims['sub'] == expected_id
    assert routes.auth_user_store.get_user(expected_id).google_sub == 'synthetic-google-sub'
    db.commit.assert_awaited_once()
    assert outbound.post.await_args.kwargs['data']['code'] == 'one-time-code'
    assert outbound.get.await_args.kwargs['headers'] == {'Authorization': 'Bearer google-test-token'}


@pytest.mark.parametrize('token_payload,profile', [
    ({}, {'sub': 'synthetic'}),
    ({'access_token': 'synthetic-token'}, {}),
])
def test_incomplete_google_response_rejected_without_db_write(google_auth, token_payload, profile):
    client, outbound, db = google_auth
    outbound.post.return_value = httpx.Response(200, json=token_payload)
    outbound.get.return_value = httpx.Response(200, json=profile)
    response = client.post('/api/auth/google/authorize', json={'code': 'one-time-code'})
    assert response.status_code == 400
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()


def test_google_network_failure_is_502(google_auth):
    client, outbound, db = google_auth
    outbound.post.side_effect = httpx.ConnectError('offline')
    response = client.post('/api/auth/google/authorize', json={'code': 'one-time-code'})
    assert response.status_code == 502
    db.execute.assert_not_awaited()


def test_empty_authorization_code_is_validation_error(google_auth):
    client, outbound, _ = google_auth
    assert client.post('/api/auth/google/authorize', json={'code': ''}).status_code == 422
    outbound.post.assert_not_awaited()

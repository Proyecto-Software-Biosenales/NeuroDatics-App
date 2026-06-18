from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlencode

from ....api.deps import get_db
from ....config.security import create_access_token
from ....config.settings import settings
from ..infrastructure.user_store import auth_user_store
from .schemas import GoogleAuthorizeRequest, GoogleAuthorizeResponse, GoogleLoginUrlResponse, AuthUserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _ensure_google_oauth_configured() -> None:
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth no configurado en backend. Define GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET.",
        )


def _resolve_google_redirect_uri(redirect_uri: str | None) -> str:
    resolved_redirect_uri = redirect_uri or settings.google_oauth_redirect_uri
    if not resolved_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing redirect_uri. Provide it in request or GOOGLE_OAUTH_REDIRECT_URI env var.",
        )

    return resolved_redirect_uri


async def _ensure_app_user(
    db: AsyncSession,
    *,
    google_sub: str,
    email: str | None,
    name: str | None,
    picture_url: str | None,
) -> str:
    existing_user = await db.execute(
        text("SELECT id FROM app_users WHERE google_sub = :google_sub LIMIT 1"),
        {"google_sub": google_sub},
    )
    existing_id = existing_user.scalar_one_or_none()

    if existing_id:
        user_id = str(existing_id)
        await db.execute(
            text(
                """
                UPDATE app_users
                SET email = :email,
                    full_name = :full_name,
                    picture_url = :picture_url,
                    updated_at = now()
                WHERE id = :id
                """
            ),
            {
                "id": uuid.UUID(user_id),
                "email": email,
                "full_name": name,
                "picture_url": picture_url,
            },
        )
        await db.commit()
        return user_id

    user_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"google:{google_sub}"))
    await db.execute(
        text(
            """
            INSERT INTO app_users (id, google_sub, email, full_name, picture_url)
            VALUES (:id, :google_sub, :email, :full_name, :picture_url)
            """
        ),
        {
            "id": uuid.UUID(user_id),
            "google_sub": google_sub,
            "email": email,
            "full_name": name,
            "picture_url": picture_url,
        },
    )
    await db.commit()
    return user_id


@router.get("/google/login-url", response_model=GoogleLoginUrlResponse)
async def google_login_url(redirect_uri: str | None = None):
    _ensure_google_oauth_configured()
    resolved_redirect_uri = _resolve_google_redirect_uri(redirect_uri)
    query = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": resolved_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": str(uuid.uuid4()),
        "prompt": "consent",
    }

    return GoogleLoginUrlResponse(
        authorization_url=f"{settings.google_oauth_authorize_url}?{urlencode(query)}"
    )


@router.post("/google/authorize", response_model=GoogleAuthorizeResponse)
async def authorize_google(
    request: GoogleAuthorizeRequest,
    db: AsyncSession = Depends(get_db),
):
    _ensure_google_oauth_configured()
    redirect_uri = _resolve_google_redirect_uri(request.redirect_uri)

    token_payload = {
        "code": request.code,
        "client_id": settings.google_oauth_client_id,
        "client_secret": settings.google_oauth_client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_response = await client.post(
                settings.google_oauth_token_url,
                data=token_payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo contactar a Google para intercambiar el codigo.",
        ) from exc

    if token_response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google token exchange failed: {token_response.text}",
        )

    token_json = token_response.json()
    google_access_token = token_json.get("access_token")

    if not google_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google no retorno access_token.",
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            userinfo_response = await client.get(
                settings.google_oauth_userinfo_url,
                headers={"Authorization": f"Bearer {google_access_token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo obtener el perfil del usuario desde Google.",
        ) from exc

    if userinfo_response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google userinfo failed: {userinfo_response.text}",
        )

    userinfo = userinfo_response.json()
    google_sub = userinfo.get("sub")
    email = userinfo.get("email")
    name = userinfo.get("name")
    picture_url = userinfo.get("picture")

    if not google_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google userinfo response missing 'sub'.",
        )

    app_user_id = await _ensure_app_user(
        db,
        google_sub=google_sub,
        email=email,
        name=name,
        picture_url=picture_url,
    )

    stored_user = auth_user_store.upsert_google_user(
        email=email,
        name=name,
        google_sub=google_sub,
        user_id_override=app_user_id,
    )

    access_token = create_access_token(
        subject=stored_user.id,
        email=stored_user.email,
        name=stored_user.name,
    )

    return GoogleAuthorizeResponse(
        access_token=access_token,
        token_type="Bearer",
        expires_in=settings.auth_access_token_exp_minutes * 60,
        user=AuthUserResponse(
            id=stored_user.id,
            email=stored_user.email,
            name=stored_user.name,
        ),
    )

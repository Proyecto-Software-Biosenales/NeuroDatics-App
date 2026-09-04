from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from .....api.deps import get_db, get_current_user
from ..application.service import GoogleDriveIntegrationService
from ..infrastructure.repository import SystemIntegrationRepository
from .schemas import (
    GoogleDriveAuthorizeResponse,
    GoogleDriveCallbackResponse,
)


# Every route in this router is authenticated at the router level. The only
# exception is the OAuth callback, which Google redirects the browser to and
# therefore cannot carry a bearer token; it is registered on a separate,
# unauthenticated router below and is protected instead by the HMAC-signed,
# TTL-bounded `state` parameter it validates.
router = APIRouter(
    prefix="/integrations/google-drive",
    tags=["integrations"],
    dependencies=[Depends(get_current_user)],
)

public_router = APIRouter(prefix="/integrations/google-drive", tags=["integrations"])


def _service_from_db(db: AsyncSession) -> GoogleDriveIntegrationService:
    repository = SystemIntegrationRepository(db)
    return GoogleDriveIntegrationService(repository)




@router.get("/authorize", response_model=GoogleDriveAuthorizeResponse)
async def authorize_google_drive(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    service = _service_from_db(db)
    authorization_url = service.build_authorization_url()
    return GoogleDriveAuthorizeResponse(authorization_url=authorization_url)


@public_router.get("/callback", response_model=GoogleDriveCallbackResponse)
async def google_drive_callback(
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Google's OAuth redirect target.

    Unauthenticated by necessity — the browser arrives here straight from
    Google with no Authorization header. `service.connect_from_callback`
    verifies the HMAC signature and TTL of `state` before doing anything, so
    this cannot be driven by a caller who does not hold `AUTH_JWT_SECRET`.
    """
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google Drive OAuth error: {error}",
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing code in Google Drive OAuth callback.",
        )

    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing state in Google Drive OAuth callback.",
        )

    service = _service_from_db(db)
    payload = await service.connect_from_callback(code=code, state=state)
    return GoogleDriveCallbackResponse(**payload)

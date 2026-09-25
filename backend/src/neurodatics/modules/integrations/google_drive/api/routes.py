from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .....api.deps import get_db, get_current_user
from .....config.settings import settings
from ..application.service import GoogleDriveIntegrationService
from ..infrastructure.repository import SystemIntegrationRepository
from .schemas import (
    GoogleDriveAuthorizeResponse,
    GoogleDriveCallbackResponse,
    GoogleDriveConnectionResponse,
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


@router.get("/connection", response_model=GoogleDriveConnectionResponse)
async def google_drive_connection(db: AsyncSession = Depends(get_db)):
    """Estado guardado de la conexión compartida, sin exponer credenciales."""
    integration = await SystemIntegrationRepository(db).get_by_provider("google_drive")
    return GoogleDriveConnectionResponse(
        connected=bool(integration and integration.get("refresh_token")),
        account_email=integration.get("account_email") if integration else None,
        oauth_configured=bool(
            settings.google_oauth_client_id and settings.google_oauth_client_secret
        ),
    )




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
    request: Request,
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
    if "text/html" in request.headers.get("accept", ""):
        return HTMLResponse(
            """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Drive conectado · NeuroDatics</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:24px;color:#172033;background:#f5f7fb}main{background:white;padding:32px;border-radius:16px}a{color:#174db5}h1{font-size:1.6rem}</style>
</head><body><main><h1>Google Drive conectado</h1>
<p>Tu autorización se guardó correctamente. Ya puedes volver a NeuroDatics y cargar tus experimentos.</p>
<p><a href="/configuracion">Volver a Configuración</a></p>
<p>Si dejaste otra pestaña de NeuroDatics abierta, puedes cerrar esta ventana y pulsar «Comprobar conexión» allí.</p>
</main></body></html>""",
            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
        )
    return GoogleDriveCallbackResponse(**payload)

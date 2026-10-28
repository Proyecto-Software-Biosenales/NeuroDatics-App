# Network edition only (Google sign-in, Google Drive). NeuroDatics ships only the local edition,
# which never imports this module; it is kept for self-hosting: docs/tecnica/alojamiento-en-red.md.

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .....api.deps import get_db
from ..application.service import GoogleDriveIntegrationService
from ..infrastructure.repository import SystemIntegrationRepository
from .schemas import GoogleDriveCallbackResponse


# The shared Drive account is chosen by the administrators on the server
# (`python -m neurodatics.modules.integrations.google_drive.admin`), never from
# the application, so the only HTTP route left is Google's OAuth redirect. It
# cannot carry a bearer token and is protected instead by the HMAC-signed,
# TTL-bounded `state` that only that command issues.
public_router = APIRouter(prefix="/integrations/google-drive", tags=["integrations"])


def _service_from_db(db: AsyncSession) -> GoogleDriveIntegrationService:
    repository = SystemIntegrationRepository(db)
    return GoogleDriveIntegrationService(repository)


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
<p>La autorización se guardó. NeuroDatics ya guarda los archivos de los proyectos en esta cuenta.</p>
<p>Puedes cerrar esta ventana o <a href="/">abrir NeuroDatics</a>.</p>
</main></body></html>""",
            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
        )
    return GoogleDriveCallbackResponse(**payload)

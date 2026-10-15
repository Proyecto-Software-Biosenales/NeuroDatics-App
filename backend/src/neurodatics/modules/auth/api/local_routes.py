"""The one route that replaces sign-in in local mode."""

from fastapi import APIRouter

from ....config.security import LOCAL_USER_ID, create_access_token
from ....config.settings import settings
from .schemas import AuthUserResponse, LocalSessionResponse

router = APIRouter(prefix="/auth", tags=["auth"])

LOCAL_USER_NAME = "Estudiante"


@router.post("/local-session", response_model=LocalSessionResponse)
async def local_session() -> LocalSessionResponse:
    """Hand the browser the same session shape Google sign-in returns.

    Nothing checks this token in local mode; it exists so the client's session code needs
    no special case.
    """
    return LocalSessionResponse(
        access_token=create_access_token(LOCAL_USER_ID, None, LOCAL_USER_NAME),
        expires_in=settings.auth_access_token_exp_minutes * 60,
        user=AuthUserResponse(id=LOCAL_USER_ID, email=None, name=LOCAL_USER_NAME),
    )

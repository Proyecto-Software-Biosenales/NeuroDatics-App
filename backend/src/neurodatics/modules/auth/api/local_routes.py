"""The routes that replace sign-in in local mode: the profiles of the people using this computer."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ....api.deps import get_db
from ....config.settings import settings
from ..application.local_profiles import (
    ProfileBusy,
    ProfileNameTaken,
    clean_name,
    create_profile,
    delete_profile,
    list_profiles,
    open_profile,
)
from ..domain.entities import LocalProfile
from .schemas import (
    AuthUserResponse,
    CreateLocalProfileRequest,
    DeleteLocalProfileResponse,
    LocalProfileResponse,
    LocalSessionRequest,
    LocalSessionResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def session_for(profile: LocalProfile | None) -> LocalSessionResponse:
    """The same session shape Google sign-in returns, so the client's session code needs no special case.

    The token is the profile id itself: it only says whose projects the browser is working on.
    """
    if profile is None:
        return LocalSessionResponse()
    return LocalSessionResponse(
        access_token=str(profile.id),
        expires_in=settings.auth_access_token_exp_minutes * 60,
        user=AuthUserResponse(id=str(profile.id), email=None, name=profile.name),
    )


@router.post("/local-session", response_model=LocalSessionResponse)
async def local_session(request: LocalSessionRequest | None = None, db: AsyncSession = Depends(get_db)):
    """Open the profile the browser names, or the last one used; no user when there is none."""
    return session_for(await open_profile(db, request.profile_id if request else None))


@router.get("/profiles", response_model=list[LocalProfileResponse])
async def get_profiles(db: AsyncSession = Depends(get_db)):
    return [
        LocalProfileResponse(id=str(profile.id), name=profile.name, project_count=count)
        for profile, count in await list_profiles(db)
    ]


@router.post("/profiles", response_model=LocalSessionResponse, status_code=status.HTTP_201_CREATED)
async def post_profile(request: CreateLocalProfileRequest, db: AsyncSession = Depends(get_db)):
    """Create a profile and open it."""
    name = clean_name(request.name)
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escribe el nombre del perfil.")
    try:
        return session_for(await create_profile(db, name))
    except ProfileNameTaken as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un perfil con ese nombre.") from exc


@router.delete("/profiles/{profile_id}", response_model=DeleteLocalProfileResponse)
async def remove_profile(profile_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a profile and, from this computer, every project it owns."""
    try:
        deleted = await delete_profile(db, profile_id)
    except ProfileBusy as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Un proyecto de este perfil se está procesando. Inténtalo cuando termine.",
        ) from exc
    if deleted is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese perfil ya no existe.")
    return DeleteLocalProfileResponse(deleted_projects=deleted)

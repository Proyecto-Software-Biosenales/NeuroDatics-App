"""Profiles of the local edition: who is using the program, and which projects are theirs.

A profile's id is the ``owner_id`` of its projects, so everything that already scopes data by
owner keeps profiles apart without knowing they exist. The first profile takes the id the edition
used before there were profiles, so the projects created then become its own.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....config.security import LOCAL_USER_ID
from ...projects.application.use_cases.delete_project import DeleteProjectUseCase
from ...projects.domain.entities import Project
from ...projects.infrastructure.mutation_lock import ProjectMutationConflict, project_mutation_lock
from ...projects.infrastructure.repository_impl import SQLProjectRepository
from ...projects.infrastructure.video_preview_metadata import invalidate_project_video_metadata
from ..domain.entities import LocalProfile
from .profile_registry import forget, remember

MAX_NAME_LENGTH = 60


class ProfileNameTaken(ValueError):
    pass


class ProfileBusy(RuntimeError):
    pass


def clean_name(name: str) -> str:
    return " ".join(name.split())[:MAX_NAME_LENGTH]


def _parse_id(profile_id: str) -> UUID | None:
    try:
        return UUID(profile_id)
    except ValueError:
        return None


async def list_profiles(db: AsyncSession) -> list[tuple[LocalProfile, int]]:
    statement = (
        select(LocalProfile, func.count(Project.id))
        .outerjoin(Project, Project.owner_id == LocalProfile.id)
        .group_by(LocalProfile.id)
        .order_by(LocalProfile.created_at, LocalProfile.name)
    )
    return [(profile, count) for profile, count in (await db.execute(statement)).all()]


async def create_profile(db: AsyncSession, name: str) -> LocalProfile:
    names = (await db.scalars(select(LocalProfile.name))).all()
    if any(existing.casefold() == name.casefold() for existing in names):
        raise ProfileNameTaken(name)
    profile = LocalProfile(
        id=uuid4() if names else UUID(LOCAL_USER_ID),
        name=name,
        last_used_at=datetime.now(timezone.utc),
    )
    db.add(profile)
    await db.commit()
    remember(profile.id)
    return profile


async def open_profile(db: AsyncSession, profile_id: str | None) -> LocalProfile | None:
    """The profile the browser asks for, or the last one used when it does not remember any."""
    if profile_id is not None:
        parsed = _parse_id(profile_id)
        profile = await db.get(LocalProfile, parsed) if parsed else None
    else:
        statement = select(LocalProfile).order_by(
            LocalProfile.last_used_at.desc().nulls_last(), LocalProfile.created_at.desc()
        )
        profile = (await db.scalars(statement.limit(1))).first()
    if profile is not None:
        profile.last_used_at = datetime.now(timezone.utc)
        await db.commit()
    return profile


async def delete_profile(db: AsyncSession, profile_id: str) -> int | None:
    """Delete the profile and every project it owns, files included. None when it does not exist."""
    owner = _parse_id(profile_id)
    if owner is None or await db.get(LocalProfile, owner) is None:
        return None
    # Its requests are refused from now on, so no new project can appear while the others go.
    forget(owner)
    deleted = 0
    try:
        while project_ids := (await db.scalars(select(Project.id).where(Project.owner_id == owner))).all():
            await db.rollback()
            for project_id in project_ids:
                async with project_mutation_lock(db, project_id):
                    await DeleteProjectUseCase(SQLProjectRepository(db), db=db).execute(project_id, owner)
                invalidate_project_video_metadata(project_id)
                deleted += 1
    except BaseException as exc:
        # The profile survives, with whatever projects were not deleted yet.
        remember(owner)
        if isinstance(exc, ProjectMutationConflict):
            raise ProfileBusy(str(exc)) from exc
        raise
    await db.execute(delete(LocalProfile).where(LocalProfile.id == owner))
    await db.commit()
    return deleted

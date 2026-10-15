"""Lazy, generation-scoped provenance persisted beside the project counter."""

from sqlalchemy import case, cast, func, inspect, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from ...projects.domain.entities import Project


def stored_transform_token(project: Project, participant_code: str, generation: int) -> str | None:
    tokens = getattr(project, "analytics_transform_tokens", None)
    entry = tokens.get(participant_code) if isinstance(tokens, dict) else None
    if not isinstance(entry, dict) or entry.get("generation") != generation:
        return None
    token = entry.get("token")
    if isinstance(token, str) and len(token) == 20 and all(c in "0123456789abcdef" for c in token):
        return token
    return None


def transform_token_update(project_id, participant_code: str, generation: int, token: str):
    """Merge in SQL so concurrent participants cannot overwrite one another.

    The generation predicate prevents a slow reader of an old ingestion from
    publishing its token after the new ingestion has been committed.
    """
    entry = {participant_code: {"generation": generation, "token": token}}
    stored = cast(Project.analytics_transform_tokens, JSONB)
    return (
        update(Project)
        .where(Project.id == project_id, Project.ingestion_generation == generation)
        .values(
            analytics_transform_tokens=case(
                (func.jsonb_typeof(stored) == "object", stored),
                else_=cast({}, JSONB),
            ).op("||")(cast(entry, JSONB)),
            updated_at=Project.updated_at,
        )
        .execution_options(synchronize_session=False)
    )


async def persist_transform_token(
    db: AsyncSession, project: Project, participant_code: str, generation: int, token: str,
) -> None:
    state = inspect(project, raiseerr=False)
    if state is None or not state.persistent:
        # Detached/transient project values can still use the frame fallback.
        return
    await db.execute(transform_token_update(project.id, participant_code, generation, token))
    await db.commit()

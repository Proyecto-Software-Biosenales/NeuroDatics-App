"""Owner-scoped planning and questionnaire capture without a storage folder."""

import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ....api.deps import get_current_user, get_db
from ..domain.entities import Project, PreExperimentResponse
from .pre_experiment_schemas import (
    PreExperimentConfig, PreExperimentEnvelope, SavedPreExperimentResponse,
    SubmitPreExperimentResponseRequest, UpdatePreExperimentRequest,
)

router = APIRouter()


def planning_summary(project) -> dict:
    config = getattr(project, "pre_experiment", None)
    return {
        "is_pre_experiment": config is not None
        and not getattr(project, "last_ingested_at", None)
        and not getattr(project, "ingestion_generation", 0),
        "planning_participants_count": len((config or {}).get("participants", [])),
    }


async def owned_project(db: AsyncSession, project_id: UUID, owner_id: str, *, lock=False) -> Project:
    statement = select(Project).where(Project.id == project_id, Project.owner_id == UUID(owner_id))
    if lock:
        statement = statement.with_for_update()
    project = (await db.execute(statement.execution_options(populate_existing=True))).scalar_one_or_none()
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def check_revision(project: Project, revision: int) -> None:
    if project.pre_experiment_revision != revision:
        raise HTTPException(409, "La configuración cambió. Recarga el pre-experimento antes de continuar.")


async def guard_revision(db: AsyncSession, project: Project, revision: int, **values) -> None:
    # PostgreSQL's row lock orders writes; this compare-and-swap also protects SQLite,
    # whose SELECT FOR UPDATE is a no-op, and obtains its writer lock before inserting.
    result = await db.execute(
        update(Project)
        .where(Project.id == project.id, Project.owner_id == project.owner_id,
               Project.pre_experiment_revision == revision)
        .values(**(values or {"pre_experiment_revision": revision}))
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "La configuración cambió. Recarga el pre-experimento antes de continuar.")


async def envelope(db: AsyncSession, project: Project) -> PreExperimentEnvelope:
    rows = (await db.execute(select(PreExperimentResponse).where(
        PreExperimentResponse.project_id == project.id,
    ).order_by(PreExperimentResponse.submitted_at, PreExperimentResponse.id))).scalars().all()
    return PreExperimentEnvelope(
        revision=project.pre_experiment_revision,
        config=PreExperimentConfig.model_validate(project.pre_experiment or {}),
        responses=[SavedPreExperimentResponse.model_validate(row) for row in rows],
    )


@router.get("/{project_id}/pre-experiment", response_model=PreExperimentEnvelope)
async def get_pre_experiment(project_id: UUID, current_user: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await owned_project(db, project_id, current_user)
    return await envelope(db, project)


@router.put("/{project_id}/pre-experiment", response_model=PreExperimentEnvelope)
async def update_pre_experiment(project_id: UUID, request: UpdatePreExperimentRequest, current_user: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await owned_project(db, project_id, current_user, lock=True)
    check_revision(project, request.revision)
    config = request.config.model_dump(mode="json")
    await guard_revision(db, project, request.revision, pre_experiment=config, pre_experiment_revision=request.revision + 1)
    await db.commit()
    await db.refresh(project)
    return await envelope(db, project)


def validated_answers(request: SubmitPreExperimentResponseRequest, questionnaire) -> dict:
    known_ids = {str(question.id) for question in questionnaire.questions}
    if set(request.answers) - known_ids:
        raise HTTPException(422, "Hay respuestas a preguntas que no pertenecen al cuestionario")
    answers = {}
    for question in questionnaire.questions:
        question_id = str(question.id)
        value = request.answers.get(question_id)
        empty = value is None or value == [] or (isinstance(value, str) and not value.strip())
        if empty:
            if question.required:
                raise HTTPException(422, f"Falta la respuesta requerida: {question.prompt}")
            continue
        if question.type == "open_text":
            valid = isinstance(value, str)
        elif question.type == "true_false":
            valid = isinstance(value, bool)
        else:
            selected = [value] if isinstance(value, str) else value
            option_ids = {str(option.id) for option in question.options}
            valid = isinstance(selected, list) and len(set(selected)) == len(selected) and all(option in option_ids for option in selected)
        if not valid:
            raise HTTPException(422, f"Respuesta inválida: {question.prompt}")
        answers[question_id] = value
    return answers


@router.post("/{project_id}/pre-experiment/responses", response_model=SavedPreExperimentResponse, status_code=201)
async def submit_pre_experiment_response(project_id: UUID, request: SubmitPreExperimentResponseRequest, current_user: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await owned_project(db, project_id, current_user, lock=True)
    check_revision(project, request.revision)
    config = PreExperimentConfig.model_validate(project.pre_experiment or {})
    participant = next((item for item in config.participants if item.id == request.participant_id), None)
    if participant is None:
        raise HTTPException(422, "El participante no pertenece a este pre-experimento")
    questionnaire = getattr(config.questionnaires, request.phase)
    if not questionnaire.enabled or not questionnaire.questions:
        raise HTTPException(422, "Este cuestionario no está habilitado")
    answers = validated_answers(request, questionnaire)
    if len(json.dumps(answers).encode("utf-8")) > 2 * 1024 * 1024:
        raise HTTPException(422, "Las respuestas exceden el límite de 2 MB")
    await guard_revision(db, project, request.revision)
    row = PreExperimentResponse(
        id=uuid4(), project_id=project.id, revision=request.revision,
        participant_id=participant.id, phase=request.phase,
        participant_snapshot=participant.model_dump(mode="json"),
        questionnaire_snapshot=questionnaire.model_dump(mode="json"),
        answers=answers, submitted_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return SavedPreExperimentResponse.model_validate(row)


@router.get("/{project_id}/pre-experiment/export")
async def export_pre_experiment(project_id: UUID, current_user: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await owned_project(db, project_id, current_user)
    data = (await envelope(db, project)).model_dump(mode="json")
    data["project"] = {"id": str(project.id), "name": project.name, "description": project.description}
    data["exported_at"] = datetime.now(timezone.utc).isoformat()
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2), media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="pre-experiment-{project.id}.json"'},
    )

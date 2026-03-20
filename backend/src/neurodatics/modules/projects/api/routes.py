from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from ....api.deps import get_db, get_current_user
from ..infrastructure.repository_impl import SQLProjectRepository
from ..application.use_cases.create_project import CreateProjectUseCase
from ..application.use_cases.list_projects import ListProjectsUseCase
from ..application.use_cases.delete_project import DeleteProjectUseCase
from ..domain.entities import ProjectFile, ProjectStatus
from .schemas import (
    CreateProjectRequest, UpdateProjectRequest, UpdateSensorsRequest,
    ProjectResponse, ProjectDetailResponse, ProjectFileResponse
)
from ....infra.storage.gdrive_client import gdrive_client

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectResponse)
async def create_project(
    request: CreateProjectRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    repository = SQLProjectRepository(db)
    use_case = CreateProjectUseCase(repository)

    existing = await repository.get_by_owner_and_name(UUID(current_user), request.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un proyecto con ese nombre"
        )
    
    project = await use_case.execute(
        owner_id=UUID(current_user),
        name=request.name,
        description=request.description
    )
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        sensors=[],
        participants_count=0
    )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all projects for current user"""
    repository = SQLProjectRepository(db)
    use_case = ListProjectsUseCase(repository)
    
    projects = await use_case.execute(owner_id=UUID(current_user))
    
    return [
        ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            status=project.status,
            created_at=project.created_at,
            sensors=[{"id": s.id, "sensor_type": s.sensor_type} for s in project.sensors],
            participants_count=len(project.participants)
        )
        for project in projects
    ]


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get project details"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return ProjectDetailResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        files=[
            ProjectFileResponse(
                id=f.id,
                kind=f.kind,
                filename=f.filename,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                created_at=f.created_at
            )
            for f in project.files
        ],
        sensors=[{"id": s.id, "sensor_type": s.sensor_type} for s in project.sensors],
        participants=[
            {
                "id": p.id,
                "participant_code": p.participant_code,
                "age": p.age,
                "sex": p.sex.value if p.sex else None
            }
            for p in project.participants
        ]
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    request: UpdateProjectRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if request.name is not None:
        existing = await repository.get_by_owner_and_name(UUID(current_user), request.name)
        if existing and existing.id != project.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un proyecto con ese nombre"
            )
        project.name = request.name
    if request.description is not None:
        project.description = request.description
    
    updated_project = await repository.update(project)
    
    return ProjectResponse(
        id=updated_project.id,
        name=updated_project.name,
        description=updated_project.description,
        status=updated_project.status,
        created_at=updated_project.created_at,
        sensors=[{"id": s.id, "sensor_type": s.sensor_type} for s in updated_project.sensors],
        participants_count=len(updated_project.participants)
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete project"""
    repository = SQLProjectRepository(db)
    use_case = DeleteProjectUseCase(repository)
    
    try:
        success = await use_case.execute(project_id, UUID(current_user))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo eliminar el proyecto en base de datos"
        ) from exc
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return {"message": "Project deleted successfully"}


@router.post("/{project_id}/files/experiment-zip", response_model=ProjectFileResponse)
async def upload_experiment_zip(
    project_id: UUID,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload experiment zip file"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Read file content
    file_content = await file.read()
    
    # Upload to Google Drive
    drive_result = gdrive_client.upload_file(
        file_content=file_content,
        filename=file.filename,
        mime_type=file.content_type or "application/zip"
    )
    
    # Save file metadata
    project_file = ProjectFile(
        project_id=project_id,
        kind="experiment_zip",
        storage_provider="gdrive",
        external_id=drive_result["drive_file_id"],
        filename=drive_result["filename"],
        mime_type=drive_result["mime_type"],
        size_bytes=drive_result["size_bytes"],
        checksum_sha256=drive_result["checksum_sha256"]
    )
    
    saved_file = await repository.add_file(project_file)
    
    return ProjectFileResponse(
        id=saved_file.id,
        kind=saved_file.kind,
        filename=saved_file.filename,
        mime_type=saved_file.mime_type,
        size_bytes=saved_file.size_bytes,
        created_at=saved_file.created_at
    )


@router.put("/{project_id}/sensors", response_model=List[dict])
async def update_sensors(
    project_id: UUID,
    request: UpdateSensorsRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project sensors"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    sensors = await repository.update_sensors(project_id, request.sensors)
    
    return [{"id": s.id, "sensor_type": s.sensor_type} for s in sensors]


@router.post("/{project_id}/finalize")
async def finalize_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize project (validate and set to active)"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Validate project
    if not project.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name is required"
        )
    
    has_experiment_zip = any(f.kind == "experiment_zip" for f in project.files)
    if not has_experiment_zip:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Experiment zip file is required"
        )
    
    if not project.sensors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one sensor is required"
        )
    
    # Update status to active
    project.status = ProjectStatus.ACTIVE
    updated_project = await repository.update(project)
    
    return {"message": "Project finalized successfully", "status": updated_project.status}
def register_project_routes(app):
    pass

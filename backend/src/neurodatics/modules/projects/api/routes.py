from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
import logging

from ....api.deps import get_db, get_current_user
from ..infrastructure.repository_impl import SQLProjectRepository
from ..application.use_cases.create_project import CreateProjectUseCase
from ..application.use_cases.list_projects import ListProjectsUseCase
from ..application.use_cases.delete_project import DeleteProjectUseCase
from ..application.use_cases.upload_experiment_zip import UploadExperimentZipUseCase
from ..domain.entities import ProjectStatus
from .schemas import (
    CreateProjectRequest, UpdateProjectRequest, UpdateSensorsRequest,
    ProjectResponse, ProjectDetailResponse, ProjectFileResponse, UploadedProjectZipSummaryResponse,
    DeleteProjectResponse,
)

logger = logging.getLogger(__name__)
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
        ],
        scenaries=[
            {
                "id": s.id,
                "name": s.name,
                "type": s.type,
                "file_id": s.file_id,
                "source_entry_path": s.source_entry_path,
                "width": s.width,
                "height": s.height,
                "fps": s.fps,
                "duration_ms": s.duration_ms,
                "aois": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "color": a.color,
                        "shape_type": a.shape_type,
                        "shape": a.shape,
                    }
                    for a in s.aois
                ],
            }
            for s in project.scenaries
        ],
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
    if request.status is not None:
        project.status = request.status
    
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


@router.delete("/{project_id}", response_model=DeleteProjectResponse)
async def delete_project(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete project"""
    repository = SQLProjectRepository(db)
    use_case = DeleteProjectUseCase(repository, db=db)
    
    try:
        result = await use_case.execute(project_id, UUID(current_user))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo eliminar el proyecto en base de datos"
        ) from exc
    
    if not result.get("deleted"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    return DeleteProjectResponse(
        message="Project deleted successfully",
        drive_folder_found=bool(result.get("drive_folder_found")),
        drive_folder_deleted=bool(result.get("drive_folder_deleted")),
    )


@router.post("/{project_id}/files/experiment-zip", response_model=UploadedProjectZipSummaryResponse)
async def upload_experiment_zip(
    project_id: UUID,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload experiment ZIP and execute full project ingestion flow."""
    
    file_content = await file.read()
    owner_id = UUID(current_user)
    mime_type = file.content_type or "application/zip"
    filename = file.filename or "experiment.zip"
    logger.info("Processing ZIP upload for project %s, file: %s", project_id, filename)
    
    # Execute upload use case
    repository = SQLProjectRepository(db)
    use_case = UploadExperimentZipUseCase(repository, db=db)

    try:
        summary = await use_case.execute(
            project_id=project_id,
            owner_id=owner_id,
            file_content=file_content,
            filename=filename,
            mime_type=mime_type
        )
    except ValueError as e:
        logger.error(f"Project access denied: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )
    except Exception as e:
        from ..application.services.zip_validation_service import ZipValidationService
        
        logger.exception("ZIP upload failed")
        
        # Return user-friendly error messages for validation errors
        if isinstance(e, ZipValidationService.ValidationError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Generic error message for other exceptions
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error procesando el archivo ZIP. Verifica que sea válido e intenta nuevamente."
        )

    return UploadedProjectZipSummaryResponse(
        project_id=summary["project_id"],
        ingestion_status=summary["ingestion_status"],
        drive_root_folder_id=summary.get("drive_root_folder_id"),
        drive_root_folder_name=summary.get("drive_root_folder_name"),
        drive_root_folder_url=summary.get("drive_root_folder_url"),
        zip_saved=summary["zip_saved"],
        zip_file=summary.get("zip_file"),
        counts=summary["counts"],
        files=summary["files"],
        csv_processing=summary["csv_processing"],
        manifest=summary["manifest"],
    )


@router.delete("/{project_id}/files/experiment-zip")
async def delete_experiment_zip(
    project_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete experiment zip file"""
    repository = SQLProjectRepository(db)
    project = await repository.get_by_id(project_id, UUID(current_user))
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Delete from database
    deleted = await repository.delete_file_by_kind(project_id, "experiment_zip")
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment zip file not found"
        )
    
    return {"message": "Experiment zip file deleted successfully"}


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
    
    has_active_files = any(f.deleted_at is None for f in project.files)
    has_ready_ingestion = (project.ingestion_status or "").upper() == "READY"
    if not has_active_files and not has_ready_ingestion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes cargar y procesar un ZIP del experimento antes de finalizar"
        )
    
    if not project.sensors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one .cvs file is required"
        )
    
    # Update status to active
    project.status = ProjectStatus.ACTIVE
    updated_project = await repository.update(project)
    
    return {"message": "Project finalized successfully", "status": updated_project.status}
def register_project_routes(app):
    pass

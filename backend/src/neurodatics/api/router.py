from fastapi import FastAPI
from ..modules.auth.api.routes import router as auth_router
from ..modules.projects.api.routes import router as projects_router
from ..modules.participants.api.routes import router as participants_router
from ..modules.scenaries.api.routes import router as scenaries_router


def include_routes(app: FastAPI):
    """Include all API routes"""
    app.include_router(auth_router, prefix="/api")
    app.include_router(projects_router, prefix="/api")
    app.include_router(participants_router, prefix="/api")
    app.include_router(scenaries_router, prefix="/api")

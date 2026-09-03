from fastapi import FastAPI
from ..modules.auth.api.routes import router as auth_router
from ..modules.integrations.google_drive.api.routes import (
    router as google_drive_integrations_router,
    public_router as google_drive_public_router,
)
from ..modules.projects.api.routes import router as projects_router
from ..modules.participants.api.routes import router as participants_router
from ..modules.scenaries.api.routes import router as scenaries_router
from ..modules.analytics.api.routes import router as analytics_router
from ..modules.reports.api.routes import router as reports_router


def include_routes(app: FastAPI):
    """Include all API routes"""
    app.include_router(auth_router, prefix="/api")
    # OAuth callback only — unauthenticated by necessity, guarded by signed state.
    app.include_router(google_drive_public_router, prefix="/api")
    app.include_router(google_drive_integrations_router, prefix="/api")
    app.include_router(projects_router, prefix="/api")
    app.include_router(participants_router, prefix="/api")
    app.include_router(scenaries_router, prefix="/api")
    app.include_router(analytics_router, prefix="/api")
    app.include_router(reports_router, prefix="/api")

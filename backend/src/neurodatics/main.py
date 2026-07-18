from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .api.router import include_routes
from .api.middlewares import register_middlewares
from .config.settings import settings
from .config.logging import configure_logging
from .infra.db.base import Base
from .infra.db.session import engine
from .infra.health.readiness import collect_readiness

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization"],
)

# Configure logging
configure_logging()

# Register middlewares
register_middlewares(app)

# Include routes
include_routes(app)


@app.on_event("startup")
async def startup_event():
    """Create database tables on startup"""
    pass


@app.get("/health")
async def health_check():
    """Liveness endpoint that does not depend on external services."""
    return {"status": "healthy"}


@app.get("/health/ready")
async def readiness_check():
    """Report whether database and Redis are usable without exposing their details."""
    dependencies = await collect_readiness()
    payload = {
        "status": "ready" if all(value == "ok" for value in dependencies.values()) else "not_ready",
        "dependencies": dependencies,
    }
    status_code = 200 if payload["status"] == "ready" else 503
    return JSONResponse(status_code=status_code, content=payload)


def main():
    """Entry point"""
    import uvicorn
    uvicorn.run(
        "neurodatics.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )


if __name__ == "__main__":
    main()

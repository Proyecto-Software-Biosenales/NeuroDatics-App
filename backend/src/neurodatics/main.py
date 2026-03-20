from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.router import include_routes
from .api.middlewares import register_middlewares
from .config.settings import settings
from .config.logging import configure_logging
from .infra.db.base import Base
from .infra.db.session import engine

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
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
    """Health check endpoint"""
    return {"status": "healthy", "debug": settings.debug}


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

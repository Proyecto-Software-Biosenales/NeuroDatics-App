from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import time
import logging

logger = logging.getLogger(__name__)


def register_middlewares(app: FastAPI):
    """Register application middlewares"""

    @app.middleware("http")
    async def logging_middleware(request: Request, call_next):
        """Log requests and responses"""
        start_time = time.time()

        # Log request
        logger.info(f"Request: {request.method} {request.url}")

        try:
            response = await call_next(request)

            # Log response
            process_time = time.time() - start_time
            logger.info(f"Response: {response.status_code} - {process_time:.4f}s")

            return response

        except Exception as e:
            # Log error
            process_time = time.time() - start_time
            logger.error(f"Error: {str(e)} - {process_time:.4f}s")

            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"}
            )

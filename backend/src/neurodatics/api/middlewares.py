from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import time
import logging
from typing import Optional
from urllib.parse import urlsplit

from ..config.settings import settings

logger = logging.getLogger(__name__)

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _local_request_refusal(host_header: str, origin_header: Optional[str]) -> Optional[str]:
    """Why a local-mode request must be refused, or None when it may proceed.

    Local mode has no login, so the only thing keeping other web pages from driving the API
    is that a browser page can neither name a loopback Host it does not own (DNS rebinding)
    nor send an Origin that differs from the one it is served from (cross-site requests).
    """
    hostname = urlsplit(f"//{host_header}").hostname
    if hostname not in _LOOPBACK_HOSTS:
        return "Host is not a loopback address"
    if origin_header is not None and urlsplit(origin_header).netloc.lower() != host_header.lower():
        return "Cross-origin requests are not allowed"
    return None


def register_middlewares(app: FastAPI):
    """Register application middlewares"""

    if settings.is_local:
        @app.middleware("http")
        async def local_origin_guard(request: Request, call_next):
            refusal = _local_request_refusal(
                request.headers.get("host", ""), request.headers.get("origin")
            )
            if refusal:
                return JSONResponse(status_code=403, content={"detail": refusal})
            return await call_next(request)

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

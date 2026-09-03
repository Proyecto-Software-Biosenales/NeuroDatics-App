import logging
import os
import sys
from threading import Lock
from ..config.settings import settings


_tombstones_seen = set()
_tombstones_lock = Lock()


def tombstone(name: str) -> None:
    """Record a candidate's use once per process, without changing its behavior."""
    process_id = os.getpid()
    key = (process_id, name)
    with _tombstones_lock:
        if key in _tombstones_seen:
            return
        _tombstones_seen.add(key)
    caller = sys._getframe(1)
    logging.getLogger("neurodatics.tombstones").warning(
        "TOMBSTONE 2026-09-03 codex %s caller=%s:%d pid=%d",
        name, caller.f_code.co_filename, caller.f_lineno, process_id,
    )


def configure_logging():
    """Configure application logging"""
    
    # Set log level based on debug setting
    log_level = logging.DEBUG if settings.debug else logging.INFO
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Configure specific loggers
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    
    logger = logging.getLogger(__name__)
    logger.info("Logging configured successfully")

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from ..config.settings import settings


def _local_handlers() -> list:
    """Local mode: the student's console shows problems, and the full log goes to a file."""
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.WARNING)
    log_dir = os.path.join(settings.local_data_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    history = RotatingFileHandler(
        os.path.join(log_dir, "app.log"), maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    return [console, history]


def configure_logging():
    """Configure application logging"""

    # Set log level based on debug setting
    log_level = logging.DEBUG if settings.debug else logging.INFO

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=_local_handlers() if settings.is_local else [logging.StreamHandler(sys.stdout)],
    )

    # Configure specific loggers
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    logger = logging.getLogger(__name__)
    logger.info("Logging configured successfully")

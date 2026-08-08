"""Admission control for the experiment-ZIP endpoint.

Ingestion is synchronous, holds a DB session and streams hundreds of megabytes
through the API container. Without a gate, a handful of concurrent uploads is
enough to exhaust memory and starve every other request, so uploads are capped
per user and globally, and a minimum gap between attempts is enforced.

Process-local, like `DriveUploadProgressRegistry` — correct for the current
single-process deployment. It has to move to Redis alongside that registry if
the API is ever scaled out.
"""

import threading
import time
from contextlib import contextmanager
from typing import Dict, Generator

from .....config.settings import settings


class UploadRejected(Exception):
    """Raised when an upload must not be admitted right now."""

    def __init__(self, message: str, retry_after_seconds: int = 0):
        self.retry_after_seconds = max(0, int(retry_after_seconds))
        super().__init__(message)


class UploadAdmissionControl:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_by_user: Dict[str, int] = {}
        self._last_started_at: Dict[str, float] = {}
        self._active_total = 0

    def _prune_last_started(self, now: float) -> None:
        window = max(1.0, float(settings.upload_min_seconds_between_uploads)) * 20
        for key in [k for k, ts in self._last_started_at.items() if now - ts > window]:
            self._last_started_at.pop(key, None)

    def _acquire(self, user_id: str) -> None:
        now = time.time()
        per_user_limit = max(1, int(settings.upload_max_concurrent_per_user))
        global_limit = max(1, int(settings.upload_max_concurrent_global))
        min_gap = max(0.0, float(settings.upload_min_seconds_between_uploads))

        with self._lock:
            self._prune_last_started(now)

            if self._active_by_user.get(user_id, 0) >= per_user_limit:
                raise UploadRejected(
                    "Ya tienes una carga de experimento en curso. Espera a que termine antes de iniciar otra.",
                    retry_after_seconds=30,
                )

            if self._active_total >= global_limit:
                raise UploadRejected(
                    "El servidor esta procesando el maximo de cargas simultaneas. Intenta de nuevo en unos minutos.",
                    retry_after_seconds=60,
                )

            last_started = self._last_started_at.get(user_id)
            if last_started is not None and (now - last_started) < min_gap:
                wait_seconds = min_gap - (now - last_started)
                raise UploadRejected(
                    "Demasiadas cargas seguidas. Espera unos segundos antes de reintentar.",
                    retry_after_seconds=int(wait_seconds) + 1,
                )

            self._active_by_user[user_id] = self._active_by_user.get(user_id, 0) + 1
            self._active_total += 1
            self._last_started_at[user_id] = now

    def _release(self, user_id: str) -> None:
        with self._lock:
            remaining = self._active_by_user.get(user_id, 0) - 1
            if remaining > 0:
                self._active_by_user[user_id] = remaining
            else:
                self._active_by_user.pop(user_id, None)
            self._active_total = max(0, self._active_total - 1)

    @contextmanager
    def slot(self, user_id: str) -> Generator[None, None, None]:
        self._acquire(user_id)
        try:
            yield
        finally:
            self._release(user_id)


upload_admission_control = UploadAdmissionControl()

import threading
import time
from typing import Dict, Optional
from uuid import UUID


class DriveUploadProgressRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: Dict[str, Dict[str, object]] = {}
        self._max_age_seconds = 60 * 60 * 6

    def _prune_stale(self, now: float) -> None:
        stale_keys = []
        for key, item in self._data.items():
            updated_at = float(item.get("updated_at") or 0)
            if updated_at > 0 and now - updated_at > self._max_age_seconds:
                stale_keys.append(key)
        for key in stale_keys:
            self._data.pop(key, None)

    def start(self, project_id: UUID, total_bytes: int) -> None:
        now = time.time()
        safe_total = max(1, int(total_bytes))
        with self._lock:
            self._prune_stale(now)
            self._data[str(project_id)] = {
                "phase": "uploading",
                "uploaded_bytes": 0,
                "total_bytes": safe_total,
                "percent": 0,
                "speed_mbps": None,
                "eta_seconds": None,
                "elapsed_seconds": 0,
                "error": None,
                "cancel_requested": False,
                "started_at": now,
                "updated_at": now,
                "last_uploaded_bytes": 0,
                "last_sample_at": now,
            }

    def request_cancel(self, project_id: UUID) -> None:
        now = time.time()
        key = str(project_id)

        with self._lock:
            self._prune_stale(now)
            item = self._data.get(key)

            if not item:
                item = {
                    "phase": "canceling",
                    "uploaded_bytes": 0,
                    "total_bytes": 1,
                    "percent": 0,
                    "speed_mbps": None,
                    "eta_seconds": None,
                    "elapsed_seconds": 0,
                    "error": None,
                    "cancel_requested": True,
                    "started_at": now,
                    "updated_at": now,
                    "last_uploaded_bytes": 0,
                    "last_sample_at": now,
                }
                self._data[key] = item
                return

            item["cancel_requested"] = True
            item["phase"] = "canceling"
            item["speed_mbps"] = None
            item["eta_seconds"] = None
            item["updated_at"] = now
            self._data[key] = item

    def is_cancel_requested(self, project_id: UUID) -> bool:
        key = str(project_id)
        with self._lock:
            now = time.time()
            self._prune_stale(now)
            item = self._data.get(key)
            if not item:
                return False
            return bool(item.get("cancel_requested"))

    def mark_uploaded_bytes(self, project_id: UUID, uploaded_bytes: int) -> None:
        now = time.time()
        key = str(project_id)

        with self._lock:
            self._prune_stale(now)
            item = self._data.get(key)
            if not item:
                return

            total_bytes = int(item["total_bytes"])
            bounded_uploaded = min(total_bytes, max(0, int(uploaded_bytes)))
            previous_uploaded = int(item["last_uploaded_bytes"])
            previous_sample_at = float(item["last_sample_at"])

            delta_bytes = max(0, bounded_uploaded - previous_uploaded)
            delta_seconds = max(0.001, now - previous_sample_at)
            speed_bytes_per_second = delta_bytes / delta_seconds if delta_bytes > 0 else 0.0

            elapsed_seconds = int(max(0.0, now - float(item["started_at"])))
            remaining_bytes = max(0, total_bytes - bounded_uploaded)
            eta_seconds = int(round(remaining_bytes / speed_bytes_per_second)) if speed_bytes_per_second > 0 else None
            computed_percent = int(min(100, round((bounded_uploaded / total_bytes) * 100)))
            if computed_percent >= 100:
                computed_percent = 99

            item["phase"] = "uploading"
            item["uploaded_bytes"] = bounded_uploaded
            item["percent"] = computed_percent
            item["speed_mbps"] = round(speed_bytes_per_second / (1024 * 1024), 2) if speed_bytes_per_second > 0 else None
            item["eta_seconds"] = eta_seconds
            item["elapsed_seconds"] = elapsed_seconds
            item["updated_at"] = now
            item["last_uploaded_bytes"] = bounded_uploaded
            item["last_sample_at"] = now
            item["cancel_requested"] = bool(item.get("cancel_requested", False))
            self._data[key] = item

    def complete(self, project_id: UUID) -> None:
        now = time.time()
        key = str(project_id)

        with self._lock:
            self._prune_stale(now)
            item = self._data.get(key)
            if not item:
                return

            total_bytes = int(item["total_bytes"])
            item["phase"] = "completed"
            item["uploaded_bytes"] = total_bytes
            item["percent"] = 100
            item["speed_mbps"] = None
            item["eta_seconds"] = 0
            item["elapsed_seconds"] = int(max(0.0, now - float(item["started_at"])))
            item["updated_at"] = now
            item["last_uploaded_bytes"] = total_bytes
            item["last_sample_at"] = now
            item["cancel_requested"] = False
            self._data[key] = item

    def fail(self, project_id: UUID, error: str) -> None:
        now = time.time()
        key = str(project_id)

        with self._lock:
            self._prune_stale(now)
            item = self._data.get(key)
            if not item:
                return

            item["phase"] = "failed"
            item["error"] = error
            item["speed_mbps"] = None
            item["eta_seconds"] = None
            item["elapsed_seconds"] = int(max(0.0, now - float(item["started_at"])))
            item["updated_at"] = now
            item["cancel_requested"] = bool(item.get("cancel_requested", False))
            self._data[key] = item

    def get(self, project_id: UUID) -> Optional[Dict[str, object]]:
        with self._lock:
            now = time.time()
            self._prune_stale(now)
            item = self._data.get(str(project_id))
            if not item:
                return None
            return dict(item)

    def remove(self, project_id: UUID) -> None:
        with self._lock:
            now = time.time()
            self._prune_stale(now)
            self._data.pop(str(project_id), None)


drive_upload_progress_registry = DriveUploadProgressRegistry()

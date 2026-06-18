import time
from pathlib import Path
from typing import Optional
from uuid import UUID

import pandas as pd

from ....config.settings import settings


class ParquetCacheService:
    """Local disk cache for participant Parquet files."""

    def __init__(self) -> None:
        self._cache_dir = Path(getattr(settings, "parquet_cache_dir", "/data/parquet_cache"))
        ttl_hours = getattr(settings, "parquet_cache_ttl_hours", 4)
        self._ttl_seconds = int(ttl_hours) * 3600

    def _path_for(self, project_id: UUID, participant_code: str) -> Path:
        return self._cache_dir / str(project_id) / f"{participant_code}.parquet"

    def get(self, project_id: UUID, participant_code: str) -> Optional[Path]:
        path = self._path_for(project_id, participant_code)
        if not path.exists():
            return None

        age_seconds = time.time() - path.stat().st_mtime
        if age_seconds > self._ttl_seconds:
            return None

        return path

    def put(self, project_id: UUID, participant_code: str, content: bytes) -> Path:
        path = self._path_for(project_id, participant_code)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def read_dataframe(self, project_id: UUID, participant_code: str) -> Optional[pd.DataFrame]:
        path = self.get(project_id, participant_code)
        if path is None:
            return None
        return pd.read_parquet(path)

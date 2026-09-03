"""One synthetic recording drives ingestion, numerical and HTTP contracts."""

import hashlib
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID
import zipfile

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from neurodatics.api.deps import get_db
from neurodatics.config.security import create_access_token
from neurodatics.main import app
from neurodatics.modules.analytics.api import routes
from neurodatics.modules.participants.domain.entities import Participant
from neurodatics.modules.projects.application.services.csv_processing_service import CsvProcessingService
from neurodatics.modules.projects.application.services.zip_validation_service import (
    UploadSelection, ZipValidationService,
)
from neurodatics.modules.projects.domain.entities import Project
from neurodatics.modules.scenaries.domain.entities import Scenaries

PROJECT_ID = UUID("00000000-0000-0000-0000-000000000101")
USER_ID = UUID("00000000-0000-0000-0000-000000000102")


@pytest.fixture(scope="session")
def corpus(tmp_path_factory):
    directory = tmp_path_factory.mktemp("synthetic-experiment")
    archive_path = Path(__file__).parents[1] / "fixtures/golden/synthetic-experiment.zip"
    assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == (
        "2dac7ab109e8a3578c40670be84706b750389f0e4bdd1b947f4dfe5d2821c168"
    )
    _, counts, _, _, excluded = ZipValidationService.validate_and_analyze(
        filename=archive_path.name, mime_type="application/zip", zip_path=str(archive_path),
        selection=UploadSelection(allow_missing_videos=True),
    )
    assert counts == {"images": 2, "videos": 0, "csv": 1, "other": 0}
    assert not excluded
    with zipfile.ZipFile(archive_path) as archive:
        csv_path = directory / "experiment.csv"
        csv_path.write_bytes(archive.read("experiment.csv"))
    result = CsvProcessingService.process(str(csv_path), str(directory / "parquet"))
    frames_by_index = {index: pd.read_parquet(path) for index, path in result.user_parquet_paths}
    frames = {item.participant_code: frames_by_index[item.user_index] for item in result.participants}
    assert set(result.detected_sensors) == {"EEG", "EyeTracker", "GSR"}
    assert set(frames) == {"SYN-01", "SYN-02"}
    assert all(set(frame.scenario) == {"stimulus-a", "stimulus-b"} for frame in frames.values())
    return SimpleNamespace(frames=frames, processing=result, zip_path=archive_path)


@pytest.fixture
def aois():
    return [SimpleNamespace(
        id="left", name="Left region", color="#2563EB", shape_type="rect",
        shape={"x": 0, "y": 0, "width": 50, "height": 100},
    ), SimpleNamespace(
        id="right", name="Right region", color="#16A34A", shape_type="rect",
        shape={"x": 50, "y": 0, "width": 50, "height": 100},
    )]


class MemoryCache:
    def __init__(self):
        self.values = {}

    def build_key(self, *args, **kwargs):
        return repr((args, sorted(kwargs.items())))

    def get_json(self, key):
        return self.values.get(key)

    def set_json(self, key, data, ttl=None):
        self.values[key] = data

    get_bytes = get_json
    set_bytes = set_json


@pytest.fixture
def http_client(corpus, aois, monkeypatch):
    project = SimpleNamespace(id=PROJECT_ID, owner_id=USER_ID, cache_generation=3)
    scenarios = [SimpleNamespace(
        id=UUID(int=index + 200), project_id=PROJECT_ID, name=name, type="image",
        file_id=UUID(int=index + 300), width=1280, height=720, aois=aois,
    ) for index, name in enumerate(("stimulus-a", "stimulus-b"))]
    participants = [SimpleNamespace(participant_code=code) for code in corpus.frames]

    class Database:
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            values = {Project: [project], Scenaries: scenarios, Participant: participants}[entity]
            return SimpleNamespace(
                scalar_one_or_none=lambda: values[0] if values else None,
                scalars=lambda: SimpleNamespace(all=lambda: values),
            )

    class Reader:
        def __init__(self, db):
            pass

        async def read(self, project_id, participant_code, generation=None):
            if participant_code not in corpus.frames:
                raise FileNotFoundError("Participant data not found")
            return corpus.frames[participant_code].copy(deep=True)

        async def read_from_cache_only(self, *args, **kwargs):
            return None

    async def database():
        yield Database()

    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", MemoryCache())
    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = database
    token = create_access_token(str(USER_ID), "synthetic@example.invalid", "Synthetic fixture")
    client = TestClient(app, headers={"Authorization": f"Bearer {token}"})
    try:
        yield client
    finally:
        client.close()
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from neurodatics.modules.projects.api import routes
from neurodatics.modules.projects.api.schemas import ProjectStatus


@pytest.mark.asyncio
async def test_get_project_serializes_aoi_scenary_id(monkeypatch):
    owner_id = uuid4()
    project_id = uuid4()
    scenary_id = uuid4()
    aoi_id = uuid4()
    project = SimpleNamespace(
        id=project_id,
        name="AOI project",
        description=None,
        status=ProjectStatus.ACTIVE,
        created_at=datetime.now(timezone.utc),
        ingestion_status=None,
        ingestion_error=None,
        drive_root_folder_id=None,
        drive_root_folder_name=None,
        drive_root_folder_url=None,
        files=[],
        sensors=[],
        participants=[],
        scenaries=[
            SimpleNamespace(
                id=scenary_id,
                name="Scenario 1",
                type="image",
                file_id=None,
                source_entry_path=None,
                width=1920,
                height=1080,
                fps=None,
                duration_ms=None,
                stimulus_placement=None,
                aois=[
                    SimpleNamespace(
                        id=aoi_id,
                        scenaries_id=scenary_id,
                        name="Product",
                        color="#ff0000",
                        shape_type="rectangle",
                        shape={"x": 10, "y": 20, "width": 30, "height": 40},
                    )
                ],
            )
        ],
    )

    class FakeProjectRepository:
        def __init__(self, db):
            self.db = db

        async def get_by_id(self, requested_project_id, requested_owner_id):
            assert requested_project_id == project_id
            assert requested_owner_id == owner_id
            return project

    monkeypatch.setattr(routes, "SQLProjectRepository", FakeProjectRepository)

    response = await routes.get_project(
        project_id=project_id,
        current_user=str(owner_id),
        db=object(),
    )

    assert response.scenaries[0].aois[0].scenaries_id == scenary_id
    assert response.model_dump()["scenaries"][0]["aois"][0]["scenaries_id"] == scenary_id

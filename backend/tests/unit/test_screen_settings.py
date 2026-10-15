"""Global screen settings: laboratory defaults, per-person storage and the review flag."""

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from neurodatics.api.deps import get_current_user, get_db
from neurodatics.modules.settings.api.routes import router
from neurodatics.modules.settings.domain.entities import UserSettings


class AsyncFacade:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    def add(self, row):
        self.session.add(row)

    async def commit(self):
        self.session.commit()

    async def refresh(self, row):
        self.session.refresh(row)


@pytest.fixture
def storage(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'settings.sqlite'}", connect_args={"check_same_thread": False})
    UserSettings.__table__.create(engine)
    user = {"id": str(uuid4())}
    app = FastAPI()
    app.include_router(router, prefix="/api")

    async def database():
        with Session(engine, expire_on_commit=False) as session:
            yield AsyncFacade(session)

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: user["id"]
    with TestClient(app) as client:
        yield client, engine, user
    engine.dispose()


LAB_SCREEN = {"width_px": 1280, "height_px": 1024, "width_cm": None, "height_cm": None}


def test_unreviewed_screen_is_the_laboratory_one(storage):
    client, _engine, _user = storage
    response = client.get("/api/settings/screen")
    assert response.status_code == 200
    assert response.json() == {"screen": LAB_SCREEN, "confirmed": False}


def test_saving_confirms_even_unchanged_defaults_and_is_per_person(storage):
    client, _engine, user = storage
    saved = client.put("/api/settings/screen", json=LAB_SCREEN)
    assert saved.json() == {"screen": LAB_SCREEN, "confirmed": True}

    changed = {**LAB_SCREEN, "width_px": 1920, "height_px": 1080, "width_cm": 52.7}
    client.put("/api/settings/screen", json=changed)
    assert client.get("/api/settings/screen").json() == {"screen": changed, "confirmed": True}

    user["id"] = str(uuid4())
    assert client.get("/api/settings/screen").json() == {"screen": LAB_SCREEN, "confirmed": False}


@pytest.mark.parametrize("screen", [
    {**LAB_SCREEN, "width_px": 0},
    {**LAB_SCREEN, "height_px": 10.5},
    {**LAB_SCREEN, "width_cm": -1},
    {**LAB_SCREEN, "notes": "campo desconocido"},
    {**LAB_SCREEN, "viewing_distance_cm": 62.5},
])
def test_invalid_screens_are_rejected(storage, screen):
    client, _engine, _user = storage
    assert client.put("/api/settings/screen", json=screen).status_code == 422
    assert client.get("/api/settings/screen").json()["confirmed"] is False


def test_a_stored_screen_that_no_longer_validates_falls_back_to_the_laboratory(storage):
    client, engine, user = storage
    client.put("/api/settings/screen", json=LAB_SCREEN)
    with Session(engine) as session:
        session.execute(update(UserSettings).values(screen={"width_px": "ancho"}))
        session.commit()
    assert client.get("/api/settings/screen").json() == {"screen": LAB_SCREEN, "confirmed": True}


def test_a_stored_screen_keeps_its_values_without_the_retired_fields(storage):
    client, engine, _user = storage
    client.put("/api/settings/screen", json=LAB_SCREEN)
    stored = {**LAB_SCREEN, "width_px": 1920, "model": "Dell P2419H", "viewing_distance_cm": 62.5}
    with Session(engine) as session:
        session.execute(update(UserSettings).values(screen=stored))
        session.commit()
    assert client.get("/api/settings/screen").json() == {
        "screen": {**LAB_SCREEN, "width_px": 1920}, "confirmed": True,
    }

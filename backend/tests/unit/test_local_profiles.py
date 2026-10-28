"""Profiles of the local edition: the routes, the first profile's id and deleting a profile's projects."""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from neurodatics.api.deps import get_db
from neurodatics.config.security import LOCAL_USER_ID
from neurodatics.modules.auth.api import local_routes
from neurodatics.modules.auth.application import local_profiles, profile_registry
from neurodatics.modules.auth.domain.entities import LocalProfile
from neurodatics.modules.projects.infrastructure.mutation_lock import ProjectMutationConflict


class Rows:
    def __init__(self, values):
        self.values = list(values)

    def all(self):
        return self.values


class FakeDb:
    def __init__(self, scalar_results=(), profile=None):
        self.scalar_results = list(scalar_results)
        self.profile = profile
        self.added, self.executed = [], []
        self.commits = 0

    async def scalars(self, _statement):
        return Rows(self.scalar_results.pop(0) if self.scalar_results else [])

    async def get(self, _model, _key):
        return self.profile

    def add(self, value):
        self.added.append(value)

    async def execute(self, statement):
        self.executed.append(statement)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


@pytest.fixture
def known_ids(monkeypatch):
    ids = set()
    monkeypatch.setattr(profile_registry, "_known_ids", ids)
    return ids


# -- creating ----------------------------------------------------------------------------------
def test_the_first_profile_inherits_the_projects_made_before_profiles(known_ids):
    profile = asyncio.run(local_profiles.create_profile(FakeDb([[]]), "Ana"))

    assert profile.id == UUID(LOCAL_USER_ID)
    assert known_ids == {LOCAL_USER_ID}


def test_later_profiles_get_their_own_id(known_ids):
    profile = asyncio.run(local_profiles.create_profile(FakeDb([["Ana"]]), "Luis"))

    assert profile.id != UUID(LOCAL_USER_ID)
    assert str(profile.id) in known_ids


def test_two_profiles_cannot_share_a_name(known_ids):
    with pytest.raises(local_profiles.ProfileNameTaken):
        asyncio.run(local_profiles.create_profile(FakeDb([["Ana María"]]), "ana maría"))


def test_names_are_trimmed_and_cut_to_the_column():
    assert local_profiles.clean_name("  Ana \n  María  ") == "Ana María"
    assert len(local_profiles.clean_name("x" * 300)) == local_profiles.MAX_NAME_LENGTH


# -- deleting ----------------------------------------------------------------------------------
@pytest.fixture
def project_deletion(monkeypatch):
    deleted = []

    class Deleter:
        def __init__(self, repository, db):
            pass

        async def execute(self, project_id, owner_id):
            deleted.append((project_id, owner_id))

    @asynccontextmanager
    async def free_lock(_db, _project_id):
        yield

    monkeypatch.setattr(local_profiles, "DeleteProjectUseCase", Deleter)
    monkeypatch.setattr(local_profiles, "SQLProjectRepository", lambda db: None)
    monkeypatch.setattr(local_profiles, "project_mutation_lock", free_lock)
    monkeypatch.setattr(local_profiles, "invalidate_project_video_metadata", lambda project_id: None)
    return deleted


def test_deleting_a_profile_deletes_every_project_it_owns(known_ids, project_deletion):
    owner, projects = uuid4(), [uuid4(), uuid4()]
    known_ids.add(str(owner))
    db = FakeDb([projects, []], profile=LocalProfile(id=owner, name="Ana"))

    assert asyncio.run(local_profiles.delete_profile(db, str(owner))) == 2

    assert project_deletion == [(project, owner) for project in projects]
    assert len(db.executed) == 1 and db.commits == 1
    assert str(owner) not in known_ids


def test_a_busy_project_keeps_the_profile(known_ids, project_deletion, monkeypatch):
    owner = uuid4()
    known_ids.add(str(owner))

    class BusyLock:
        async def __aenter__(self):
            raise ProjectMutationConflict("busy")

        async def __aexit__(self, *_exc_info):
            return False

    monkeypatch.setattr(local_profiles, "project_mutation_lock", lambda _db, _project_id: BusyLock())
    db = FakeDb([[uuid4()]], profile=LocalProfile(id=owner, name="Ana"))

    with pytest.raises(local_profiles.ProfileBusy):
        asyncio.run(local_profiles.delete_profile(db, str(owner)))

    assert db.executed == [] and str(owner) in known_ids


@pytest.mark.parametrize("profile_id", ["not-an-id", str(uuid4())])
def test_deleting_a_missing_profile_reports_it(profile_id):
    assert asyncio.run(local_profiles.delete_profile(FakeDb(), profile_id)) is None


# -- routes ------------------------------------------------------------------------------------
@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(local_routes.router, prefix="/api")

    async def no_db():
        yield None

    app.dependency_overrides[get_db] = no_db
    return TestClient(app)


def returning(value):
    async def call(*_args):
        return value

    return call


def test_a_computer_without_profiles_gets_a_session_without_user(client, monkeypatch):
    monkeypatch.setattr(local_routes, "open_profile", returning(None))

    body = client.post("/api/auth/local-session").json()

    assert body["user"] is None and body["access_token"] is None


def test_the_session_token_is_the_profile_id(client, monkeypatch):
    seen = {}

    async def open_profile(_db, profile_id):
        seen["asked"] = profile_id
        return SimpleNamespace(id=UUID(LOCAL_USER_ID), name="Ana")

    monkeypatch.setattr(local_routes, "open_profile", open_profile)

    body = client.post("/api/auth/local-session", json={"profile_id": LOCAL_USER_ID}).json()

    assert seen["asked"] == LOCAL_USER_ID
    assert body["access_token"] == LOCAL_USER_ID
    assert body["user"] == {"id": LOCAL_USER_ID, "email": None, "name": "Ana"}
    assert body["expires_in"] > 0


def test_profiles_list_their_projects(client, monkeypatch):
    monkeypatch.setattr(local_routes, "list_profiles", returning([(LocalProfile(id=UUID(LOCAL_USER_ID), name="Ana"), 3)]))

    assert client.get("/api/auth/profiles").json() == [{"id": LOCAL_USER_ID, "name": "Ana", "project_count": 3}]


def test_a_profile_needs_a_name(client):
    response = client.post("/api/auth/profiles", json={"name": "   "})

    assert response.status_code == 422 and response.json()["detail"] == "Escribe el nombre del perfil."


def test_a_repeated_name_is_refused(client, monkeypatch):
    async def taken(_db, name):
        raise local_profiles.ProfileNameTaken(name)

    monkeypatch.setattr(local_routes, "create_profile", taken)

    assert client.post("/api/auth/profiles", json={"name": "Ana"}).status_code == 409


def test_creating_a_profile_opens_it(client, monkeypatch):
    monkeypatch.setattr(local_routes, "create_profile", returning(LocalProfile(id=UUID(LOCAL_USER_ID), name="Ana")))

    response = client.post("/api/auth/profiles", json={"name": " Ana "})

    assert response.status_code == 201 and response.json()["user"]["name"] == "Ana"


@pytest.mark.parametrize(("outcome", "code"), [(2, 200), (None, 404)])
def test_deleting_a_profile_reports_its_projects(client, monkeypatch, outcome, code):
    monkeypatch.setattr(local_routes, "delete_profile", returning(outcome))

    response = client.delete(f"/api/auth/profiles/{LOCAL_USER_ID}")

    assert response.status_code == code
    if outcome is not None:
        assert response.json() == {"deleted_projects": 2}


def test_a_profile_with_a_project_in_progress_is_not_deleted(client, monkeypatch):
    async def busy(_db, _profile_id):
        raise local_profiles.ProfileBusy("busy")

    monkeypatch.setattr(local_routes, "delete_profile", busy)

    assert client.delete(f"/api/auth/profiles/{LOCAL_USER_ID}").status_code == 409

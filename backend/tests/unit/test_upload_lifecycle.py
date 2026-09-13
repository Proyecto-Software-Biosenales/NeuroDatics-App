import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from neurodatics.modules.participants.domain.entities import Participant, Sex
from neurodatics.modules.projects.domain.entities import (
    Project,
    ProjectFile,
    ProjectSensor,
    UploadAttempt,
    DriveCleanupTask,
)
from neurodatics.modules.projects.infrastructure.repository_impl import (
    SQLProjectRepository,
)
from neurodatics.modules.projects.infrastructure.mutation_lock import (
    project_mutation_lock,
    ProjectMutationConflict,
)
from neurodatics.modules.projects.infrastructure.upload_attempt_store import (
    UploadAttemptConflict,
    UploadAttemptStore,
)
from neurodatics.modules.projects.infrastructure.drive_cleanup import (
    enqueue_drive_cleanup,
    drain_drive_cleanup,
)
from neurodatics.modules.projects.application.services.drive_upload_progress_registry import (
    DriveUploadProgressRegistry,
)
from neurodatics.modules.projects.application.use_cases import (
    ingestion_lifecycle as module,
)
from neurodatics.modules.projects.application.use_cases.ingestion_lifecycle import (
    IngestionLifecycle,
    finish_upload_on_disconnect,
)
from neurodatics.modules.projects.application.use_cases.publish_ingestion import (
    preserve_unchanged_stimulus_annotations,
)
from neurodatics.modules.projects.application.use_cases.delete_project import (
    DeleteProjectUseCase,
)


def lifecycle(*, previous_root=None):
    repository = SimpleNamespace(
        commit=AsyncMock(), rollback=AsyncMock(), update_project_ingestion=AsyncMock()
    )
    project = SimpleNamespace(id=uuid4(), drive_root_folder_id=previous_root)
    return IngestionLifecycle(repository, None, project, uuid4())


def test_cancel_survives_processing_to_drive_transition_without_poisoning_retry():
    registry = DriveUploadProgressRegistry()
    first, retry = f"project:{uuid4()}", f"project:{uuid4()}"
    registry.request_cancel(first)
    registry.begin(first)
    registry.start(first, 100)
    registry.mark_uploaded_bytes(first, 50)
    assert registry.get(first)["phase"] == "canceling"
    assert registry.is_cancel_requested(first)
    registry.fail(first, "canceled")
    registry.begin(retry)
    assert not registry.is_cancel_requested(retry)
    registry.complete(retry)
    registry.request_cancel(retry)
    registry.mark_uploaded_bytes(retry, 0)
    assert registry.get(retry)["phase"] == "completed"


@pytest.mark.asyncio
async def test_validation_failure_does_not_modify_previous_project_status(monkeypatch):
    attempt = lifecycle(previous_root="published")
    await attempt.begin()
    delete = Mock(return_value=True)
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    await attempt.fail(ValueError("invalid archive"), "invalid archive", [])
    attempt.repository.update_project_ingestion.assert_not_awaited()
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_failed_replacement_preserves_ready_generation_and_cleans_only_new_root(
    monkeypatch,
):
    attempt = lifecycle(previous_root="published")
    await attempt.begin()
    attempt.processing = True
    await attempt.record_root("new-root")
    delete = Mock(return_value=True)
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    await attempt.fail(RuntimeError(), "failed", ["new-root", "child"])
    delete.assert_called_once_with("new-root")
    assert (
        attempt.repository.update_project_ingestion.await_args.args[1][
            "ingestion_status"
        ]
        == "READY"
    )


@pytest.mark.asyncio
async def test_post_commit_failure_can_never_compensate_published_files(monkeypatch):
    attempt = lifecycle()
    await attempt.begin()
    attempt.published = True
    delete = Mock()
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    await attempt.fail(RuntimeError(), "failed", ["published"])
    delete.assert_not_called()
    attempt.repository.rollback.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "receipt", [SimpleNamespace(phase="completed"), RuntimeError("DB unavailable")]
)
async def test_unknown_commit_outcome_retains_drive_objects(monkeypatch, receipt):
    attempt = lifecycle()
    await attempt.begin()
    attempt.publishing = True
    getter = (
        AsyncMock(side_effect=receipt)
        if isinstance(receipt, Exception)
        else AsyncMock(return_value=receipt)
    )
    attempt.store = SimpleNamespace(get=getter)
    delete = Mock()
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    await attempt.fail(RuntimeError(), "failed", ["possibly-published"])
    delete.assert_not_called()
    attempt.repository.update_project_ingestion.assert_not_awaited()


@pytest.mark.asyncio
async def test_duplicate_attempt_rejection_does_not_overwrite_its_receipt(monkeypatch):
    attempt = lifecycle()
    attempt.store = SimpleNamespace(
        begin=AsyncMock(side_effect=UploadAttemptConflict()),
        update=AsyncMock(),
        session=object(),
    )
    attempt.recover = AsyncMock()
    monkeypatch.setattr(module, "assert_project_mutation_lock", AsyncMock())
    with pytest.raises(UploadAttemptConflict):
        await attempt.begin()
    await attempt.fail(UploadAttemptConflict(), "duplicate", [])
    attempt.store.update.assert_not_awaited()


@pytest.mark.asyncio
async def test_interrupted_attempt_is_recovered_but_failed_cleanup_does_not_change_newer_state(
    monkeypatch,
):
    attempt = lifecycle(previous_root="current")
    interrupted, already_failed = uuid4(), uuid4()
    attempt.store = SimpleNamespace(
        unfinished=AsyncMock(
            return_value=[
                SimpleNamespace(
                    id=interrupted,
                    phase="uploading",
                    root_folder_id="staged",
                    cleanup_root_id=None,
                ),
                SimpleNamespace(
                    id=already_failed,
                    phase="failed",
                    root_folder_id="old-staged",
                    cleanup_root_id="old-staged",
                ),
            ]
        ),
        update=AsyncMock(),
        interrupt=AsyncMock(return_value=True),
    )
    delete = Mock(return_value=False)
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    await attempt.recover()
    assert [call.args[0] for call in delete.call_args_list] == ["staged", "old-staged"]
    attempt.repository.update_project_ingestion.assert_awaited_once()
    assert attempt.store.update.await_args_list[0].kwargs["cleanup_root_id"] == "staged"


@pytest.mark.asyncio
async def test_disconnect_waits_for_worker_cleanup_before_releasing_request_resources():
    project_id, upload_id = uuid4(), uuid4()
    started, release = asyncio.Event(), asyncio.Event()
    finished = []

    async def work():
        started.set()
        await release.wait()
        finished.append(True)
        assert module.drive_upload_progress_registry.is_cancel_requested(
            module.progress_key(project_id, upload_id)
        )
        return "complete"

    task = asyncio.create_task(
        finish_upload_on_disconnect(work(), project_id, upload_id)
    )
    await started.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    assert not finished
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert finished == [True]


@pytest.mark.asyncio
async def test_project_delete_failure_never_deletes_drive(monkeypatch):
    repository = SimpleNamespace(
        get_by_id=AsyncMock(
            return_value=SimpleNamespace(drive_root_folder_id="published")
        ),
        delete=AsyncMock(side_effect=RuntimeError("commit failed")),
    )
    delete = Mock()
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    with pytest.raises(RuntimeError):
        await DeleteProjectUseCase(repository).execute(uuid4(), uuid4())
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_project_delete_is_committed_before_drive_cleanup(monkeypatch):
    calls = []

    async def delete_db(*args):
        calls.append("commit")
        return True

    repository = SimpleNamespace(
        get_by_id=AsyncMock(
            return_value=SimpleNamespace(drive_root_folder_id="published")
        ),
        delete=delete_db,
    )
    monkeypatch.setattr(
        module.gdrive_client,
        "delete_file",
        lambda file_id: calls.append("drive") or False,
    )
    result = await DeleteProjectUseCase(repository).execute(uuid4(), uuid4())
    assert calls == ["commit", "drive"]
    assert result["deleted"] and not result["drive_folder_deleted"]


@pytest.mark.asyncio
async def test_mutation_lock_holds_dedicated_transaction_until_exit_and_releases_on_error():
    calls = []

    class Connection:
        @asynccontextmanager
        async def begin(self):
            calls.append("lock transaction")
            try:
                yield
            finally:
                calls.append("released")

        async def scalar(self, statement, params):
            assert "pg_try_advisory_xact_lock" in str(statement)
            assert isinstance(params["key"], int)
            return True

    class Engine:
        @asynccontextmanager
        async def connect(self):
            yield Connection()

    db = SimpleNamespace(bind=Engine(), info={})
    with pytest.raises(RuntimeError):
        async with project_mutation_lock(db, uuid4()):
            assert db.info["project_mutation_connection"]
            calls.append("ordinary commits cannot release this transaction")
            raise RuntimeError()
    assert calls[-1] == "released"
    assert "project_mutation_connection" not in db.info


@pytest.mark.asyncio
async def test_competing_mutation_is_rejected_without_entering_body():
    connection = SimpleNamespace(scalar=AsyncMock(return_value=False))

    @asynccontextmanager
    async def transaction():
        yield

    connection.begin = transaction

    @asynccontextmanager
    async def connect():
        yield connection

    with pytest.raises(ProjectMutationConflict):
        async with project_mutation_lock(
            SimpleNamespace(bind=SimpleNamespace(connect=connect), info={}), uuid4()
        ):
            pytest.fail("conflicting mutation entered")


class SyncSessionAdapter:
    """Execute the real repository SQL against enforced SQLite foreign keys."""

    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    async def flush(self):
        self.session.flush()

    async def commit(self):
        self.session.commit()

    async def scalar(self, statement):
        return self.session.scalar(statement)

    def add_all(self, objects):
        self.session.add_all(objects)


@pytest.fixture
def database():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    for table in (
        Project.__table__,
        ProjectFile.__table__,
        Participant.__table__,
        ProjectSensor.__table__,
        UploadAttempt.__table__,
        DriveCleanupTask.__table__,
    ):
        table.create(engine)
    with Session(engine) as session:
        project = Project(id=uuid4(), owner_id=uuid4(), name="Existing")
        session.add(project)
        session.commit()
        yield session, project.id, SQLProjectRepository(SyncSessionAdapter(session))
    engine.dispose()


@pytest.mark.asyncio
async def test_zip_replacement_detaches_historical_children_and_rolls_back_atomically(
    database,
):
    session, project_id, repository = database
    parent = ProjectFile(
        id=uuid4(),
        project_id=project_id,
        kind="experiment_zip",
        storage_provider="gdrive",
        external_id="zip",
        filename="study.zip",
    )
    session.add(parent)
    session.flush()
    child = ProjectFile(
        id=uuid4(),
        project_id=project_id,
        source_zip_id=parent.id,
        kind="processed_parquet",
        storage_provider="gdrive",
        external_id="parquet",
        filename="data.parquet",
    )
    session.add(child)
    session.commit()
    parent_id, child_id = parent.id, child.id
    await repository.soft_delete_active_files(project_id)
    assert await repository.purge_files_by_kind(project_id, "experiment_zip") == 1
    assert session.get(ProjectFile, child_id).source_zip_id is None
    session.rollback()
    assert session.get(ProjectFile, parent_id) is not None
    assert session.get(ProjectFile, child_id).source_zip_id == parent_id
    assert session.get(ProjectFile, child_id).deleted_at is None


@pytest.mark.asyncio
async def test_metadata_replacement_keeps_matching_demographics_in_same_transaction(
    database,
):
    session, project_id, repository = database
    session.add_all(
        [
            Participant(
                project_id=project_id, participant_code="P01", age=35, sex=Sex.FEMALE
            ),
            Participant(project_id=project_id, participant_code="P02", age=50),
            ProjectSensor(project_id=project_id, sensor_type="GSR"),
        ]
    )
    session.commit()
    await repository.reconcile_ingestion_metadata(
        project_id, ["P01", "P03"], ["EEG", "EEG"]
    )
    participants = {p.participant_code: p for p in session.scalars(select(Participant))}
    assert set(participants) == {"P01", "P03"}
    assert participants["P01"].age == 35 and participants["P01"].sex == Sex.FEMALE
    assert participants["P03"].age is None
    assert list(session.scalars(select(ProjectSensor.sensor_type))) == ["EEG"]
    session.rollback()
    assert set(session.scalars(select(Participant.participant_code))) == {"P01", "P02"}
    assert list(session.scalars(select(ProjectSensor.sensor_type))) == ["GSR"]


@pytest.mark.asyncio
async def test_durable_pre_receive_cancel_survives_begin_but_not_a_new_attempt(
    database,
):
    session, project_id, repository = database
    store = UploadAttemptStore(repository.session)
    upload_id, retry_id = uuid4(), uuid4()
    await store.request_cancel(project_id, upload_id)
    await store.begin(project_id, upload_id)
    assert await store.is_canceled(project_id, upload_id)
    await store.update(upload_id, phase="failed")
    session.commit()
    await store.begin(project_id, retry_id)
    assert not await store.is_canceled(project_id, retry_id)
    with pytest.raises(UploadAttemptConflict):
        await store.begin(project_id, upload_id)
    session.rollback()
    assert (await store.get(project_id, upload_id)).phase == "failed"


@pytest.mark.asyncio
async def test_cancel_after_completion_does_not_change_durable_receipt(database):
    session, project_id, repository = database
    store, upload_id = UploadAttemptStore(repository.session), uuid4()
    await store.begin(project_id, upload_id)
    await store.update(upload_id, phase="completed")
    session.commit()
    await store.request_cancel(project_id, upload_id)
    receipt = await store.get(project_id, upload_id)
    assert receipt.phase == "completed" and not receipt.cancel_requested


@pytest.mark.asyncio
async def test_publication_and_recovery_cannot_both_claim_one_attempt(database):
    session, project_id, repository = database
    store = UploadAttemptStore(repository.session)
    recovered, published = uuid4(), uuid4()
    await store.begin(project_id, recovered)
    assert await store.interrupt(recovered, "interrupted", "staged-root")
    session.commit()
    with pytest.raises(UploadAttemptConflict):
        await store.update_active(
            recovered, require_not_canceled=True, phase="completed"
        )
    session.rollback()
    with pytest.raises(UploadAttemptConflict):
        await store.update_active(
            recovered, phase="uploading", progress={"percent": 50}
        )
    session.rollback()
    await store.begin(project_id, published)
    await store.update_active(published, require_not_canceled=True, phase="completed")
    session.commit()
    assert not await store.interrupt(published, "interrupted", "published-root")
    assert (await store.get(project_id, published)).phase == "completed"


@pytest.mark.asyncio
async def test_cleanup_outbox_rolls_back_with_deletion_and_protects_active_references(
    database, monkeypatch
):
    session, project_id, repository = database
    project = session.get(Project, project_id)
    project.drive_root_folder_id = "active-root"
    session.commit()
    await enqueue_drive_cleanup(
        repository.session, project_id, ["active-root", "retired-root"]
    )
    session.rollback()
    assert not list(session.scalars(select(DriveCleanupTask)))
    await enqueue_drive_cleanup(
        repository.session, project_id, ["active-root", "retired-root"]
    )
    session.commit()
    delete = Mock(return_value=True)
    monkeypatch.setattr(module.gdrive_client, "delete_file", delete)
    removed = await drain_drive_cleanup(repository.session)
    assert removed == {"retired-root"}
    delete.assert_called_once_with("retired-root")
    assert list(session.scalars(select(DriveCleanupTask.external_id))) == [
        "active-root"
    ]


@pytest.mark.parametrize("changed", [False, True])
def test_aoi_annotations_survive_only_identical_stimulus_replacement(changed):
    from neurodatics.modules.scenaries.domain.entities import Scenaries

    old_id, new_id = uuid4(), uuid4()
    shape = {"x": 1, "y": 2, "width": 30, "height": 40}
    old = SimpleNamespace(
        source_entry_path="Images/scene.png",
        file_id=old_id,
        type="image",
        width=100,
        height=100,
        aois=[
            SimpleNamespace(
                name="Product", color="#ff0000", shape_type="rectangle", shape=shape
            )
        ],
    )
    project = SimpleNamespace(
        files=[SimpleNamespace(id=old_id, deleted_at=None, checksum_sha256="same")],
        scenaries=[old],
    )
    current = Scenaries(
        id=uuid4(),
        source_entry_path=old.source_entry_path,
        file_id=new_id,
        type="image",
        width=100,
        height=100,
    )
    files = [
        SimpleNamespace(id=new_id, checksum_sha256="changed" if changed else "same")
    ]
    preserve_unchanged_stimulus_annotations(project, files, [current])
    if changed:
        assert current.aois == []
    else:
        assert current.aois[0].shape == shape
        assert current.aois[0].shape is not shape
        assert current.aois[0].scenaries_id == current.id

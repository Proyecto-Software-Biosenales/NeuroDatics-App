"""Participant -> Parquet identity.

Analytics used to pick a participant's Parquet by the position of its row in
the ``participants`` table. Those rows are inserted in whatever order the
frontend registers them, which is not the order of the blocks in the CSV, so
selecting one participant could silently return another's recording. These
tests pin the identity-based resolution and the narrow legacy path that
remains for Parquets stored before the code was recorded.
"""

import io
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pandas as pd
import pytest

import neurodatics.modules.projects.application.use_cases.upload_experiment_zip as upload_module
from neurodatics.config.settings import settings
from neurodatics.modules.analytics.application.services.parquet_reader_service import (
    RESOLUTION_BLOCK_METADATA,
    RESOLUTION_FILE_METADATA,
    RESOLUTION_LEGACY_POSITIONAL,
    AmbiguousParquetIdentityError,
    ParquetIdentityError,
    ParquetReaderService,
    ParticipantParquetNotFoundError,
)
from neurodatics.modules.participants.domain.entities import Participant
from neurodatics.modules.projects.application.services.csv_processing_service import (
    BlockMetadata,
    CsvProcessingService,
    ParticipantInfo,
    ProcessingResult,
)
from neurodatics.modules.projects.application.services.zip_extraction_service import (
    ExtractedZipContext,
    ZipExtractionService,
)
from neurodatics.modules.projects.application.services.zip_validation_service import (
    AcquisitionSummary,
    UploadSelection,
    ZipManifestEntry,
    ZipValidationService,
)
from neurodatics.modules.projects.application.use_cases.upload_experiment_zip import (
    ParticipantIdentityError,
    UploadExperimentZipUseCase,
)
from neurodatics.modules.projects.domain.entities import Project, ProjectFile
from neurodatics.modules.scenaries.domain.entities import Scenaries  # noqa: F401  (configures mappers)

READER_LOGGER = "neurodatics.modules.analytics.application.services.parquet_reader_service"

# The CSV always lists P01, P02, P03 in that block order. The database rows are
# created in a different order on purpose: that mismatch is the bug under test.
CSV_BLOCK_ORDER = ["P01", "P02", "P03"]
DB_ROW_ORDER = ["P03", "P01", "P02"]


# --------------------------------------------------------------------------
# Fakes
# --------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    """Applies the reader's filters by hand.

    The fake must never be more permissive than the database, otherwise a test
    could pass on rows the real query would have excluded.
    """

    def __init__(
        self,
        project_id,
        project_files=(),
        participants=(),
        ingestion_generation=0,
    ):
        self.project_id = project_id
        self.project_files = list(project_files)
        self.participants = list(participants)
        self.ingestion_generation = ingestion_generation
        self.queried_entities = []

    async def execute(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        self.queried_entities.append(entity)

        if entity is Project:
            return _FakeResult([self.ingestion_generation])
        if entity is ProjectFile:
            return _FakeResult(
                project_file
                for project_file in self.project_files
                if project_file.project_id == self.project_id
                and project_file.kind == "processed_parquet"
                and project_file.deleted_at is None
            )
        if entity is Participant:
            return _FakeResult(
                sorted(
                    (
                        participant
                        for participant in self.participants
                        if participant.project_id == self.project_id
                    ),
                    key=lambda participant: (participant.created_at, str(participant.id)),
                )
            )
        raise AssertionError(f"Unexpected query for entity {entity!r}")


class _FakeCache:
    def __init__(self, tmp_path):
        self._dir = tmp_path
        self.reads = []

    def read_dataframe(self, project_id, participant_code, generation=0):
        self.reads.append(participant_code)
        return None

    def put(self, project_id, participant_code, content, generation=0):
        path = self._dir / f"{project_id}-g{generation}-{participant_code}.parquet"
        path.write_bytes(content)
        return path


class _FakeDriveClient:
    def __init__(self, content_by_external_id):
        self._content = content_by_external_id
        self.downloaded = []

    def download_file_content(self, external_id):
        self.downloaded.append(external_id)
        return self._content[external_id]


# --------------------------------------------------------------------------
# Row builders
# --------------------------------------------------------------------------


def _participants_in_db_order(project_id, codes):
    """Create participant rows in the given order, oldest first."""

    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [
        Participant(
            id=uuid4(),
            project_id=project_id,
            participant_code=code,
            created_at=base + timedelta(minutes=position),
        )
        for position, code in enumerate(codes)
    ]


def _user_parquet(
    project_id,
    user_index,
    *,
    participant_code=None,
    nested_participant_code=None,
    deleted=False,
    filename=None,
):
    metadata = {"user_index": user_index, "type": "user_parquet"}
    if participant_code is not None:
        metadata["participant_code"] = participant_code
    if nested_participant_code is not None:
        metadata["block_metadata"] = {
            "user_index": user_index,
            "participant_code": nested_participant_code,
        }

    return ProjectFile(
        id=uuid4(),
        project_id=project_id,
        kind="processed_parquet",
        storage_provider="gdrive",
        external_id=f"drive-user{user_index}",
        filename=filename or f"user{user_index}.parquet",
        original_filename=filename or f"user{user_index}.parquet",
        source_entry_path=f"processed/user{user_index}/user{user_index}.parquet",
        mime_type="application/octet-stream",
        extension=".parquet",
        file_metadata=metadata,
        deleted_at=datetime(2026, 1, 1, tzinfo=timezone.utc) if deleted else None,
    )


def _scenario_parquet(project_id, user_index, scenario, *, participant_code=None):
    metadata = {
        "user_index": user_index,
        "scenario": scenario,
        "type": "scenario_parquet",
    }
    if participant_code is not None:
        metadata["participant_code"] = participant_code

    return ProjectFile(
        id=uuid4(),
        project_id=project_id,
        kind="processed_parquet",
        storage_provider="gdrive",
        external_id=f"drive-user{user_index}-{scenario}",
        filename=f"{scenario}.parquet",
        file_metadata=metadata,
        deleted_at=None,
    )


def _v2_project(project_id):
    """Three identified Parquets, participant rows in a different order."""

    files = [
        _user_parquet(project_id, index, participant_code=code)
        for index, code in enumerate(CSV_BLOCK_ORDER, start=1)
    ]
    participants = _participants_in_db_order(project_id, DB_ROW_ORDER)
    return _FakeSession(project_id, project_files=files, participants=participants)


# --------------------------------------------------------------------------
# Identity resolution (new uploads)
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_identity_resolution_ignores_participant_row_order():
    project_id = uuid4()
    session = _v2_project(project_id)
    reader = ParquetReaderService(session)

    for expected_index, code in enumerate(CSV_BLOCK_ORDER, start=1):
        resolution = await reader.resolve_user_parquet(project_id, code)

        assert resolution.project_file.filename == f"user{expected_index}.parquet"
        assert resolution.participant_code == code
        assert resolution.strategy == RESOLUTION_FILE_METADATA
        assert resolution.is_legacy is False

    # The identity path must not consult the participants table at all: that is
    # what makes the result independent of row order.
    assert Participant not in session.queried_entities


@pytest.mark.asyncio
async def test_identity_resolution_survives_reversed_row_order():
    """The same files resolve identically no matter how the rows are ordered."""

    project_id = uuid4()
    files = [
        _user_parquet(project_id, index, participant_code=code)
        for index, code in enumerate(CSV_BLOCK_ORDER, start=1)
    ]

    for row_order in (CSV_BLOCK_ORDER, DB_ROW_ORDER, list(reversed(CSV_BLOCK_ORDER))):
        session = _FakeSession(
            project_id,
            project_files=files,
            participants=_participants_in_db_order(project_id, row_order),
        )
        resolution = await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")
        assert resolution.project_file.filename == "user1.parquet"


@pytest.mark.asyncio
async def test_read_downloads_the_parquet_belonging_to_the_requested_participant(tmp_path):
    project_id = uuid4()
    session = _v2_project(project_id)

    content_by_external_id = {}
    for index, code in enumerate(CSV_BLOCK_ORDER, start=1):
        buffer = io.BytesIO()
        pd.DataFrame({"time": [0.0, 1.0], "who": [code, code]}).to_parquet(buffer, index=False)
        content_by_external_id[f"drive-user{index}"] = buffer.getvalue()

    client = _FakeDriveClient(content_by_external_id)
    reader = ParquetReaderService(session)
    reader._cache = _FakeCache(tmp_path)
    reader._build_drive_client = AsyncMock(return_value=client)

    frame = await reader.read(project_id, "P01")

    assert set(frame["who"]) == {"P01"}
    assert client.downloaded == ["drive-user1"]


@pytest.mark.asyncio
async def test_scenario_parquets_do_not_shadow_the_user_parquet():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1, participant_code="P01"),
            _scenario_parquet(project_id, 1, "Scene_1", participant_code="P01"),
            _scenario_parquet(project_id, 1, "Scene_2", participant_code="P01"),
        ],
        participants=_participants_in_db_order(project_id, ["P01"]),
    )

    resolution = await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")

    assert resolution.project_file.filename == "user1.parquet"


@pytest.mark.asyncio
async def test_soft_deleted_parquets_from_a_previous_upload_are_ignored():
    """Re-uploads soft-delete the old rows; those must not create ambiguity."""

    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1, participant_code="P01", deleted=True),
            _user_parquet(project_id, 1, participant_code="P01"),
        ],
        participants=_participants_in_db_order(project_id, ["P01"]),
    )

    resolution = await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")

    assert resolution.project_file.deleted_at is None


@pytest.mark.asyncio
async def test_surrounding_whitespace_does_not_hide_a_match():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[_user_parquet(project_id, 1, participant_code=" P01 ")],
        participants=_participants_in_db_order(project_id, ["P01"]),
    )

    resolution = await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")

    assert resolution.project_file.filename == "user1.parquet"


@pytest.mark.asyncio
async def test_blank_participant_code_is_rejected():
    project_id = uuid4()
    reader = ParquetReaderService(_v2_project(project_id))

    with pytest.raises(ParquetIdentityError, match="participant_code is required"):
        await reader.resolve_user_parquet(project_id, "   ")


# --------------------------------------------------------------------------
# Transition: participant code only inside the serialized block metadata
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_nested_block_metadata_participant_code_is_supported():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, index, nested_participant_code=code)
            for index, code in enumerate(CSV_BLOCK_ORDER, start=1)
        ],
        participants=_participants_in_db_order(project_id, DB_ROW_ORDER),
    )
    reader = ParquetReaderService(session)

    resolution = await reader.resolve_user_parquet(project_id, "P02")

    assert resolution.project_file.filename == "user2.parquet"
    assert resolution.strategy == RESOLUTION_BLOCK_METADATA
    assert resolution.is_legacy is False


@pytest.mark.asyncio
async def test_top_level_code_wins_over_a_stale_nested_code():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(
                project_id,
                1,
                participant_code="P01",
                nested_participant_code="P99",
            ),
            _user_parquet(project_id, 2, participant_code="P99"),
        ],
        participants=_participants_in_db_order(project_id, ["P01", "P99"]),
    )
    reader = ParquetReaderService(session)

    assert (await reader.resolve_user_parquet(project_id, "P01")).project_file.filename == (
        "user1.parquet"
    )
    assert (await reader.resolve_user_parquet(project_id, "P99")).project_file.filename == (
        "user2.parquet"
    )


@pytest.mark.asyncio
async def test_mixed_top_level_and_nested_metadata_both_resolve():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1, participant_code="P01"),
            _user_parquet(project_id, 2, nested_participant_code="P02"),
        ],
        participants=_participants_in_db_order(project_id, ["P02", "P01"]),
    )
    reader = ParquetReaderService(session)

    first = await reader.resolve_user_parquet(project_id, "P01")
    second = await reader.resolve_user_parquet(project_id, "P02")

    assert first.strategy == RESOLUTION_FILE_METADATA
    assert first.project_file.filename == "user1.parquet"
    assert second.strategy == RESOLUTION_BLOCK_METADATA
    assert second.project_file.filename == "user2.parquet"


# --------------------------------------------------------------------------
# Visible failures instead of a silently wrong participant
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_participant_metadata_fails_visibly():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1, participant_code="P01"),
            _user_parquet(project_id, 2, participant_code="P01"),
            _user_parquet(project_id, 3, participant_code="P03"),
        ],
        participants=_participants_in_db_order(project_id, DB_ROW_ORDER),
    )
    reader = ParquetReaderService(session)

    with pytest.raises(AmbiguousParquetIdentityError) as failure:
        await reader.resolve_user_parquet(project_id, "P01")

    message = str(failure.value)
    assert "2 Parquet files claim participant 'P01'" in message
    assert "user1.parquet" in message and "user2.parquet" in message

    # The unaffected participant still resolves.
    assert (await reader.resolve_user_parquet(project_id, "P03")).project_file.filename == (
        "user3.parquet"
    )


@pytest.mark.asyncio
async def test_unknown_participant_never_falls_back_to_a_position():
    project_id = uuid4()
    session = _v2_project(project_id)
    reader = ParquetReaderService(session)

    with pytest.raises(ParticipantParquetNotFoundError) as failure:
        await reader.resolve_user_parquet(project_id, "P09")

    message = str(failure.value)
    assert "P09" in message
    assert "P01, P02, P03" in message


@pytest.mark.asyncio
async def test_parquet_without_identity_is_not_selected_by_position():
    """A half-identified project must not guess for the unlabelled file."""

    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1, participant_code="P01"),
            _user_parquet(project_id, 2, participant_code="P02"),
            _user_parquet(project_id, 3),  # identity missing
        ],
        participants=_participants_in_db_order(project_id, CSV_BLOCK_ORDER),
    )
    reader = ParquetReaderService(session)

    with pytest.raises(AmbiguousParquetIdentityError) as failure:
        await reader.resolve_user_parquet(project_id, "P03")

    message = str(failure.value)
    assert "user3.parquet" in message
    assert "P01, P02" in message

    # The identified participants are unaffected.
    assert (await reader.resolve_user_parquet(project_id, "P01")).project_file.filename == (
        "user1.parquet"
    )


@pytest.mark.asyncio
async def test_project_without_any_parquet_reports_missing_file():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[],
        participants=_participants_in_db_order(project_id, CSV_BLOCK_ORDER),
    )

    with pytest.raises(ParticipantParquetNotFoundError, match="P01"):
        await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")


# --------------------------------------------------------------------------
# Legacy: Parquets stored before the participant code was recorded
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_legacy_parquets_are_matched_by_participant_row_position(caplog):
    """Documents the legacy rule: position in the row order, not in the CSV.

    The row order is the only signal these files carry, so ``P03`` - first row
    here - maps to ``user1.parquet``. That is a guess, and it is reported as
    one: this is exactly why new uploads record the code instead.
    """

    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[_user_parquet(project_id, index) for index in (1, 2, 3)],
        participants=_participants_in_db_order(project_id, DB_ROW_ORDER),
    )
    reader = ParquetReaderService(session)

    with caplog.at_level(logging.WARNING, logger=READER_LOGGER):
        resolution = await reader.resolve_user_parquet(project_id, "P03")

    assert resolution.project_file.filename == "user1.parquet"
    assert resolution.strategy == RESOLUTION_LEGACY_POSITIONAL
    assert resolution.is_legacy is True
    assert any("legacy position" in record.getMessage() for record in caplog.records)

    assert (await reader.resolve_user_parquet(project_id, "P01")).project_file.filename == (
        "user2.parquet"
    )
    assert (await reader.resolve_user_parquet(project_id, "P02")).project_file.filename == (
        "user3.parquet"
    )


@pytest.mark.asyncio
async def test_legacy_resolution_fails_when_counts_do_not_line_up():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[_user_parquet(project_id, index) for index in (1, 2)],
        participants=_participants_in_db_order(project_id, CSV_BLOCK_ORDER),
    )

    with pytest.raises(AmbiguousParquetIdentityError) as failure:
        await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")

    assert "3 participant(s) but 2 Parquet file(s)" in str(failure.value)


@pytest.mark.asyncio
async def test_legacy_resolution_fails_on_duplicate_participant_rows():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[_user_parquet(project_id, index) for index in (1, 2, 3)],
        participants=_participants_in_db_order(project_id, ["P01", "P02", "P01"]),
    )
    reader = ParquetReaderService(session)

    with pytest.raises(AmbiguousParquetIdentityError) as failure:
        await reader.resolve_user_parquet(project_id, "P01")

    assert "appears 2 times" in str(failure.value)

    # Only the duplicated code is ambiguous.
    assert (await reader.resolve_user_parquet(project_id, "P02")).project_file.filename == (
        "user2.parquet"
    )


@pytest.mark.asyncio
async def test_legacy_resolution_reports_an_unknown_participant():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[_user_parquet(project_id, index) for index in (1, 2, 3)],
        participants=_participants_in_db_order(project_id, CSV_BLOCK_ORDER),
    )

    with pytest.raises(ParticipantParquetNotFoundError, match="not found in project"):
        await ParquetReaderService(session).resolve_user_parquet(project_id, "P09")


@pytest.mark.asyncio
async def test_legacy_resolution_fails_when_the_positional_file_is_missing():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1, filename="user7.parquet"),
            _user_parquet(project_id, 2, filename="user8.parquet"),
        ],
        participants=_participants_in_db_order(project_id, ["P01", "P02"]),
    )

    with pytest.raises(ParticipantParquetNotFoundError):
        await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")


@pytest.mark.asyncio
async def test_legacy_resolution_fails_on_duplicate_positional_filenames():
    project_id = uuid4()
    session = _FakeSession(
        project_id,
        project_files=[
            _user_parquet(project_id, 1),
            _user_parquet(project_id, 1),
        ],
        participants=_participants_in_db_order(project_id, ["P01", "P02"]),
    )

    with pytest.raises(AmbiguousParquetIdentityError, match="user1.parquet"):
        await ParquetReaderService(session).resolve_user_parquet(project_id, "P01")


# --------------------------------------------------------------------------
# Upload: every Parquet is stamped with its participant code
# --------------------------------------------------------------------------


def _processing_result(tmp_path, specs):
    """Build a ProcessingResult whose Parquet files exist on disk.

    ``specs`` is a list of ``(user_index, participant_code, scenarios)``; a
    ``None`` code models a block the importer could not name.
    """

    participants = []
    blocks = []
    user_paths = []
    scenario_paths = []

    for user_index, participant_code, scenarios in specs:
        user_path = tmp_path / f"user{user_index}.parquet"
        user_path.write_bytes(b"user parquet")
        user_paths.append((user_index, str(user_path)))

        for scenario in scenarios:
            scenario_path = tmp_path / f"user{user_index}-{scenario}.parquet"
            scenario_path.write_bytes(b"scenario parquet")
            scenario_paths.append((user_index, scenario, str(scenario_path)))

        if participant_code is not None:
            participants.append(
                ParticipantInfo(participant_code=participant_code, user_index=user_index)
            )
        blocks.append(
            BlockMetadata(user_index=user_index, participant_code=participant_code or "")
        )

    return ProcessingResult(
        detected_sensors=["EyeTracker"],
        participants=participants,
        user_parquet_paths=user_paths,
        scenario_parquet_paths=scenario_paths,
        encoding="utf-16",
        block_metadata=blocks,
        warnings=[],
    )


async def _run_upload(tmp_path, monkeypatch, processing_result):
    """Drive the ingestion use case with Drive and the repository stubbed out."""

    project_id = uuid4()
    owner_id = uuid4()

    zip_path = tmp_path / "experiment.zip"
    zip_path.write_bytes(b"zip")
    raw_csv_path = tmp_path / "recording.csv"
    raw_csv_path.write_text("placeholder", encoding="utf-8")
    extraction_dir = tmp_path / "extraction"
    extraction_dir.mkdir()

    entry = ZipManifestEntry(
        source_entry_path="recording.csv",
        filename="recording.csv",
        extension=".csv",
        mime_type="text/csv",
        size_bytes=raw_csv_path.stat().st_size,
        kind="raw_csv",
    )
    resolved_selection = UploadSelection(csv_entry_path="recording.csv")
    extracted = ExtractedZipContext(
        temp_dir=str(extraction_dir),
        extracted_root=str(extraction_dir),
        files_by_entry_path={"recording.csv": str(raw_csv_path)},
        folders=[],
    )

    @contextmanager
    def fake_extraction():
        yield extracted

    monkeypatch.setattr(
        ZipValidationService,
        "validate_and_analyze",
        staticmethod(
            lambda **kwargs: (
                [entry],
                {"images": 0, "videos": 0, "csv": 1, "other": 0},
                resolved_selection,
                AcquisitionSummary(),
                [],
            )
        ),
    )
    monkeypatch.setattr(
        ZipExtractionService,
        "extract_to_temp",
        staticmethod(lambda zip_path, entries: fake_extraction()),
    )
    monkeypatch.setattr(
        CsvProcessingService,
        "process",
        staticmethod(lambda *args, **kwargs: processing_result),
    )
    monkeypatch.setattr(settings, "ingestion_save_original_zip", False)

    counter = iter(range(1000))
    monkeypatch.setattr(
        upload_module.gdrive_client, "find_child_folder_by_name", lambda **kwargs: None
    )
    monkeypatch.setattr(
        upload_module.gdrive_client,
        "create_folder",
        lambda name, parent_id=None: {"drive_file_id": f"folder-{next(counter)}", "name": name},
    )
    monkeypatch.setattr(
        upload_module.gdrive_client,
        "upload_file",
        lambda filename, mime_type, parent_id, local_path: {
            "drive_file_id": f"file-{next(counter)}",
            "checksum_sha256": "0" * 64,
            "drive_web_view_link": None,
            "drive_download_link": None,
        },
    )
    for hook in ("start", "mark_uploaded_bytes", "complete", "fail"):
        monkeypatch.setattr(
            upload_module.drive_upload_progress_registry, hook, lambda *args: None
        )
    monkeypatch.setattr(
        upload_module.drive_upload_progress_registry,
        "is_cancel_requested",
        lambda *args: False,
    )
    monkeypatch.setattr(upload_module.gdrive_client, "delete_file", lambda *args: True)
    monkeypatch.setattr(
        upload_module.ParquetCacheService,
        "prune_stale_generations",
        lambda *args, **kwargs: 0,
    )
    monkeypatch.setattr(
        upload_module.AnalyticsRedisCache,
        "invalidate_stale_generations",
        lambda *args, **kwargs: 0,
    )
    monkeypatch.setattr(upload_module, "prune_media_caches", lambda: [])

    repository = SimpleNamespace(
        get_by_id=AsyncMock(
            return_value=SimpleNamespace(
                id=project_id, name="Experiment", drive_root_folder_id=None
            )
        ),
        update_project_ingestion=AsyncMock(),
        bump_ingestion_generation=AsyncMock(return_value=1),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        soft_delete_active_files=AsyncMock(),
        purge_files_by_kind=AsyncMock(),
        clear_project_scenaries=AsyncMock(),
        add_files=AsyncMock(),
        add_scenaries=AsyncMock(),
    )
    use_case = UploadExperimentZipUseCase(repository)
    use_case._create_new_drive_root_folder = AsyncMock(
        return_value={
            "drive_file_id": "root-folder",
            "name": "Experiment",
            "drive_web_view_link": None,
        }
    )

    await use_case.execute(
        project_id=project_id,
        owner_id=owner_id,
        zip_path=str(zip_path),
        filename="experiment.zip",
        mime_type="application/zip",
        selection=resolved_selection,
        screen_geometry=None,
    )
    return repository


@pytest.mark.asyncio
async def test_upload_stamps_participant_code_on_user_and_scenario_parquets(
    tmp_path,
    monkeypatch,
):
    processing_result = _processing_result(
        tmp_path,
        [
            (1, "P01", ["Scene 1", "Scene 2"]),
            (2, "P02", ["Scene 1"]),
            (3, "P03", []),
        ],
    )

    repository = await _run_upload(tmp_path, monkeypatch, processing_result)

    inserted = repository.add_files.await_args.args[0]
    processed = [item for item in inserted if item.kind == "processed_parquet"]
    assert len(processed) == 6

    by_kind = {"user_parquet": {}, "scenario_parquet": {}}
    for item in processed:
        metadata = item.file_metadata
        # Every processed Parquet carries the code at the top level.
        assert "participant_code" in metadata
        by_kind[metadata["type"]].setdefault(metadata["participant_code"], []).append(item)

    assert set(by_kind["user_parquet"]) == {"P01", "P02", "P03"}
    assert by_kind["user_parquet"]["P01"][0].filename == "user1.parquet"
    assert by_kind["user_parquet"]["P02"][0].filename == "user2.parquet"
    assert by_kind["user_parquet"]["P03"][0].filename == "user3.parquet"

    assert len(by_kind["scenario_parquet"]["P01"]) == 2
    assert len(by_kind["scenario_parquet"]["P02"]) == 1
    assert "P03" not in by_kind["scenario_parquet"]


@pytest.mark.asyncio
async def test_uploaded_metadata_resolves_back_through_the_reader(tmp_path, monkeypatch):
    """The write side and the read side agree on the same field."""

    processing_result = _processing_result(
        tmp_path,
        [(1, "P01", []), (2, "P02", []), (3, "P03", [])],
    )
    repository = await _run_upload(tmp_path, monkeypatch, processing_result)

    inserted = repository.add_files.await_args.args[0]
    project_id = inserted[0].project_id
    session = _FakeSession(
        project_id,
        project_files=inserted,
        # Rows registered in an order unrelated to the CSV blocks.
        participants=_participants_in_db_order(project_id, DB_ROW_ORDER),
    )
    reader = ParquetReaderService(session)

    for index, code in enumerate(CSV_BLOCK_ORDER, start=1):
        resolution = await reader.resolve_user_parquet(project_id, code)
        assert resolution.project_file.filename == f"user{index}.parquet"
        assert resolution.strategy == RESOLUTION_FILE_METADATA


@pytest.mark.asyncio
async def test_upload_rejects_two_blocks_claiming_the_same_participant(tmp_path, monkeypatch):
    processing_result = _processing_result(
        tmp_path,
        [(1, "P01", []), (2, "P01", [])],
    )

    with pytest.raises(ParticipantIdentityError, match="'P01'"):
        await _run_upload(tmp_path, monkeypatch, processing_result)


@pytest.mark.asyncio
async def test_upload_rejects_a_block_without_a_participant_code(tmp_path, monkeypatch):
    processing_result = _processing_result(
        tmp_path,
        [(1, "P01", []), (2, None, ["Scene 1"])],
    )

    with pytest.raises(ParticipantIdentityError) as failure:
        await _run_upload(tmp_path, monkeypatch, processing_result)

    message = str(failure.value)
    assert "user2.parquet" in message
    assert "user2/Scene 1.parquet" in message

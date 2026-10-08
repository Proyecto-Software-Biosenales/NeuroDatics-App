import asyncio
import threading
import time
from collections import OrderedDict
from types import SimpleNamespace
from uuid import uuid4

import pandas as pd
import pytest

from neurodatics.modules.analytics.application.services.parquet_reader_service import (
    ParquetIdentityError,
    ParquetReaderService,
    PreparedParquetBatch,
)
from neurodatics.modules.analytics.infrastructure.singleflight import settled_thread
from neurodatics.modules.projects.infrastructure import image_cache
from neurodatics.modules.projects.infrastructure.image_cache import (
    CachedProjectImage,
    ProjectImageRef,
)
from neurodatics.modules.reports.application.services import executive_report_service
from neurodatics.modules.reports.application.services.executive_report_service import (
    ExecutiveReportService,
)
from neurodatics.modules.reports.infrastructure.io_budget import (
    ReportIOBudget,
    ReportIOBusy,
)


@pytest.mark.asyncio
async def test_group_frames_use_two_workers_keep_order_and_partial_warnings(monkeypatch):
    project_id = uuid4()
    codes = ["P01", "P02", "P03", "P04"]
    active = 0
    maximum = 0
    generations = []

    async def prepare(self, received_project_id, received_codes, generation):
        generations.append(generation)
        assert received_project_id == project_id
        assert received_codes == codes
        return PreparedParquetBatch(
            reads={code: SimpleNamespace(participant_code=code) for code in codes},
            errors={},
            storage_client=object(),
        )

    async def read_prepared(self, prepared, storage_client, *, projection=None):
        nonlocal active, maximum
        assert storage_client is not None
        assert projection is None
        active += 1
        maximum = max(maximum, active)
        try:
            await asyncio.sleep(0.02)
            if prepared.participant_code == "P02":
                raise OSError("synthetic partial failure")
            return pd.DataFrame({"participant": [prepared.participant_code]})
        finally:
            active -= 1

    monkeypatch.setattr(ParquetReaderService, "prepare_batch", prepare)
    monkeypatch.setattr(ParquetReaderService, "read_prepared", read_prepared)

    frames, warnings = await ExecutiveReportService(SimpleNamespace())._read_participant_frames(
        project_id,
        codes,
        generation=7,
    )

    assert generations == [7]
    assert maximum == 2
    assert list(frames) == ["P01", "P03", "P04"]
    assert warnings == ["No se pudieron cargar los datos del participante P02."]
    assert executive_report_service.report_io_budget.stats() == {"running": 0, "waiting": 0}


@pytest.mark.asyncio
async def test_batch_identity_error_keeps_warning_position_without_starting_io(monkeypatch):
    calls = []

    async def prepare(self, project_id, codes, generation):
        return PreparedParquetBatch(
            reads={"P01": SimpleNamespace(participant_code="P01")},
            errors={"P02": ParquetIdentityError("ambiguous legacy identity")},
            storage_client=object(),
        )

    async def read_prepared(self, prepared, storage_client, *, projection=None):
        calls.append(prepared.participant_code)
        return pd.DataFrame({"participant": [prepared.participant_code]})

    monkeypatch.setattr(ParquetReaderService, "prepare_batch", prepare)
    monkeypatch.setattr(ParquetReaderService, "read_prepared", read_prepared)

    frames, warnings = await ExecutiveReportService(SimpleNamespace())._read_participant_frames(
        uuid4(),
        ["P01", "P02"],
        generation=11,
    )

    assert calls == ["P01"]
    assert list(frames) == ["P01"]
    assert warnings == ["No se pudieron cargar los datos del participante P02."]


@pytest.mark.asyncio
async def test_report_cancellation_keeps_slot_until_worker_physically_settles(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    async def prepare(self, project_id, codes, generation):
        return PreparedParquetBatch(
            reads={"P01": SimpleNamespace(participant_code="P01")},
            errors={},
            storage_client=object(),
        )

    async def read_prepared(self, prepared, storage_client, *, projection=None):
        def blocking_read():
            started.set()
            release.wait(timeout=5)
            return pd.DataFrame({"participant": [prepared.participant_code]})

        return await settled_thread(blocking_read)

    monkeypatch.setattr(ParquetReaderService, "prepare_batch", prepare)
    monkeypatch.setattr(ParquetReaderService, "read_prepared", read_prepared)
    service = ExecutiveReportService(SimpleNamespace())
    task = asyncio.create_task(
        service._read_participant_frames(uuid4(), ["P01"], generation=3)
    )
    try:
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(0.005)
        assert started.is_set()
        task.cancel()
        await asyncio.sleep(0.02)
        assert not task.done()
        assert executive_report_service.report_io_budget.stats()["running"] == 1
    finally:
        release.set()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert executive_report_service.report_io_budget.stats() == {"running": 0, "waiting": 0}


@pytest.mark.asyncio
async def test_process_io_budget_bounds_running_and_waiting():
    budget = ReportIOBudget(max_running=1, max_waiting=1)
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow():
        started.set()
        await release.wait()
        return "ok"

    first = asyncio.create_task(budget.run(slow))
    await started.wait()
    second = asyncio.create_task(budget.run(slow))
    await asyncio.sleep(0)
    assert budget.stats() == {"running": 1, "waiting": 1}
    with pytest.raises(ReportIOBusy):
        await budget.run(slow)
    release.set()
    assert await asyncio.gather(first, second) == ["ok", "ok"]
    assert budget.stats() == {"running": 0, "waiting": 0}


@pytest.mark.asyncio
async def test_process_io_budget_handoff_reserves_slot_before_waiter_resumes():
    budget = ReportIOBudget(max_running=1, max_waiting=1)
    state = budget._state()
    state.running = 1
    reserved = asyncio.get_running_loop().create_future()
    state.waiters.append(reserved)

    budget._release(state)

    assert reserved.done()
    assert budget.stats() == {"running": 1, "waiting": 0}
    newcomer_started = asyncio.Event()
    newcomer_release = asyncio.Event()

    async def newcomer_operation():
        newcomer_started.set()
        await newcomer_release.wait()

    newcomer = asyncio.create_task(budget.run(newcomer_operation))
    await asyncio.sleep(0)
    assert budget.stats() == {"running": 1, "waiting": 1}
    with pytest.raises(ReportIOBusy):
        await budget.run(newcomer_operation)

    # Model the reserved waiter settling: its active slot transfers atomically
    # to the newcomer already in the bounded queue.
    budget._release(state)
    await newcomer_started.wait()
    assert budget.stats() == {"running": 1, "waiting": 0}
    newcomer_release.set()
    await newcomer
    assert budget.stats() == {"running": 0, "waiting": 0}


@pytest.mark.asyncio
async def test_process_io_budget_zero_waiting_rejects_while_slot_is_active():
    budget = ReportIOBudget(max_running=1, max_waiting=0)
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow():
        started.set()
        await release.wait()

    active = asyncio.create_task(budget.run(slow))
    await started.wait()
    with pytest.raises(ReportIOBusy):
        await budget.run(slow)
    assert budget.stats() == {"running": 1, "waiting": 0}
    release.set()
    await active
    assert budget.stats() == {"running": 0, "waiting": 0}


@pytest.mark.asyncio
async def test_http_and_report_image_layer_share_one_download(monkeypatch):
    monkeypatch.setattr(image_cache, "_cache_store", OrderedDict())
    monkeypatch.setattr(image_cache, "_cache_total_bytes", 0)
    monkeypatch.setattr(image_cache, "_read_disk_cache", lambda _file_id: None)
    monkeypatch.setattr(image_cache, "_write_disk_cache", lambda *_args: None)
    downloads = 0
    active = 0
    maximum = 0
    lock = threading.Lock()

    class Storage:
        def download_file_content(self, external_id):
            nonlocal downloads, active, maximum
            with lock:
                downloads += 1
                active += 1
                maximum = max(maximum, active)
            time.sleep(0.02)
            with lock:
                active -= 1
            return b"shared-image"

    ref = ProjectImageRef(uuid4(), "external-image", "image/png", "image-key")
    results = await asyncio.gather(
        *(image_cache.load_project_image(ref, Storage()) for _ in range(5))
    )

    assert downloads == 1
    assert maximum == 1
    assert [result.content for result in results] == [b"shared-image"] * 5
    assert (await image_cache.load_project_image(ref, Storage())).content == b"shared-image"
    assert downloads == 1
    assert image_cache.image_flights.stats() == {
        "entries": 0,
        "running": 0,
        "consumers": 0,
    }


@pytest.mark.asyncio
async def test_image_disk_cache_keys_body_and_metadata_by_complete_identity(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(image_cache.settings, "image_cache_dir", str(tmp_path))
    monkeypatch.setattr(image_cache, "_cache_store", OrderedDict())
    monkeypatch.setattr(image_cache, "_cache_total_bytes", 0)
    file_id = uuid4()
    old_ref = ProjectImageRef(file_id, "external-old", "image/png", "old-key")
    new_ref = ProjectImageRef(file_id, "external-new", "image/png", "new-key")
    image_cache._write_disk_cache(old_ref, b"old-image")

    assert await image_cache.get_cached_project_image(new_ref) is None

    class Storage:
        def __init__(self):
            self.downloads = []

        def download_file_content(self, external_id):
            self.downloads.append(external_id)
            return b"new-image"

    storage = Storage()
    loaded = await image_cache.load_project_image(new_ref, storage)

    assert loaded.content == b"new-image"
    assert storage.downloads == ["external-new"]
    assert image_cache._read_disk_cache(old_ref) == (b"old-image", "image/png")
    assert image_cache._read_disk_cache(new_ref) == (b"new-image", "image/png")


@pytest.mark.asyncio
async def test_image_disk_cache_rejects_incoherent_publication(tmp_path, monkeypatch):
    monkeypatch.setattr(image_cache.settings, "image_cache_dir", str(tmp_path))
    monkeypatch.setattr(image_cache, "_cache_store", OrderedDict())
    monkeypatch.setattr(image_cache, "_cache_total_bytes", 0)
    ref = ProjectImageRef(uuid4(), "external", "image/png", "identity-key")
    image_cache._write_disk_cache(ref, b"complete")
    image_path, _ = image_cache._disk_cache_paths(ref.cache_key)
    image_path.write_bytes(b"partial-or-other-writer")

    assert await image_cache.get_cached_project_image(ref) is None


@pytest.mark.asyncio
async def test_same_file_uuid_with_distinct_image_identities_never_crosses_bytes(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(image_cache.settings, "image_cache_dir", str(tmp_path))
    monkeypatch.setattr(image_cache, "_cache_store", OrderedDict())
    monkeypatch.setattr(image_cache, "_cache_total_bytes", 0)
    file_id = uuid4()
    refs = [
        ProjectImageRef(file_id, "external-a", "image/png", "identity-a"),
        ProjectImageRef(file_id, "external-b", "image/jpeg", "identity-b"),
    ]

    class Storage:
        def download_file_content(self, external_id):
            time.sleep(0.02)
            return external_id.encode("ascii")

    loaded = await asyncio.gather(
        *(image_cache.load_project_image(ref, Storage()) for ref in refs)
    )

    assert [item.content for item in loaded] == [b"external-a", b"external-b"]
    assert [item.mime_type for item in loaded] == ["image/png", "image/jpeg"]


@pytest.mark.asyncio
async def test_scenario_image_map_uses_preloaded_relation_and_filters_identity(monkeypatch):
    project_id = uuid4()
    valid_id = uuid4()
    valid_file = SimpleNamespace(
        id=valid_id,
        project_id=project_id,
        external_id="valid",
        mime_type="image/png",
        updated_at=None,
        deleted_at=None,
    )
    deleted_file = SimpleNamespace(
        id=uuid4(), project_id=project_id, external_id="deleted",
        mime_type="image/png", updated_at=None, deleted_at=object(),
    )
    foreign_file = SimpleNamespace(
        id=uuid4(), project_id=uuid4(), external_id="foreign",
        mime_type="image/png", updated_at=None, deleted_at=None,
    )
    text_file = SimpleNamespace(
        id=uuid4(), project_id=project_id, external_id="text",
        mime_type="text/plain", updated_at=None, deleted_at=None,
    )

    def scenario(name, project_file):
        return SimpleNamespace(
            name=name,
            type="image",
            source_entry_path=f"{name}.png",
            file=project_file,
            file_id=project_file.id,
        )

    project = SimpleNamespace(
        id=project_id,
        scenaries=[
            scenario("valid-a", valid_file),
            scenario("valid-b", valid_file),
            scenario("deleted", deleted_file),
            scenario("foreign", foreign_file),
            scenario("wrong-mime", text_file),
        ],
    )
    cache_reads = []

    async def cached(ref):
        cache_reads.append(ref.cache_key)
        return CachedProjectImage(b"image", "image/png", '"etag"', "HIT")

    async def forbidden_client(self):
        raise AssertionError("warm image batch should not resolve storage OAuth")

    monkeypatch.setattr(executive_report_service, "get_cached_project_image", cached)
    monkeypatch.setattr(ExecutiveReportService, "_build_drive_client", forbidden_client)

    images = await ExecutiveReportService(SimpleNamespace())._load_scenario_images(project)

    assert images == {
        "valid-a": b"image",
        "valid-b": b"image",
        "deleted": None,
        "foreign": None,
        "wrong-mime": None,
    }
    assert len(cache_reads) == 1

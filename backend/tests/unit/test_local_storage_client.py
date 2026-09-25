"""The local object store must behave like the Drive client the app was written against."""

import hashlib
import inspect
from concurrent.futures import ThreadPoolExecutor

import pytest

from neurodatics.infra.storage.gdrive_client import GoogleDriveClient
from neurodatics.infra.storage.local_client import LocalStorageClient, LocalStorageError

# Every method application code calls on the shared store.
STORE_METHODS = (
    "reserve_file_id",
    "create_folder",
    "find_child_folder_by_name",
    "upload_file",
    "delete_file",
    "rename_file",
    "download_file_content",
    "download_file_to_path",
)


@pytest.fixture
def store(tmp_path):
    return LocalStorageClient(tmp_path / "storage")


@pytest.mark.parametrize("name", STORE_METHODS)
def test_local_store_keeps_the_drive_client_signature(name):
    drive = inspect.signature(getattr(GoogleDriveClient, name))
    local = inspect.signature(getattr(LocalStorageClient, name))

    assert [(p.name, p.kind, p.default) for p in local.parameters.values()] == [
        (p.name, p.kind, p.default) for p in drive.parameters.values()
    ]


def test_upload_returns_the_drive_shaped_record_and_stores_the_bytes(store):
    folder = store.create_folder("root")
    content = b"eye tracking bytes"

    uploaded = store.upload_file(
        "a.csv", "text/csv", parent_id=folder["drive_file_id"], file_content=content
    )

    assert uploaded["filename"] == "a.csv"
    assert uploaded["size_bytes"] == len(content)
    assert uploaded["checksum_sha256"] == hashlib.sha256(content).hexdigest()
    assert uploaded["parents"] == [folder["drive_file_id"]]
    assert store.download_file_content(uploaded["drive_file_id"]) == content


def test_upload_from_a_local_path_matches_upload_from_bytes(store, tmp_path):
    source = tmp_path / "video.mp4"
    source.write_bytes(b"\x00\x01" * 3_000_000)

    uploaded = store.upload_file("video.mp4", "video/mp4", local_path=str(source))

    assert uploaded["size_bytes"] == 6_000_000
    assert uploaded["checksum_sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert store.download_file_content(uploaded["drive_file_id"]) == source.read_bytes()


def test_upload_requires_exactly_one_source(store):
    with pytest.raises(ValueError):
        store.upload_file("x", "text/plain")
    with pytest.raises(ValueError):
        store.upload_file("x", "text/plain", file_content=b"a", local_path="b")


def test_upload_into_a_missing_folder_is_refused_and_leaves_nothing(store):
    with pytest.raises(LocalStorageError):
        store.upload_file("x", "text/plain", parent_id="0" * 32, file_content=b"a")

    assert list(store._data.glob("*")) == []


def test_reserved_ids_are_honoured_when_creating_a_folder(store):
    reserved = store.reserve_file_id()

    folder = store.create_folder("root", file_id=reserved)

    assert folder["drive_file_id"] == reserved


def test_find_child_folder_by_name_only_looks_inside_the_parent(store):
    root_a = store.create_folder("a")["drive_file_id"]
    root_b = store.create_folder("b")["drive_file_id"]
    inner = store.create_folder("scenario", parent_id=root_a)

    assert store.find_child_folder_by_name("scenario", root_a)["drive_file_id"] == inner["drive_file_id"]
    assert store.find_child_folder_by_name("scenario", root_b) is None
    assert store.find_child_folder_by_name("missing", root_a) is None


def test_deleting_a_folder_removes_its_whole_subtree(store):
    root = store.create_folder("root")["drive_file_id"]
    child = store.create_folder("child", parent_id=root)["drive_file_id"]
    leaf = store.upload_file("f", "text/plain", parent_id=child, file_content=b"x")["drive_file_id"]
    outside = store.upload_file("g", "text/plain", file_content=b"y")["drive_file_id"]

    assert store.delete_file(root) is True

    for gone in (root, child, leaf):
        with pytest.raises(LocalStorageError):
            store.download_file_content(gone)
    assert store.download_file_content(outside) == b"y"


def test_deleting_a_file_removes_it_from_its_folder(store):
    root = store.create_folder("root")["drive_file_id"]
    first = store.upload_file("f", "text/plain", parent_id=root, file_content=b"1")["drive_file_id"]
    second = store.upload_file("g", "text/plain", parent_id=root, file_content=b"2")["drive_file_id"]

    store.delete_file(first)
    store.delete_file(root)

    with pytest.raises(LocalStorageError):
        store.download_file_content(second)


def test_deleting_something_already_gone_counts_as_deleted(store):
    assert store.delete_file(store.reserve_file_id()) is True


def test_ids_that_could_escape_the_root_are_refused(store):
    assert store.delete_file("../../outside") is False
    with pytest.raises(LocalStorageError):
        store.download_file_content(r"..\..\outside")


def test_rename_updates_the_name_the_folder_lookup_sees(store):
    root = store.create_folder("root")["drive_file_id"]
    inner = store.create_folder("old", parent_id=root)["drive_file_id"]

    renamed = store.rename_file(inner, "new")

    assert renamed["name"] == "new"
    assert store.find_child_folder_by_name("old", root) is None
    assert store.find_child_folder_by_name("new", root)["drive_file_id"] == inner
    assert store.rename_file(store.reserve_file_id(), "x") is None


def test_download_to_path_yields_the_bytes_and_survives_deleting_the_copy(store, tmp_path):
    file_id = store.upload_file("v", "video/mp4", file_content=b"frames" * 100)["drive_file_id"]
    destination = tmp_path / "cache" / "video.mp4"

    store.download_file_to_path(file_id, str(destination))
    destination.unlink()

    assert store.download_file_content(file_id) == b"frames" * 100
    assert not list(destination.parent.glob("*.part"))


def test_download_to_path_of_a_missing_file_raises(store, tmp_path):
    with pytest.raises(LocalStorageError):
        store.download_file_to_path(store.reserve_file_id(), str(tmp_path / "x"))


def test_parallel_uploads_into_one_folder_are_all_removed_with_it(store):
    root = store.create_folder("root")["drive_file_id"]

    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(
            pool.map(
                lambda n: store.upload_file(
                    f"f{n}", "text/plain", parent_id=root, file_content=str(n).encode()
                )["drive_file_id"],
                range(40),
            )
        )

    assert store.delete_file(root) is True
    assert not list(store._data.glob("*")) and not list(store._meta.glob("*"))
    assert len(set(ids)) == 40


def test_a_new_client_on_the_same_root_sees_earlier_uploads(tmp_path):
    first = LocalStorageClient(tmp_path / "storage")
    file_id = first.upload_file("f", "text/plain", file_content=b"kept")["drive_file_id"]

    assert LocalStorageClient(tmp_path / "storage").download_file_content(file_id) == b"kept"

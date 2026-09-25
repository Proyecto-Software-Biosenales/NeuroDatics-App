"""Local-disk object store with the same surface as ``GoogleDriveClient``.

Local mode keeps every file the app stores under one directory instead of Google Drive, so
the upload, analytics and media code runs unchanged: they still hold opaque file ids, and
the id -> file mapping lives here.

Layout under the root:

    data/<id>        the bytes of a file
    meta/<id>.json   name, kind, parent, size and checksum of a file or a folder

Ids are 32 hex characters and never come from a path, so a name from a ZIP entry cannot
reach outside the root. A folder's meta lists its children, so deleting a folder removes
its subtree the way Drive does.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")
_CHUNK_BYTES = 1024 * 1024


class LocalStorageError(RuntimeError):
    """A local storage operation failed; ``drive_file_id`` mirrors the Drive error's field."""

    def __init__(self, message: str, drive_file_id: Optional[str] = None):
        super().__init__(message)
        self.drive_file_id = drive_file_id


class LocalStorageClient:
    def __init__(self, root: str | os.PathLike[str]):
        self._root = Path(root)
        self._data = self._root / "data"
        self._meta = self._root / "meta"
        # One process owns the directory (the launcher enforces it), so a process lock is
        # enough to keep a folder's children list consistent between upload threads.
        self._lock = threading.RLock()

    # -- helpers ---------------------------------------------------------------------------
    def _ensure_dirs(self) -> None:
        self._data.mkdir(parents=True, exist_ok=True)
        self._meta.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _checked_id(file_id: str) -> str:
        if not isinstance(file_id, str) or not _ID_PATTERN.match(file_id):
            raise LocalStorageError("Invalid local file id", drive_file_id=str(file_id))
        return file_id

    def _meta_path(self, file_id: str) -> Path:
        return self._meta / f"{self._checked_id(file_id)}.json"

    def _data_path(self, file_id: str) -> Path:
        return self._data / self._checked_id(file_id)

    def _read_meta(self, file_id: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(self._meta_path(file_id).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    def _write_meta(self, file_id: str, meta: Dict[str, Any]) -> None:
        target = self._meta_path(file_id)
        temporary = target.with_name(f"{target.name}.part")
        temporary.write_text(json.dumps(meta), encoding="utf-8")
        temporary.replace(target)

    def _require_parent(self, parent_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not parent_id:
            return None
        parent = self._read_meta(parent_id)
        if parent is None or parent.get("kind") != "folder":
            raise LocalStorageError("Parent folder does not exist", drive_file_id=parent_id)
        return parent

    def _attach(self, parent_id: Optional[str], child_id: str) -> None:
        if not parent_id:
            return
        parent = self._read_meta(parent_id)
        if parent is None:
            return
        children = parent.setdefault("children", [])
        if child_id not in children:
            children.append(child_id)
            self._write_meta(parent_id, parent)

    def _detach(self, parent_id: Optional[str], child_id: str) -> None:
        if not parent_id:
            return
        parent = self._read_meta(parent_id)
        if parent is not None and child_id in parent.get("children", []):
            parent["children"].remove(child_id)
            self._write_meta(parent_id, parent)

    @staticmethod
    def _summary(file_id: str, meta: Dict[str, Any]) -> Dict[str, Any]:
        parent = meta.get("parent")
        return {
            "drive_file_id": file_id,
            "name": meta["name"],
            "drive_web_view_link": None,
            "parents": [parent] if parent else [],
        }

    # -- the Drive-shaped surface ------------------------------------------------------------
    def reserve_file_id(self) -> str:
        return uuid.uuid4().hex

    def create_folder(
        self,
        name: str,
        parent_id: Optional[str] = None,
        *,
        file_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        folder_id = self._checked_id(file_id) if file_id else self.reserve_file_id()
        with self._lock:
            self._ensure_dirs()
            self._require_parent(parent_id)
            meta = {"kind": "folder", "name": name, "parent": parent_id, "children": []}
            self._write_meta(folder_id, meta)
            self._attach(parent_id, folder_id)
        return self._summary(folder_id, meta)

    def find_child_folder_by_name(self, name: str, parent_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            parent = self._read_meta(parent_id)
            for child_id in (parent or {}).get("children", []):
                child = self._read_meta(child_id)
                if child and child.get("kind") == "folder" and child.get("name") == name:
                    return self._summary(child_id, child)
        return None

    def upload_file(
        self,
        filename: str,
        mime_type: str,
        parent_id: Optional[str] = None,
        file_content: Optional[bytes] = None,
        local_path: Optional[str] = None,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if (file_content is None) == (local_path is None):
            raise ValueError("Provide exactly one of file_content or local_path")

        parent_id = parent_id or folder_id
        file_id = self.reserve_file_id()
        with self._lock:
            self._ensure_dirs()
            self._require_parent(parent_id)

        target = self._data_path(file_id)
        temporary = target.with_name(f"{target.name}.part")
        sha256 = hashlib.sha256()
        size = 0
        try:
            # Hash while copying so the stored bytes are the ones that were checksummed.
            if local_path is not None:
                source = Path(local_path)
                filename = filename or source.name
                with source.open("rb") as reader, temporary.open("wb") as writer:
                    for chunk in iter(lambda: reader.read(_CHUNK_BYTES), b""):
                        sha256.update(chunk)
                        writer.write(chunk)
                        size += len(chunk)
                if size != source.stat().st_size:
                    raise OSError("Upload source changed while being read")
            else:
                sha256.update(file_content)
                size = len(file_content)
                temporary.write_bytes(file_content)
            temporary.replace(target)

            meta = {
                "kind": "file",
                "name": filename,
                "parent": parent_id,
                "mime_type": mime_type,
                "size": size,
                "sha256": sha256.hexdigest(),
            }
            with self._lock:
                self._write_meta(file_id, meta)
                self._attach(parent_id, file_id)
        except Exception as exc:
            temporary.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            self._meta_path(file_id).unlink(missing_ok=True)
            raise LocalStorageError(
                "Local storage write failed", drive_file_id=file_id
            ) from exc

        return {
            "drive_file_id": file_id,
            "filename": filename,
            "size_bytes": size,
            "mime_type": mime_type,
            "checksum_sha256": meta["sha256"],
            "drive_web_view_link": None,
            "drive_download_link": None,
            "parents": [parent_id] if parent_id else [],
        }

    def delete_file(self, file_id: str) -> bool:
        """Delete a file, or a folder and everything below it. Missing counts as deleted."""
        try:
            with self._lock:
                return self._delete_tree(file_id)
        except Exception as exc:
            logger.warning("Failed deleting local object %s (%s)", file_id, type(exc).__name__)
            return False

    def _delete_tree(self, file_id: str) -> bool:
        meta = self._read_meta(file_id)
        if meta is None:
            self._data_path(file_id).unlink(missing_ok=True)
            return True

        ok = True
        for child_id in list(meta.get("children", [])):
            ok = self._delete_tree(child_id) and ok
        if not ok:
            # A child could not be removed; keep this folder so a retry still finds it.
            return False

        self._data_path(file_id).unlink(missing_ok=True)
        self._meta_path(file_id).unlink(missing_ok=True)
        self._detach(meta.get("parent"), file_id)
        return True

    def rename_file(self, file_id: str, new_name: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            meta = self._read_meta(file_id)
            if meta is None:
                logger.warning("Local object not found for rename: %s", file_id)
                return None
            meta["name"] = new_name
            self._write_meta(file_id, meta)
            return self._summary(file_id, meta)

    def download_file_content(self, file_id: str) -> bytes:
        try:
            return self._data_path(file_id).read_bytes()
        except FileNotFoundError as exc:
            raise LocalStorageError("Local file not found", drive_file_id=file_id) from exc

    def download_file_to_path(
        self,
        file_id: str,
        destination_path: str,
        chunk_size: int = 8 * 1024 * 1024,
    ) -> str:
        source = self._data_path(file_id)
        if not source.is_file():
            raise LocalStorageError("Local file not found", drive_file_id=file_id)

        destination = Path(destination_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f"{destination.name}.part")
        try:
            # A hard link makes the cached copy free. Stored files are never rewritten in
            # place, and deleting the cached name leaves the stored one alone.
            try:
                temporary.unlink(missing_ok=True)
                os.link(source, temporary)
            except OSError:
                with source.open("rb") as reader, temporary.open("wb") as writer:
                    shutil.copyfileobj(reader, writer, chunk_size)
            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return str(destination)

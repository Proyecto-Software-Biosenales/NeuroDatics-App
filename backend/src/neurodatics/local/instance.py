"""One running copy per data directory.

Two launchers on the same data would race to create the cluster and to pick ports, and
PostgreSQL would stop the loser with a traceback. A named Windows mutex is the interlock: the
system releases it when its owner dies, however it dies, so a crash never leaves a stale lock.

The owner also publishes where it is listening in ``instance.json``; a second launch reads
that and opens the running app instead of starting another.
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import pathlib
import time
from typing import Optional

_ERROR_ALREADY_EXISTS = 183
INFO_FILE = "instance.json"


class InstanceLock:
    def __init__(self, data_root: pathlib.Path) -> None:
        self._info_path = pathlib.Path(data_root) / INFO_FILE
        digest = hashlib.sha1(os.path.normcase(os.path.realpath(data_root)).encode("utf-8")).hexdigest()
        self._name = f"Local\\NeuroDatics-{digest[:16]}"
        self._handle = None

    def acquire(self) -> bool:
        """True when this process is now the only launcher for the data directory."""
        kernel32 = ctypes.windll.kernel32
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        handle = kernel32.CreateMutexW(None, False, self._name)
        if not handle:
            raise OSError(f"could not create the single-instance mutex (error {ctypes.GetLastError()})")
        if ctypes.GetLastError() == _ERROR_ALREADY_EXISTS:
            kernel32.CloseHandle(ctypes.c_void_p(handle))
            return False
        self._handle = handle
        # Whatever an earlier run left here describes a server that is gone.
        self._info_path.unlink(missing_ok=True)
        return True

    def publish(self, port: int) -> None:
        """Say where the app is listening, once it is."""
        self._info_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._info_path.with_name(INFO_FILE + ".part")
        temporary.write_text(
            json.dumps({"pid": os.getpid(), "port": port, "url": f"http://127.0.0.1:{port}/"}),
            encoding="utf-8",
        )
        temporary.replace(self._info_path)

    def release(self) -> None:
        if self._handle is None:
            return
        self._info_path.unlink(missing_ok=True)
        kernel32 = ctypes.windll.kernel32
        kernel32.ReleaseMutex(ctypes.c_void_p(self._handle))
        kernel32.CloseHandle(ctypes.c_void_p(self._handle))
        self._handle = None


def wait_for_running_instance(data_root: pathlib.Path, timeout: float = 90.0) -> Optional[dict]:
    """The published address of the launcher that holds the lock, once it has one."""
    path = pathlib.Path(data_root) / INFO_FILE
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            time.sleep(0.5)
    return None

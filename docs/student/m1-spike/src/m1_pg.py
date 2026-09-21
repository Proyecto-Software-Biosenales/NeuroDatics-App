"""Embedded PostgreSQL launcher prototype for the student edition (M1 spike, not product code).

Everything that bit us while probing the Windows binaries is handled here on purpose:

* pg_ctl start is run with stdin/stdout/stderr on files. The postmaster inherits the caller's
  handles, so a pipe never reaches EOF and any parent reading it would hang forever.
* initdb cannot run from a path with non-ASCII characters (the share path is embedded in SQL
  as ANSI bytes), so a ready-made cluster template is copied instead of running initdb.
* An orphaned server (launcher closed or killed) is adopted through postmaster.pid.
"""
from __future__ import annotations

import ctypes
import os
import pathlib
import shutil
import socket
import subprocess
import time
from ctypes import wintypes

CREATE_NO_WINDOW = 0x08000000


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _same_dir(a: str, b: str) -> bool:
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


def pid_is_postgres(pid: int, bin_dir: pathlib.Path | None = None) -> bool:
    """True when pid is a live postgres.exe, and (if given) one launched from bin_dir.

    Windows reuses pids, and this machine may also run an unrelated PostgreSQL service, so the
    image name alone is not proof that a stale postmaster.pid still belongs to our server.
    """
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.restype = wintypes.HANDLE
    handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        return False
    try:
        size = wintypes.DWORD(1024)
        buffer = ctypes.create_unicode_buffer(1024)
        if not kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            return False
        image = pathlib.Path(buffer.value)
        if image.name.lower() != "postgres.exe":
            return False
        return bin_dir is None or _same_dir(str(image.parent), str(bin_dir))
    finally:
        kernel32.CloseHandle(handle)


class EmbeddedPostgres:
    def __init__(self, bin_dir: pathlib.Path, data_dir: pathlib.Path, log_dir: pathlib.Path) -> None:
        self.bin = pathlib.Path(bin_dir)
        self.data = pathlib.Path(data_dir)
        self.log_dir = pathlib.Path(log_dir)
        self.port: int | None = None
        self.adopted = False
        self.log_dir.mkdir(parents=True, exist_ok=True)

    # -- plumbing ----------------------------------------------------------------------
    def _run(self, exe: str, *args: str, timeout: float = 120.0) -> subprocess.CompletedProcess:
        out = open(self.log_dir / f"{exe}.out.log", "ab")
        try:
            return subprocess.run(
                [str(self.bin / f"{exe}.exe"), *args],
                stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
                timeout=timeout, check=False, creationflags=CREATE_NO_WINDOW,
            )
        finally:
            out.close()

    def _pid_file(self) -> list[str] | None:
        try:
            return (self.data / "postmaster.pid").read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return None

    def running_pid(self) -> int | None:
        lines = self._pid_file()
        if not lines:
            return None
        try:
            pid = int(lines[0])
        except ValueError:
            return None
        return pid if pid_is_postgres(pid, self.bin) else None

    def wait_ready(self, timeout: float = 60.0) -> float:
        """Poll real connectivity. pg_ctl -w cannot be trusted after an unclean exit."""
        started = time.perf_counter()
        while time.perf_counter() - started < timeout:
            probe = subprocess.run(
                [str(self.bin / "pg_isready.exe"), "-h", "127.0.0.1", "-p", str(self.port), "-t", "2"],
                stdin=subprocess.DEVNULL, capture_output=True, check=False, creationflags=CREATE_NO_WINDOW,
            )
            if probe.returncode == 0:
                return round(time.perf_counter() - started, 2)
            time.sleep(0.25)
        raise RuntimeError(f"PostgreSQL did not accept connections on port {self.port} within {timeout} s")

    # -- lifecycle ---------------------------------------------------------------------
    def ensure_cluster(self, template: pathlib.Path) -> str:
        if (self.data / "PG_VERSION").exists():
            return "existing"
        self.data.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(template, self.data)
        return "copied-from-template"

    def start(self) -> dict:
        """Start (or adopt) the server; return how long it took to accept connections."""
        started = time.perf_counter()
        pid = self.running_pid()
        if pid:
            lines = self._pid_file() or []
            self.port = int(lines[3])
            self.adopted = True
            ready = self.wait_ready(30)
            return {"how": "adopted-orphan", "pid": pid, "port": self.port, "ready_seconds": ready,
                    "seconds": round(time.perf_counter() - started, 2)}
        # No live server of ours: a leftover postmaster.pid is stale. Left in place it still says
        # "ready", so pg_ctl -w would report success while crash recovery is only starting.
        stale = self.data / "postmaster.pid"
        stale_removed = stale.exists()
        if stale_removed:
            stale.unlink()
        self.port = free_port()
        options = f"-p {self.port} -c listen_addresses=127.0.0.1 -c timezone=UTC -c log_timezone=UTC"
        completed = self._run(
            "pg_ctl", "start", "-w", "-t", "120", "-D", str(self.data),
            "-l", str(self.log_dir / "postgres.log"), "-o", options, timeout=150,
        )
        if completed.returncode != 0:
            tail = (self.log_dir / "pg_ctl.out.log").read_text(errors="replace")[-600:]
            raise RuntimeError(f"pg_ctl start exited {completed.returncode}: {tail}")
        self.adopted = False
        ready = self.wait_ready(120)
        return {"how": "started", "port": self.port, "stale_pid_removed": stale_removed, "ready_seconds": ready,
                "seconds": round(time.perf_counter() - started, 2)}

    def stop(self) -> dict:
        started = time.perf_counter()
        completed = self._run("pg_ctl", "stop", "-m", "fast", "-w", "-t", "120", "-D", str(self.data), timeout=150)
        return {"returncode": completed.returncode, "seconds": round(time.perf_counter() - started, 2)}

    def hard_kill(self) -> dict:
        """Simulate a crash or power loss: terminate the postmaster and every child at once."""
        pid = self.running_pid()
        if pid is None:
            return {"killed": False}
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, check=False)
        deadline = time.time() + 15
        while time.time() < deadline and pid_is_postgres(pid, self.bin):
            time.sleep(0.1)
        return {"killed": True, "pid": pid, "pid_file_left_behind": (self.data / "postmaster.pid").exists()}

    def control_state(self) -> str:
        out = subprocess.run(
            [str(self.bin / "pg_controldata.exe"), str(self.data)],
            capture_output=True, text=True, check=False, creationflags=CREATE_NO_WINDOW,
        ).stdout
        for line in out.splitlines():
            if line.startswith("Database cluster state"):
                return line.split(":", 1)[1].strip()
        return "unknown"

    def url(self, database: str = "neurodatics") -> str:
        return f"postgresql+psycopg://postgres@127.0.0.1:{self.port}/{database}"

    def dir_mb(self) -> float:
        total = sum(f.stat().st_size for f in self.data.rglob("*") if f.is_file())
        return round(total / 1048576, 1)

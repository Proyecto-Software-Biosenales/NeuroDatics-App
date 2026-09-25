"""Embedded PostgreSQL for the student edition (Windows x64).

The server is the same PostgreSQL 16 the teacher edition runs, so SQL, migrations, the project
lock and the JSONB token merge stay untouched. Each rule below was learnt by running the real
Windows binaries (docs/student/M1-SPIKE.md):

* ``initdb`` cannot run from a path with non-ASCII characters, so a cluster template built
  elsewhere is copied instead; ``initdb`` never runs on the student's machine.
* ``pg_ctl start`` hands its stdio to the postmaster, so a parent reading a pipe would hang
  forever. Every child here has stdin, stdout and stderr on files or NUL.
* After a hard kill the stale ``postmaster.pid`` still says "ready", so readiness is polled
  with ``pg_isready`` rather than trusted from ``pg_ctl -w``.
* Pids are reused and other PostgreSQL servers may run on the machine, so a pid file counts
  only when its pid is a live ``postgres.exe`` from our own ``bin`` folder.
* The server always starts in UTC, whatever timezone the template was built in.
* A launcher that died leaves its server running; the next launch adopts it through the
  pid file (its port is line 4).

This module must not import ``neurodatics.config`` (the settings need the port it finds).
"""

from __future__ import annotations

import ctypes
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import time
from ctypes import wintypes
from typing import Optional

CREATE_NO_WINDOW = 0x08000000
SUPERUSER = "postgres"
DATABASE = "neurodatics"

# Loopback only, and a password even there: any other local user or process can reach 127.0.0.1.
_PG_HBA = (
    "# Written by NeuroDatics. Loopback connections only, always with a password.\n"
    "host    all    all    127.0.0.1/32    scram-sha-256\n"
    "host    all    all    ::1/128         scram-sha-256\n"
)
_PORT_TAKEN_MARKERS = ("already in use", "could not create any tcp/ip sockets", "could not bind")


class PostgresError(RuntimeError):
    """The embedded server could not be prepared or started."""


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _same_dir(a: str, b: str) -> bool:
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


def pid_is_postgres(pid: int, bin_dir: Optional[pathlib.Path] = None) -> bool:
    """True when pid is a live postgres.exe, and (if given) one launched from bin_dir."""
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


def _replace_when_released(source: pathlib.Path, target: pathlib.Path, attempts: int = 40, pause: float = 0.5) -> None:
    """Rename a freshly copied folder into place, waiting out programs that still hold a file in it.

    A virus scanner or the search indexer opens the ~1,000 files just copied, and Windows refuses to
    rename a directory while any of them is open ("Access is denied"). It clears within seconds.
    """
    for attempt in range(attempts):
        try:
            source.replace(target)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(pause)


class EmbeddedPostgres:
    def __init__(
        self,
        bin_dir: pathlib.Path,
        data_dir: pathlib.Path,
        log_dir: pathlib.Path,
        password_file: pathlib.Path,
    ) -> None:
        self.bin = pathlib.Path(bin_dir)
        self.data = pathlib.Path(data_dir)
        self.log_dir = pathlib.Path(log_dir)
        self.password_file = pathlib.Path(password_file)
        self.port: Optional[int] = None
        self.adopted = False
        self.log_dir.mkdir(parents=True, exist_ok=True)

    # -- plumbing ----------------------------------------------------------------------
    def _run(self, exe: str, *args: str, timeout: float = 120.0) -> subprocess.CompletedProcess:
        out = open(self.log_dir / f"{exe}.out.log", "ab")
        try:
            return subprocess.run(
                [str(self.bin / f"{exe}.exe"), *args],
                stdin=subprocess.DEVNULL,
                stdout=out,
                stderr=subprocess.STDOUT,
                timeout=timeout,
                check=False,
                creationflags=CREATE_NO_WINDOW,
            )
        finally:
            out.close()

    def _pid_lines(self) -> Optional[list[str]]:
        try:
            return (self.data / "postmaster.pid").read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return None

    def running_pid(self) -> Optional[int]:
        lines = self._pid_lines()
        if not lines:
            return None
        try:
            pid = int(lines[0])
        except ValueError:
            return None
        return pid if pid_is_postgres(pid, self.bin) else None

    def wait_ready(self, timeout: float = 60.0) -> float:
        started = time.perf_counter()
        while time.perf_counter() - started < timeout:
            probe = subprocess.run(
                [str(self.bin / "pg_isready.exe"), "-h", "127.0.0.1", "-p", str(self.port), "-t", "2"],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                check=False,
                creationflags=CREATE_NO_WINDOW,
            )
            if probe.returncode == 0:
                return round(time.perf_counter() - started, 2)
            time.sleep(0.25)
        raise PostgresError(
            f"PostgreSQL did not accept connections on port {self.port} within {timeout:g} s"
        )

    @property
    def password(self) -> str:
        return self.password_file.read_text(encoding="utf-8").strip()

    # -- the cluster ----------------------------------------------------------------------
    def ensure_cluster(self, template: pathlib.Path) -> str:
        """Create the data directory from the template on first launch, secured before use.

        The copy is built beside the final name and renamed into place, so a launch that is
        interrupted halfway leaves nothing that looks like a cluster.
        """
        if (self.data / "PG_VERSION").exists():
            return "existing"
        if self.data.exists() and any(self.data.iterdir()):
            raise PostgresError(
                f"{self.data} exists but is not a PostgreSQL cluster; refusing to overwrite it"
            )

        building = self.data.with_name(self.data.name + ".building")
        shutil.rmtree(building, ignore_errors=True)
        self.data.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(template, building)
        try:
            password = secrets.token_hex(24)
            self._set_superuser_password(building, password)
            (building / "pg_hba.conf").write_text(_PG_HBA, encoding="utf-8", newline="\n")
            self.password_file.parent.mkdir(parents=True, exist_ok=True)
            self.password_file.write_text(password, encoding="utf-8")
            if self.data.exists():
                self.data.rmdir()
            _replace_when_released(building, self.data)
        except BaseException:
            shutil.rmtree(building, ignore_errors=True)
            raise
        return "copied-from-template"

    def _set_superuser_password(self, cluster: pathlib.Path, password: str) -> None:
        """Set the password with the server stopped, so it never has to run without one."""
        completed = subprocess.run(
            [str(self.bin / "postgres.exe"), "--single", "-D", str(cluster), "postgres"],
            input=f"ALTER ROLE {SUPERUSER} PASSWORD '{password}';\n".encode(),
            capture_output=True,
            timeout=120,
            check=False,
            creationflags=CREATE_NO_WINDOW,
        )
        if completed.returncode != 0:
            tail = completed.stdout.decode(errors="replace")[-400:] + completed.stderr.decode(errors="replace")[-400:]
            raise PostgresError(f"could not secure the new cluster: {tail}")

    # -- lifecycle ---------------------------------------------------------------------
    def start(self) -> dict:
        """Start (or adopt) the server; return how it came up."""
        started = time.perf_counter()
        pid = self.running_pid()
        if pid:
            self.port = int((self._pid_lines() or [])[3])
            self.adopted = True
            ready = self.wait_ready(30)
            return {"how": "adopted", "pid": pid, "port": self.port, "ready_seconds": ready,
                    "seconds": round(time.perf_counter() - started, 2)}

        # No live server of ours: a leftover postmaster.pid is stale. Left in place it still
        # says "ready", so pg_ctl -w would report success while crash recovery is starting.
        stale = self.data / "postmaster.pid"
        stale_removed = stale.exists()
        if stale_removed:
            stale.unlink()

        last_failure = ""
        for _ in range(4):
            self.port = free_port()
            options = f"-p {self.port} -c listen_addresses=127.0.0.1 -c timezone=UTC -c log_timezone=UTC"
            completed = self._run(
                "pg_ctl", "start", "-w", "-t", "120", "-D", str(self.data),
                "-l", str(self.log_dir / "postgres.log"), "-o", options, timeout=150,
            )
            if completed.returncode == 0:
                self.adopted = False
                ready = self.wait_ready(120)
                return {"how": "started", "port": self.port, "stale_pid_removed": stale_removed,
                        "ready_seconds": ready, "seconds": round(time.perf_counter() - started, 2)}
            last_failure = self._log_tail("pg_ctl.out.log") + self._log_tail("postgres.log")
            # Another program took the port between choosing it and binding it: choose again.
            if not any(marker in last_failure.lower() for marker in _PORT_TAKEN_MARKERS):
                break
        raise PostgresError(f"pg_ctl could not start the server: {last_failure[-600:]}")

    def _log_tail(self, name: str, size: int = 600) -> str:
        try:
            return (self.log_dir / name).read_text(errors="replace")[-size:]
        except OSError:
            return ""

    def stop(self) -> dict:
        started = time.perf_counter()
        completed = self._run("pg_ctl", "stop", "-m", "fast", "-w", "-t", "120", "-D", str(self.data), timeout=150)
        return {"returncode": completed.returncode, "seconds": round(time.perf_counter() - started, 2)}

    def control_state(self) -> str:
        out = subprocess.run(
            [str(self.bin / "pg_controldata.exe"), str(self.data)],
            capture_output=True, text=True, check=False, creationflags=CREATE_NO_WINDOW,
        ).stdout
        for line in out.splitlines():
            if line.startswith("Database cluster state"):
                return line.split(":", 1)[1].strip()
        return "unknown"

    def connect_kwargs(self, database: str = DATABASE) -> dict:
        return {
            "host": "127.0.0.1",
            "port": self.port,
            "user": SUPERUSER,
            "password": self.password,
            "dbname": database,
        }

    def url(self, database: str = DATABASE) -> str:
        return f"postgresql+psycopg://{SUPERUSER}:{self.password}@127.0.0.1:{self.port}/{database}"

    def ensure_database(self, name: str = DATABASE) -> None:
        import psycopg

        with psycopg.connect(**self.connect_kwargs("postgres"), autocommit=True) as conn:
            if not conn.execute("select 1 from pg_database where datname = %s", (name,)).fetchone():
                conn.execute(f'create database "{name}"')

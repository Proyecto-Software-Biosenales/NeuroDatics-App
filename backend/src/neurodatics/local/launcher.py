"""Start NeuroDatics for one student: database, migrations, then the app on loopback.

Everything the app needs is decided here and handed over through the environment before the
application is imported, because its settings are read once at import time.

    NeuroDatics Estudiantes/    the extracted folder (read-only is fine); a student sees only
        neurodatics-estudiantes.exe  LEEME.txt
        _internal/              hidden: the frozen runtime and the package (sys._MEIPASS)
            pgsql/bin  pg-template  tools/ (ffmpeg)  frontend/  THIRD-PARTY-NOTICES.txt
    %LOCALAPPDATA%/NeuroDatics Estudiantes/
        pgdata  logs  storage  cache  postgres.password  instance.json

The data lives in the profile rather than beside the program on purpose: a folder extracted
into Downloads or Desktop is often synced by OneDrive, and syncing a live database corrupts it.
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
import errno
import json
import os
import pathlib
import secrets
import socket
import sys
import threading
import time
import traceback
import webbrowser
from ctypes import wintypes
from typing import Callable, Optional

from .instance import InstanceLock, app_address, wait_for_running_instance
from .postgres import EmbeddedPostgres, PostgresError

APP_DIR_NAME = "NeuroDatics Estudiantes"
PREFERRED_PORT = 8765
FRONTEND_DIR = "frontend"
FAILURE_LOG = "launcher-errors.log"

_CTRL_CLOSE_EVENTS = {2, 5, 6}  # console closed, user logging off, system shutting down
_FILE_ATTRIBUTE_HIDDEN = 0x2
_INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF
_console_handlers: list = []
# Windows reports a port held by another program, or reserved by the system, with WSA codes.
_PORT_TAKEN = {errno.EADDRINUSE, errno.EACCES, getattr(errno, "WSAEACCES", errno.EACCES)}


def package_dir(override: Optional[str]) -> pathlib.Path:
    """Where pgsql, pg-template, tools and frontend live.

    The frozen package keeps them in the runtime's own folder (``_internal``) so the folder a
    student opens shows only the program and its guide. A package that still has them beside
    the executable (builds before 2026-10-08) keeps working.
    """
    if override:
        return pathlib.Path(override)
    support = getattr(sys, "_MEIPASS", None)
    if support and (pathlib.Path(support) / "pgsql").is_dir():
        return pathlib.Path(support)
    return pathlib.Path(sys.executable).resolve().parent


def hide_support_folder(pkg: pathlib.Path) -> None:
    """Keep the support folder hidden beside the executable, best effort.

    The zip already marks it hidden, but not every extractor honours that. Only the frozen
    runtime's own folder is touched; a folder passed with --pkg is left alone.
    """
    support = getattr(sys, "_MEIPASS", None)
    if not support or pathlib.Path(support) != pkg:
        return
    try:
        kernel32 = ctypes.windll.kernel32
        attributes = kernel32.GetFileAttributesW(str(pkg)) & 0xFFFFFFFF  # DWORD; ctypes returns int
        if attributes != _INVALID_FILE_ATTRIBUTES and not attributes & _FILE_ATTRIBUTE_HIDDEN:
            kernel32.SetFileAttributesW(str(pkg), attributes | _FILE_ATTRIBUTE_HIDDEN)
    except (AttributeError, OSError):
        pass  # not Windows, or a read-only location: cosmetic only


def default_data_dir() -> pathlib.Path:
    base = os.environ.get("LOCALAPPDATA") or str(pathlib.Path.home() / "AppData" / "Local")
    return pathlib.Path(base) / APP_DIR_NAME


def migrations_dir() -> pathlib.Path:
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        return pathlib.Path(frozen_root) / "migrations"
    return pathlib.Path(__file__).resolve().parents[3] / "migrations"


def _bind_loopback(family: int, port: int) -> socket.socket:
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        # Keeps another program from binding this port beside us (Windows only).
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        if family == socket.AF_INET6:
            sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        sock.bind(("::1" if family == socket.AF_INET6 else "127.0.0.1", port))
        sock.setblocking(False)
        return sock
    except OSError:
        sock.close()
        raise


def bind_listening_sockets(preferred: int) -> list[socket.socket]:
    """Bind the app's port on both loopbacks, preferring a stable one.

    A stable address keeps the browser's saved state for the app between launches; the sockets
    are bound here and handed to the server, so there is no gap in which another program can
    take the port. Browsers try ::1 first for a *.localhost name, so the port must be ours there
    too: a port held by another program on ::1 is skipped, and a machine without IPv6 gets
    127.0.0.1 alone.
    """
    for port in (preferred, 0, 0) if preferred else (0, 0):
        try:
            v4 = _bind_loopback(socket.AF_INET, port)
        except OSError:
            continue
        try:
            return [v4, _bind_loopback(socket.AF_INET6, v4.getsockname()[1])]
        except OSError as exc:
            if exc.errno in _PORT_TAKEN:
                v4.close()
                continue
            return [v4]
    raise OSError("no free loopback port")


def apply_environment(pkg: pathlib.Path, data_root: pathlib.Path, database_url: str) -> None:
    """What the application reads from settings, set before it is imported."""
    os.environ.update(
        {
            "APP_MODE": "local",
            "APP_ENV": "production",
            "DEBUG": "false",
            "LOCAL_DATA_DIR": str(data_root),
            "DATABASE_URL": database_url,
            # Nothing verifies tokens in local mode; the settings still insist on a secret.
            "AUTH_JWT_SECRET": secrets.token_urlsafe(48),
        }
    )
    frontend = pkg / FRONTEND_DIR
    if (frontend / "index.html").is_file():
        os.environ["LOCAL_FRONTEND_DIR"] = str(frontend)
    tools = pkg / "tools"
    if tools.is_dir():
        os.environ["PATH"] = str(tools) + os.pathsep + os.environ.get("PATH", "")


def migrate() -> dict:
    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config()
    config.set_main_option("script_location", str(migrations_dir()))
    head = ScriptDirectory.from_config(config).get_current_head()
    started = time.perf_counter()
    command.upgrade(config, "head")
    return {"head": head, "seconds": round(time.perf_counter() - started, 2)}


def on_console_close(stop: Callable[[], None], finished: threading.Event) -> None:
    """Shut the database down cleanly when the student closes the console window.

    Windows ends the process a few seconds after a close event, so the handler starts the
    shutdown and holds that grace period open until it is done.
    """
    handler_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

    def handler(event: int) -> bool:
        if event not in _CTRL_CLOSE_EVENTS:
            return False
        stop()
        finished.wait(timeout=4.5)
        return True

    callback = handler_type(handler)
    _console_handlers.append(callback)  # the callback must outlive this function
    ctypes.windll.kernel32.SetConsoleCtrlHandler(callback, True)


def watch_stop_file(path: str, server, finished: threading.Event) -> None:
    """Test hook: a build check ends the app cleanly by creating this file."""
    while not finished.is_set():
        if os.path.exists(path):
            server.should_exit = True
            return
        time.sleep(0.5)


def serve(args: argparse.Namespace, pkg: pathlib.Path, data_root: pathlib.Path, lock: InstanceLock) -> int:
    pg = EmbeddedPostgres(
        pkg / "pgsql" / "bin", data_root / "pgdata", data_root / "logs", data_root / "postgres.password"
    )
    print("Preparando la base de datos local...", flush=True)
    started = time.perf_counter()
    pg.ensure_cluster(pkg / "pg-template")
    pg.start()
    finished = threading.Event()
    try:
        pg.ensure_database()
        apply_environment(pkg, data_root, pg.url())
        blocked: list[str] = []
        if args.offline_guard:
            from . import offline_guard

            offline_guard.install()
            blocked = offline_guard.BLOCKED
        print(f"Migraciones: {migrate()}", flush=True)

        import uvicorn

        from neurodatics.main import app

        sockets = bind_listening_sockets(args.port)
        port = sockets[0].getsockname()[1]
        url = f"http://127.0.0.1:{port}/"
        address = app_address(port)
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
        on_console_close(lambda: setattr(server, "should_exit", True), finished)
        if args.exit_after:
            threading.Timer(args.exit_after, lambda: setattr(server, "should_exit", True)).start()
        if args.stop_file:
            threading.Thread(target=watch_stop_file, args=(args.stop_file, server, finished), daemon=True).start()

        should_open = not args.no_browser and (pkg / FRONTEND_DIR / "index.html").exists()

        def announce() -> None:
            while not server.started and not finished.is_set():
                time.sleep(0.1)
            if finished.is_set():
                return
            lock.publish(port)
            seconds = round(time.perf_counter() - started, 1)
            print(f"NeuroDatics esta listo en {address} ({seconds} s). Cierra esta ventana para salir.", flush=True)
            print(f"Si tu navegador no abre esa direccion, usa {url}", flush=True)
            if should_open:
                webbrowser.open(address)

        threading.Thread(target=announce, daemon=True).start()
        # psycopg's async driver cannot use the default Windows loop.
        asyncio.run(server.serve(sockets=sockets), loop_factory=asyncio.SelectorEventLoop)
        if args.offline_guard:
            print(json.dumps({"offline_guard_blocked": blocked}), flush=True)
        return 0
    finally:
        print("Cerrando la base de datos...", flush=True)
        pg.stop()
        finished.set()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="neurodatics-estudiantes")
    parser.add_argument("--pkg", help="package folder (default: the folder of the executable)")
    parser.add_argument("--data-dir", help=f"where projects live (default: %%LOCALAPPDATA%%\\{APP_DIR_NAME})")
    parser.add_argument("--port", type=int, default=PREFERRED_PORT, help="preferred port; 0 picks any")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--exit-after", type=float, default=0.0, help="stop after N seconds (tests)")
    parser.add_argument("--stop-file", help="stop cleanly once this file exists (tests)")
    parser.add_argument("--offline-guard", action="store_true", help="refuse and report non-loopback connections")
    return parser


def is_elevated() -> bool:
    """True when running with an administrator token ("Run as administrator")."""
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except (AttributeError, OSError):
        return False


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if is_elevated():
        # PostgreSQL refuses to run under an administrator token; say so instead of failing
        # later with a database error.
        print("NeuroDatics no puede ejecutarse como administrador. Cierra esta ventana y abrelo con doble clic normal.",
              file=sys.stderr)
        return 2
    pkg = package_dir(args.pkg)
    hide_support_folder(pkg)
    data_root = pathlib.Path(args.data_dir or os.environ.get("NEURODATICS_DATA_DIR") or default_data_dir())
    data_root.mkdir(parents=True, exist_ok=True)

    lock = InstanceLock(data_root)
    if not lock.acquire():
        running = wait_for_running_instance(data_root)
        if running is None:
            print("Otra ventana de NeuroDatics se esta iniciando. Espera unos segundos e intentalo de nuevo.")
            return 1
        address = running.get("address", running["url"])
        print(f"NeuroDatics ya esta abierto en {address}")
        if not args.no_browser:
            webbrowser.open(address)
        return 0

    try:
        return serve(args, pkg, data_root, lock)
    except PostgresError as exc:
        print(f"No se pudo iniciar la base de datos local: {exc}", file=sys.stderr)
        report_failure(data_root, f"PostgresError: {exc}")
        return 2
    except Exception:
        report_failure(data_root, traceback.format_exc())
        return 2
    finally:
        lock.release()


def report_failure(data_root: pathlib.Path, detail: str) -> None:
    """Keep what went wrong where a student can attach it to a message.

    A double-clicked console closes the moment the program ends, so the screen alone is gone
    before anyone reads it.
    """
    path = data_root / "logs" / FAILURE_LOG
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as log:
            log.write(f"--- {time.strftime('%Y-%m-%d %H:%M:%S')}\n{detail.rstrip()}\n")
        print(f"NeuroDatics no pudo iniciar. Los detalles estan en {path}", file=sys.stderr)
    except OSError:
        print(f"NeuroDatics no pudo iniciar:\n{detail}", file=sys.stderr)

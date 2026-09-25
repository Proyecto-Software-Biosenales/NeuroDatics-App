"""The parts of the offline launcher that do not need the PostgreSQL binaries.

The database lifecycle itself (template copy, password, crash recovery, adoption) is proven
against the real binaries by the frozen build's ``pg-check``; see ``student/README.md``.
"""

import asyncio
import json
import os
import socket
import sys

import pytest

from neurodatics.local import launcher, offline_guard, postgres
from neurodatics.local.instance import INFO_FILE, InstanceLock, wait_for_running_instance
from neurodatics.local.postgres import EmbeddedPostgres, PostgresError, pid_is_postgres

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="the student edition is Windows only")

UNROUTABLE = "203.0.113.9"  # TEST-NET-3: reserved, never a real host


# -- one running copy per data directory --------------------------------------------------------
def test_a_second_launcher_on_the_same_data_directory_is_turned_away(tmp_path):
    first, second = InstanceLock(tmp_path), InstanceLock(tmp_path)

    assert first.acquire() is True
    try:
        assert second.acquire() is False
    finally:
        first.release()

    assert second.acquire() is True
    second.release()


def test_different_data_directories_do_not_share_a_lock(tmp_path):
    a, b = InstanceLock(tmp_path / "a"), InstanceLock(tmp_path / "b")

    assert a.acquire() and b.acquire()
    a.release()
    b.release()


def test_the_lock_publishes_the_address_and_clears_it_when_released(tmp_path):
    (tmp_path / INFO_FILE).write_text(json.dumps({"port": 1}), encoding="utf-8")  # a dead run's leftover

    fresh = InstanceLock(tmp_path)
    assert fresh.acquire()
    assert not (tmp_path / INFO_FILE).exists(), "a new owner must discard what a dead one left"
    fresh.publish(8765)
    assert wait_for_running_instance(tmp_path, timeout=1) == {
        "pid": os.getpid(),
        "port": 8765,
        "url": "http://127.0.0.1:8765/",
    }
    fresh.release()
    assert not (tmp_path / INFO_FILE).exists()


def test_waiting_for_an_instance_that_never_publishes_gives_up(tmp_path):
    assert wait_for_running_instance(tmp_path, timeout=0.6) is None


# -- the offline guard -------------------------------------------------------------------------
@pytest.fixture
def guard():
    offline_guard.BLOCKED.clear()
    restore = offline_guard.install()
    try:
        yield offline_guard.BLOCKED
    finally:
        restore()
        offline_guard.BLOCKED.clear()


def test_guard_refuses_synchronous_outbound_connections(guard):
    with pytest.raises(OSError):
        socket.create_connection((UNROUTABLE, 9), timeout=1)

    assert guard and all(UNROUTABLE in entry for entry in guard)


def test_guard_refuses_asyncio_outbound_connections(guard):
    """The path the first version of the tripwire could not see."""

    async def attempt():
        await asyncio.open_connection(UNROUTABLE, 9)

    for factory in (asyncio.SelectorEventLoop, getattr(asyncio, "ProactorEventLoop", None)):
        if factory is None:
            continue
        guard.clear()
        with pytest.raises(OSError):
            asyncio.run(attempt(), loop_factory=factory)
        assert any(entry.startswith("asyncio connect") for entry in guard), (factory, guard)


def test_guard_refuses_name_lookups(guard):
    with pytest.raises(OSError):
        socket.getaddrinfo("example.com", 80)

    assert guard == ["getaddrinfo example.com"]


def test_guard_lets_loopback_through_on_both_paths(guard):
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]

        socket.create_connection(("127.0.0.1", port), timeout=2).close()

        async def attempt():
            _, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.close()

        asyncio.run(attempt(), loop_factory=asyncio.SelectorEventLoop)

    assert guard == []


def test_restoring_the_guard_puts_the_originals_back():
    before = (socket.socket.connect, socket.getaddrinfo)
    restore = offline_guard.install()
    assert (socket.socket.connect, socket.getaddrinfo) != before

    restore()

    assert (socket.socket.connect, socket.getaddrinfo) == before


# -- the launcher's own decisions ----------------------------------------------------------------
def test_the_preferred_port_is_used_when_free_and_replaced_when_taken():
    probe = socket.socket()
    probe.bind(("127.0.0.1", 0))
    free_port = probe.getsockname()[1]
    probe.close()

    chosen = launcher.bind_listening_socket(free_port)
    try:
        assert chosen.getsockname()[1] == free_port
        fallback = launcher.bind_listening_socket(free_port)  # now taken by `chosen`
        try:
            assert fallback.getsockname()[1] not in (0, free_port)
        finally:
            fallback.close()
    finally:
        chosen.close()


def test_environment_hands_the_settings_everything_they_need(tmp_path, monkeypatch):
    monkeypatch.setattr(os, "environ", os.environ.copy())
    package = tmp_path / "pkg"
    (package / "tools").mkdir(parents=True)

    launcher.apply_environment(package, tmp_path / "data", "postgresql+psycopg://u:p@127.0.0.1:1/x")

    assert os.environ["APP_MODE"] == "local" and os.environ["LOCAL_DATA_DIR"] == str(tmp_path / "data")
    assert os.environ["DATABASE_URL"].endswith("/x") and len(os.environ["AUTH_JWT_SECRET"]) >= 32
    assert os.environ["PATH"].startswith(str(package / "tools"))


def test_data_lives_in_the_profile_not_beside_the_program(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    assert launcher.default_data_dir() == tmp_path / launcher.APP_DIR_NAME


def test_the_migrations_folder_is_found_from_a_source_checkout():
    assert (launcher.migrations_dir() / "env.py").is_file()


def test_an_administrator_launch_is_refused_before_anything_starts(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(launcher, "is_elevated", lambda: True)

    assert launcher.main(["--data-dir", str(tmp_path / "never-created")]) == 2

    assert "administrador" in capsys.readouterr().err
    assert not (tmp_path / "never-created").exists()


def test_an_unexpected_failure_is_written_where_a_student_can_find_it(monkeypatch, tmp_path, capsys):
    def explode(*_):
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(launcher, "is_elevated", lambda: False)
    monkeypatch.setattr(launcher, "serve", explode)

    assert launcher.main(["--data-dir", str(tmp_path), "--no-browser"]) == 2

    log = (tmp_path / "logs" / launcher.FAILURE_LOG).read_text(encoding="utf-8")
    assert "RuntimeError: disk on fire" in log
    assert launcher.FAILURE_LOG in capsys.readouterr().err
    assert not (tmp_path / INFO_FILE).exists(), "a failed launch must release the instance lock"


def test_a_database_failure_is_logged_too(monkeypatch, tmp_path, capsys):
    def refuse(*_):
        raise PostgresError("port taken")

    monkeypatch.setattr(launcher, "is_elevated", lambda: False)
    monkeypatch.setattr(launcher, "serve", refuse)

    assert launcher.main(["--data-dir", str(tmp_path), "--no-browser"]) == 2

    assert "port taken" in (tmp_path / "logs" / launcher.FAILURE_LOG).read_text(encoding="utf-8")
    assert "base de datos local" in capsys.readouterr().err


def test_a_double_clicked_failure_waits_for_the_student_but_a_build_gate_never_does(monkeypatch):
    import importlib.util
    import pathlib

    entry = pathlib.Path(__file__).resolve().parents[3] / "student" / "src" / "student_entry.py"
    spec = importlib.util.spec_from_file_location("student_entry_under_test", entry)
    student_entry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(student_entry)
    prompts = []
    monkeypatch.setattr("builtins.input", lambda prompt="": prompts.append(prompt) or "")

    assert student_entry.double_click(lambda argv: 2) == 2
    assert student_entry.double_click(lambda argv: (_ for _ in ()).throw(RuntimeError("boom"))) == 2
    assert len(prompts) == 2

    assert student_entry.double_click(lambda argv: 0) == 0
    assert len(prompts) == 2, "a clean exit must not wait"

    monkeypatch.setattr(launcher, "main", lambda argv: 2)
    monkeypatch.setattr(sys, "argv", ["neurodatics-estudiantes.exe", "serve", "--no-browser"])
    assert student_entry.main() == 2
    assert len(prompts) == 2, "any argument means a script is driving; never wait"


def test_the_parser_accepts_the_documented_options():
    args = launcher.build_parser().parse_args(["--no-browser", "--port", "0", "--offline-guard"])

    assert args.no_browser and args.port == 0 and args.offline_guard


# -- the embedded database's file handling -------------------------------------------------------
def make_postgres(tmp_path, bin_dir=None):
    return EmbeddedPostgres(
        bin_dir or tmp_path / "no-such-bin",
        tmp_path / "root" / "pgdata",
        tmp_path / "root" / "logs",
        tmp_path / "root" / "postgres.password",
    )


def test_an_existing_cluster_is_left_alone(tmp_path):
    pg = make_postgres(tmp_path)
    pg.data.mkdir(parents=True)
    (pg.data / "PG_VERSION").write_text("16")

    assert pg.ensure_cluster(tmp_path / "template") == "existing"


def test_a_folder_that_is_not_a_cluster_is_never_overwritten(tmp_path):
    pg = make_postgres(tmp_path)
    pg.data.mkdir(parents=True)
    (pg.data / "somebodys-file.txt").write_text("keep me")

    with pytest.raises(PostgresError, match="refusing to overwrite"):
        pg.ensure_cluster(tmp_path / "template")

    assert (pg.data / "somebodys-file.txt").read_text() == "keep me"


def test_a_failed_first_launch_leaves_nothing_that_looks_like_a_cluster(tmp_path):
    template = tmp_path / "template"
    template.mkdir()
    (template / "PG_VERSION").write_text("16")
    pg = make_postgres(tmp_path)  # its bin folder does not exist, so securing the copy fails

    with pytest.raises(OSError):
        pg.ensure_cluster(template)

    assert not pg.data.exists()
    assert not pg.data.with_name("pgdata.building").exists()
    assert not pg.password_file.exists()


def test_a_stale_pid_file_is_not_mistaken_for_a_live_server(tmp_path):
    pg = make_postgres(tmp_path)
    pg.data.mkdir(parents=True)
    (pg.data / "postmaster.pid").write_text(f"{os.getpid()}\n{pg.data}\n0\n5432\n", encoding="utf-8")

    assert pid_is_postgres(os.getpid()) is False  # this process is python.exe
    assert pg.running_pid() is None


def test_connection_details_carry_the_generated_password(tmp_path):
    pg = make_postgres(tmp_path)
    pg.password_file.parent.mkdir(parents=True, exist_ok=True)
    pg.password_file.write_text("s3cret\n")
    pg.port = 54321

    assert pg.url() == "postgresql+psycopg://postgres:s3cret@127.0.0.1:54321/neurodatics"
    assert pg.connect_kwargs()["password"] == "s3cret"


def test_a_folder_a_scanner_still_holds_is_renamed_once_it_lets_go(tmp_path, monkeypatch):
    source, target = tmp_path / "pgdata.building", tmp_path / "pgdata"
    source.mkdir()
    real_replace, refusals = type(source).replace, []

    def refuse_twice(self, destination):
        if len(refusals) < 2:
            refusals.append(self)
            raise PermissionError(5, "Access is denied")
        return real_replace(self, destination)

    monkeypatch.setattr(type(source), "replace", refuse_twice)

    postgres._replace_when_released(source, target, pause=0)

    assert len(refusals) == 2 and target.is_dir() and not source.exists()


def test_a_folder_that_is_never_released_still_fails_loudly(tmp_path, monkeypatch):
    source = tmp_path / "pgdata.building"
    source.mkdir()

    def always_refuse(self, destination):
        raise PermissionError(5, "Access is denied")

    monkeypatch.setattr(type(source), "replace", always_refuse)

    with pytest.raises(PermissionError):
        postgres._replace_when_released(source, tmp_path / "pgdata", attempts=3, pause=0)

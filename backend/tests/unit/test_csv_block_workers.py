"""Participant blocks processed in worker processes give exactly the serial result."""

from concurrent.futures import Future
from concurrent.futures.process import BrokenProcessPool
from dataclasses import asdict
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from neurodatics.config.settings import Settings
from neurodatics.shared import machine_resources
from neurodatics.modules.projects.application.services import csv_processing_service
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingError,
    CsvProcessingService,
)


def _block(code: str, rows: int, phase: float) -> list[str]:
    lines = [
        f"Grabación : {code} | Rec 1",
        "Nombre : Bandwidth / X",
        "Frecuencia : 60 Hz",
        "Nombre : Bandwidth / Y",
        "Frecuencia : 60 Hz",
        "Frecuencia del archivo : 60 Hz",
        "",
        "Time;Bandwidth / X;Bandwidth / Y;GSR / GSR;Scenario 1;",
    ]
    for index in range(rows):
        dwell = (index // 40) % 3
        lines.append(
            ";".join(
                [
                    f"{index / 60:.6f}".replace(".", ","),
                    f"{20 + dwell * 25 + phase + (index % 3) * 0.02:.4f}".replace(".", ","),
                    f"{30 + dwell * 10 + (index % 2) * 0.03:.4f}".replace(".", ","),
                    f"{1.5 + index / 1000:.4f}".replace(".", ","),
                    "Stim A" if index < rows // 2 else "Stim B",
                    "",
                ]
            )
        )
    return lines


def _write_csv(path: Path, blocks: list[list[str]]) -> Path:
    path.write_text("\n".join(line for block in blocks for line in block), encoding="utf-16")
    return path


def _comparable(result, out_dir: Path) -> str:
    return repr(asdict(result)).replace(repr(str(out_dir))[1:-1], "<OUT>")


def _parquets(out_dir: Path) -> dict[str, bytes]:
    return {
        path.relative_to(out_dir).as_posix(): path.read_bytes()
        for path in sorted(out_dir.rglob("*.parquet"))
    }


@pytest.fixture
def pool_for_any_size(monkeypatch):
    monkeypatch.setattr(CsvProcessingService, "_POOL_MIN_LINES", 0)
    used = []
    original = CsvProcessingService._run_in_pool

    def spy(jobs, workers):
        futures = original(jobs, workers)
        used.append(futures is not None)
        return futures

    monkeypatch.setattr(CsvProcessingService, "_run_in_pool", staticmethod(spy))
    return used


def test_worker_processes_reproduce_the_serial_result_byte_for_byte(tmp_path, pool_for_any_size):
    csv_path = _write_csv(
        tmp_path / "three.csv",
        [_block("P1", 400, 0.0), _block("P2", 300, 1.0), _block("P3", 350, 2.0)],
    )
    serial_out = tmp_path / "serial"
    pooled_out = tmp_path / "pooled"

    serial = CsvProcessingService.process(str(csv_path), str(serial_out), max_workers=1)
    pooled = CsvProcessingService.process(str(csv_path), str(pooled_out), max_workers=3)

    assert pool_for_any_size == [True]
    assert [p.participant_code for p in pooled.participants] == ["P1", "P2", "P3"]
    assert _comparable(pooled, pooled_out) == _comparable(serial, serial_out)
    serial_files = _parquets(serial_out)
    assert len(serial_files) == 9
    assert _parquets(pooled_out) == serial_files


def test_a_failing_block_raises_the_serial_error(tmp_path, pool_for_any_size):
    broken = _block("P2", 300, 1.0)
    broken[20] = "1;2;3"
    csv_path = _write_csv(
        tmp_path / "broken.csv",
        [_block("P1", 300, 0.0), broken, _block("P3", 300, 2.0)],
    )

    with pytest.raises(CsvProcessingError) as serial:
        CsvProcessingService.process(str(csv_path), str(tmp_path / "serial"), max_workers=1)
    with pytest.raises(CsvProcessingError) as pooled:
        CsvProcessingService.process(str(csv_path), str(tmp_path / "pooled"), max_workers=3)

    assert "Fila malformada" in str(serial.value)
    assert str(pooled.value) == str(serial.value)


def _pool_that_cannot_start() -> MagicMock:
    return MagicMock(side_effect=PermissionError("process creation blocked"))


def _pool_that_loses_its_workers() -> MagicMock:
    broken = Future()
    broken.set_exception(BrokenProcessPool("a worker died"))
    pool = MagicMock()
    pool.__enter__.return_value = pool
    pool.submit.return_value = broken
    return MagicMock(return_value=pool)


@pytest.mark.parametrize("failing_pool", [_pool_that_cannot_start, _pool_that_loses_its_workers])
def test_a_pool_that_fails_falls_back_to_this_process(tmp_path, monkeypatch, failing_pool):
    monkeypatch.setattr(CsvProcessingService, "_POOL_MIN_LINES", 0)
    monkeypatch.setattr(csv_processing_service, "ProcessPoolExecutor", failing_pool())
    csv_path = _write_csv(tmp_path / "two.csv", [_block("P1", 200, 0.0), _block("P2", 200, 1.0)])

    serial = CsvProcessingService.process(str(csv_path), str(tmp_path / "serial"), max_workers=1)
    fallback = CsvProcessingService.process(str(csv_path), str(tmp_path / "fallback"), max_workers=2)

    assert _comparable(fallback, tmp_path / "fallback") == _comparable(serial, tmp_path / "serial")


def test_small_csvs_stay_in_this_process(tmp_path, monkeypatch):
    monkeypatch.setattr(
        CsvProcessingService,
        "_run_in_pool",
        staticmethod(lambda jobs, workers: pytest.fail("pool started for a small CSV")),
    )
    csv_path = _write_csv(tmp_path / "small.csv", [_block("P1", 50, 0.0), _block("P2", 50, 1.0)])

    result = CsvProcessingService.process(str(csv_path), str(tmp_path / "out"), max_workers=8)

    assert [p.participant_code for p in result.participants] == ["P1", "P2"]


def _reference_is_header(line: str) -> bool:
    if not line.strip():
        return False
    _, cells = CsvProcessingService._header_cells(line)
    return any(CsvProcessingService._canonical_column(cell) == "time" for cell in cells)


def _reference_is_marker(line: str) -> bool:
    normalized = CsvProcessingService._norm(line)
    return normalized.startswith("grabación") or normalized.startswith("grabacion")


TRICKY_LINES = [
    "Time;GSR / GSR;",
    "TIMESTAMP,a,b",
    "x;  Tiempo  (s) ;y",
    "a;TIME (S)",
    '"Time";1',
    '"Ti"me;1',
    "'time';1",
    "a;TiMe",
    "time/x;1",
    "Tiempo de inicio : 1/01/2026 10:00:00 a. m.",
    "Ｔｉｍｅ;x",
    "Tiempo (s);x",
    "1,5;0;90;",
    "0,016667;20,0200;30,0300;1,5010;Stim A;",
    "Grabación : A001 | Rec 1",
    "Grabacion : B002 | Rec 1",
    '  "GRABACION: x',
    "x grabacion",
    "",
    "   ",
]


@pytest.mark.parametrize("line", TRICKY_LINES)
def test_ascii_shortcuts_agree_with_full_canonicalization(line):
    assert CsvProcessingService._is_header_line(line) == _reference_is_header(line)
    assert CsvProcessingService._is_recording_marker(line) == _reference_is_marker(line)


def _settings(**values) -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://postgres@127.0.0.1:5432/neurodatics",
        auth_jwt_secret="test-secret-that-is-long-enough-for-unit-tests",
        **values,
    )


GIB = 2**30


@pytest.mark.parametrize(
    ("cpus", "memory", "concurrent", "expected"),
    [
        (16, 8 * GIB, 1, 8),  # desktop, student edition: CPUs decide
        (4, 4 * GIB, 1, 2),  # reference laptop: half of 4 CPUs
        (2, 4 * GIB, 1, 1),  # two CPUs: stays in-process
        (8, 2 * GIB, 4, 1),  # server default: 2 GiB shared by 4 uploads
        (8, 4 * GIB, 2, 4),  # server with 4 GiB and 2 uploads
        (16, 3 * GIB, 1, 8),  # memory allows exactly 8 workers
        (16, 2 * GIB, 1, 4),  # memory caps before the CPUs do
        (8, None, 1, 1),  # memory unknown: no extra processes
    ],
)
def test_block_workers_follow_cpus_and_each_ingestions_memory_share(cpus, memory, concurrent, expected):
    assert machine_resources.block_workers_for(cpus, memory, concurrent) == expected


def test_container_limits_win_over_the_hosts_totals(tmp_path, monkeypatch):
    cgroup = tmp_path / "cgroup"
    cgroup.mkdir()
    (cgroup / "memory.max").write_text("2147483648", encoding="ascii")
    (cgroup / "cpu.max").write_text("200000 100000", encoding="ascii")
    monkeypatch.setattr(machine_resources, "_CGROUP", cgroup)
    monkeypatch.setattr("os.process_cpu_count", lambda: 32, raising=False)
    monkeypatch.setattr("os.cpu_count", lambda: 32)

    assert machine_resources.usable_memory() == 2 * GIB
    assert machine_resources.usable_cpus() == 2

    (cgroup / "memory.max").write_text("max", encoding="ascii")
    (cgroup / "cpu.max").write_text("max 100000", encoding="ascii")
    monkeypatch.setattr(machine_resources, "physical_memory", lambda: 16 * GIB)
    assert machine_resources.usable_memory() == 8 * GIB
    assert machine_resources.usable_cpus() == 32


def test_the_real_machine_is_probed():
    assert machine_resources.usable_cpus() >= 1
    assert (machine_resources.physical_memory() or 0) > GIB


def test_setting_sizes_workers_per_edition_unless_forced(tmp_path, monkeypatch):
    monkeypatch.setattr(machine_resources, "usable_cpus", lambda: 8)
    monkeypatch.setattr(machine_resources, "usable_memory", lambda: 2 * GIB)

    # Server: the 2 GiB are shared by UPLOAD_MAX_CONCURRENT_GLOBAL=4 ingestions.
    assert _settings().ingestion_block_worker_count == 1
    assert _settings(upload_max_concurrent_global=1).ingestion_block_worker_count == 4
    # Student edition: one user, one ingestion at a time.
    local = _settings(app_mode="local", local_data_dir=str(tmp_path))
    assert local.ingestion_block_worker_count == 4
    assert _settings(ingestion_block_workers=3).ingestion_block_worker_count == 3

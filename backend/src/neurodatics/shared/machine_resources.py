"""How many CPUs and how much memory this process may really use.

Inside a container the operating system still reports the host's CPUs and RAM, so
the cgroup limits are read first; on Windows and bare Linux the machine totals apply.
Every probe returns None when it cannot tell, and callers fall back to a safe value.
"""

from __future__ import annotations

import ctypes
import os
import sys
from pathlib import Path
from typing import Optional

# Measured on the SAIO export (six blocks, 232,759 lines): a block worker peaked at
# about 240 MiB and the app process at 640-800 MB during one ingestion.
BLOCK_WORKER_BYTES = 256 * 2**20
INGESTION_BASE_BYTES = 1024 * 2**20
# Without a container limit the rest of the machine (browser, OS, PostgreSQL) keeps half.
UNCONTAINED_MEMORY_SHARE = 0.5

_CGROUP = Path("/sys/fs/cgroup")


def _read(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="ascii").strip()
    except (OSError, ValueError):
        return None


def cgroup_memory_limit() -> Optional[int]:
    """The container's memory ceiling in bytes, or None when there is none."""
    for path in (_CGROUP / "memory.max", _CGROUP / "memory" / "memory.limit_in_bytes"):
        text = _read(path)
        if text and text.isdigit():
            limit = int(text)
            # cgroup v1 reports "unlimited" as a number near 2**63.
            return limit if limit < 2**60 else None
    return None


def cgroup_cpu_limit() -> Optional[float]:
    """CPUs the container's quota allows (may be fractional), or None."""
    text = _read(_CGROUP / "cpu.max")
    if text:
        quota, _, period = text.partition(" ")
        if quota.isdigit() and period.isdigit() and int(period):
            return int(quota) / int(period)
        return None
    quota_text = _read(_CGROUP / "cpu" / "cpu.cfs_quota_us")
    period_text = _read(_CGROUP / "cpu" / "cpu.cfs_period_us")
    if quota_text and period_text and quota_text.isdigit() and period_text.isdigit():
        if int(period_text):
            return int(quota_text) / int(period_text)
    return None


def physical_memory() -> Optional[int]:
    """Total RAM of the machine in bytes, or None."""
    if sys.platform == "win32":

        class _MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = _MemoryStatus()
        status.dwLength = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return int(status.ullTotalPhys)
        return None
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (AttributeError, OSError, ValueError):
        return None


def usable_cpus() -> int:
    cpus = getattr(os, "process_cpu_count", os.cpu_count)() or 1
    quota = cgroup_cpu_limit()
    if quota is not None:
        cpus = min(cpus, max(1, int(quota)))
    return cpus


def usable_memory() -> Optional[int]:
    limit = cgroup_memory_limit()
    if limit is not None:
        return limit
    total = physical_memory()
    return int(total * UNCONTAINED_MEMORY_SHARE) if total else None


def block_workers_for(cpus: int, memory_bytes: Optional[int], concurrent_ingestions: int) -> int:
    """Worker processes one ingestion may start: half the CPUs, within its memory share.

    Every ingestion that may run at once gets an equal share of the memory; one
    ingestion needs its base, and each worker a block's peak on top.
    """
    by_cpu = max(1, cpus // 2)
    if memory_bytes is None:
        return 1
    share = memory_bytes // max(1, concurrent_ingestions)
    by_memory = (share - INGESTION_BASE_BYTES) // BLOCK_WORKER_BYTES
    return max(1, min(by_cpu, int(by_memory)))

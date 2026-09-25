"""Refuse and record every non-loopback connection this process tries to make.

The student edition promises to work with no network. This is how that promise is checked from
inside the process: a run with the guard installed that ends with an empty ``BLOCKED`` list never
tried to leave the machine through Python.

It covers the synchronous socket path and asyncio. asyncio needs its own hooks: on Windows the
default event loop connects through overlapped I/O (``ConnectEx``), which never calls
``socket.socket.connect``, so guarding only the socket module leaves the served app - the async
part - unwatched. It cannot see native code (ffmpeg, Typst) or another process, so runs also
sample the operating system's connection table.
"""

from __future__ import annotations

import importlib
import socket
from typing import Callable, List

BLOCKED: List[str] = []

_LOOPBACK_NAMES = {"localhost", "::1", ""}


def is_loopback(host: object) -> bool:
    text = str(host)
    return text in _LOOPBACK_NAMES or text.startswith("127.")


def _host_of(address: object) -> object:
    return address[0] if isinstance(address, tuple) else address


def install() -> Callable[[], None]:
    """Start guarding; the returned function puts every original back."""
    originals = {
        "connect": socket.socket.connect,
        "connect_ex": socket.socket.connect_ex,
        "getaddrinfo": socket.getaddrinfo,
    }
    loop_classes = []
    for module, name in (
        ("asyncio.selector_events", "BaseSelectorEventLoop"),
        ("asyncio.proactor_events", "BaseProactorEventLoop"),
    ):
        try:
            loop_classes.append(getattr(importlib.import_module(module), name))
        except (ImportError, AttributeError):
            continue
    original_sock_connect = {cls: cls.sock_connect for cls in loop_classes}

    def guarded_connect(self, address):
        host = _host_of(address)
        if not is_loopback(host):
            BLOCKED.append(f"connect {host}")
            raise OSError(f"offline guard refused connect to {host}")
        return originals["connect"](self, address)

    def guarded_connect_ex(self, address):
        host = _host_of(address)
        if not is_loopback(host):
            BLOCKED.append(f"connect_ex {host}")
            return 10065  # WSAEHOSTUNREACH
        return originals["connect_ex"](self, address)

    def guarded_getaddrinfo(host, *args, **kwargs):
        if host is not None and not is_loopback(host):
            BLOCKED.append(f"getaddrinfo {host}")
            raise socket.gaierror(f"offline guard refused lookup of {host}")
        return originals["getaddrinfo"](host, *args, **kwargs)

    def guard_loop(original):
        async def guarded_sock_connect(self, sock, address):
            host = _host_of(address)
            if not is_loopback(host):
                BLOCKED.append(f"asyncio connect {host}")
                raise OSError(f"offline guard refused connect to {host}")
            return await original(self, sock, address)

        return guarded_sock_connect

    socket.socket.connect = guarded_connect
    socket.socket.connect_ex = guarded_connect_ex
    socket.getaddrinfo = guarded_getaddrinfo
    for cls, original in original_sock_connect.items():
        cls.sock_connect = guard_loop(original)

    def restore() -> None:
        socket.socket.connect = originals["connect"]
        socket.socket.connect_ex = originals["connect_ex"]
        socket.getaddrinfo = originals["getaddrinfo"]
        for cls, original in original_sock_connect.items():
            cls.sock_connect = original

    return restore


__all__ = ["BLOCKED", "install", "is_loopback"]

"""The one program students run, and the checks that prove a build is sound.

    neurodatics-estudiantes.exe                  start the app (what a double-click does)
    neurodatics-estudiantes.exe serve [options]  the same, with options (see --help)
    neurodatics-estudiantes.exe selftest | pg-check | pg-adopt | http-check ...   build gates
"""
from __future__ import annotations

import multiprocessing
import sys
import traceback

CHECKS = {"selftest", "pg-check", "pg-adopt", "http-check"}


def double_click(launch) -> int:
    """No arguments means a student opened the exe: a failure must stay readable.

    The console closes with the program, so an error would flash and vanish. Build gates always
    pass arguments and never wait here.
    """
    try:
        code = launch([])
    except Exception:
        traceback.print_exc()
        print("NeuroDatics no pudo iniciar.", file=sys.stderr)
        code = 2
    if code:
        try:
            input("Pulsa Enter para cerrar esta ventana.")
        except (EOFError, OSError, RuntimeError):
            pass
    return code


def main() -> int:
    multiprocessing.freeze_support()  # frozen child processes must not start a second app
    argv = sys.argv[1:]
    command = argv[0] if argv and not argv[0].startswith("-") else "serve"
    rest = argv[1:] if argv and not argv[0].startswith("-") else argv

    if command == "serve":
        from neurodatics.local.launcher import main as launch

        if argv:
            return launch(rest)
        return double_click(launch)
    if command not in CHECKS:
        print(f"unknown command {command!r}; use serve or one of {sorted(CHECKS)}")
        return 2

    sys.argv = [sys.argv[0]] + rest
    if command == "selftest":
        import selftest

        return selftest.main()
    if command == "http-check":
        import http_check

        return http_check.main(rest)
    import pg_check

    return pg_check.main(command, rest)


if __name__ == "__main__":
    sys.exit(main())

r"""Fail if a PostgreSQL binary in the package imports a Visual C++ runtime DLL that does not travel with it.

    <build-venv>\Scripts\python.exe student\check-pe-imports.py --pgsql <package folder>\_internal\pgsql

The build machine has the Visual C++ Redistributable in System32, so a missing runtime DLL never shows
there: postgres.exe starts anyway, and only a clean Windows says "MSVCP140.dll was not found". This reads
the import tables of every program and library under bin\ and lib\ instead of trusting what loads here.
Windows itself (System32, minus the redistributable) and the procedural-language extensions, which need
a Perl, Python or Tcl install the package never uses, are not required to travel.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import re
import sys

import pefile

VC_RUNTIME = re.compile(r"^(msvcp|vcruntime|concrt|vcomp|vccorlib)\d", re.IGNORECASE)
# plperl, plpython3 and pltcl and their transforms: loaded only by CREATE EXTENSION, which nothing runs.
OPTIONAL = re.compile(r"^(perl\d+|python3\d*|tcl\d+t?)\.dll$", re.IGNORECASE)
SYSTEM32 = pathlib.Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"


def imports(path: pathlib.Path) -> list[str]:
    pe = pefile.PE(str(path), fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]])
    return [entry.dll.decode().lower() for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pgsql", required=True, type=pathlib.Path)
    args = parser.parse_args()
    bin_dir = args.pgsql / "bin"
    shipped = {p.name.lower() for p in bin_dir.iterdir() if p.is_file()}
    missing: dict[str, set[str]] = {}
    binaries = [p for d in (bin_dir, args.pgsql / "lib") for p in d.iterdir() if p.suffix.lower() in (".exe", ".dll")]
    for binary in binaries:
        for name in imports(binary):
            if name in shipped or name.startswith(("api-ms-", "ext-ms-")) or OPTIONAL.match(name):
                continue
            if not VC_RUNTIME.match(name) and (SYSTEM32 / name).exists():
                continue
            missing.setdefault(name, set()).add(binary.name)
    print(f"checked the imports of {len(binaries)} PostgreSQL binaries")
    for name, users in sorted(missing.items()):
        print(f"  MISSING {name}  (imported by {', '.join(sorted(users))})")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())

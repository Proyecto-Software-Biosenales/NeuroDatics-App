"""List imported DLLs that are neither shipped beside the binary nor part of Windows itself."""
import os
import pathlib
import sys

import pefile

pkg = pathlib.Path(sys.argv[1])
system32 = pathlib.Path(os.environ["SystemRoot"]) / "System32"
VC_RUNTIME = ("vcruntime", "msvcp", "concrt", "vcomp", "vccorlib", "msvcr")


def imports(path: pathlib.Path) -> set[str]:
    pe = pefile.PE(str(path), fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]])
    return {entry.dll.decode().lower() for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])}


def audit(label: str, root: pathlib.Path, patterns: tuple[str, ...]) -> None:
    files = [p for pat in patterns for p in root.glob(pat)]
    shipped = {p.name.lower() for p in root.rglob("*.dll")} | {p.name.lower() for p in root.rglob("*.pyd")}
    needed: dict[str, set[str]] = {}
    for f in files:
        try:
            for dll in imports(f):
                needed.setdefault(dll, set()).add(f.name)
        except Exception as exc:  # unreadable PE: report, do not hide
            print(f"   cannot parse {f.name}: {exc}")
    missing = {d: users for d, users in needed.items() if d not in shipped and not d.startswith("api-ms-win-")}
    outside_windows_core = {}
    for dll, users in sorted(missing.items()):
        here = (system32 / dll).exists()
        outside_windows_core[dll] = (here, users)
    print(f"== {label}: {len(files)} binaries, {len(needed)} distinct imported DLLs")
    vc = {d: v for d, v in outside_windows_core.items() if d.startswith(VC_RUNTIME)}
    other = {d: v for d, v in outside_windows_core.items() if not d.startswith(VC_RUNTIME)}
    print("   Visual C++ runtime DLLs imported but NOT shipped beside the binaries:")
    for d, (here, users) in vc.items():
        print(f"     {d:22s} present in System32 on this machine: {here}   used by {len(users)} binaries e.g. {sorted(users)[:3]}")
    if not vc:
        print("     none")
    print("   other DLLs not shipped (expected: Windows components):", sorted(other))


audit("pgsql/bin", pkg / "pgsql" / "bin", ("*.exe",))
audit("pgsql/lib", pkg / "pgsql" / "lib", ("*.dll",))
audit("tools (ffmpeg/ffprobe)", pkg / "tools", ("*.exe",))
audit("frozen runtime top level", pkg, ("*.exe",))
internal = pkg / "_internal"
shipped_vc = sorted(p.name for p in internal.glob("*.dll") if p.name.lower().startswith(VC_RUNTIME))
print("VC runtime DLLs shipped in _internal:", shipped_vc)
print("VC runtime DLLs shipped in pgsql/bin:", sorted(p.name for p in (pkg / "pgsql" / "bin").glob("*.dll") if p.name.lower().startswith(VC_RUNTIME)))

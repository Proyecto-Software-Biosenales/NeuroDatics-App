r"""Write THIRD-PARTY-NOTICES.txt for the student package from what is actually inside it.

    <build-venv>\Scripts\python.exe student\make-notices.py --pkg <package folder> --out <file>

Python components come from the build venv's installed metadata (the packages the frozen program
was built from), web components from frontend/package.json plus each package's own license field,
and the ffmpeg section from the binary that is really in tools\ (a GPL build and an LGPL build
carry different obligations, so the text is derived, not assumed). The license *texts* that the
GPL and LGPL require to accompany a binary are not generated: the package report lists them as
blockers when they are missing.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys
from importlib import metadata

REPO = pathlib.Path(__file__).resolve().parents[1]


def python_license(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    expression = meta.get("License-Expression")
    if expression:
        return expression.strip()
    declared = (meta.get("License") or "").strip()
    if declared and len(declared) <= 60 and "\n" not in declared:
        return declared
    classifiers = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    if classifiers:
        return "; ".join(classifiers)
    return declared.splitlines()[0][:60] if declared else "see the package"


def python_components(requirements: pathlib.Path) -> list[tuple[str, str, str]]:
    rows = []
    for line in requirements.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Za-z0-9_.\-]+)==", line.strip())
        if not match:
            continue
        try:
            dist = metadata.distribution(match.group(1))
        except metadata.PackageNotFoundError:
            continue
        rows.append((dist.metadata["Name"], dist.version, python_license(dist)))
    return sorted(rows, key=lambda row: row[0].lower())


def web_components(frontend: pathlib.Path) -> list[tuple[str, str, str]]:
    package = json.loads((frontend / "package.json").read_text(encoding="utf-8"))
    rows = []
    for name in sorted(package.get("dependencies", {})):
        manifest = frontend / "node_modules" / name / "package.json"
        if not manifest.is_file():
            rows.append((name, "?", "not installed here"))
            continue
        info = json.loads(manifest.read_text(encoding="utf-8"))
        declared = info.get("license") or info.get("licenses") or "see the package"
        rows.append((name, info.get("version", "?"), declared if isinstance(declared, str) else json.dumps(declared)))
    return rows


def ffmpeg_section(tools: pathlib.Path) -> list[str]:
    exe = tools / "ffmpeg.exe"
    if not exe.is_file():
        return ["ffmpeg: not included in this package."]
    banner = subprocess.run([str(exe), "-version"], capture_output=True, text=True, timeout=30).stdout
    first = banner.splitlines()[0] if banner else "ffmpeg (version unknown)"
    gpl = "--enable-gpl" in banner
    version3 = "--enable-version3" in banner
    lines = [
        "ffmpeg and ffprobe (tools\\)",
        f"  {first}",
        "  Project: https://ffmpeg.org/  -  builds: https://www.gyan.dev/ffmpeg/builds/",
        "  NeuroDatics only starts these programs as separate processes, to read the size of a video and",
        "  to extract one still image from it. It does not link against them.",
    ]
    if gpl:
        lines += [
            "  This build was configured with --enable-gpl" + (" --enable-version3" if version3 else "")
            + ", so it is licensed under the GNU General Public License"
            + (", version 3" if version3 else "") + ".",
            "  The complete license text must accompany the binary (tools\\LICENSE-ffmpeg.txt) and the corresponding",
            "  source code is available from the project and build site above; the maintainers of this package",
            "  will provide it on request for at least three years.",
        ]
    else:
        lines += [
            "  This build was configured without --enable-gpl, so it is licensed under the GNU Lesser General",
            "  Public License, version 2.1 or later. The license text must accompany the binary",
            "  (tools\\LICENSE-ffmpeg.txt); the source is available from the project and build site above.",
        ]
    return lines


FIXED = """\
NeuroDatics Estudiantes bundles the following software. Each keeps its own license.

PostgreSQL 16 (pgsql\\, pg-template\\)
  Database server, from the EnterpriseDB binary distribution of PostgreSQL 16.
  Licensed under the PostgreSQL License (a permissive license similar to BSD/MIT).
  https://www.postgresql.org/about/licence/

Python runtime (_internal\\)
  The interpreter and standard library are licensed under the Python Software Foundation License.
  https://docs.python.org/3/license.html

Microsoft Visual C++ Redistributable (vcruntime140*.dll, msvcp140*.dll)
  Redistributed under Microsoft's Visual C++ Redistributable terms so that the program starts on a
  computer that does not have it installed.

Poppins typeface (frontend\\fonts\\)
  Copyright The Poppins Project Authors. SIL Open Font License 1.1 (the text is in frontend\\fonts\\OFL.txt).
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pkg", required=True, help="the assembled package folder")
    parser.add_argument("--out", required=True)
    parser.add_argument("--requirements", default=str(REPO / "student" / "requirements-frozen.txt"))
    args = parser.parse_args()
    pkg = pathlib.Path(args.pkg)

    out = ["THIRD-PARTY NOTICES", "=" * 19, "", FIXED]
    out += ffmpeg_section(pkg / "tools") + [""]
    out += ["Python libraries (from the build environment; the program may use only some of them)", ""]
    out += [f"  {name} {version}: {license_}" for name, version, license_ in python_components(pathlib.Path(args.requirements))]
    out += ["", "Web application libraries (frontend\\)", ""]
    out += [f"  {name} {version}: {license_}" for name, version, license_ in web_components(REPO / "frontend")]
    out += ["", "Each library's full license text is in its own distribution and available from its project page.", ""]
    text = "\r\n".join(out)
    pathlib.Path(args.out).write_text(text, encoding="utf-8-sig", newline="")
    print(f"notices: {len(text.splitlines())} lines -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

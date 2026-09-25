"""Fail when the student edition's direct pins differ from the environment the tests run on.

    .venv/Scripts/python.exe student/check-pins.py [--against path/to/other/python.exe]

The backend suite, its goldens and its numeric characterization run in the root .venv. A
package that computes results must be the same version in the frozen build, otherwise "the
tests passed" says nothing about what a student sees. Build tools (pyinstaller) are exempt.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

BUILD_ONLY = {"pyinstaller"}


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def installed(python: str) -> dict[str, str]:
    out = subprocess.run([python, "-m", "pip", "freeze"], capture_output=True, text=True, check=True).stdout
    versions = {}
    for line in out.splitlines():
        name, separator, version = line.partition("==")
        if separator:
            versions[normalize(name)] = version.strip()
    return versions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--against", default=sys.executable, help="python of the environment the tests run on")
    args = parser.parse_args()

    tested = installed(args.against)
    requirements = pathlib.Path(__file__).with_name("requirements.txt")
    problems = []
    for line in requirements.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, version = re.sub(r"\[.*?\]", "", line).partition("==")
        name = normalize(name)
        if name in BUILD_ONLY:
            continue
        if tested.get(name) != version:
            problems.append(f"{name}: student pins {version}, tests run {tested.get(name, 'not installed')}")
    for problem in problems:
        print("DRIFT", problem)
    print("pins match the tested environment" if not problems else f"{len(problems)} pin(s) differ")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

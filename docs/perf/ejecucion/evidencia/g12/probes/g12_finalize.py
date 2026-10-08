"""Generate G12 preservation, manifest and textual patch against its received snapshot."""

from __future__ import annotations

import difflib
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
EVIDENCE = ROOT / "docs/perf/ejecucion/evidencia/g12"
BASE = ROOT / "output/perf-g12/base"
EXPECTED_RECEIVED_CHANGES = {
    "docs/CHANGELOG.md",
    "docs/perf/ejecucion/ESTADO.md",
}
PATCH_PATHS = [
    "docs/CHANGELOG.md",
    "docs/perf/ejecucion/ESTADO.md",
    "docs/perf/ejecucion/G12.md",
    "docs/perf/ejecucion/RESULTADOS.md",
    "docs/perf/ejecucion/evidencia/g12/CONTRATOS.md",
    "docs/perf/ejecucion/evidencia/g12/DIAGNOSTICO-GATE.md",
    "docs/perf/ejecucion/evidencia/g12/frontend-build-source-equivalence.json",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_backend.py",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_browser.mjs",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_compare.py",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_finalize.py",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_frontend.ps1",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_integrated_composition.py",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_local_frontend.ps1",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_media_report.py",
    "docs/perf/ejecucion/evidencia/g12/probes/g12_resource_composition.py",
]
CONTROL_NAMES = {
    "inventario-inicial.json",
    "snapshot-scope.json",
    "reconciliacion-cuota.json",
    "manifiesto-final.json",
    "preservacion.json",
    "own.patch",
    "reverse-check.log",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def preservation() -> dict:
    inventory = json.loads((EVIDENCE / "inventario-inicial.json").read_text(encoding="utf-8"))
    missing = []
    changed = []
    for row in inventory["files"]:
        path = ROOT / row["path"]
        if not path.is_file():
            missing.append(row["path"])
            continue
        current = sha256(path)
        if current != row["sha256"]:
            changed.append({
                "path": row["path"],
                "before": row["sha256"],
                "after": current,
                "expected": row["path"] in EXPECTED_RECEIVED_CHANGES,
            })
    unexpected = [row for row in changed if not row["expected"]]
    assert not missing and not unexpected
    assert {row["path"] for row in changed} == EXPECTED_RECEIVED_CHANGES
    return {
        "source": "inventario-inicial.json",
        "checked": len(inventory["files"]),
        "unchanged": len(inventory["files"]) - len(changed),
        "expected_changes": changed,
        "missing": missing,
        "unexpected_drift": unexpected,
        "result": "all received files preserved except the two authorized G12 documentation updates",
        "excluded_controls": inventory["excludes"],
    }


def textual_patch() -> str:
    chunks = []
    for relative in PATCH_PATHS:
        current = ROOT / relative
        assert current.is_file(), relative
        baseline = BASE / relative
        old = baseline.read_text(encoding="utf-8").splitlines(keepends=True) if baseline.is_file() else []
        new = current.read_text(encoding="utf-8").splitlines(keepends=True)
        if old == new:
            continue
        chunks.extend(difflib.unified_diff(
            old,
            new,
            fromfile=f"a/{relative}" if baseline.is_file() else "/dev/null",
            tofile=f"b/{relative}",
            lineterm="\n",
        ))
    return "".join(chunks)


def manifest() -> dict:
    paths = [
        ROOT / "docs/CHANGELOG.md",
        ROOT / "docs/perf/ejecucion/ESTADO.md",
        ROOT / "docs/perf/ejecucion/G12.md",
        ROOT / "docs/perf/ejecucion/RESULTADOS.md",
    ]
    for path in EVIDENCE.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        relative = path.relative_to(EVIDENCE)
        name = relative.as_posix()
        if relative.name in CONTROL_NAMES:
            continue
        if name.startswith("agente-") or name.endswith(".stderr.log") or name.endswith(".jsonl"):
            continue
        paths.append(path)
    rows = []
    for path in sorted(set(paths)):
        rows.append({
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        })
    return {
        "scope": "G12 docs, probes and evidence; root controls, live agent logs and self-referential final controls excluded",
        "count": len(rows),
        "files": rows,
    }


def main():
    preserved = preservation()
    (EVIDENCE / "preservacion.json").write_text(
        json.dumps(preserved, indent=2), encoding="utf-8"
    )
    patch = textual_patch()
    assert patch
    (EVIDENCE / "own.patch").write_text(patch, encoding="utf-8", newline="\n")
    owned = manifest()
    (EVIDENCE / "manifiesto-final.json").write_text(
        json.dumps(owned, indent=2), encoding="utf-8"
    )
    print(json.dumps({
        "preservation_checked": preserved["checked"],
        "unchanged": preserved["unchanged"],
        "expected_changes": len(preserved["expected_changes"]),
        "manifest_files": owned["count"],
        "patch_bytes": len(patch.encode("utf-8")),
    }, indent=2))


if __name__ == "__main__":
    main()

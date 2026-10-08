"""Build a field-for-field G00 -> G12 comparison without rerunning probes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
EVIDENCE = ROOT / "docs/perf/ejecucion/evidencia"


def load(relative: str):
    path = EVIDENCE / relative
    return path, json.loads(path.read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def delta(before: float, after: float) -> float:
    return (after - before) * 100 / before


def result_rows(before, after, family: str):
    before_by_name = {row["name"]: row for row in before}
    after_by_name = {row["name"]: row for row in after}
    assert set(before_by_name) == set(after_by_name)
    rows = []
    for name in before_by_name:
        old = before_by_name[name]
        new = after_by_name[name]
        assert old["n"] == new["n"] == 5
        rows.append({
            "family": family,
            "case": name,
            "comparable": True,
            "protocol": "same named case, corpus/parameters/phase, warmup=1, n=5, Python 3.14/PyArrow 25",
            "g00": {
                "median_ms": old["median_ms"],
                "min_ms": old["min_ms"],
                "max_ms": old["max_ms"],
                "counts": old["samples"][0].get("counts", {}),
            },
            "g12": {
                "median_ms": new["median_ms"],
                "min_ms": new["min_ms"],
                "max_ms": new["max_ms"],
                "counts": new["samples"][0].get("counts", {}),
            },
            "median_delta_percent": delta(old["median_ms"], new["median_ms"]),
        })
    return rows


def main():
    g00_backend_path, g00_backend = load("g00/backend-baseline.json")
    g12_backend_path, g12_backend = load("g12/backend-g12.json")
    g00_media_path, g00_media = load("g00/media-report-baseline.json")
    g12_media_path, g12_media = load("g12/media-report-g12.json")
    g00_browser_path, g00_browser = load("g00/browser-baseline.json")
    g12_browser_path, g12_browser = load("g12/browser-g12.json")

    rows = result_rows(g00_backend["results"], g12_backend["results"], "backend")
    rows.extend(result_rows(g00_media["results"], g12_media["results"], "media_report"))

    g00_steps = {row["step"]: row for row in g00_browser["summary"]}
    for new in g12_browser["summary"]:
        old = g00_steps.get(new["step"])
        if old is None:
            rows.append({
                "family": "browser",
                "case": new["step"],
                "comparable": False,
                "reason": "G00 predates comparison-charts-v3; G12 retains this as current-contract evidence only",
                "g12": new,
            })
            continue
        assert old["n"] == new["n"] == 5
        rows.append({
            "family": "browser",
            "case": new["step"],
            "comparable": True,
            "protocol": "same G00-UI dimensions, viewport/DPR, 20 ms API delay, UI phase, warmup=1 and n=5; G12 mocks add required current project-detail/v3 shapes",
            "g00": old,
            "g12": new,
            "median_delta_percent": delta(old["median_ms"], new["median_ms"]),
            "request_count_delta": new["request_counts"][0] - old["request_counts"][0],
            "fixture_bytes_delta": new["bytes"][0] - old["bytes"][0],
        })

    output = {
        "scope": "comparison of preserved G00 and G12 JSON only; no probe rerun",
        "runtime": {
            "g00_python": g00_backend["python"],
            "g12_python": g12_backend["python"],
            "g00_versions": g00_backend["versions"],
            "g12_versions": g12_backend["versions"],
            "io_delay_ms": [g00_backend["io_delay_ms_per_download"], g12_backend["io_delay_ms_per_download"]],
        },
        "source_sha256": {
            str(path.relative_to(ROOT)).replace("\\", "/"): digest(path)
            for path in (
                g00_backend_path,
                g12_backend_path,
                g00_media_path,
                g12_media_path,
                g00_browser_path,
                g12_browser_path,
            )
        },
        "rows": rows,
        "interpretation_limits": [
            "fixture response bytes are not production transfer savings",
            "timing deltas are medians of n=5 and are descriptive; ranges remain authoritative",
            "direct bytes, Pydantic models and transferred bytes are not summed",
            "comparison-charts-v3 has no G00 row and is not assigned a synthetic baseline",
            "PostgreSQL, Redis, Drive, cloud and frozen-package equivalence are not inferred",
        ],
    }
    target = EVIDENCE / "g12/comparison-g00-g12.json"
    target.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(target),
        "rows": len(rows),
        "comparable": sum(row["comparable"] for row in rows),
        "not_comparable": sum(not row["comparable"] for row in rows),
    }, indent=2))


if __name__ == "__main__":
    main()

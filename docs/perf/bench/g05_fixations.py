"""Offline G05 comparison: exact G00 corpus, collect and EyeTracker PDF."""
import argparse
import hashlib
import importlib.util
import json
import platform
import tempfile
from dataclasses import fields, is_dataclass
from pathlib import Path

import g00_backend as baseline
import numpy as np
import pandas as pd
import pyarrow
import pytest
from neurodatics.modules.reports.application.sensor_reports import eye_tracking
from neurodatics.modules.reports.infrastructure.pdf_adapter import PDFAdapter


def normalize(value):
    if isinstance(value, pd.DataFrame):
        return json.loads(value.to_json(orient="split", double_precision=15))
    if isinstance(value, np.ndarray):
        return normalize(value.tolist())
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    if is_dataclass(value):
        return {f.name: normalize(getattr(value, f.name)) for f in fields(value) if f.name != "participant"}
    if isinstance(value, (float, np.floating)) and not np.isfinite(value):
        return str(value)
    return value


def compact_equivalence(values):
    """Persist checksums rather than millions of synthetic waveform numbers."""
    compact = {}
    for key, value in values.items():
        if key == "asset_hashes":
            compact[key] = value
            continue
        encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        compact[key] = {"sha256": hashlib.sha256(encoded).hexdigest(), "serialized_bytes": len(encoded)}
    return compact


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("before", "after"), required=True)
    args = parser.parse_args()
    root = baseline.ROOT
    output = root / "docs/perf/ejecucion/evidencia/g05"
    runtime = root / "output/perf-g05"
    runtime.mkdir(parents=True, exist_ok=True)
    fixture = baseline.load_fixture_module()
    spec = importlib.util.spec_from_file_location("g05_report_fixture", root / "backend/tests/characterization/test_sensor_reports.py")
    report_fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(report_fixture)
    result = {"phase": args.phase, "runtime": {"python": platform.python_version(), "pandas": pd.__version__,
              "numpy": np.__version__, "pyarrow": pyarrow.__version__}, "measurements": [], "equivalence": {}}
    with tempfile.TemporaryDirectory(prefix="corpus-", dir=runtime) as temporary:
        class Factory:
            def mktemp(self, name):
                target = Path(temporary) / name
                target.mkdir()
                return target
        corpus = fixture.corpus.__wrapped__(Factory())
        aois = fixture.aois.__wrapped__()
        base = corpus.frames["SYN-01"]
        pieces = []
        for block in range(64):
            part = base.copy(deep=True)
            part["time"] += block * 16
            for column in ("segment_id", "fixation_segment_id"):
                if column in part:
                    part[column] = part[column].astype(str) + f"-block-{block}"
            for column in part.columns:
                if column == "fixation_id" or column.startswith("fixation_id__"):
                    part[column] = part[column] + block * 10000
            pieces.append(part)
        large = pd.concat(pieces, ignore_index=True)
        large.attrs = dict(base.attrs)
        for index in range(16):
            large[f"g00_unused_{index:02d}"] = np.sin(np.arange(len(large), dtype=float) / (index + 5))
        corpora = {"small": corpus.frames, "large": {f"SYN-L{index:02d}": large.copy(deep=True) for index in range(4)}}
        original = eye_tracking.FixationEventService.build_events
        def counted(*a, **kw):
            baseline.COUNTERS["event_builds"] += 1
            return original(*a, **kw)
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(eye_tracking.FixationEventService, "build_events", staticmethod(counted))
            for label, frames in corpora.items():
                context = report_fixture._context(frames, aois, "EyeTracker", group=True)
                def collect(context=context, label=label):
                    recordings = [eye_tracking.collect(p, s) for s in context.scenarios for p in context.participants]
                    result["equivalence"][label] = normalize(recordings)
                    return recordings
                result["measurements"].append(baseline.measure(f"{label}/group_collect", collect, 5))
                if label == "small":
                    def pdf(context=context):
                        document = eye_tracking.build(context)
                        result["equivalence"]["render_inputs"] = document.as_json()
                        result["equivalence"]["asset_hashes"] = {key: hashlib.sha256(value).hexdigest() for key, value in document.assets.items()}
                        rendered = PDFAdapter().render(document.as_json(), document.assets, timestamp=context.generated_at)
                        assert rendered.startswith(b"%PDF")
                        baseline.COUNTERS["report_assets"] += len(document.assets)
                        baseline.COUNTERS["pdf_bytes"] += len(rendered)
                        return rendered
                    result["measurements"].append(baseline.measure("small/build_figures_pdf", pdf, 5))
    # Outside the timed operations: normalize persisted evidence size only.
    result["equivalence"] = compact_equivalence(result["equivalence"])
    if args.phase == "after":
        before = json.loads((output / "before.json").read_text(encoding="utf-8"))
        assert result["runtime"] == before["runtime"]
        assert result["equivalence"] == before["equivalence"], "Scientific/render inputs changed"
        result["equivalent_to_before"] = True
    (output / f"{args.phase}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"phase": args.phase, "equivalent": result.get("equivalent_to_before"),
                      "measurements": [{k: row[k] for k in ("name", "n", "median_ms", "min_ms", "max_ms")} for row in result["measurements"]]}, indent=2))


if __name__ == "__main__":
    main()

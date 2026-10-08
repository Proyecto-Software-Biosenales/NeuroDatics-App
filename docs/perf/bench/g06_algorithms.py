"""Offline G06 comparison over the G00 corpus and affected flows.

Run from the repository root. One warm-up plus five retained samples are used.
No database, Redis, Drive, user data, dependency, or deployment is touched.
"""

import argparse
import hashlib
import json
import platform
import tempfile
from dataclasses import fields, is_dataclass
from pathlib import Path
from types import SimpleNamespace

import g00_backend as baseline
import numpy as np
import pandas as pd
import pyarrow
import pytest
from neurodatics.modules.analytics.api import routes as analytics_routes
from neurodatics.modules.analytics.application.services.aoi_analytics_service import (
    AoiAnalyticsService,
)
from neurodatics.modules.analytics.application.services.fixation_analytics_service import (
    FixationEventService,
)
from neurodatics.modules.reports.application.sensor_reports import common, eye_tracking


def normalize(value):
    if isinstance(value, pd.DataFrame):
        return json.loads(value.to_json(orient="split", double_precision=15))
    if isinstance(value, np.ndarray):
        return normalize(value.tolist())
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    if is_dataclass(value):
        return {
            field.name: normalize(getattr(value, field.name))
            for field in fields(value)
            if field.name != "participant"
        }
    if isinstance(value, (float, np.floating)) and not np.isfinite(value):
        return str(value)
    return value


def compact(values):
    output = {}
    for key, value in values.items():
        encoded = json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        output[key] = {
            "sha256": hashlib.sha256(encoded).hexdigest(),
            "serialized_bytes": len(encoded),
        }
    return output


def aois():
    return [
        SimpleNamespace(
            id="left",
            name="01 Left",
            color="#2563EB",
            shape_type="rect",
            shape={"x": 0, "y": 0, "width": 55, "height": 100},
        ),
        SimpleNamespace(
            id="right",
            name="02 Right",
            color="#16A34A",
            shape_type="rect",
            shape={"x": 45, "y": 0, "width": 55, "height": 100},
        ),
        SimpleNamespace(
            id="ellipse",
            name="03 Ellipse",
            color="#F59E0B",
            shape_type="circle",
            shape={"x": 20, "y": 15, "width": 60, "height": 70},
        ),
        SimpleNamespace(
            id="point",
            name="04 Degenerate rect",
            color="#8B5CF6",
            shape_type="rect",
            shape={"x": 50, "y": 50, "width": 0, "height": 0},
        ),
        SimpleNamespace(
            id="degenerate-ellipse",
            name="05 Degenerate ellipse",
            color="#EC4899",
            shape_type="circle",
            shape={"x": 50, "y": 50, "width": 0, "height": 20},
        ),
        SimpleNamespace(
            id="polygon",
            name="06 Polygon",
            color="#0F766E",
            shape_type="polygon",
            shape={
                "points": [
                    {"x": 10, "y": 10},
                    {"x": 40, "y": 15},
                    {"x": 35, "y": 45},
                    {"x": 12, "y": 40},
                ]
            },
        ),
    ]


def shape_mask(shape, x, y):
    helper = getattr(AoiAnalyticsService, "_mask_for_shape", None)
    if helper is not None:
        return helper(shape, x, y)
    finite = np.isfinite(x) & np.isfinite(y)
    return np.asarray(
        [
            bool(valid) and AoiAnalyticsService._contains(shape, x_value, y_value)
            for x_value, y_value, valid in zip(x, y, finite)
        ],
        dtype=bool,
    )


def build_large(base):
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
    result = pd.concat(pieces, ignore_index=True)
    result.attrs = dict(base.attrs)
    for index in range(16):
        result[f"g00_unused_{index:02d}"] = np.sin(
            np.arange(len(result), dtype=float) / (index + 5)
        )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("before", "after"), required=True)
    args = parser.parse_args()
    root = baseline.ROOT
    output = root / "docs/perf/ejecucion/evidencia/g06"
    runtime = root / "output/perf-g06"
    runtime.mkdir(parents=True, exist_ok=True)
    fixture = baseline.load_fixture_module()
    result = {
        "phase": args.phase,
        "runtime": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "pyarrow": pyarrow.__version__,
        },
        "protocol": {"warmup": 1, "retained_samples": 5},
        "measurements": [],
        "equivalence": {},
        "limits": [
            "synthetic G00 corpus; no real DB/Redis/Drive or user data",
            "RSS is a process snapshot and lifetime peak, not per-operation peak",
            "HTTP uses the in-process characterized route fixture without response cache",
            "polygon membership retains the scalar fallback",
        ],
    }

    rng = np.random.default_rng(20261002)
    x = rng.uniform(-0.1, 1.1, 300_000).astype(np.float64)
    y = rng.uniform(-0.1, 1.1, 300_000).astype(np.float64)
    x[::997] = np.nan
    y[::991] = np.inf
    shapes = {
        "rectangle": {"x": 20.0, "y": 15.0, "width": 50.0, "height": 60.0, "type": "rect"},
        "ellipse": {"x": 20.0, "y": 15.0, "width": 50.0, "height": 60.0, "type": "circle"},
        "polygon": {
            "x": 10.0,
            "y": 10.0,
            "width": 40.0,
            "height": 45.0,
            "type": "polygon",
            "points": [
                {"x": 10.0, "y": 10.0},
                {"x": 50.0, "y": 20.0},
                {"x": 40.0, "y": 55.0},
                {"x": 15.0, "y": 45.0},
            ],
        },
    }
    for name, shape in shapes.items():
        def membership(shape=shape, name=name):
            mask = shape_mask(shape, x, y)
            result["equivalence"][f"mask/{name}"] = normalize(mask)
            return mask

        result["measurements"].append(
            baseline.measure(f"mask/{name}/300000", membership, 5)
        )

    cadence_times = np.arange(100_000, dtype=np.float64) / 60.0
    for count in (1, 20, 100):
        segments = [f"segment-{index % count}" for index in range(len(cadence_times))]

        def cadence(segments=segments, count=count):
            values = FixationEventService._cadence_by_segment(
                cadence_times, segments, 60.0
            )
            result["equivalence"][f"cadence/{count}"] = normalize(values)
            return values

        result["measurements"].append(
            baseline.measure(f"cadence/{count}/100000", cadence, 5)
        )

    with tempfile.TemporaryDirectory(prefix="corpus-", dir=runtime) as temporary:
        class Factory:
            def mktemp(self, name):
                target = Path(temporary) / name
                target.mkdir()
                return target

        corpus = fixture.corpus.__wrapped__(Factory())
        aoi_values = aois()
        large = build_large(corpus.frames["SYN-01"])
        corpora = {
            "small": corpus.frames,
            "large": {
                f"SYN-L{index:02d}": large.copy(deep=True) for index in range(4)
            },
        }
        with pytest.MonkeyPatch.context() as patch:
            for label, frames in corpora.items():
                code = next(iter(frames))
                frame = frames[code]

                def metrics(frame=frame, label=label):
                    value = AoiAnalyticsService.compute_metrics(
                        frame, "stimulus-a", aoi_values
                    )
                    result["equivalence"][f"metrics/{label}"] = normalize(value)
                    return value

                result["measurements"].append(
                    baseline.measure(f"{label}/aoi_metrics", metrics, 5)
                )

                def report(frames=frames, label=label):
                    recordings = []
                    for participant_code, participant_frame in frames.items():
                        participant = common.ReportParticipant(
                            participant_code,
                            participant_code,
                            "#2563EB",
                            participant_frame,
                        )
                        for scenario in ("stimulus-a", "stimulus-b"):
                            recording = eye_tracking.collect(
                                participant,
                                common.ReportScenario(
                                    scenario, scenario, 1, aoi_values
                                ),
                            )
                            assert recording is not None and recording.aoi is not None
                            recordings.append(recording)
                    result["equivalence"][f"report/{label}"] = normalize(recordings)
                    return recordings

                result["measurements"].append(
                    baseline.measure(f"{label}/report_group_collect", report, 5)
                )

                corpus.frames = frames
                client_generator = fixture.http_client.__wrapped__(
                    corpus, aoi_values, patch
                )
                client = next(client_generator)
                prefix = f"/api/projects/{baseline.PROJECT}/analytics/aois"

                def request(
                    code=code, label=label, client=client, prefix=prefix
                ):
                    analytics_routes._redis.values.clear()
                    response = client.get(
                        prefix,
                        params={
                            "participant_code": code,
                            "scenario": "stimulus-a",
                        },
                    )
                    assert response.status_code == 200, response.text
                    result["equivalence"][f"http/{label}"] = response.json()
                    return response

                result["measurements"].append(
                    baseline.measure(f"{label}/http_no_response_cache/aois", request, 5)
                )
                client_generator.close()

    result["equivalence"] = compact(result["equivalence"])
    if args.phase == "after":
        before = json.loads((output / "before.json").read_text(encoding="utf-8"))
        assert result["runtime"] == before["runtime"]
        assert result["equivalence"] == before["equivalence"]
        result["equivalent_to_before"] = True
    target = output / f"{args.phase}.json"
    target.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "phase": args.phase,
                "equivalent": result.get("equivalent_to_before"),
                "measurements": [
                    {
                        key: row[key]
                        for key in ("name", "n", "median_ms", "min_ms", "max_ms")
                    }
                    for row in result["measurements"]
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

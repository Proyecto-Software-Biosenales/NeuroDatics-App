"""G03 comparison on G00's exact synthetic corpus, offline and sequential.

Runtime unchanged; full/projected HTTP misses alternate. Cold storage transfers
the entire file with an explicit 20 ms delay. No G00 evidence is overwritten.
"""

import asyncio
import gc
import hashlib
import json
import platform
import statistics
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace as NS

import g00_backend as baseline
import numpy as np
import pandas as pd
import pyarrow
import pytest
from neurodatics.modules.analytics.application.services.eeg_analytics_service import (
    EegAnalyticsService,
)
from neurodatics.modules.analytics.application.services.gsr_analytics_service import (
    GsrAnalyticsService,
)
from neurodatics.modules.analytics.domain.parquet_projection import (
    DISTANCE_PROJECTION,
    EEG_PROJECTION,
    GSR_PROJECTION,
    PUPIL_PROJECTION,
    TIMING_PROJECTION,
)

ROOT = baseline.ROOT
PROFILES = {
    "/scenario-timing": TIMING_PROJECTION,
    "/timeseries/gsr": GSR_PROJECTION, "/statistics/gsr": GSR_PROJECTION,
    "/timeseries/pupil": PUPIL_PROJECTION, "/statistics/pupil": PUPIL_PROJECTION,
    "/timeseries/distance": DISTANCE_PROJECTION, "/statistics/distance": DISTANCE_PROJECTION,
    "/timeseries/eeg": EEG_PROJECTION, "/psd/eeg": EEG_PROJECTION,
    "/spectrogram/eeg": EEG_PROJECTION, "/topography/eeg": EEG_PROJECTION,
}


def sample(operation):
    gc.collect()
    before = baseline.COUNTERS.copy()
    cpu, started = time.process_time(), time.perf_counter()
    result = operation()
    return result, {"ms": (time.perf_counter() - started) * 1000,
                    "cpu_ms": (time.process_time() - cpu) * 1000,
                    "counts": dict(baseline.COUNTERS - before), **baseline.rss()}


def summary(rows):
    times = [r["ms"] for r in rows]
    return {"n": len(rows), "warmup": 1, "median_ms": statistics.median(times),
            "min_ms": min(times), "max_ms": max(times), "samples": rows}


def category_probe(frame):
    categorical = frame.copy(deep=True)
    cpu = time.perf_counter()
    categorical["scenario"] = categorical.scenario.astype("category")
    conversion_ms = (time.perf_counter() - cpu) * 1000
    # Include nulls, encounter order, unused categories and differing category
    # dictionaries. Existing consumers call fillna("") and groupby defaults.
    labels = pd.Series(["b", None, "a", "b", None], name="scenario")
    labels_cat = labels.astype("category").cat.add_categories(["unused"])
    group_object = pd.DataFrame({"scenario": labels, "v": range(5)}).groupby("scenario", sort=False, dropna=False).size()
    group_category = pd.DataFrame({"scenario": labels_cat, "v": range(5)}).groupby("scenario", sort=False, dropna=False, observed=False).size()
    errors = {}
    for name, operation in {
        "null_fill": lambda: labels_cat.fillna(""),
        "eeg_query": lambda: EegAnalyticsService.compute_timeseries(categorical, "stimulus-a"),
    }.items():
        try:
            operation()
        except (TypeError, ValueError) as exc:
            errors[name] = str(exc)
    concatenated = pd.concat([labels_cat, pd.Series(["c"]).astype("category")], ignore_index=True)
    return {"decision": "discarded; current null-fill contract fails and groupby adds unused categories",
            "scenario_object_bytes": int(frame.scenario.memory_usage(deep=True)),
            "scenario_category_bytes": int(categorical.scenario.memory_usage(deep=True)),
            "conversion_ms": conversion_ms,
            "null_mask_equal": labels.isna().equals(labels_cat.isna()),
            "encounter_order_equal": labels.dropna().tolist() == labels_cat.dropna().tolist(),
            "json_equal": labels.to_json() == labels_cat.to_json(),
            "groupby_object": group_object.to_json(), "groupby_category": group_category.to_json(),
            "concat_dtype": str(concatenated.dtype), "errors": errors,
            "gsr_query_equal": GsrAnalyticsService.compute_timeseries(frame, "stimulus-a") == GsrAnalyticsService.compute_timeseries(categorical, "stimulus-a")}


def main():
    out = ROOT / "docs/perf/ejecucion/evidencia/g03/medidas.json"
    runtime = ROOT / "output/perf-g03/runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    fixture = baseline.load_fixture_module()
    result = {"scope": "real reader/services/HTTP; synthetic storage 20ms; MemoryCache; no cloud",
              "python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__,
              "pyarrow": pyarrow.__version__, "repeats": 5, "fixtures": [], "queries": []}
    with tempfile.TemporaryDirectory(dir=runtime, prefix="g03-") as temp:
        directory = Path(temp)

        class Factory:
            def mktemp(self, name):
                path = directory / name
                path.mkdir()
                return path

        corpus = fixture.corpus.__wrapped__(Factory())
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
                    part[column] += block * 10000
            pieces.append(part)
        large = pd.concat(pieces, ignore_index=True)
        large.attrs = dict(base.attrs)
        for scenario in ("stimulus-a", "stimulus-b"):
            original = baseline.FixationEventService.build_events(base, scenario=scenario)[0]
            extended = baseline.FixationEventService.build_events(large, scenario=scenario)[0]
            assert len(extended) == 64 * len(original)
            assert extended.duration_s.min() > 0
        for index in range(16):
            large[f"g00_unused_{index:02d}"] = np.sin(np.arange(len(large), dtype=float) / (index + 5))
        for label, frame in [("small", base), ("large", large)]:
            path = directory / f"{label}.parquet"
            frame.to_parquet(path, index=False)
            payload = path.read_bytes()
            full_bytes = int(frame.memory_usage(deep=True).sum())
            result["fixtures"].append({"label": label, "rows": len(frame), "columns": len(frame.columns),
                                       "full_frame_bytes": full_bytes, "parquet_bytes": len(payload),
                                       "sha256_parquet": hashlib.sha256(payload).hexdigest(), "category": category_probe(frame)})
            reader = baseline.ParquetReaderService(None)
            reader._cache._cache_dir = directory / f"cache-{label}"
            storage = baseline.SyntheticStorage({"SYN-01": payload}, 0.020)

            async def resolve(project_id, participant_code):
                baseline.COUNTERS["resolve_files"] += 1
                return NS(project_file=NS(external_id=participant_code))

            async def drive(storage=storage):
                return storage

            reader.resolve_user_parquet = resolve
            reader._build_drive_client = drive
            corpus.frames = {"SYN-01": frame}
            with pytest.MonkeyPatch.context() as patch:
                decode = pd.read_parquet

                def counted_read(*args, decode=decode, **kwargs):
                    baseline.COUNTERS["parquet_reads"] += 1
                    return decode(*args, **kwargs)

                patch.setattr(pd, "read_parquet", counted_read)
                client_generator = fixture.http_client.__wrapped__(corpus, fixture.aois.__wrapped__(), patch)
                client = next(client_generator)
                selection = {"mode": "full", "state": "disk"}
                generation_counter = 100
                reader._cache.put(baseline.PROJECT, "SYN-01", payload, 0)

                class SelectedReader:
                    def __init__(self, db):
                        pass

                    async def read(self, project_id, participant_code, generation=None, *, projection=None, selection=selection, reader=reader):
                        nonlocal generation_counter
                        if selection["state"] == "cold":
                            generation_counter += 1
                            generation = generation_counter
                        return await reader.read(project_id, participant_code, generation,
                                                 projection=projection if selection["mode"] == "projected" else None)

                patch.setattr(baseline.analytics_routes, "ParquetReaderService", SelectedReader)
                for endpoint, profile in PROFILES.items():
                    projected_frame = asyncio.run(reader.read(baseline.PROJECT, "SYN-01", 0, projection=profile))
                    frame_bytes = int(projected_frame.memory_usage(deep=True).sum())
                    del projected_frame
                    for state in ("disk", "cold"):
                        rows = {"full": [], "projected": []}
                        expected = None
                        for repeat in range(6):
                            for mode in ("full", "projected"):
                                selection.update(mode=mode, state=state)

                                def request(client=client, endpoint=endpoint):
                                    baseline.analytics_routes._redis.values.clear()
                                    response = client.get(f"/api/projects/{baseline.PROJECT}/analytics{endpoint}",
                                                          params={"participant_code": "SYN-01", "scenario": "stimulus-a"})
                                    assert response.status_code == 200, response.text
                                    return response

                                response, measured = sample(request)
                                if expected is None:
                                    expected = response.content
                                assert response.content == expected, endpoint
                                if repeat:
                                    rows[mode].append(measured)
                        result["queries"].append({"fixture": label, "endpoint": endpoint, "state": state,
                                                  "profile": profile.name, "full": summary(rows["full"]),
                                                  "projected": summary(rows["projected"]), "equivalent_http_bytes": True,
                                                  "response_bytes": len(expected), "full_frame_bytes": full_bytes,
                                                  "projected_frame_bytes": frame_bytes})
                        out.write_text(json.dumps(result, indent=2), encoding="utf-8")
                client_generator.close()
    result["limits"] = ["OS file cache not cleared", "RSS snapshot and process lifetime peak, not operation peak",
                        "No Redis/Drive/PostgreSQL", "full and projected outputs compared exactly",
                        "Before is the same real reader forced full, no response cache; no frontend/global gate rerun"]
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "queries": len(result["queries"])}))


if __name__ == "__main__":
    main()

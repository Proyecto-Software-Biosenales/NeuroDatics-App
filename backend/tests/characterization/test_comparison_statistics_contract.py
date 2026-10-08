import json
import math
import shutil
import subprocess

import pytest

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.analytics_service import (
    EegAnalyticsService,
    GsrAnalyticsService,
    PupilAnalyticsService,
)
from neurodatics.modules.analytics.application.services.comparison_chart_config import (
    ChartConfigBuilder,
    legacy_javascript_summary,
)


PREFIX = "/api/projects/00000000-0000-0000-0000-000000000101/analytics"


def _assert_summary_close(actual, expected):
    assert actual.keys() == expected.keys()
    for key, expected_value in expected.items():
        actual_value = actual[key]
        if isinstance(expected_value, float):
            assert actual_value == pytest.approx(expected_value, rel=2e-15, abs=1e-12)
        else:
            assert actual_value == expected_value


def test_summary_matches_the_previous_javascript_reduction_order():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for the cross-language reference")
    script = r"""
const cases = {
  empty: [null, NaN, Infinity, -Infinity],
  n1: [4], odd: [3, 1, 2], even: [4, 1, 3, 2],
  baselineZero: [0, 0, 1, 2, 3], negative: [-8, -4, -2, -1],
  cancellation: [1e16, 1, -1e16], overflow: [1e308, 1e308],
}
function summarize(input) {
  const values = input.filter((value) => typeof value === "number" && Number.isFinite(value))
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const median = values.length % 2 ? sorted[Math.floor(values.length / 2)] : (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
  const std = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : 0
  const start = Math.floor(sorted.length * 0.05)
  const end = Math.max(start + 1, Math.ceil(sorted.length * 0.2))
  const baselineValues = sorted.slice(start, end)
  const baseline = baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
  const max = sorted[sorted.length - 1]
  return {count: values.length, mean, median, std, min: sorted[0], max, baseline, peak: baseline === 0 ? null : ((max - baseline) / Math.abs(baseline)) * 100}
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([key, values]) => [key, summarize(values)]))))
"""
    reference = json.loads(
        subprocess.run(
            [node, "-e", script], check=True, capture_output=True, text=True
        ).stdout
    )
    python_cases = {
        "empty": [None, math.nan, math.inf, -math.inf],
        "n1": [4], "odd": [3, 1, 2], "even": [4, 1, 3, 2],
        "baselineZero": [0, 0, 1, 2, 3],
        "negative": [-8, -4, -2, -1],
        "cancellation": [1e16, 1, -1e16],
        "overflow": [1e308, 1e308],
    }
    for name, values in python_cases.items():
        actual = legacy_javascript_summary(values)
        expected = reference[name]
        if expected is None:
            assert actual is None
        else:
            _assert_summary_close(actual, expected)


def test_payload_summaries_match_the_five_previous_endpoint_series(corpus):
    frame = corpus.frames["SYN-01"]
    scenario = "stimulus-b"
    max_points = 7
    requested = ["pupil", "distance", "gaze", "gsr", "eeg_timeseries"]
    payload = ChartConfigBuilder.build_comparison_payload(
        frame, scenario, requested, max_points=max_points
    )
    assert payload["charts"] == ChartConfigBuilder.build_many(
        frame, scenario, requested, max_points=max_points
    )

    old = {
        "pupil": PupilAnalyticsService.compute_timeseries(
            frame, scenario, max_points=max_points
        ),
        "distance": PupilAnalyticsService.compute_distance_timeseries(
            frame, scenario, max_points=max_points
        ),
        "gaze": PupilAnalyticsService.compute_gaze_timeseries(
            frame, scenario, max_points=max_points
        ),
        "gsr": GsrAnalyticsService.compute_timeseries(
            frame, scenario, max_points=max_points
        ),
        "eeg_timeseries": EegAnalyticsService.compute_timeseries(
            frame, scenario=scenario, smooth_window_s=0.0, max_points=max_points
        ),
    }
    fields = {
        "pupil": {"left": "smooth_left", "right": "smooth_right"},
        "distance": {"distance": "distance_cm"},
        "gaze": {"x": "gx_clean", "y": "gy_clean"},
        "gsr": {"gsr": "gsr_smooth"},
    }
    blocks = {item["visualization_id"]: item for item in payload["statistics"]}
    for visualization_id, mapping in fields.items():
        block = blocks[visualization_id]
        assert block["status"] == "ok"
        assert block["source"]["selected_samples"] <= max_points
        for series in block["series"]:
            expected = legacy_javascript_summary(
                old[visualization_id][mapping[series["key"]]]
            )
            _assert_summary_close(series["summary"], expected)

    eeg_block = blocks["eeg_timeseries"]
    assert [series["key"] for series in eeg_block["series"]] == old["eeg_timeseries"]["channels"]
    for series in eeg_block["series"]:
        expected = legacy_javascript_summary(
            old["eeg_timeseries"]["smooth"][series["key"]]
        )
        _assert_summary_close(series["summary"], expected)
    assert eeg_block["source"]["parameters"] == {
        "scenario": "request", "max_points": max_points,
        "decimation": "linspace", "start_time_s": None, "end_time_s": None,
        "channels": "all_available_in_canonical_order", "smooth_window_s": 0.0,
        "reference": "as_exported", "bandpass_hz": None, "notch_hz": None,
    }


def test_one_visualization_failure_does_not_remove_other_results(corpus, monkeypatch):
    frame = corpus.frames["SYN-01"]

    def fail(*_args, **_kwargs):
        raise RuntimeError("deliberate GSR failure")

    monkeypatch.setattr(GsrAnalyticsService, "compute_timeseries", fail)
    payload = ChartConfigBuilder.build_comparison_payload(
        frame, "stimulus-a", ["pupil", "gsr"], max_points=9
    )
    assert [chart["id"] for chart in payload["charts"]] == ["pupil"]
    blocks = {item["visualization_id"]: item for item in payload["statistics"]}
    assert blocks["pupil"]["status"] == "ok"
    assert blocks["gsr"]["status"] == "error"
    assert blocks["gsr"]["error"] == "computation_failed"


def test_consolidated_payload_computes_each_signal_once(corpus, monkeypatch):
    calls = {}
    methods = [
        (PupilAnalyticsService, "compute_timeseries"),
        (PupilAnalyticsService, "compute_distance_timeseries"),
        (PupilAnalyticsService, "compute_gaze_timeseries"),
        (GsrAnalyticsService, "compute_timeseries"),
        (EegAnalyticsService, "compute_timeseries"),
    ]
    for owner, name in methods:
        original = getattr(owner, name)
        key = f"{owner.__name__}.{name}"

        def wrapped(*args, _original=original, _key=key, **kwargs):
            calls[_key] = calls.get(_key, 0) + 1
            return _original(*args, **kwargs)

        monkeypatch.setattr(owner, name, staticmethod(wrapped))

    ChartConfigBuilder.build_comparison_payload(
        corpus.frames["SYN-01"], "stimulus-a",
        ["pupil", "distance", "gaze", "gsr", "eeg_timeseries"],
        max_points=13,
    )
    assert calls == {f"{owner.__name__}.{name}": 1 for owner, name in methods}


def test_http_contract_selects_and_versions_statistics(http_client):
    response = http_client.get(
        PREFIX + "/comparison/charts",
        params={
            "participant_code": "SYN-01", "scenario": "stimulus-a",
            "visualizations": "pupil,gsr", "max_points": 11,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["contract_version"] == "comparison-charts-v3"
    assert body["statistics_schema_version"] == "comparison-statistics-v1"
    assert [item["visualization_id"] for item in body["statistics"]] == ["pupil", "gsr"]
    assert all(item["source"]["parameters"]["max_points"] == 11 for item in body["statistics"])


def test_cold_http_topology_removes_five_frame_reads(http_client, monkeypatch):
    reader_type = routes.ParquetReaderService
    original_read = reader_type.read
    original_transform = routes.transform_cache_token
    counts = {"reads": 0, "transforms": 0}

    async def counted_read(self, *args, **kwargs):
        counts["reads"] += 1
        return await original_read(self, *args, **kwargs)

    def counted_transform(*args, **kwargs):
        counts["transforms"] += 1
        return original_transform(*args, **kwargs)

    monkeypatch.setattr(reader_type, "read", counted_read)
    monkeypatch.setattr(routes, "transform_cache_token", counted_transform)
    params = {"participant_code": "SYN-01", "scenario": "stimulus-a"}
    baseline_paths = [
        "/comparison/charts", "/timeseries/pupil", "/timeseries/distance",
        "/timeseries/gaze", "/timeseries/gsr", "/timeseries/eeg",
    ]
    routes._redis.values.clear()
    for path in baseline_paths:
        response = http_client.get(PREFIX + path, params=params)
        assert response.status_code == 200, response.text
    assert counts == {"reads": 6, "transforms": 2}

    routes._redis.values.clear()
    counts.update(reads=0, transforms=0)
    response = http_client.get(PREFIX + "/comparison/charts", params=params)
    assert response.status_code == 200, response.text
    assert counts == {"reads": 1, "transforms": 1}

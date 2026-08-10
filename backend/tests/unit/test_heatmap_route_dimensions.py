"""The heatmap endpoint has to carry the stimulus' size to the renderer.

Capturing intrinsic dimensions at ingestion is only useful if the request path
reads them back, and only safe if a scenario re-ingested at a new size cannot be
answered from a cache entry rendered at the old one.
"""

import io
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
from starlette.datastructures import Headers

from neurodatics.modules.analytics.api import routes

Image = pytest.importorskip("PIL.Image", reason="heatmap rendering needs Pillow")

PROJECT_ID = uuid4()
CURRENT_USER = str(uuid4())
SCENARIO = "Scenario canonical"


def _request(headers=None):
    """The route reads if-none-match off the request to answer revalidations."""

    return SimpleNamespace(headers=Headers(headers or {}))


class FakeCache:
    """Records the keys it is asked for; never returns a hit."""

    def __init__(self):
        self.requested_keys = []
        self.byte_writes = {}
        self.json_writes = {}

    def build_key(self, project_id, participant_code, endpoint, scenario="all", generation=0):
        return f"analytics:{project_id}:g{generation}:{participant_code}:{endpoint}:{scenario}"

    def get_bytes(self, key):
        self.requested_keys.append(key)
        return self.byte_writes.get(key)

    def set_bytes(self, key, value, ttl=None):
        self.byte_writes[key] = value

    def get_json(self, key):
        return self.json_writes.get(key)

    def set_json(self, key, data, ttl=None):
        self.json_writes[key] = data


class FakeReader:
    def __init__(self, _db):
        pass

    async def read(self, _project_id, _participant_code, generation=None):
        samples = 20
        return pd.DataFrame(
            {
                "time": np.arange(samples, dtype=float) / 100.0,
                "fix_x": [50.0] * samples,
                "fix_y": [20.0] * samples,
                "scenario": [SCENARIO] * samples,
            }
        )


@pytest.fixture
def wired(monkeypatch):
    cache = FakeCache()

    async def allow(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID)

    monkeypatch.setattr(routes, "_verify_ownership", allow)
    monkeypatch.setattr(routes, "_redis", cache)
    monkeypatch.setattr(routes, "ParquetReaderService", FakeReader)
    return cache


def _with_scenary(monkeypatch, width, height):
    async def resolve(*args, **kwargs):
        return SimpleNamespace(name=SCENARIO, file_id=None, width=width, height=height)

    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", resolve)


async def _rendered_size(response) -> tuple[int, int]:
    chunks = [chunk async for chunk in response.body_iterator]
    with Image.open(io.BytesIO(b"".join(chunks))) as image:
        return image.size


@pytest.mark.asyncio
@pytest.mark.parametrize("width,height", [(800, 800), (1920, 1080), (3440, 1440)])
async def test_the_overlay_is_rendered_at_the_stored_stimulus_size(
    wired, monkeypatch, width, height
):
    _with_scenary(monkeypatch, width, height)

    response = await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )

    assert response.media_type == "image/png"
    assert await _rendered_size(response) == (width, height)
    assert response.headers["x-stimulus-transform-status"] == "legacy_passthrough_missing"
    assert response.headers["x-stimulus-coordinate-space"] == "legacy_screen_normalized"
    assert response.headers["x-stimulus-transform-version"] == "none"
    assert response.headers["x-stimulus-transform-fingerprint"] == "none"
    assert response.headers["x-stimulus-transform-warnings"] == "stimulus_placement_missing"


@pytest.mark.asyncio
async def test_a_scenario_without_stored_dimensions_still_renders(wired, monkeypatch):
    _with_scenary(monkeypatch, None, None)

    response = await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )

    assert await _rendered_size(response) == (1920, 1080)


@pytest.mark.asyncio
async def test_a_resized_stimulus_does_not_hit_the_old_cache_entry(wired, monkeypatch):
    _with_scenary(monkeypatch, 1920, 1080)
    await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )

    _with_scenary(monkeypatch, 3440, 1440)
    await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )

    assert len(set(wired.requested_keys)) == 2


@pytest.mark.asyncio
async def test_cached_and_uncached_heatmaps_expose_identical_transform_headers(
    wired, monkeypatch
):
    _with_scenary(monkeypatch, 800, 800)

    uncached = await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )
    cached = await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )

    transform_headers = {
        name: value
        for name, value in uncached.headers.items()
        if name.startswith("x-stimulus-")
    }
    assert transform_headers
    assert {
        name: value
        for name, value in cached.headers.items()
        if name.startswith("x-stimulus-")
    } == transform_headers


@pytest.mark.asyncio
async def test_applied_heatmap_headers_report_the_persisted_contract(wired, monkeypatch):
    _with_scenary(monkeypatch, 800, 800)
    fingerprint = "a" * 64

    class AppliedReader:
        def __init__(self, _db):
            pass

        async def read(self, _project_id, _participant_code, generation=None):
            samples = 20
            return pd.DataFrame(
                {
                    "time": np.arange(samples, dtype=float) / 100.0,
                    "scenario": [SCENARIO] * samples,
                    "fix_x": [50.0] * samples,
                    "fix_y": [20.0] * samples,
                    "fixation_id": [1] * samples,
                    "fixation_segment_id": [1] * samples,
                    "fixation_method": ["idt"] * samples,
                    "fixation_detector_version": ["fixation-v2"] * samples,
                    "is_valid_gaze": [True] * samples,
                    "gaze_x_stimulus_norm": [0.5] * samples,
                    "gaze_y_stimulus_norm": [0.2] * samples,
                    "gaze_invalid_reason": [None] * samples,
                    "stimulus_transform_status": ["applied"] * samples,
                    "stimulus_transform_version": ["screen-stimulus-v1"] * samples,
                    "stimulus_transform_fingerprint": [fingerprint] * samples,
                }
            )

    monkeypatch.setattr(routes, "ParquetReaderService", AppliedReader)

    response = await routes.heatmap_overlay(
        _request(),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        db=object(),
        current_user=CURRENT_USER,
    )

    assert response.headers["x-stimulus-transform-status"] == "applied"
    assert response.headers["x-stimulus-coordinate-space"] == "stimulus_normalized"
    assert response.headers["x-stimulus-transform-version"] == "screen-stimulus-v1"
    assert response.headers["x-stimulus-transform-fingerprint"] == fingerprint
    assert "x-stimulus-transform-warnings" not in response.headers

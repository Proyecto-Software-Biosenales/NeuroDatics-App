"""The group heatmap pools participants so that each one weighs the same.

A participant with many long fixations must not drown out one who looked
briefly; participants without data are skipped and named, not an error; and
the cache identity cannot depend on the order the client listed them in.
"""

import io
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.heatmap_analytics_service import (
    HeatmapAnalyticsService,
)

Image = pytest.importorskip("PIL.Image", reason="heatmap rendering needs Pillow")

PROJECT_ID = uuid4()
CURRENT_USER = str(uuid4())
SCENARIO = "Scenario canonical"
WIDTH, HEIGHT = 800, 600


def _events(x_norm, y_norm, count, duration_s):
    return pd.DataFrame({
        "x_norm": [x_norm] * count,
        "y_norm": [y_norm] * count,
        "duration_s": [duration_s] * count,
    })


def _pixel(png, x_norm, y_norm):
    with Image.open(io.BytesIO(png)) as image:
        rgba = image.convert("RGBA")
        return rgba.getpixel((int(x_norm * rgba.width), int(y_norm * rgba.height)))


def test_a_participant_with_many_long_fixations_does_not_dominate():
    heavy = _events(0.25, 0.5, 50, 2.0)
    light = _events(0.75, 0.5, 1, 0.1)

    pooled = HeatmapAnalyticsService.render_overlay(
        pd.concat([heavy, light], ignore_index=True), width=WIDTH, height=HEIGHT,
    )
    group, used = HeatmapAnalyticsService.render_group_overlay(
        {"A": heavy, "B": light}, width=WIDTH, height=HEIGHT,
    )

    # Pooled by duration, the brief look vanishes under the threshold ...
    assert _pixel(pooled, 0.75, 0.5)[3] == 0
    # ... while in the group map both participants reach the same peak.
    assert used == ["A", "B"]
    heavy_peak = _pixel(group, 0.25, 0.5)
    light_peak = _pixel(group, 0.75, 0.5)
    assert light_peak[3] > 0
    assert np.allclose(heavy_peak, light_peak, atol=2)


def test_a_participant_s_own_events_keep_the_duration_weighting():
    # Normalization is per participant: inside one, longer looks still weigh more.
    events = pd.concat([_events(0.25, 0.5, 1, 2.0), _events(0.75, 0.5, 1, 0.5)], ignore_index=True)

    group, _ = HeatmapAnalyticsService.render_group_overlay({"A": events}, width=WIDTH, height=HEIGHT)

    assert group == HeatmapAnalyticsService.render_overlay(events, width=WIDTH, height=HEIGHT)


def test_an_explicit_weight_column_replaces_the_durations():
    events = pd.concat([_events(0.25, 0.5, 1, 2.0), _events(0.75, 0.5, 1, 0.5)], ignore_index=True)
    as_weights = events.assign(weight=events["duration_s"])
    equal = events.assign(weight=1.0)

    by_duration = HeatmapAnalyticsService.render_overlay(events, width=WIDTH, height=HEIGHT)

    assert HeatmapAnalyticsService.render_overlay(as_weights, width=WIDTH, height=HEIGHT) == by_duration
    assert HeatmapAnalyticsService.render_overlay(equal, width=WIDTH, height=HEIGHT) != by_duration


def test_participants_without_events_inside_the_image_do_not_contribute():
    outside = _events(1.5, 0.5, 3, 0.3)

    png, used = HeatmapAnalyticsService.render_group_overlay(
        {"A": _events(0.5, 0.5, 2, 0.3), "B": pd.DataFrame(columns=["x_norm", "y_norm", "duration_s"]), "C": outside},
        width=WIDTH, height=HEIGHT,
    )

    assert png
    assert used == ["A"]
    assert HeatmapAnalyticsService.render_group_overlay({"C": outside}, width=WIDTH, height=HEIGHT) == (None, [])


# --- Route ------------------------------------------------------------------


def _frame(scenario=SCENARIO, x=50.0):
    samples = 20
    return pd.DataFrame({
        "time": np.arange(samples, dtype=float) / 100.0,
        "fix_x": [x] * samples,
        "fix_y": [20.0] * samples,
        "scenario": [scenario] * samples,
    })


FRAMES = {
    "P-01": _frame(x=30.0),
    "P-02": _frame(x=70.0),
    "P-03": _frame(scenario="Another scenario"),
}


class FakeReader:
    def __init__(self, _db):
        pass

    async def read(self, _project_id, participant_code, generation=None):
        if participant_code not in FRAMES:
            raise FileNotFoundError("Participant data not found")
        return FRAMES[participant_code].copy(deep=True)


class FakeCache:
    def __init__(self):
        self.keys = []
        self._bytes = {}
        self._json = {}

    def build_key(self, project_id, participant_code, endpoint, scenario="all", generation=0):
        key = f"analytics:{project_id}:g{generation}:{participant_code}:{endpoint}:{scenario}"
        self.keys.append(key)
        return key

    def get_bytes(self, key):
        return self._bytes.get(key)

    def set_bytes(self, key, value, ttl=None):
        self._bytes[key] = value

    def get_json(self, key):
        return self._json.get(key)

    def set_json(self, key, data, ttl=None):
        self._json[key] = data


@pytest.fixture
def wired(monkeypatch):
    cache = FakeCache()

    async def owned_project(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID, owner_id=CURRENT_USER, ingestion_generation=4)

    async def resolve(*args, **kwargs):
        return SimpleNamespace(name=SCENARIO, file_id=None, width=WIDTH, height=HEIGHT)

    monkeypatch.setattr(routes, "_verify_ownership", owned_project)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", resolve)
    monkeypatch.setattr(routes, "ParquetReaderService", FakeReader)
    monkeypatch.setattr(routes, "_redis", cache)
    return cache


async def _group(codes, scenario=SCENARIO, if_none_match=None):
    headers = {} if if_none_match is None else {"if-none-match": if_none_match}
    return await routes.group_heatmap_overlay(
        SimpleNamespace(headers=Headers(headers)),
        PROJECT_ID,
        participant_codes=codes,
        scenario=scenario,
        min_fixation_duration_ms=200,
        generation=None,
        db=object(),
        current_user=CURRENT_USER,
    )


async def _body(response):
    return b"".join([chunk async for chunk in response.body_iterator])


@pytest.mark.asyncio
async def test_the_group_map_renders_at_the_stimulus_size_and_names_its_participants(wired):
    response = await _group(["P-02", "P-01"])

    assert response.media_type == "image/png"
    with Image.open(io.BytesIO(await _body(response))) as image:
        assert image.size == (WIDTH, HEIGHT)
    assert response.headers["x-group-participants"] == "P-01,P-02"
    assert response.headers["x-group-participants-skipped"] == ""
    assert response.headers["cache-control"] == "private, max-age=0, must-revalidate"
    assert response.headers["x-stimulus-transform-status"] == "legacy_passthrough_missing"
    assert response.headers["x-stimulus-coordinate-space"] == "legacy_screen_normalized"


@pytest.mark.asyncio
async def test_participants_without_data_in_the_scenario_are_skipped(wired):
    response = await _group(["P-01", "P-03", "NOBODY"])

    assert response.status_code == 200
    assert response.headers["x-group-participants"] == "P-01"
    assert response.headers["x-group-participants-skipped"] == "NOBODY,P-03"
    # The cached answer reports the same participants.
    cached = await _group(["P-01", "P-03", "NOBODY"])
    assert cached.headers["x-group-participants-skipped"] == "NOBODY,P-03"
    assert await _body(cached) == await _body(response)


@pytest.mark.asyncio
async def test_the_group_map_matches_the_individual_map_for_a_single_participant(wired):
    group = await _group(["P-01"])
    individual = await routes.heatmap_overlay(
        SimpleNamespace(headers=Headers({})),
        PROJECT_ID,
        participant_code="P-01",
        scenario=SCENARIO,
        min_fixation_duration_ms=200,
        generation=None,
        db=object(),
        current_user=CURRENT_USER,
    )

    assert await _body(group) == await _body(individual)


@pytest.mark.asyncio
async def test_all_scenarios_is_rejected(wired):
    with pytest.raises(HTTPException) as error:
        await _group(["P-01"], scenario="all")
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_an_empty_participant_list_is_rejected(wired):
    with pytest.raises(HTTPException) as error:
        await _group(["", "  "])
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_nobody_with_data_is_a_404_in_spanish(wired):
    with pytest.raises(HTTPException) as error:
        await _group(["P-03", "NOBODY"])
    assert error.value.status_code == 404
    assert "participantes" in error.value.detail


@pytest.mark.asyncio
async def test_the_cache_identity_ignores_order_and_repetition(wired):
    first = await _group(["P-02", "P-01"])
    second = await _group(["P-01", "P-02", "P-01", " P-02 "])
    other = await _group(["P-01"])

    assert first.headers["etag"] == second.headers["etag"]
    assert other.headers["etag"] != first.headers["etag"]
    revalidated = await _group(["P-01", "P-02"], if_none_match=first.headers["etag"])
    assert revalidated.status_code == 304
    assert all(":g4:" in key for key in wired.keys)


def test_mixed_transforms_are_reported_as_mixed():
    applied = {
        "status": "applied", "output_space": "stimulus_normalized",
        "contract_version": "screen-stimulus-v1", "contract_fingerprint": "a" * 64,
        "warning_codes": [],
    }
    other_screen = {**applied, "contract_fingerprint": "b" * 64}
    legacy = {
        "status": "legacy_passthrough_missing", "output_space": "legacy_screen_normalized",
        "contract_version": None, "contract_fingerprint": None,
        "warning_codes": ["stimulus_placement_missing"],
    }

    assert routes._group_transform_provenance([applied, applied]) == applied
    same_space = routes._group_transform_provenance([applied, other_screen])
    assert same_space["status"] == "applied"
    assert same_space["contract_fingerprint"] is None
    mixed = routes._group_transform_provenance([applied, legacy])
    assert mixed["status"] == "mixed"
    assert "mixed_stimulus_coordinate_transforms" in mixed["warning_codes"]

from types import SimpleNamespace
from uuid import uuid4

import pandas as pd
import pytest
from fastapi import HTTPException

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.application.services.analytics_service import (
    PupilAnalyticsService,
)


PROJECT_ID = uuid4()
CURRENT_USER = str(uuid4())


class FakeCache:
    def __init__(self):
        self.key_args = None
        self.writes = []

    def build_key(self, *args):
        self.key_args = args
        return "|".join(str(value) for value in args)

    def get_json(self, key):
        return None

    def set_json(self, key, data, ttl=None):
        self.writes.append((key, data, ttl))


def _overlapping_time_df():
    return pd.DataFrame(
        {
            "time": [0.5, 0.5, 1.0, 1.0],
            "scenario": ["Scenario A", "ScenarioB.mp4", "Scenario A", "ScenarioB.mp4"],
            "gx": [10.0, 90.0, 10.0, 90.0],
            "gy": [20.0, 80.0, 20.0, 80.0],
        }
    )


def test_find_gaze_at_scopes_overlapping_times_to_requested_scenario():
    df = _overlapping_time_df()

    unscoped = PupilAnalyticsService.find_gaze_at(df, 0.5)
    scoped = PupilAnalyticsService.find_gaze_at(df, 0.5, scenario="Scenario B")

    assert unscoped["scenario"] == "Scenario A"
    assert unscoped["gx"] == 10.0
    assert scoped["scenario"] == "ScenarioB.mp4"
    assert scoped["gx"] == 90.0
    assert scoped["gy"] == 80.0


def test_find_gaze_at_uses_cleaned_gaze_at_the_selected_time():
    df = pd.DataFrame(
        {
            "time": [10.0, 10.01, 10.02, 10.03, 10.04],
            "scenario": ["Scenario A"] * 5,
            "gx": [40.0, 40.0, None, 40.0, 40.0],
            "gy": [60.0, 60.0, None, 60.0, 60.0],
        }
    )
    series = PupilAnalyticsService.compute_gaze_timeseries(
        df,
        scenario="Scenario A",
    )
    selected_index = series["time"].index(10.02)

    result = PupilAnalyticsService.find_gaze_at(
        df,
        10.02,
        scenario="Scenario A",
    )

    assert result["nearest_time_s"] == 10.02
    assert result["scenario"] == "Scenario A"
    assert result["gx"] == round(series["gx_clean"][selected_index], 2)
    assert result["gy"] == round(series["gy_clean"][selected_index], 2)


def test_find_gaze_at_keeps_empty_coordinates_when_no_valid_pair_exists():
    df = pd.DataFrame(
        {
            "time": [10.0, 10.01],
            "scenario": ["Scenario A", "Scenario A"],
            "gx": [None, 120.0],
            "gy": [None, 50.0],
        }
    )

    result = PupilAnalyticsService.find_gaze_at(
        df,
        10.01,
        scenario="Scenario A",
    )

    assert result["nearest_time_s"] == 10.01
    assert result["scenario"] == "Scenario A"
    assert result["gx"] is None
    assert result["gy"] is None


@pytest.mark.asyncio
async def test_gaze_at_route_uses_canonical_scenario_for_filter_and_cache(monkeypatch):
    cache = FakeCache()
    scenario_file_id = uuid4()

    async def allow_ownership(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID)

    async def resolve_scenario(*args, **kwargs):
        return SimpleNamespace(
            name="Scenario B",
            type="video",
            file_id=scenario_file_id,
        )

    class Reader:
        def __init__(self, db):
            pass

        async def read_from_cache_only(self, project_id, participant_code):
            return _overlapping_time_df()

    monkeypatch.setattr(routes, "_verify_ownership", allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", resolve_scenario)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", cache)

    response = await routes.gaze_at(
        PROJECT_ID,
        participant_code="P-01",
        t_s=0.5,
        scenario="scenario-b",
        db=object(),
        current_user=CURRENT_USER,
    )

    assert response.scenario == "Scenario B"
    assert response.gx == 90.0
    assert response.gy == 80.0
    assert response.scenario_file_id == str(scenario_file_id)
    assert response.scenario_type == "video"
    assert response.scenario_time_s == 0.0
    assert cache.key_args == (
        PROJECT_ID,
        "P-01",
        "gaze_at_v4:0.5",
        "Scenario B",
    )
    assert len(cache.writes) == 1


@pytest.mark.asyncio
async def test_gaze_at_without_scenario_preserves_unscoped_cache_contract(monkeypatch):
    cache = FakeCache()

    async def allow_ownership(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID)

    async def should_not_resolve(*args, **kwargs):
        raise AssertionError("omitting scenario must preserve the standalone lookup")

    class Reader:
        def __init__(self, db):
            pass

        async def read_from_cache_only(self, project_id, participant_code):
            return pd.DataFrame({"time": [0.5], "gx": [25.0], "gy": [75.0]})

    monkeypatch.setattr(routes, "_verify_ownership", allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", should_not_resolve)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", cache)

    response = await routes.gaze_at(
        PROJECT_ID,
        participant_code="P-01",
        t_s=0.5,
        scenario=None,
        db=object(),
        current_user=CURRENT_USER,
    )

    assert response.gx == 25.0
    assert response.gy == 75.0
    assert response.scenario is None
    assert cache.key_args == (PROJECT_ID, "P-01", "gaze_at_v3", "0.5")


@pytest.mark.asyncio
async def test_gaze_at_without_scenario_resolves_stimulus_for_global_time(
    monkeypatch,
):
    cache = FakeCache()
    scenario_file_id = uuid4()
    scenary = SimpleNamespace(
        name="Scenario B",
        type="video",
        file_id=scenario_file_id,
    )

    async def allow_ownership(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID)

    async def should_not_resolve_requested_scenario(*args, **kwargs):
        raise AssertionError("the all-scenarios lookup must remain unscoped")

    class Reader:
        def __init__(self, db):
            pass

        async def read_from_cache_only(self, project_id, participant_code):
            return pd.DataFrame(
                {
                    "time": [3.0, 20.0, 25.0],
                    "scenario": ["Scenario A", "Scenario B", "Scenario B"],
                    "gx": [10.0, 82.0, 82.0],
                    "gy": [20.0, 62.0, 62.0],
                }
            )

    class FakeDb:
        async def execute(self, statement):
            return SimpleNamespace(scalar_one_or_none=lambda: scenary)

    monkeypatch.setattr(routes, "_verify_ownership", allow_ownership)
    monkeypatch.setattr(
        routes,
        "_resolve_scenary_for_analytics",
        should_not_resolve_requested_scenario,
    )
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", cache)

    response = await routes.gaze_at(
        PROJECT_ID,
        participant_code="P-01",
        t_s=24.9001,
        scenario=None,
        db=FakeDb(),
        current_user=CURRENT_USER,
    )

    assert response.nearest_time_s == 25.0
    assert response.scenario == "Scenario B"
    assert response.gx == 82.0
    assert response.gy == 62.0
    assert response.scenario_file_id == str(scenario_file_id)
    assert response.scenario_type == "video"
    assert response.scenario_time_s == 5.0
    assert cache.key_args == (PROJECT_ID, "P-01", "gaze_at_v3", "24.9001")


@pytest.mark.asyncio
async def test_gaze_at_rejects_non_concrete_scenario(monkeypatch):
    async def allow_ownership(*args, **kwargs):
        return SimpleNamespace(id=PROJECT_ID)

    monkeypatch.setattr(routes, "_verify_ownership", allow_ownership)

    with pytest.raises(HTTPException) as exc_info:
        await routes.gaze_at(
            PROJECT_ID,
            participant_code="P-01",
            t_s=0.5,
            scenario="all",
            db=object(),
            current_user=CURRENT_USER,
        )

    assert exc_info.value.status_code == 400

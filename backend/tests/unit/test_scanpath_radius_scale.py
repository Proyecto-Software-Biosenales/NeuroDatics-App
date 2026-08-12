from math import sqrt
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.api.schemas import ScanpathResponse
from neurodatics.modules.analytics.application.services.analytics_service import (
    ScanpathAnalyticsService,
)
from neurodatics.modules.analytics.domain.coordinate_transform import (
    transform_cache_token,
)


CAP_SECONDS = 2.0


def _v2_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "time": [0.00, 0.01, 0.02, 0.50, 0.51, 0.52],
            "fix_x": [10.0, 10.0, 10.0, 40.0, 40.0, 40.0],
            "fix_y": [20.0, 20.0, 20.0, 50.0, 50.0, 50.0],
            "fixation_id": [1, 1, 1, 2, 2, 2],
            "fixation_segment_id": ["segment-a"] * 6,
            "fixation_method": ["idt"] * 6,
            "fixation_detector_version": ["fixation-v2.0"] * 6,
            "fixation_detector_sample_count": [3] * 6,
            "scenario": ["A"] * 6,
        }
    )


@pytest.mark.parametrize(
    ("duration_s", "expected"),
    [
        (-0.1, 0.0),
        (0.0, 0.0),
        (0.2, sqrt(0.1)),
        (1.0, sqrt(0.5)),
        (2.0, 1.0),
        (3.0, 1.0),
        (float("nan"), 0.0),
    ],
)
def test_radius_norm_uses_the_absolute_two_second_area_scale(duration_s, expected):
    actual = ScanpathAnalyticsService._scale_radius(np.array([duration_s]))

    assert actual[0] == pytest.approx(expected)


def test_same_duration_has_the_same_radius_in_every_participant_cohort():
    alone = ScanpathAnalyticsService._scale_radius(np.array([0.2]))[0]
    beside_a_long_fixation = ScanpathAnalyticsService._scale_radius(
        np.array([0.2, CAP_SECONDS])
    )[0]
    beside_a_short_fixation = ScanpathAnalyticsService._scale_radius(
        np.array([0.1, 0.2])
    )[1]

    assert alone == pytest.approx(sqrt(0.1))
    assert beside_a_long_fixation == pytest.approx(alone)
    assert beside_a_short_fixation == pytest.approx(alone)


def test_scanpath_exposes_total_dwell_and_absolute_scale_metadata():
    result = ScanpathAnalyticsService.compute_scanpath(_v2_frame(), "A")

    assert result["total_duration_s"] == pytest.approx(0.06)
    assert result["radius_scale"] == {
        "version": "absolute-area-v1",
        "encoding": "area",
        "cap_ms": 2000,
    }
    assert [item["radius_norm"] for item in result["objectives"]] == pytest.approx(
        [sqrt(0.03 / CAP_SECONDS)] * 2,
        abs=1e-6,
    )


def test_empty_and_legacy_cached_scanpaths_receive_safe_contract_defaults():
    empty = ScanpathAnalyticsService.compute_scanpath(pd.DataFrame(), "A")
    cached = ScanpathResponse(
        objectives=[],
        n_objectives=0,
        total_distance_px=0.0,
        avg_duration_s=0.0,
    )

    expected_scale = {
        "version": "absolute-area-v1",
        "encoding": "area",
        "cap_ms": 2000,
    }
    assert empty["total_duration_s"] == 0.0
    assert empty["radius_scale"] == expected_scale
    assert cached.total_duration_s == 0.0
    assert cached.radius_scale.model_dump() == expected_scale


class _CacheSpy:
    def __init__(self):
        self.key_args = None

    def build_key(self, *args, **kwargs):
        self.key_args = args
        return "cache-key"

    def get_json(self, key):
        return None

    def set_json(self, key, data, ttl=None):
        return None


@pytest.mark.asyncio
async def test_scanpath_route_uses_v4_cache_namespace(monkeypatch):
    project_id = uuid4()
    current_user = str(uuid4())
    frame = _v2_frame()
    cache = _CacheSpy()

    async def allow_ownership(*args, **kwargs):
        return SimpleNamespace(id=project_id, ingestion_generation=7)

    async def no_scenary(*args, **kwargs):
        return None

    class Reader:
        def __init__(self, db):
            pass

        async def read(self, project_id, participant_code, generation=None):
            return frame

    monkeypatch.setattr(routes, "_verify_ownership", allow_ownership)
    monkeypatch.setattr(routes, "_resolve_scenary_for_analytics", no_scenary)
    monkeypatch.setattr(routes, "ParquetReaderService", Reader)
    monkeypatch.setattr(routes, "_redis", cache)

    response = await routes.scanpath(
        project_id,
        participant_code="P-01",
        scenario="A",
        min_fixation_duration_ms=200,
        db=object(),
        current_user=current_user,
    )

    token = transform_cache_token(frame)
    assert response.radius_scale.version == "absolute-area-v1"
    assert cache.key_args == (
        project_id,
        "P-01",
        f"scanpath_v4:stimulus-v1:{token}:min-duration-200ms",
        "A",
    )

"""Cache ordering over real HTTP handlers and the existing synthetic corpus."""

import pytest

from neurodatics.modules.analytics.api import routes
from neurodatics.modules.analytics.domain.coordinate_transform import transform_cache_token

PREFIX = "/api/projects/00000000-0000-0000-0000-000000000101/analytics"
SPATIAL_ROUTES = [
    "/comparison/charts", "/gaze-at", "/timeseries/gaze", "/statistics/gaze",
    "/scanpath", "/fixations", "/heatmap", "/fixations/sensitivity",
    "/fixations/histogram", "/aois",
]


@pytest.fixture
def token_reads(http_client, corpus, monkeypatch):
    reader_class = routes.ParquetReaderService
    reads = []
    projects = []

    class CountingReader(reader_class):
        def __init__(self, db):
            reads.append("constructed")
            super().__init__(db)

    async def persist(db, project, participant_code, generation, token):
        assert token == transform_cache_token(corpus.frames[participant_code])
        existing = getattr(project, "analytics_transform_tokens", None) or {}
        project.analytics_transform_tokens = {
            **existing, participant_code: {"generation": generation, "token": token},
        }
        projects.append(project)

    monkeypatch.setattr(routes, "ParquetReaderService", CountingReader)
    monkeypatch.setattr(routes, "persist_transform_token", persist)
    return reads, projects


@pytest.mark.parametrize("endpoint", SPATIAL_ROUTES)
def test_spatial_cache_hit_never_constructs_a_reader(http_client, token_reads, endpoint):
    reads, _ = token_reads
    params = {"participant_code": "SYN-01", "scenario": "stimulus-a", "t_s": 1.2}
    first = http_client.get(PREFIX + endpoint, params=params)
    assert first.status_code == 200, first.text
    assert len(reads) == 1
    second = http_client.get(PREFIX + endpoint, params=params)
    assert second.status_code == 200, second.text
    assert second.content == first.content
    assert len(reads) == 1
    if endpoint == "/heatmap":
        conditional = http_client.get(
            PREFIX + endpoint, params=params, headers={"If-None-Match": first.headers["etag"]},
        )
        assert conditional.status_code == 304
        assert not conditional.content
        assert len(reads) == 1


def test_participants_and_new_generations_cannot_reuse_a_token(http_client, token_reads):
    reads, projects = token_reads
    params = {"participant_code": "SYN-01", "scenario": "stimulus-a"}
    path = PREFIX + "/statistics/gaze"
    first = http_client.get(path, params=params)
    assert first.status_code == 200
    project = projects[0]
    assert http_client.get(path, params={**params, "participant_code": "SYN-02"}).status_code == 200
    assert len(reads) == 2
    assert set(project.analytics_transform_tokens) == {"SYN-01", "SYN-02"}
    project.ingestion_generation = 1
    assert http_client.get(path, params=params).status_code == 200
    assert len(reads) == 3
    assert project.analytics_transform_tokens["SYN-01"]["generation"] == 1


def test_persisted_token_with_missing_response_reads_once(http_client, token_reads):
    reads, _ = token_reads
    params = {"participant_code": "SYN-01", "scenario": "stimulus-a"}
    path = PREFIX + "/statistics/gaze"
    assert http_client.get(path, params=params).status_code == 200
    routes._redis.values.clear()
    assert http_client.get(path, params=params).status_code == 200
    assert len(reads) == 2


def test_aoi_edit_invalidates_metrics_without_reingestion(http_client, token_reads, aois):
    reads, _ = token_reads
    params = {"participant_code": "SYN-01", "scenario": "stimulus-a"}
    path = PREFIX + "/aois"
    first = http_client.get(path, params=params)
    assert first.status_code == 200
    aois[0].name = "Updated region"
    aois[0].shape = {"x": 0, "y": 0, "width": 20, "height": 100}
    second = http_client.get(path, params=params)
    assert second.status_code == 200
    assert second.json() != first.json()
    assert any(aoi["name"] == "Updated region" for aoi in second.json()["aois"])
    assert len(reads) == 2


def test_comparison_cache_distinguishes_visualizations_and_point_caps(http_client, token_reads):
    reads, _ = token_reads
    params = {"participant_code": "SYN-01", "scenario": "stimulus-a"}
    path = PREFIX + "/comparison/charts"
    for extra in ({"max_points": 5}, {"max_points": 8}, {"visualizations": "pupil"}):
        response = http_client.get(path, params={**params, **extra})
        assert response.status_code == 200, response.text
    assert len(reads) == 3

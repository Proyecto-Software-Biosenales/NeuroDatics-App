"""All 23 analytics handlers execute over HTTP against the shared synthetic corpus."""

import io
from itertools import product

from PIL import Image
import pytest

from neurodatics.main import app

PREFIX = "/api/projects/00000000-0000-0000-0000-000000000101/analytics"
ROUTES = [
    "/participants", "/scenarios", "/correlations", "/comparison/charts",
    "/timeseries/pupil", "/statistics/pupil", "/gaze-at",
    "/timeseries/gaze", "/statistics/gaze", "/timeseries/distance", "/statistics/distance",
    "/timeseries/gsr", "/statistics/gsr", "/timeseries/eeg", "/psd/eeg",
    "/spectrogram/eeg", "/topography/eeg", "/scanpath", "/fixations", "/heatmap",
    "/fixations/sensitivity", "/fixations/histogram", "/aois",
]


def response_shape(value):
    """Pin actual serialized keys/types independently of production Pydantic schemas."""
    if isinstance(value, dict):
        return {key: response_shape(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        shapes = [response_shape(item) for item in value]
        return sorted({repr(shape): shape for shape in shapes}.values(), key=repr)
    if isinstance(value, (float, int)) and not isinstance(value, bool):
        return "number"
    return type(value).__name__


def test_contract_inventory_covers_every_analytics_route():
    mounted = {route.path.split("/analytics", 1)[1] for route in app.routes
               if "/analytics/" in getattr(route, "path", "")}
    assert mounted == set(ROUTES)
    assert len(ROUTES) == 23


@pytest.mark.parametrize("endpoint", ROUTES)
def test_successful_analytics_contract(http_client, endpoint, snapshot):
    shapes = {}
    for participant, scenario in product(("SYN-01", "SYN-02"), ("stimulus-a", "stimulus-b")):
        params = {"participant_code": participant, "scenario": scenario, "t_s": 1.2}
        response = http_client.get(PREFIX + endpoint, params=params)
        assert response.status_code == 200, response.text
        if endpoint == "/heatmap":
            assert response.headers["content-type"] == "image/png"
            assert response.headers["cache-control"] == "private, max-age=0, must-revalidate"
            assert response.headers["vary"] == "Authorization"
            assert response.headers["x-fixation-source"] == "raw_gaze"
            assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
            with Image.open(io.BytesIO(response.content)) as image:
                assert image.size == (1280, 720)
            conditional = http_client.get(PREFIX + endpoint, params=params,
                                          headers={"If-None-Match": response.headers["etag"]})
            assert conditional.status_code == 304
            assert not conditional.content
            shapes[f"{participant}/{scenario}"] = {
                "media_type": response.headers["content-type"],
                "headers": sorted(response.headers),
            }
        else:
            assert response.headers["content-type"] == "application/json"
            body = response.json()
            assert body
            for key in ("time", "frequency", "charts", "fixations", "objectives", "aois", "points"):
                if isinstance(body, dict) and key in body:
                    assert body[key], f"{endpoint} returned empty {key}"
            shapes[f"{participant}/{scenario}"] = response_shape(body)
            cached = http_client.get(PREFIX + endpoint, params=params)
            assert cached.status_code == 200
            assert cached.json() == body
    assert snapshot == shapes


@pytest.mark.parametrize("endpoint", [route for route in ROUTES if route not in ("/participants", "/scenarios")])
def test_analytics_unknown_participant_is_404(http_client, endpoint):
    response = http_client.get(PREFIX + endpoint, params={
        "participant_code": "MISSING", "scenario": "stimulus-a", "t_s": 1.2,
    })
    assert response.status_code == 404
    assert response.json() == {"detail": "Participant data not found"}

"""Cache hits skip I/O; read errors never become computation errors."""

import threading

import pytest

from neurodatics.modules.analytics.api import routes

PREFIX = "/api/projects/00000000-0000-0000-0000-000000000101/analytics"
PLAIN_ROUTES = [
    "/correlations", "/timeseries/pupil", "/statistics/pupil",
    "/timeseries/distance", "/statistics/distance", "/timeseries/gsr",
    "/statistics/gsr", "/timeseries/eeg", "/psd/eeg", "/spectrogram/eeg",
    "/topography/eeg",
]
PARAMS = {"participant_code": "SYN-01", "scenario": "stimulus-a"}


@pytest.mark.parametrize("endpoint", PLAIN_ROUTES)
def test_cached_json_skips_reader_and_compute(http_client, monkeypatch, endpoint):
    first = http_client.get(PREFIX + endpoint, params=PARAMS)
    assert first.status_code == 200, first.text

    def unexpected_read(db):
        pytest.fail("cache hit constructed a Parquet reader")

    monkeypatch.setattr(routes, "ParquetReaderService", unexpected_read)
    second = http_client.get(PREFIX + endpoint, params=PARAMS)
    assert second.status_code == 200, second.text
    assert second.content == first.content


@pytest.mark.parametrize("endpoint", ["/timeseries/pupil", "/scanpath"])
@pytest.mark.parametrize("error,status", [
    (ValueError("missing participant"), 404),
    (FileNotFoundError("missing file"), 404),
    (RuntimeError("storage unavailable"), 503),
])
def test_reader_error_mapping(http_client, monkeypatch, endpoint, error, status):
    class FailingReader:
        def __init__(self, db):
            pass

        async def read(self, *args, **kwargs):
            raise error

    monkeypatch.setattr(routes, "ParquetReaderService", FailingReader)
    response = http_client.get(PREFIX + endpoint, params=PARAMS)
    assert response.status_code == status
    assert response.json() == {"detail": str(error)}


def test_computation_error_stays_422_after_successful_read(http_client, monkeypatch):
    def invalid_computation(*args, **kwargs):
        raise ValueError("unsupported fixation variant")

    monkeypatch.setattr(routes.ScanpathAnalyticsService, "compute_scanpath", invalid_computation)
    response = http_client.get(PREFIX + "/scanpath", params=PARAMS)
    assert response.status_code == 422
    assert response.json() == {"detail": "unsupported fixation variant"}


def test_shared_compute_runs_off_the_request_thread(http_client, monkeypatch):
    request_threads = []
    compute_threads = []
    reader_class = routes.ParquetReaderService
    compute = routes.PupilAnalyticsService.compute_timeseries

    class ThreadReader(reader_class):
        async def read(self, *args, **kwargs):
            request_threads.append(threading.get_ident())
            return await super().read(*args, **kwargs)

    def tracked_compute(*args, **kwargs):
        compute_threads.append(threading.get_ident())
        return compute(*args, **kwargs)

    monkeypatch.setattr(routes, "ParquetReaderService", ThreadReader)
    monkeypatch.setattr(routes.PupilAnalyticsService, "compute_timeseries", tracked_compute)
    response = http_client.get(PREFIX + "/timeseries/pupil", params=PARAMS)
    assert response.status_code == 200, response.text
    assert len(request_threads) == len(compute_threads) == 1
    assert request_threads[0] != compute_threads[0]

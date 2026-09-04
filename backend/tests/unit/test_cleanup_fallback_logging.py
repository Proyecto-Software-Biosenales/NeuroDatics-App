"""Best-effort fallbacks stay usable and log no exception payloads."""

import logging
from types import SimpleNamespace

import googleapiclient.http
import pandas as pd
import pytest
from PIL import Image

from neurodatics.diagnostics import network_preflight
import neurodatics.infra.storage.gdrive_client as drive
from neurodatics.modules.projects.application.services import stimulus_probe_service as probe
from neurodatics.modules.reports.application.services import executive_report_service as report


SENSITIVE_ERROR = "token=private-test-token; /private/participant.csv"


def fail_with_sensitive_error(*args, **kwargs):
    raise OSError(SENSITIVE_ERROR)


def assert_safe_warning(caplog, operation):
    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert any(operation in record.getMessage() for record in warnings)
    assert any("OSError" in record.getMessage() for record in warnings)
    assert SENSITIVE_ERROR not in caplog.text
    assert all(record.exc_info is None for record in warnings)


@pytest.mark.asyncio
async def test_tcp_cleanup_warning_preserves_success(monkeypatch, caplog):
    class Writer:
        def close(self):
            pass

        async def wait_closed(self):
            fail_with_sensitive_error()

    async def open_connection(*args):
        return object(), Writer()

    monkeypatch.setattr(network_preflight.asyncio, "open_connection", open_connection)

    assert await network_preflight.probe_tcp("example.test", 5432, 1) == {"ok": True}
    assert_safe_warning(caplog, "TCP probe stream cleanup")


def test_drive_handle_cleanup_warning_preserves_upload(monkeypatch, tmp_path, caplog):
    local_file = tmp_path / "sample.csv"
    local_file.write_text("sample", encoding="utf-8")
    media = SimpleNamespace(stream=lambda: SimpleNamespace(close=fail_with_sensitive_error))
    monkeypatch.setattr(googleapiclient.http, "MediaFileUpload", lambda *a, **k: media)
    request = SimpleNamespace(execute=lambda **kwargs: {"id": "uploaded-file", "size": "6"})
    service = SimpleNamespace(files=lambda: SimpleNamespace(create=lambda **kwargs: request))
    client = drive.GoogleDriveClient()
    monkeypatch.setattr(client, "_require_service", lambda: service)

    result = client.upload_file("sample.csv", "text/csv", local_path=str(local_file))

    assert result["drive_file_id"] == "uploaded-file"
    assert result["size_bytes"] == 6
    assert_safe_warning(caplog, "Drive upload file-handle cleanup")


def test_exif_warning_preserves_unknown_orientation(caplog):
    image = SimpleNamespace(getexif=fail_with_sensitive_error)

    assert probe._exif_orientation(image) is None
    assert_safe_warning(caplog, "Stimulus EXIF orientation")


def test_heatmap_warning_preserves_missing_overlay(monkeypatch, caplog):
    base = Image.new("RGBA", (16, 16))
    monkeypatch.setattr(report.Image, "open", fail_with_sensitive_error)

    assert report._draw_heatmap(base, b"invalid-image") is None
    assert_safe_warning(caplog, "Executive report heatmap overlay")


def test_fixation_warning_preserves_other_report_assets(monkeypatch, caplog):
    monkeypatch.setattr(report, "_open_base_image", lambda value: Image.new("RGBA", (16, 16)))
    monkeypatch.setattr(
        report.HeatmapAnalyticsService, "compute_heatmap_overlay", lambda *a, **k: None
    )
    monkeypatch.setattr(
        report.ScanpathAnalyticsService, "compute_scanpath", lambda *a, **k: {"n_objectives": 0}
    )
    monkeypatch.setattr(
        report.FixationDataService, "compute_fixation_data", fail_with_sensitive_error
    )

    assets = report.build_spatial_assets([], pd.DataFrame(), "scenario", None, [])

    assert assets.heatmap is None
    assert assets.scanpath is None
    assert assets.spatial_metrics == []
    assert_safe_warning(caplog, "Executive report fixation summary")

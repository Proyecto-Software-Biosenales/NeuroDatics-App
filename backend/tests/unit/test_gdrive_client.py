import neurodatics.infra.storage.gdrive_client as gdrive_module


def test_drive_transport_preserves_resumable_upload_308(monkeypatch):
    captured = {}
    service = object()

    def fake_build(api_name, api_version, *, http, cache_discovery):
        assert (api_name, api_version) == ("drive", "v3")
        assert cache_discovery is False
        captured["authorized_http"] = http
        return service

    monkeypatch.setattr(gdrive_module, "build", fake_build)

    client = gdrive_module.GoogleDriveClient()
    client.set_oauth_credentials(object())
    client._initialize_service()

    assert client._service is service
    assert client._initialization_error is None

    base_http = captured["authorized_http"].http
    assert base_http.timeout == max(
        30, int(gdrive_module.settings.gdrive_http_timeout_seconds)
    )
    assert 308 not in base_http.redirect_codes
    assert 307 in base_http.redirect_codes

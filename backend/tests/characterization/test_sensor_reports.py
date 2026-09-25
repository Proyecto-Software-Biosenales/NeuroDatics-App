"""Device reports over the synthetic recording: content contract and HTTP packaging.

These are behaviour checks, not goldens: layout and chart bytes are free to
change, but every scenario must be covered, numbers must follow the dashboard's
definitions and the route must hand back one PDF per device.
"""

import io
import zipfile
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from PIL import Image

from neurodatics.modules.reports.application.sensor_reports import common, eeg, eye_tracking, gsr
from neurodatics.modules.reports.application.services.executive_report_service import ExecutiveReportService
from neurodatics.modules.reports.infrastructure.pdf_adapter import PDFAdapter

# The http_client fixture authorises and scopes requests to this synthetic project.
PROJECT_ID = UUID("00000000-0000-0000-0000-000000000101")

SCENARIOS = ("stimulus-a", "stimulus-b")
BUILDERS = {"EyeTracker": eye_tracking.build, "GSR": gsr.build, "EEG": eeg.build}


def _png(width=1280, height=720):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (240, 240, 240)).save(buffer, format="PNG")
    return buffer.getvalue()


def _context(frames, aois, device, group):
    codes = list(frames) if group else list(frames)[:1]
    participants = [
        common.ReportParticipant(code, alias, color, frames[code])
        for code, alias, color in common.participant_aliases(codes)
    ]
    scenarios = [
        common.ReportScenario(name, name, position, aois, _png())
        for position, name in enumerate(SCENARIOS, start=1)
    ]
    return common.ReportContext(
        project_name="Synthetic",
        device=common.DEVICES[device],
        participants=participants,
        scenarios=scenarios,
        group=group,
        generated_at=datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc),
    )


def _walk(blocks):
    for block in blocks:
        yield block
        if block["type"] == "columns":
            for stack in block["columns"]:
                yield from _walk(stack)
        elif block["type"] == "group":
            yield from _walk(block["blocks"])


def _all_blocks(document):
    yield from _walk(document.summary)
    for section in document.sections:
        yield from _walk(section["blocks"])


@pytest.mark.parametrize("group", [False, True], ids=["individual", "group"])
@pytest.mark.parametrize("device", ["EyeTracker", "GSR", "EEG"])
def test_device_report_covers_every_scenario_and_renders(corpus, aois, device, group):
    context = _context(corpus.frames, aois, device, group)

    document = BUILDERS[device](context)

    assert [section["title"] for section in document.sections] == list(SCENARIOS)
    blocks = list(_all_blocks(document))
    assert {"kpis", "figure", "table"} <= {block["type"] for block in blocks}
    assert not any(block["type"] == "callout" and block["title"] == "Sin datos" for block in blocks)
    referenced = {block["src"] for block in blocks if block["type"] == "figure"}
    referenced |= {item["src"] for block in blocks if block["type"] == "images" for item in block["items"]}
    assert referenced and referenced <= set(document.assets)
    assert any(block["type"] == "table" and block["title"] == "Participantes" for block in document.summary) == group
    pdf = PDFAdapter().render(document.as_json(), document.assets, timestamp=context.generated_at)
    assert pdf.startswith(b"%PDF")


def test_eye_tracking_ttff_is_measured_from_scenario_onset(corpus, aois):
    # The metrics service reports the first AOI fixation on the recording clock;
    # a late scenario makes the difference to onset-relative time obvious.
    frame = corpus.frames["SYN-01"].copy()
    frame["time"] = frame["time"] + 100.0
    participant = common.ReportParticipant("SYN-01", "P1", "#2a78d6", frame)
    scenario = common.ReportScenario("stimulus-a", "stimulus-a", 1, aois)

    recording = eye_tracking.collect(participant, scenario)

    fixated = [row for row in eye_tracking._aoi_rows(recording) if row.get("ttff_ms") is not None]
    assert fixated
    for row in fixated:
        assert row["ttff_ms"] >= 100_000.0
        assert 0.0 <= eye_tracking._relative_ttff_s(recording, row) <= recording.duration_s
    assert recording.first_fixation_s is not None and recording.first_fixation_s <= recording.duration_s


def test_eye_tracking_report_works_without_a_stimulus_image_or_aois(corpus):
    context = _context(corpus.frames, [], "EyeTracker", group=False)
    for scenario in context.scenarios:
        scenario.image = None

    document = eye_tracking.build(context)

    blocks = list(_all_blocks(document))
    assert any(block["type"] == "images" for block in blocks)
    assert not any(block["type"] == "table" and block["title"] == "Métricas por AOI" for block in blocks)
    assert any(
        block["type"] == "paragraph" and "lienzo neutro" in block["text"] for block in blocks
    )
    assert PDFAdapter().render(document.as_json(), document.assets).startswith(b"%PDF")


def test_gsr_report_flags_a_constant_sensor(corpus):
    frame = corpus.frames["SYN-01"].copy()
    frame["gsr"] = 0.93
    participant = common.ReportParticipant("SYN-01", "P1", "#2a78d6", frame)

    recording = gsr.collect(participant, common.ReportScenario("stimulus-a", "stimulus-a", 1))

    assert recording.stats.peak_percent == pytest.approx(0.0)
    assert "constante" in recording.flat_signal_notice


def test_eeg_relative_band_power_is_a_distribution(corpus):
    participant = common.ReportParticipant("SYN-01", "P1", "#2a78d6", corpus.frames["SYN-01"])

    recording = eeg.collect(participant, common.ReportScenario("stimulus-a", "stimulus-a", 1))

    assert recording.band_power
    for channel in recording.band_power:
        shares = [value for value in recording.relative_bands(channel).values() if value is not None]
        assert sum(shares) == pytest.approx(100.0)
    assert sum(value for value in recording.mean_relative_bands().values() if value is not None) == pytest.approx(100.0)


@pytest.fixture
def report_service(corpus, aois, monkeypatch):
    project = SimpleNamespace(
        id=PROJECT_ID,
        name="Proyecto Sintético",
        ingestion_generation=3,
        sensors=[SimpleNamespace(sensor_type=sensor) for sensor in ("EyeTracker", "GSR", "EEG")],
        participants=[SimpleNamespace(participant_code=code) for code in corpus.frames],
        scenaries=[
            SimpleNamespace(name=name, type="image", source_entry_path=f"{name}.png", file=None, file_id=None, aois=aois)
            for name in SCENARIOS
        ]
        + [SimpleNamespace(name="clip", type="video", source_entry_path="clip.mp4", file=None, file_id=None, aois=[])],
    )

    async def load_project(self, _project_id, _owner_id):
        return project

    async def read_frames(self, _project_id, codes, _generation=None):
        return {code: corpus.frames[code].copy() for code in codes}, []

    async def load_images(self, _project):
        return {name: _png() for name in SCENARIOS}

    monkeypatch.setattr(ExecutiveReportService, "_load_project", load_project)
    monkeypatch.setattr(ExecutiveReportService, "_read_participant_frames", read_frames)
    monkeypatch.setattr(ExecutiveReportService, "_load_scenario_images", load_images)
    return project


def test_report_route_returns_one_pdf_for_one_device(http_client, report_service):
    response = http_client.post(
        "/api/reports/executive",
        json={
            "project_id": str(PROJECT_ID),
            "scope": {"kind": "participant", "participant_code": "SYN-01"},
            "mode": {"kind": "sensor", "sensor": "GSR"},
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    disposition = response.headers["content-disposition"]
    assert 'filename="informe-gsr-proyecto-sintetico-participante-syn-01-' in disposition
    assert response.content.startswith(b"%PDF")


def test_report_route_packages_every_device_for_all_participants(http_client, report_service):
    response = http_client.post(
        "/api/reports/executive",
        json={
            "project_id": str(PROJECT_ID),
            "scope": {"kind": "all_participants"},
            "mode": {"kind": "comparative"},
            "include_cover": False,
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert 'filename="informes-proyecto-sintetico-grupo-' in response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert [name.split("-proyecto")[0] for name in names] == ["informe-eye-tracking", "informe-gsr", "informe-eeg"]
        assert all(archive.read(name).startswith(b"%PDF") for name in names)


def test_report_route_rejects_a_device_the_project_lacks(http_client, report_service):
    report_service.sensors = [SimpleNamespace(sensor_type="EyeTracker")]

    response = http_client.post(
        "/api/reports/executive",
        json={
            "project_id": str(PROJECT_ID),
            "scope": {"kind": "all_participants"},
            "mode": {"kind": "sensor", "sensor": "EEG"},
        },
    )

    assert response.status_code == 400
    assert "sensores" in response.json()["detail"]

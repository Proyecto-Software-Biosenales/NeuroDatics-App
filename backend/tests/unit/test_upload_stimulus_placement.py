from unittest.mock import Mock
from uuid import uuid4

import pytest

from neurodatics.modules.participants.domain.entities import Participant  # noqa: F401
from neurodatics.modules.projects.application.services.fixation_detection_service import (
    ScreenGeometry,
)
from neurodatics.modules.projects.application.services.zip_validation_service import (
    ZipManifestEntry,
)
from neurodatics.modules.projects.application.use_cases.upload_experiment_zip import (
    StimulusPlacementUploadError,
    UploadExperimentZipUseCase,
)
from neurodatics.modules.projects.domain.entities import ProjectFile

Image = pytest.importorskip(
    "PIL.Image", reason="placement validation probes intrinsic size"
)


def _entry(path: str = "Images/centered-square.png") -> ZipManifestEntry:
    return ZipManifestEntry(
        source_entry_path=path,
        filename=path.rsplit("/", 1)[-1],
        extension=".png",
        mime_type="image/png",
        size_bytes=1,
        kind="scenario_image",
    )


def _payload(path: str = "Images/centered-square.png") -> dict:
    return {
        "source_entry_path": path,
        "placement": {
            "geometry_stability": "static",
            "contract_version": "screen-stimulus-v1",
            "screen_width_px": 1920,
            "screen_height_px": 1080,
            "stimulus_left_px": 420,
            "stimulus_top_px": 0,
            "stimulus_width_px": 1080,
            "stimulus_height_px": 1080,
            "display_mode": "contain",
        },
    }


def _write_square(tmp_path):
    image_path = tmp_path / "centered-square.png"
    Image.new("RGB", (1080, 1080), (200, 200, 200)).save(image_path)
    return str(image_path)


def test_upload_resolves_and_attaches_centered_placement(tmp_path):
    use_case = UploadExperimentZipUseCase(repository=Mock())
    local_path = _write_square(tmp_path)

    resolved = use_case._resolve_stimulus_placements(
        [_payload()],
        manifest_entries=[_entry()],
        extracted_files={"Images/centered-square.png": local_path},
        screen_geometry=None,
    )

    contract = resolved.by_scenario_name["centered-square"]
    assert contract.to_snapshot()["contract_fingerprint"] == contract.fingerprint
    assert contract.stimulus_left_px == 420

    project_file = ProjectFile(
        id=uuid4(),
        project_id=uuid4(),
        kind="scenario_image",
        storage_provider="gdrive",
        external_id="drive-id",
        filename="centered-square.png",
        source_entry_path="Images/centered-square.png",
    )
    scenary = use_case._build_scenary_from_file(
        project_file,
        local_path,
        placement_contract=contract,
    )
    assert scenary.stimulus_placement.contract_fingerprint == contract.fingerprint
    assert scenary.stimulus_placement.screen_width_px == 1920


def test_upload_rejects_unknown_stimulus_path(tmp_path):
    use_case = UploadExperimentZipUseCase(repository=Mock())
    local_path = _write_square(tmp_path)

    with pytest.raises(StimulusPlacementUploadError) as exc:
        use_case._resolve_stimulus_placements(
            [_payload("Images/missing.png")],
            manifest_entries=[_entry()],
            extracted_files={"Images/centered-square.png": local_path},
            screen_geometry=None,
        )

    assert exc.value.code == "unknown_stimulus_path"


def test_upload_rejects_screen_calibration_mismatch(tmp_path):
    use_case = UploadExperimentZipUseCase(repository=Mock())
    local_path = _write_square(tmp_path)
    physical = ScreenGeometry(
        width_px=2560,
        height_px=1440,
        width_mm=600,
        height_mm=340,
        viewing_distance_mm=650,
    )

    with pytest.raises(StimulusPlacementUploadError) as exc:
        use_case._resolve_stimulus_placements(
            [_payload()],
            manifest_entries=[_entry()],
            extracted_files={"Images/centered-square.png": local_path},
            screen_geometry=physical,
        )

    assert exc.value.code == "screen_geometry_mismatch"


def test_upload_rejects_known_time_varying_geometry(tmp_path):
    use_case = UploadExperimentZipUseCase(repository=Mock())
    local_path = _write_square(tmp_path)
    payload = _payload()
    payload["placement"]["geometry_stability"] = "time_varying"

    with pytest.raises(StimulusPlacementUploadError) as exc:
        use_case._resolve_stimulus_placements(
            [payload],
            manifest_entries=[_entry()],
            extracted_files={"Images/centered-square.png": local_path},
            screen_geometry=None,
        )

    assert exc.value.code == "dynamic_stimulus_geometry_not_supported"


def test_upload_rejects_ambiguous_media_identity(tmp_path):
    use_case = UploadExperimentZipUseCase(repository=Mock())
    local_path = _write_square(tmp_path)
    second = _entry("Images/CENTERED-SQUARE.png")

    with pytest.raises(StimulusPlacementUploadError) as exc:
        use_case._resolve_stimulus_placements(
            [_payload()],
            manifest_entries=[_entry(), second],
            extracted_files={
                "Images/centered-square.png": local_path,
                "Images/CENTERED-SQUARE.png": local_path,
            },
            screen_geometry=None,
        )

    assert exc.value.code == "ambiguous_stimulus_identity"

"""Ingestion is what puts a stimulus' real size on its ``scenaries`` row.

The heatmap endpoint reads ``Scenaries.width``/``height`` to decide the pixel
size of the overlay it renders. Those columns existed but were hard-coded to
``None``, so every stimulus - square, ultrawide or otherwise - was analysed as
if it were 1920x1080.
"""

import io
from unittest.mock import Mock
from uuid import uuid4

import pytest

# Imported so the ORM mappers this use case builds can resolve their
# relationships by name.
from neurodatics.modules.participants.domain.entities import Participant  # noqa: F401
from neurodatics.modules.scenaries.domain.entities import AOI, Scenaries  # noqa: F401
from neurodatics.modules.projects.application.use_cases.upload_experiment_zip import (
    UploadExperimentZipUseCase,
)
from neurodatics.modules.projects.domain.entities import ProjectFile

Image = pytest.importorskip("PIL.Image", reason="image probing needs Pillow")


@pytest.fixture
def use_case():
    return UploadExperimentZipUseCase(repository=Mock())


def _stimulus_file(kind: str = "scenario_image", filename: str = "Crem helado.jpeg") -> ProjectFile:
    return ProjectFile(
        id=uuid4(),
        project_id=uuid4(),
        kind=kind,
        storage_provider="gdrive",
        external_id="drive-id",
        filename=filename,
        source_entry_path=f"stimuli/{filename}",
    )


def _write_image(path, width: int, height: int) -> str:
    Image.new("RGB", (width, height), (200, 200, 200)).save(path, format="JPEG")
    return str(path)


@pytest.mark.parametrize("width,height", [(800, 800), (1920, 1080), (3440, 1440)])
def test_a_scenario_records_the_stimulus_dimensions(use_case, tmp_path, width, height):
    local_path = _write_image(tmp_path / "Crem helado.jpeg", width, height)

    scenary = use_case._build_scenary_from_file(_stimulus_file(), local_path)

    assert (scenary.width, scenary.height) == (width, height)
    assert scenary.name == "Crem helado"
    assert scenary.type == "image"


def test_an_unreadable_stimulus_still_produces_a_scenario(use_case, tmp_path):
    """A stimulus we cannot measure must not fail the upload."""

    local_path = tmp_path / "corrupt.jpeg"
    local_path.write_bytes(b"not an image")

    scenary = use_case._build_scenary_from_file(_stimulus_file(), str(local_path))

    assert scenary is not None
    assert scenary.width is None and scenary.height is None


def test_dimensions_are_absent_when_the_file_was_never_localised(use_case):
    scenary = use_case._build_scenary_from_file(_stimulus_file(), None)

    assert scenary is not None
    assert scenary.width is None and scenary.height is None


def test_a_non_stimulus_file_never_becomes_a_scenario(use_case, tmp_path):
    local_path = _write_image(tmp_path / "whatever.jpeg", 640, 480)

    assert use_case._build_scenary_from_file(_stimulus_file(kind="raw_csv"), local_path) is None

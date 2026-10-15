from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

# Import every relationship target before constructing ORM instances so the
# repository's global SQLAlchemy mapper registry can resolve string targets.
from neurodatics.modules.participants.domain.entities import Participant  # noqa: F401
from neurodatics.modules.projects.domain.entities import Project  # noqa: F401
from neurodatics.modules.projects.domain.entities import ProjectFile  # noqa: F401
from neurodatics.modules.scenaries.api.schemas import (
    StimulusPlacementRequest,
    StimulusPlacementResponse,
    scenariesRequest,
)
from neurodatics.modules.scenaries.domain.entities import AOI  # noqa: F401
from neurodatics.modules.scenaries.domain.entities import Scenaries, StimulusPlacement
from neurodatics.modules.scenaries.domain.stimulus_placement import (
    StimulusPlacementContract,
    StimulusPlacementRequiresReprocessing,
    StimulusPlacementValidationError,
)
from neurodatics.modules.scenaries.infrastructure.repository_impl import (
    SQLscenariesRepository,
)


def _centered_payload(**overrides):
    payload = {
        "geometry_stability": "static",
        "contract_version": "screen-stimulus-v1",
        "screen_width_px": 1920,
        "screen_height_px": 1080,
        "stimulus_left_px": 420,
        "stimulus_top_px": 0,
        "stimulus_width_px": 1080,
        "stimulus_height_px": 1080,
        "display_mode": "contain",
    }
    payload.update(overrides)
    return payload


def _centered_contract(**overrides):
    return StimulusPlacementContract.from_dict(
        _centered_payload(**overrides),
        intrinsic_width=1080,
        intrinsic_height=1080,
    )


def test_contract_materializes_defaults_and_has_stable_fingerprint():
    omitted = _centered_contract()
    explicit = _centered_contract(
        viewport={
            "left_px": 0.0,
            "top_px": 0.0,
            "width_px": 1920.0,
            "height_px": 1080.0,
            "scroll_x_px": 0.0,
            "scroll_y_px": 0.0,
        }
    )

    assert omitted.to_dict()["viewport"] == {
        "left_px": 0,
        "top_px": 0,
        "width_px": 1920,
        "height_px": 1080,
        "scroll_x_px": 0,
        "scroll_y_px": 0,
    }
    assert omitted.fingerprint == explicit.fingerprint
    assert len(omitted.fingerprint) == 64
    assert (
        omitted.fingerprint
        == "1a7baf6af0b3856b3d26de5e1d891a0c0aab27674e246d65111d9895fd8e29bc"
    )
    assert omitted.to_snapshot()["contract_fingerprint"] == omitted.fingerprint


def test_dynamic_geometry_is_a_named_preprocessing_error():
    with pytest.raises(StimulusPlacementValidationError) as exc_info:
        _centered_contract(geometry_stability="time_varying")

    assert exc_info.value.code == "dynamic_stimulus_geometry_not_supported"


def test_fullscreen_is_valid_only_when_explicit_and_equal_to_the_screen():
    fullscreen = StimulusPlacementContract.from_dict(
        _centered_payload(
            display_mode="fullscreen",
            stimulus_left_px=0,
            stimulus_top_px=0,
            stimulus_width_px=1920,
            stimulus_height_px=1080,
        )
    )
    assert fullscreen.display_mode == "fullscreen"

    with pytest.raises(StimulusPlacementValidationError):
        StimulusPlacementContract.from_dict(
            _centered_payload(display_mode="fullscreen")
        )


def test_contain_requires_intrinsic_dimensions_but_crop_does_not():
    with pytest.raises(StimulusPlacementValidationError) as exc_info:
        StimulusPlacementContract.from_dict(_centered_payload())
    assert exc_info.value.code == "intrinsic_dimensions_required_for_display_mode"

    crop = StimulusPlacementContract.from_dict(
        _centered_payload(
            display_mode="crop",
            stimulus_left_px=-100,
            viewport={
                "left_px": 100,
                "top_px": 100,
                "width_px": 800,
                "height_px": 800,
            },
        )
    )
    assert crop.stimulus_left_px == -100


def test_partial_viewport_and_client_provenance_are_rejected():
    with pytest.raises(StimulusPlacementValidationError):
        _centered_contract(viewport={"left_px": 0, "top_px": 0, "width_px": 100})

    with pytest.raises(ValidationError):
        StimulusPlacementRequest.model_validate(
            {**_centered_payload(), "source": "acquisition_metadata"}
        )

    with pytest.raises(ValidationError):
        StimulusPlacementRequest.model_validate(
            _centered_payload(
                viewport={
                    "left_px": 0,
                    "top_px": 0,
                    "width_px": 1920,
                    "height_px": 1080,
                    "scroll_x_px": 10,
                }
            )
        )

    with pytest.raises(ValidationError):
        StimulusPlacementRequest.model_validate(_centered_payload(screen_width_px=True))


def test_orm_constructor_and_typed_response_round_trip():
    contract = _centered_contract()
    placement = StimulusPlacement.from_contract(contract)

    assert placement.contract_fingerprint == contract.fingerprint
    assert placement.to_contract().fingerprint == contract.fingerprint
    response = StimulusPlacementResponse.model_validate(placement)
    assert response.source == "user_config"
    assert response.viewport is None
    assert response.stimulus_left_px == 420


def test_scenario_request_preserves_placement_tristate():
    omitted = scenariesRequest(name="A", type="image")
    cleared = scenariesRequest(name="A", type="image", stimulus_placement=None)
    replaced = scenariesRequest(
        name="A",
        type="image",
        stimulus_placement=StimulusPlacementRequest.model_validate(_centered_payload()),
    )

    assert "stimulus_placement" not in omitted.model_dump(exclude_unset=True)
    assert cleared.model_dump(exclude_unset=True)["stimulus_placement"] is None
    assert isinstance(
        replaced.model_dump(exclude_unset=True)["stimulus_placement"], dict
    )


def test_orm_table_exposes_one_to_one_constraint_and_database_checks():
    table = StimulusPlacement.__table__
    constraint_names = {constraint.name for constraint in table.constraints}

    assert table.name == "stimulus_placements"
    assert "uq_stimulus_placements_scenaries_id" in constraint_names
    assert "ck_stimulus_placements_viewport_atomic" in constraint_names
    assert "ck_stimulus_placements_display_size_positive_finite" in constraint_names
    assert next(iter(table.c.scenaries_id.foreign_keys)).ondelete == "CASCADE"
    assert Scenaries.stimulus_placement.property.uselist is False


class _FakeResult:
    def __init__(self, *, rows=None, scalar=None):
        self._rows = rows or []
        self._scalar = scalar

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def scalar_one_or_none(self):
        return self._scalar


class _FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.added = []
        self.committed = False

    async def execute(self, _statement):
        return self.responses.pop(0)

    def add(self, instance):
        self.added.append(instance)

    async def commit(self):
        self.committed = True


def _existing_scenario(contract=None):
    scenario = Scenaries(
        id=uuid4(),
        project_id=uuid4(),
        name="A",
        type="image",
        file_id=uuid4(),
        source_entry_path="Images/A.png",
        width=1080,
        height=1080,
    )
    scenario.stimulus_placement = StimulusPlacement.from_contract(
        contract or _centered_contract()
    )
    return scenario


@pytest.mark.asyncio
async def test_repository_omission_preserves_placement_for_unchanged_media():
    scenario = _existing_scenario()
    original = scenario.stimulus_placement
    session = _FakeSession(
        [
            _FakeResult(rows=[scenario]),
            _FakeResult(scalar=None),
            _FakeResult(rows=[scenario]),
        ]
    )

    result = await SQLscenariesRepository(session).upsert_scenaries(
        scenario.project_id,
        [{"name": "A", "type": "image"}],
    )

    assert session.committed is True
    assert result[0].stimulus_placement is original


@pytest.mark.asyncio
async def test_repository_explicit_null_clears_unprocessed_placement():
    scenario = _existing_scenario()
    session = _FakeSession(
        [
            _FakeResult(rows=[scenario]),
            _FakeResult(scalar=None),
            _FakeResult(rows=[scenario]),
        ]
    )

    await SQLscenariesRepository(session).upsert_scenaries(
        scenario.project_id,
        [{"name": "A", "type": "image", "stimulus_placement": None}],
    )

    assert scenario.stimulus_placement is None


@pytest.mark.asyncio
async def test_repository_object_replaces_unprocessed_placement():
    scenario = _existing_scenario()
    previous_fingerprint = scenario.stimulus_placement.contract_fingerprint
    replacement = _centered_payload(
        display_mode="crop",
        stimulus_left_px=100,
        stimulus_top_px=50,
        stimulus_width_px=800,
        stimulus_height_px=800,
        viewport={
            "left_px": 100,
            "top_px": 50,
            "width_px": 800,
            "height_px": 800,
        },
    )
    session = _FakeSession(
        [
            _FakeResult(rows=[scenario]),
            _FakeResult(scalar=None),
            _FakeResult(rows=[scenario]),
        ]
    )

    await SQLscenariesRepository(session).upsert_scenaries(
        scenario.project_id,
        [
            {
                "name": "A",
                "type": "image",
                "stimulus_placement": replacement,
            }
        ],
    )

    assert scenario.stimulus_placement.display_mode == "crop"
    assert scenario.stimulus_placement.stimulus_left_px == 100
    assert scenario.stimulus_placement.contract_fingerprint != previous_fingerprint


@pytest.mark.asyncio
async def test_repository_media_replacement_without_geometry_clears_old_geometry():
    scenario = _existing_scenario()
    session = _FakeSession(
        [
            _FakeResult(rows=[scenario]),
            _FakeResult(scalar=None),
            _FakeResult(rows=[scenario]),
        ]
    )

    await SQLscenariesRepository(session).upsert_scenaries(
        scenario.project_id,
        [
            {
                "name": "A",
                "type": "image",
                "file_id": uuid4(),
                "source_entry_path": "Images/replacement.png",
            }
        ],
    )

    assert scenario.stimulus_placement is None


@pytest.mark.asyncio
async def test_repository_rejects_processed_project_geometry_mutation_before_changes():
    scenario = _existing_scenario()
    original = scenario.stimulus_placement
    session = _FakeSession(
        [
            _FakeResult(rows=[scenario]),
            _FakeResult(scalar=uuid4()),
        ]
    )

    with pytest.raises(StimulusPlacementRequiresReprocessing) as exc_info:
        await SQLscenariesRepository(session).upsert_scenaries(
            scenario.project_id,
            [{"name": "A", "type": "image", "stimulus_placement": None}],
        )

    assert exc_info.value.code == "stimulus_placement_requires_reprocessing"
    assert session.committed is False
    assert scenario.stimulus_placement is original

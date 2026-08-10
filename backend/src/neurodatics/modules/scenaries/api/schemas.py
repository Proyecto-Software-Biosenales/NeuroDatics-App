from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    model_validator,
)
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID


class StimulusViewportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    left_px: StrictFloat = Field(allow_inf_nan=False)
    top_px: StrictFloat = Field(allow_inf_nan=False)
    width_px: StrictFloat = Field(gt=0, allow_inf_nan=False)
    height_px: StrictFloat = Field(gt=0, allow_inf_nan=False)
    scroll_x_px: StrictFloat = Field(default=0, ge=0, allow_inf_nan=False)
    scroll_y_px: StrictFloat = Field(default=0, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_scroll_pair(self):
        supplied = self.model_fields_set
        if ("scroll_x_px" in supplied) != ("scroll_y_px" in supplied):
            raise ValueError("scroll_x_px and scroll_y_px must be supplied together")
        return self


class StimulusPlacementRequest(BaseModel):
    """Client-writable placement; provenance and fingerprint are backend-only."""

    model_config = ConfigDict(extra="forbid")

    geometry_stability: Literal["static", "time_varying"]
    contract_version: Literal["screen-stimulus-v1"]
    screen_width_px: StrictInt = Field(gt=0)
    screen_height_px: StrictInt = Field(gt=0)
    stimulus_left_px: StrictFloat = Field(allow_inf_nan=False)
    stimulus_top_px: StrictFloat = Field(allow_inf_nan=False)
    stimulus_width_px: StrictFloat = Field(gt=0, allow_inf_nan=False)
    stimulus_height_px: StrictFloat = Field(gt=0, allow_inf_nan=False)
    display_mode: Literal["contain", "cover", "crop", "fullscreen"]
    viewport: Optional[StimulusViewportRequest] = None


class StimulusViewportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    left_px: float
    top_px: float
    width_px: float
    height_px: float
    scroll_x_px: float
    scroll_y_px: float


class StimulusPlacementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    geometry_stability: Literal["static"]
    contract_version: Literal["screen-stimulus-v1"]
    screen_width_px: int
    screen_height_px: int
    stimulus_left_px: float
    stimulus_top_px: float
    stimulus_width_px: float
    stimulus_height_px: float
    display_mode: Literal["contain", "cover", "crop", "fullscreen"]
    viewport: Optional[StimulusViewportResponse] = None
    source: Literal["user_config", "acquisition_metadata"]
    contract_fingerprint: str


class scenariesRequest(BaseModel):
    name: str
    type: str
    file_id: Optional[UUID] = None
    source_entry_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    duration_ms: Optional[int] = None
    # Tri-state: omitted preserves for unchanged media, null clears, object replaces.
    stimulus_placement: Optional[StimulusPlacementRequest] = None


class UpdatescenariesRequest(BaseModel):
    scenaries: List[scenariesRequest]


class AOIRequest(BaseModel):
    scenaries_name: str
    name: str
    color: str
    shape_type: str
    shape: Dict[str, Any]


class UpdateAOIsRequest(BaseModel):
    aois: List[AOIRequest]


class AOIResponse(BaseModel):
    id: UUID
    scenaries_id: UUID
    name: str
    color: str
    shape_type: str
    shape: Dict[str, Any]

    class Config:
        from_attributes = True


class scenariesResponse(BaseModel):
    id: UUID
    name: str
    type: str
    file_id: Optional[UUID]
    source_entry_path: Optional[str]
    width: Optional[int]
    height: Optional[int]
    fps: Optional[int]
    duration_ms: Optional[int]
    stimulus_placement: Optional[StimulusPlacementResponse] = None
    aois: List[AOIResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True

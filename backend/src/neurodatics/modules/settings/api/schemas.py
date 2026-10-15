"""Screen shared by every experiment of a person, used to prefill new projects."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# The laboratory monitor.
DEFAULT_SCREEN_WIDTH_PX = 1280
DEFAULT_SCREEN_HEIGHT_PX = 1024

# Fields of earlier versions, dropped when a stored screen is read so it still validates: the model was a
# label nothing used, and the viewing distance comes from each CSV's own distance column.
RETIRED_SCREEN_FIELDS = ("model", "viewing_distance_cm")


class ScreenSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    width_px: int = Field(default=DEFAULT_SCREEN_WIDTH_PX, gt=0, le=100000, strict=True)
    height_px: int = Field(default=DEFAULT_SCREEN_HEIGHT_PX, gt=0, le=100000, strict=True)
    width_cm: Optional[float] = Field(default=None, gt=0, le=10000)
    height_cm: Optional[float] = Field(default=None, gt=0, le=10000)


class ScreenSettingsEnvelope(BaseModel):
    screen: ScreenSettings
    confirmed: bool

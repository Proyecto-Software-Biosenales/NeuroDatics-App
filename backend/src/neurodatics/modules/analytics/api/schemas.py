from typing import List, Optional

from pydantic import BaseModel


class ParticipantItem(BaseModel):
    participant_code: str
    user_index: int


class ScenarioItem(BaseModel):
    name: str
    type: str
    file_id: Optional[str] = None


class PupilTimeseriesResponse(BaseModel):
    time: List[float]
    left: List[float]
    right: List[float]
    average: List[float]
    smooth_left: List[float]
    smooth_right: List[float]


class PupilStatisticsResponse(BaseModel):
    mean: float
    min: float
    max: float
    std: float
    median: float
    baseline: float


class GazeAtResponse(BaseModel):
    requested_time_s: float
    nearest_time_s: float
    scenario: Optional[str] = None
    gx: Optional[float] = None
    gy: Optional[float] = None
    scenario_file_id: Optional[str] = None

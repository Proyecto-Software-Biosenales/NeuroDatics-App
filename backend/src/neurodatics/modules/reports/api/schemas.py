from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, model_validator


ReportSensor = Literal["EyeTracker", "EEG", "GSR"]


class ExecutiveReportScope(BaseModel):
    kind: Literal["participant", "all_participants"]
    participant_code: Optional[str] = None

    @model_validator(mode="after")
    def validate_participant_scope(self):
        if self.kind == "participant" and not (self.participant_code or "").strip():
            raise ValueError("participant_code is required for participant scope")
        if self.kind == "all_participants":
            self.participant_code = None
        return self


class ExecutiveReportMode(BaseModel):
    kind: Literal["comparative", "sensor"]
    sensor: Optional[ReportSensor] = None

    @model_validator(mode="after")
    def validate_sensor_mode(self):
        if self.kind == "sensor" and self.sensor is None:
            raise ValueError("sensor is required for sensor mode")
        if self.kind == "comparative":
            self.sensor = None
        return self


class ExecutiveReportRequest(BaseModel):
    project_id: UUID
    scope: ExecutiveReportScope
    mode: ExecutiveReportMode
    scenario_scope: Literal["all_by_sections"] = "all_by_sections"
    include_cover: bool = True
    include_metadata: bool = True

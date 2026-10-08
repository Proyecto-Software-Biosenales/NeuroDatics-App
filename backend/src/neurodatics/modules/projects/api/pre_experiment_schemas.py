"""Versioned planning metadata, independent from acquisition participants."""

from datetime import datetime, timezone
import json
from typing import Annotated, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, field_validator, model_validator


class PlanningModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class PlanningParticipant(PlanningModel):
    id: UUID
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    identification_document: str = Field(default="", max_length=100)
    gender: str = Field(default="", max_length=100)
    age: Optional[int] = Field(default=None, ge=0, le=150, strict=True)
    notes: str = Field(default="", max_length=10000)

    @field_validator("code", "name")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El nombre y el código del participante no pueden estar vacíos")
        return value


class PlanningScreen(PlanningModel):
    model: str = Field(default="", max_length=255)
    width_px: Optional[int] = Field(default=None, gt=0, le=100000, strict=True)
    height_px: Optional[int] = Field(default=None, gt=0, le=100000, strict=True)
    width_cm: Optional[float] = Field(default=None, gt=0, le=10000)
    height_cm: Optional[float] = Field(default=None, gt=0, le=10000)
    viewing_distance_cm: Optional[float] = Field(default=None, gt=0, le=10000)
    notes: str = Field(default="", max_length=10000)


class QuestionOption(PlanningModel):
    id: UUID
    label: str = Field(min_length=1, max_length=1000)

    @field_validator("label")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("La opción necesita un texto")
        return value.strip()


class PlanningQuestion(PlanningModel):
    id: UUID
    type: Literal["multiple_choice", "open_text", "true_false"]
    prompt: str = Field(min_length=1, max_length=5000)
    required: StrictBool = True
    options: list[QuestionOption] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_question(self):
        if not self.prompt.strip():
            raise ValueError("La pregunta necesita un enunciado")
        self.prompt = self.prompt.strip()
        if self.type == "multiple_choice":
            if len(self.options) < 2:
                raise ValueError("La selección múltiple requiere al menos dos opciones")
            if len({option.id for option in self.options}) != len(self.options):
                raise ValueError("Los identificadores de las opciones deben ser únicos")
        elif self.options:
            raise ValueError("Solo las preguntas de selección múltiple tienen opciones")
        return self


class PlanningQuestionnaire(PlanningModel):
    enabled: StrictBool = False
    title: str = Field(default="Cuestionario", min_length=1, max_length=255)
    questions: list[PlanningQuestion] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def unique_questions(self):
        if self.enabled and not self.questions:
            raise ValueError("Un cuestionario habilitado requiere al menos una pregunta")
        if not self.title.strip():
            raise ValueError("El cuestionario necesita un título")
        self.title = self.title.strip()
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("Los identificadores de preguntas deben ser únicos")
        return self


class PlanningQuestionnaires(PlanningModel):
    before: PlanningQuestionnaire = Field(default_factory=lambda: PlanningQuestionnaire(title="Cuestionario antes del experimento"))
    after: PlanningQuestionnaire = Field(default_factory=lambda: PlanningQuestionnaire(title="Cuestionario después del experimento"))


class PreExperimentConfig(PlanningModel):
    participants: list[PlanningParticipant] = Field(default_factory=list, max_length=1000)
    screen: PlanningScreen = Field(default_factory=PlanningScreen)
    notes: str = Field(default="", max_length=50000)
    questionnaires: PlanningQuestionnaires = Field(default_factory=PlanningQuestionnaires)

    @model_validator(mode="after")
    def unique_participants(self):
        if len({participant.id for participant in self.participants}) != len(self.participants):
            raise ValueError("Los identificadores de participantes deben ser únicos")
        if len({participant.code.casefold() for participant in self.participants}) != len(self.participants):
            raise ValueError("Los códigos de participantes deben ser únicos")
        if len(json.dumps(self.model_dump(mode="json")).encode("utf-8")) > 2 * 1024 * 1024:
            raise ValueError("La configuración excede el límite de 2 MB")
        return self


class UpdatePreExperimentRequest(PlanningModel):
    revision: int = Field(ge=0, strict=True)
    config: PreExperimentConfig


Answer = Union[Annotated[StrictStr, Field(max_length=20000)], StrictBool, Annotated[list[StrictStr], Field(max_length=100)]]


class SubmitPreExperimentResponseRequest(PlanningModel):
    revision: int = Field(ge=0, strict=True)
    participant_id: UUID
    phase: Literal["before", "after"]
    answers: dict[str, Answer] = Field(max_length=200)


class SavedPreExperimentResponse(PlanningModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: UUID
    revision: int
    participant_id: UUID
    phase: Literal["before", "after"]
    participant_snapshot: PlanningParticipant
    questionnaire_snapshot: PlanningQuestionnaire
    answers: dict[str, Answer]
    submitted_at: datetime

    @field_validator("submitted_at")
    @classmethod
    def utc_submission_time(cls, value: datetime) -> datetime:
        # SQLite drops the zone; every submission is recorded in UTC.
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class PreExperimentEnvelope(PlanningModel):
    revision: int
    config: PreExperimentConfig
    responses: list[SavedPreExperimentResponse]

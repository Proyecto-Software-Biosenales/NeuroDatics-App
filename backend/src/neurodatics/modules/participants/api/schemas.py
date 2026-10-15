from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from enum import Enum


class Sex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class ParticipantRequest(BaseModel):
    # Identifier extracted from the recording; it is the key and is never edited.
    participant_code: str
    age: Optional[int] = None
    sex: Optional[Sex] = None
    # Omitted fields keep the stored value; blank strings clear it.
    name: Optional[str] = Field(default=None, max_length=120)
    document: Optional[str] = Field(default=None, max_length=50)

    @field_validator("name", "document", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        if isinstance(value, str):
            value = " ".join(value.split())
            return value or None
        return value


class UpdateParticipantsRequest(BaseModel):
    participants: List[ParticipantRequest]


class ParticipantResponse(BaseModel):
    participant_code: str
    age: Optional[int]
    sex: Optional[str]
    name: Optional[str] = None
    document: Optional[str] = None

    class Config:
        from_attributes = True

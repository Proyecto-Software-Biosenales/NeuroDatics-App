from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class Sex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class ParticipantRequest(BaseModel):
    participant_code: str  # Can be document ID directly for now
    age: Optional[int] = None
    sex: Optional[Sex] = None


class UpdateParticipantsRequest(BaseModel):
    participants: List[ParticipantRequest]


class ParticipantResponse(BaseModel):
    participant_code: str
    age: Optional[int]
    sex: Optional[str]
    
    class Config:
        from_attributes = True

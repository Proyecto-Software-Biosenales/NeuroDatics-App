from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID


class scenariesRequest(BaseModel):
    name: str
    type: str
    file_id: Optional[UUID] = None
    source_entry_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    duration_ms: Optional[int] = None


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
    aois: List[AOIResponse] = []
    
    class Config:
        from_attributes = True

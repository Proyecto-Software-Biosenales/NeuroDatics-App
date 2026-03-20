from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID


class scenariesRequest(BaseModel):
    name: str
    type: str
    file_id: Optional[UUID] = None
    width: Optional[int] = None
    height: Optional[int] = None


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
    width: Optional[int]
    height: Optional[int]
    aois: List[AOIResponse] = []
    
    class Config:
        from_attributes = True
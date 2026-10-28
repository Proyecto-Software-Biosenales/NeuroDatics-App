from pydantic import BaseModel, Field
from typing import Optional


class GoogleAuthorizeRequest(BaseModel):
    code: str = Field(min_length=1)
    redirect_uri: Optional[str] = None


class AuthUserResponse(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


class GoogleLoginUrlResponse(BaseModel):
    authorization_url: str


class GoogleAuthorizeResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: AuthUserResponse


class LocalSessionRequest(BaseModel):
    profile_id: Optional[str] = None


class LocalSessionResponse(BaseModel):
    """No token and no user when this computer has no profile yet."""
    mode: str = "local"
    access_token: Optional[str] = None
    token_type: str = "Bearer"
    expires_in: int = 0
    user: Optional[AuthUserResponse] = None


class LocalProfileResponse(BaseModel):
    id: str
    name: str
    project_count: int


class CreateLocalProfileRequest(BaseModel):
    name: str = Field(max_length=200)


class DeleteLocalProfileResponse(BaseModel):
    deleted_projects: int

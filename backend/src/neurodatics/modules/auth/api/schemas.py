from pydantic import BaseModel, Field
from typing import Optional


class GoogleAuthorizeRequest(BaseModel):
    code: str = Field(min_length=1)
    redirect_uri: Optional[str] = None


class AuthUserResponse(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


class GoogleAuthorizeResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: AuthUserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int

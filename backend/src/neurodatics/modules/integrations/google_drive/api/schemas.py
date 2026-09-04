from pydantic import BaseModel
from typing import Optional


class GoogleDriveAuthorizeResponse(BaseModel):
    authorization_url: str


class GoogleDriveCallbackResponse(BaseModel):
    connected: bool
    provider: str
    account_email: Optional[str] = None
    scope: Optional[str] = None
    refresh_token_received: bool

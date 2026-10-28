# Network edition only (Google sign-in, Google Drive). NeuroDatics ships only the local edition,
# which never imports this module; it is kept for self-hosting: docs/tecnica/alojamiento-en-red.md.

from pydantic import BaseModel
from typing import Optional


class GoogleDriveCallbackResponse(BaseModel):
    connected: bool
    provider: str
    account_email: Optional[str] = None
    scope: Optional[str] = None
    refresh_token_received: bool

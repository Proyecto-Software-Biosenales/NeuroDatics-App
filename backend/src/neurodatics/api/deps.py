from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from ..infra.db.session import get_session
from ..config.security import security, get_current_user_id


async def get_db() -> AsyncSession:
    """Get database session"""
    async for session in get_session():
        yield session


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> str:
    """Get current authenticated user ID"""
    return await get_current_user_id(credentials)

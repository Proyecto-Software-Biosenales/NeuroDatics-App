from fastapi import HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError
from ..config.settings import settings

security = HTTPBearer(auto_error=False)

def _encode_token(subject: str, token_type: str, expires_minutes: int, extra_claims: Optional[Dict[str, Any]] = None) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": subject,
        "iss": settings.auth_jwt_issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
        "typ": token_type,
    }

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.auth_jwt_secret, algorithm=settings.auth_jwt_algorithm)


def create_access_token(subject: str, email: Optional[str], name: Optional[str]) -> str:
    return _encode_token(
        subject=subject,
        token_type="access",
        expires_minutes=settings.auth_access_token_exp_minutes,
        extra_claims={
            "email": email,
            "name": name,
        },
    )


async def verify_jwt_token(token: str, expected_type: str = "access") -> Dict[str, Any]:
    """Verify locally issued JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.auth_jwt_secret,
            algorithms=[settings.auth_jwt_algorithm],
            issuer=settings.auth_jwt_issuer,
        )

        token_type = payload.get("typ")
        if token_type != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type. Expected {expected_type}.",
            )

        return payload

    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: token has expired",
        ) from exc
    except JWTClaimsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: issuer claim mismatch",
        ) from exc
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: signature verification failed",
        ) from exc


async def get_current_user_id(credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    """Extract user_id from JWT token"""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.debug(f"Auth check - credentials present: {credentials is not None}, scheme: {credentials.scheme.lower() if credentials else 'None'}")
    
    if credentials is None or not credentials.credentials:
        logger.warning("Missing Authorization header in request")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization bearer token",
        )

    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme. Expected Bearer token",
        )

    payload = await verify_jwt_token(credentials.credentials, expected_type="access")
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject (sub) claim",
        )

    return user_id

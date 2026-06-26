from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ...auth import (
    AuthUser,
    configured_users,
    format_expiry,
    login_user,
    public_user_payload,
    require_user,
)
from ...config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: dict


@router.get("/me")
def auth_me(user: AuthUser = Depends(require_user)) -> dict:
    return {
        "auth_enabled": get_settings().auth_enabled,
        "user": public_user_payload(user),
    }


@router.post("/login", response_model=LoginResponse)
def auth_login(request: LoginRequest) -> LoginResponse:
    settings = get_settings()
    if not settings.auth_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Authentication is disabled.")
    if not configured_users():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No auth users are configured.")

    user, token, expires_at = login_user(request.username, request.password)
    return LoginResponse(
        access_token=token,
        expires_at=format_expiry(expires_at),
        user=public_user_payload(user),
    )

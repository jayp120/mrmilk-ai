from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
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
from ...services import login_guard

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


def _client_ip(http_request: Request) -> str:
    """Caller IP, honouring one layer of proxy. When deployed behind CloudFront
    or a load balancer, request.client.host is the proxy, so the real client is
    the FIRST entry in X-Forwarded-For."""
    xff = http_request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return http_request.client.host if http_request.client else ""


@router.post("/login", response_model=LoginResponse)
def auth_login(request: LoginRequest, http_request: Request) -> LoginResponse:
    settings = get_settings()
    if not settings.auth_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Authentication is disabled.")
    if not configured_users():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No auth users are configured.")

    ip = _client_ip(http_request)

    # Brute-force gate. Checked BEFORE verifying the password so a locked-out
    # caller learns nothing from timing, and so we never burn PBKDF2 work on an
    # attacker's guesses.
    wait = login_guard.check_allowed(request.username, ip)
    if wait > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed sign-in attempts. Try again in {int(wait // 60) + 1} minute(s).",
            headers={"Retry-After": str(int(wait) + 1)},
        )

    try:
        user, token, expires_at = login_user(request.username, request.password)
    except HTTPException:
        # Only credential rejections are counted — a 503 for misconfiguration
        # must not lock out the operator trying to sign in.
        login_guard.record_failure(request.username, ip)
        raise

    login_guard.record_success(request.username, ip)
    return LoginResponse(
        access_token=token,
        expires_at=format_expiry(expires_at),
        user=public_user_payload(user),
    )

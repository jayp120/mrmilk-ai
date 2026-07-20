from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings


HASH_SCHEME = "pbkdf2_sha256"
HASH_ITERATIONS = 260_000
TOKEN_VERSION = 1

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {
        "admin:read",
        "customers:read",
        "chat:use",
        "feedback:write",
        "imports:read",
        "imports:write",
        "reports:read",
    },
    "ops": {
        "customers:read",
        "chat:use",
        "feedback:write",
        "imports:read",
        "imports:write",
        "reports:read",
    },
    "marketing": {
        "customers:read",
        "chat:use",
        "feedback:write",
        "imports:read",
        "reports:read",
    },
    "crm": {
        "customers:read",
        "chat:use",
        "feedback:write",
        "imports:read",
        "reports:read",
    },
}

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    username: str
    role: str
    name: str
    permissions: set[str]


@dataclass(frozen=True)
class UserCredential:
    username: str
    role: str
    name: str
    password_hash: str
    disabled: bool = False


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_urlsafe(18)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        HASH_ITERATIONS,
    )
    return f"{HASH_SCHEME}${HASH_ITERATIONS}${salt}${_b64url_encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iterations_raw, salt, expected = password_hash.split("$", 3)
        iterations = int(iterations_raw)
    except ValueError:
        return False
    if scheme != HASH_SCHEME or iterations < 100_000:
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return hmac.compare_digest(_b64url_encode(actual), expected)


def _permissions_for(role: str) -> set[str]:
    return set(ROLE_PERMISSIONS.get(role.strip().lower(), set()))


def _safe_username(value: object) -> str:
    return str(value or "").strip().lower()


def configured_users() -> dict[str, UserCredential]:
    settings = get_settings()
    raw = (settings.auth_users_json or "").strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AUTH_USERS_JSON is not valid JSON.") from exc

    if not isinstance(parsed, list):
        raise RuntimeError("AUTH_USERS_JSON must be a JSON array.")

    users: dict[str, UserCredential] = {}
    for entry in parsed:
        if not isinstance(entry, dict):
            raise RuntimeError("Each AUTH_USERS_JSON item must be an object.")
        username = _safe_username(entry.get("username"))
        role = str(entry.get("role") or "").strip().lower()
        password_hash = str(entry.get("password_hash") or "").strip()
        if not username or not role or not password_hash:
            raise RuntimeError("Each auth user needs username, role, and password_hash.")
        if role not in ROLE_PERMISSIONS:
            raise RuntimeError(f"Unsupported auth role: {role}")
        users[username] = UserCredential(
            username=username,
            role=role,
            name=str(entry.get("name") or username).strip(),
            password_hash=password_hash,
            disabled=bool(entry.get("disabled", False)),
        )
    return users


def _auth_disabled_user() -> AuthUser:
    return AuthUser(
        username="local-owner",
        role="owner",
        name="Local Owner",
        permissions=_permissions_for("owner"),
    )


def _token_secret() -> str:
    settings = get_settings()
    secret = (settings.auth_token_secret or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_TOKEN_SECRET is not configured.",
        )
    if len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_TOKEN_SECRET must be at least 32 characters.",
        )
    return secret


def _sign(body: str) -> str:
    secret = _token_secret().encode("utf-8")
    return _b64url_encode(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())


def create_access_token(user: UserCredential | AuthUser) -> tuple[str, int]:
    settings = get_settings()
    expires_at = int(time.time()) + max(5, settings.auth_token_ttl_minutes) * 60
    payload = {
        "v": TOKEN_VERSION,
        "sub": user.username,
        "role": user.role,
        "name": user.name,
        "exp": expires_at,
    }
    body = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{body}.{_sign(body)}", expires_at


def parse_access_token(token: str) -> AuthUser:
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token.") from exc

    if not hmac.compare_digest(signature, _sign(body)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token.")

    try:
        payload = json.loads(_b64url_decode(body))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token.") from exc

    if int(payload.get("v") or 0) != TOKEN_VERSION:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unsupported auth token.")
    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth token expired.")

    username = _safe_username(payload.get("sub"))
    users = configured_users()
    credential = users.get(username)
    if credential is None or credential.disabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active.")

    # Role and display name come from server config so old tokens cannot keep
    # stale privileges after an env change.
    return AuthUser(
        username=credential.username,
        role=credential.role,
        name=credential.name,
        permissions=_permissions_for(credential.role),
    )


def public_user_payload(user: AuthUser) -> dict:
    return {
        "username": user.username,
        "name": user.name,
        "role": user.role,
        "permissions": sorted(user.permissions),
    }


def login_user(username: str, password: str) -> tuple[AuthUser, str, int]:
    settings = get_settings()
    if not settings.auth_enabled:
        user = _auth_disabled_user()
        token, expires_at = create_access_token(user)
        return user, token, expires_at

    users = configured_users()
    credential = users.get(_safe_username(username))
    if credential is None or credential.disabled or not verify_password(password, credential.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    user = AuthUser(
        username=credential.username,
        role=credential.role,
        name=credential.name,
        permissions=_permissions_for(credential.role),
    )
    token, expires_at = create_access_token(credential)
    return user, token, expires_at


def format_expiry(expires_at: int) -> str:
    return datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    settings = get_settings()
    if not settings.auth_enabled:
        return _auth_disabled_user()

    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return parse_access_token(credentials.credentials)


def require_permission(permission: str) -> Callable[[AuthUser], AuthUser]:
    def dependency(user: AuthUser = Depends(require_user)) -> AuthUser:
        if permission not in user.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' is required.",
            )
        return user

    return dependency

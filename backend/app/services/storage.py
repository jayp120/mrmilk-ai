from __future__ import annotations

from datetime import datetime
from pathlib import Path
from re import sub
from threading import Lock

import httpx

from ..config import get_settings

_bucket_init_lock = Lock()
_bucket_ready = False


def build_storage_key(file_name: str, fingerprint: str) -> str:
    stamp = datetime.utcnow().strftime("%Y/%m/%d")
    safe_name = sub(r"[^A-Za-z0-9._-]+", "-", file_name).strip("-") or "import.xlsx"
    return f"imports/{stamp}/{fingerprint[:12]}-{safe_name}"


def save_local_import_copy(file_name: str, content: bytes, fingerprint: str) -> str:
    settings = get_settings()
    if not settings.allow_local_file_fallback:
        raise RuntimeError("Local file fallback is disabled.")

    key = build_storage_key(file_name, fingerprint)
    target = Path("backend/.runtime") / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return str(target)


def _get_supabase_admin_headers() -> dict[str, str] | None:
    settings = get_settings()
    key = settings.supabase_service_role_key or settings.supabase_secret_key
    if not settings.supabase_url or not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }


def _ensure_supabase_bucket(client: httpx.Client) -> None:
    global _bucket_ready
    if _bucket_ready:
        return

    with _bucket_init_lock:
        if _bucket_ready:
            return

        settings = get_settings()
        headers = _get_supabase_admin_headers()
        if headers is None:
            raise RuntimeError("Supabase admin credentials are not configured.")

        bucket_name = settings.supabase_storage_bucket
        response = client.get(f"{settings.supabase_url}/storage/v1/bucket", headers=headers)
        response.raise_for_status()
        buckets = response.json()
        if not any(bucket.get("name") == bucket_name or bucket.get("id") == bucket_name for bucket in buckets):
            create_response = client.post(
                f"{settings.supabase_url}/storage/v1/bucket",
                headers={**headers, "Content-Type": "application/json"},
                json={"id": bucket_name, "name": bucket_name, "public": False},
            )
            create_response.raise_for_status()

        _bucket_ready = True


def save_supabase_import_copy(file_name: str, content: bytes, fingerprint: str) -> str:
    settings = get_settings()
    headers = _get_supabase_admin_headers()
    if not settings.supabase_url or headers is None:
        raise RuntimeError("Supabase storage is not configured.")

    storage_key = build_storage_key(file_name, fingerprint)
    bucket_name = settings.supabase_storage_bucket
    object_path = storage_key.split("/", 1)[1] if storage_key.startswith(f"{bucket_name}/") else storage_key

    with httpx.Client(timeout=30.0) as client:
        _ensure_supabase_bucket(client)
        upload_response = client.post(
            f"{settings.supabase_url}/storage/v1/object/{bucket_name}/{object_path}",
            headers={
                **headers,
                "x-upsert": "true",
                "Content-Type": "application/octet-stream",
            },
            content=content,
        )
        upload_response.raise_for_status()

    return storage_key


def save_import_copy(file_name: str, content: bytes, fingerprint: str) -> str:
    settings = get_settings()
    if settings.supabase_configured:
        try:
            return save_supabase_import_copy(file_name, content, fingerprint)
        except Exception:
            if not settings.allow_local_file_fallback:
                raise
    return save_local_import_copy(file_name, content, fingerprint)


def delete_local_import_copy(storage_key: str) -> None:
    path = Path(storage_key)
    if path.exists():
        path.unlink()


def delete_supabase_import_copy(storage_key: str) -> None:
    settings = get_settings()
    headers = _get_supabase_admin_headers()
    if not settings.supabase_url or headers is None:
        raise RuntimeError("Supabase storage is not configured.")

    bucket_name = settings.supabase_storage_bucket
    object_path = storage_key.split("/", 1)[1] if storage_key.startswith(f"{bucket_name}/") else storage_key

    with httpx.Client(timeout=30.0) as client:
        _ensure_supabase_bucket(client)
        delete_response = client.delete(
            f"{settings.supabase_url}/storage/v1/object/{bucket_name}/{object_path}",
            headers=headers,
        )
        if delete_response.status_code not in {200, 204, 404}:
            delete_response.raise_for_status()


def delete_import_copy(storage_key: str | None) -> None:
    if not storage_key:
        return

    settings = get_settings()
    if storage_key.startswith("imports/") and settings.supabase_configured:
        try:
            delete_supabase_import_copy(storage_key)
            return
        except Exception:
            if not settings.allow_local_file_fallback:
                raise

    delete_local_import_copy(storage_key)

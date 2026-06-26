from fastapi import APIRouter, Depends, HTTPException, status

from ...auth import AuthUser, require_permission
from ...config import get_settings
from ...db import get_db_last_error, is_db_available, is_db_configured, session_scope
from ...services.customer_analytics import (
    build_cached_customer_records,
    build_cached_customer_summary,
    build_customer_records,
    build_customer_summary,
)

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _require_db() -> None:
    if not is_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured.",
        )


def _allow_cache_fallback() -> bool:
    return get_settings().allow_local_file_fallback
    if not is_db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database is not reachable. {get_db_last_error()}",
        )


@router.get("/summary")
def customer_summary(_actor: AuthUser = Depends(require_permission("customers:read"))) -> dict:
    """
    Returns aggregated business metrics from the live customer snapshot —
    the same shape as the hardcoded DATA object the workspace uses, but
    computed fresh from the database.
    """
    if not is_db_available() and _allow_cache_fallback():
        cached = build_cached_customer_summary()
        if cached is not None:
            return cached

    _require_db()
    with session_scope() as session:
        summary = build_customer_summary(session)

    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No live customer dataset found. Upload a MilkMaster snapshot first.",
        )
    return summary


@router.get("/records")
def customer_records(_actor: AuthUser = Depends(require_permission("customers:read"))) -> dict:
    """
    Returns the full customer record list from the live snapshot,
    normalised to the shape the workspace expects for client-side
    DuckDB queries and customer match filtering.
    """
    if not is_db_available() and _allow_cache_fallback():
        cached = build_cached_customer_records()
        if cached is not None:
            return {"snapshot_id": cached["snapshot_id"], "records": cached["records"], "snapshot_source": "disk-cache"}

    _require_db()
    with session_scope() as session:
        summary = build_customer_summary(session)
        if summary is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No live customer dataset found.",
            )
        records = build_customer_records(session, summary["snapshot_id"])

    return {"snapshot_id": summary["snapshot_id"], "records": records}

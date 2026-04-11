from fastapi import APIRouter, HTTPException, status

from ...db import get_db_last_error, is_db_available, is_db_configured, session_scope
from ...services.customer_analytics import build_customer_records, build_customer_summary

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _require_db() -> None:
    if not is_db_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured.",
        )
    if not is_db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database is not reachable. {get_db_last_error()}",
        )


@router.get("/summary")
def customer_summary() -> dict:
    """
    Returns aggregated business metrics from the live customer snapshot —
    the same shape as the hardcoded DATA object the workspace uses, but
    computed fresh from the database.
    """
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
def customer_records() -> dict:
    """
    Returns the full customer record list from the live snapshot,
    normalised to the shape the workspace expects for client-side
    DuckDB queries and customer match filtering.
    """
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

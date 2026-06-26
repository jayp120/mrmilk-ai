"""
DuckDB analytical engine — primary path for SQL-shaped analytical queries.

Why DuckDB:
  * Reads our 361k-row sales.parquet directly — no copy, no driver overhead.
  * Runs aggregations (~100M rows/sec) so most queries return in <1s.
  * Single in-process binary; no servers to operate.
  * Speaks standard SQL — the LLM already knows it.
  * Avoids the E2B sandbox cold-start (~2s) for trivial queries.

Architecture:
  * `customers.parquet` is materialized from the live Supabase snapshot on
    first call (per snapshot id) and cached on disk.
  * `sales.parquet` already exists in backend/.cache.
  * A DuckDB connection is created per call (cheap; no global state to leak).
  * Both tables are exposed as `customers` and `sales` views — and `sales_delivered`
    pre-filtered to delivery_status='delivered'.
  * Output is row-capped server-side. Caller gets columns + rows + row_count.

Safety:
  * Rejects anything that isn't a single SELECT/WITH statement.
  * Rejects mutation / DDL keywords.
  * Hard row cap of 20,000 (matches the existing run_safe_sql cap).
"""
from __future__ import annotations

import logging
import re
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CustomerRecord, DatasetSnapshot

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

MAX_ROWS = 20000
TIMEOUT_SECONDS = 15.0

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|"
    r"copy|attach|detach|set|pragma|vacuum|reindex|comment|lock|"
    r"call|execute|export|import)\b",
    re.IGNORECASE,
)
_MULTI = re.compile(r";.*\S")
_LIMIT = re.compile(r"\blimit\s+\d+\b", re.IGNORECASE)

_customer_parquet_lock = threading.Lock()


def _customer_parquet_path(snapshot_id: str) -> Path:
    safe = "".join(c for c in snapshot_id if c.isalnum() or c in "-_")
    return CACHE_DIR / f"customers-{safe}.parquet"


# Columns the cached customers parquet must contain. When this set isn't a
# subset of the on-disk parquet's schema, we treat the file as stale and
# rebuild it. Lets us evolve the columns (e.g. adding customer_id) without
# manually wiping caches on every deploy.
_REQUIRED_CUSTOMER_COLUMNS = {"customer_id", "mobile", "name", "area", "hub", "subscription_status"}


def _materialize_customers_parquet(session: Session, snapshot_id: str) -> Path | None:
    """Dump the current snapshot's customer_records to a Parquet file once
    per snapshot, then reuse on every DuckDB call. The dump is small (~5MB
    for 20k rows) and lives alongside sales.parquet.

    If the cached file predates a schema bump (missing required columns),
    it's transparently rebuilt."""
    path = _customer_parquet_path(snapshot_id)
    with _customer_parquet_lock:
        if path.is_file():
            # Schema check — if the cache is missing any required column, drop it
            try:
                import pandas as pd
                head = pd.read_parquet(path).head(0)
                if _REQUIRED_CUSTOMER_COLUMNS.issubset(set(head.columns)):
                    return path
                logger.info(
                    "duckdb_engine: cached customers parquet schema stale (%s missing %s), rebuilding",
                    path.name, _REQUIRED_CUSTOMER_COLUMNS - set(head.columns),
                )
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            except Exception as exc:  # noqa: BLE001
                logger.warning("duckdb_engine: cache schema check failed (%s), rebuilding", exc)
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
        try:
            import pandas as pd
        except ImportError:
            return None

        rows = session.execute(
            select(CustomerRecord).where(CustomerRecord.dataset_snapshot_id == snapshot_id)
        ).scalars().all()
        if not rows:
            return None

        records: list[dict[str, Any]] = []
        for r in rows:
            records.append({
                "id": r.id,
                # MilkMaster source customer id — the canonical key ops teams
                # use across the dashboard, CSV exports, and call scripts.
                "customer_id": r.source_customer_id or "",
                "mobile": r.mobile or "",
                "alternate_mobile": r.alternate_mobile or "",
                "name": r.name or "",
                "subscription_status": r.subscription_status or "",
                "temp_customer_status": r.temp_customer_status or "",
                "is_blocked": bool(r.is_blocked),
                "dnd": bool(r.dnd),
                "source": r.source or "",
                "sub_source": r.sub_source or "",
                "campaign_name": r.campaign_name or "",
                "note": r.note or "",
                "total_orders": int(r.total_orders or 0),
                "total_revenue": float(r.total_revenue or 0),
                "current_consumption": float(r.current_consumption or 0),
                "payment_mode": r.payment_mode or "",
                "payment_type": r.payment_type or "",
                "wallet_balance": float(r.wallet_balance_spend or 0),
                "effective_wallet_balance": float(r.effective_wallet_balance_current or 0),
                "credit_limit": float(r.credit_limit or 0),
                "route_name": r.route_name or "",
                "delivery_boy": r.delivery_boy or "",
                "delivery_preference": r.delivery_preference or "",
                "time_slot": r.time_slot or "",
                "area": r.area or "",
                "sub_area": r.sub_area or "",
                "hub": r.hub or "No Hub Assigned",
                "city": r.city or "",
                "address": r.address or "",
                "crm_agent": r.crm_agent or "",
                "created_by": r.created_by or "",
                "customer_type": r.customer_type or "",
                "email_id": r.email_id or "",
                "gst_number": r.gst_number or "",
                "follow_up_date": r.follow_up_date,
                "created_date": r.created_date,
                "first_delivery_date": r.first_delivery_date,
                "last_delivery_date": r.last_delivery_date,
            })
        df = pd.DataFrame(records)
        df.to_parquet(path, index=False)
        logger.info("duckdb_engine: wrote %s (%d rows)", path.name, len(df))
        return path


def _validate(query: str) -> tuple[bool, str | None, str]:
    if not query or not query.strip():
        return False, "empty_query", ""
    q = query.strip().rstrip(";").strip()
    if not re.match(r"^\s*(with|select)\b", q, re.IGNORECASE):
        return False, "only_select_allowed", q
    if _FORBIDDEN.search(q):
        return False, "forbidden_keyword", q
    if _MULTI.search(q):
        return False, "multiple_statements", q
    if not _LIMIT.search(q):
        q = f"{q} LIMIT {MAX_ROWS}"
    return True, None, q


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool, list, dict)):
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)


def run_duckdb_sql(session: Session, query: str) -> dict[str, Any]:
    """Execute a read-only SELECT against DuckDB views over sales + customers.

    Available tables/views inside the query:
      - customers          → current customer master snapshot
                             (id, mobile, name, area, hub, subscription_status,
                              total_revenue, total_orders, wallet_balance,
                              effective_wallet_balance, last_delivery_date, …)
      - sales              → 361k sales transactions
                             (date, invoice_id, mobile, product_name,
                              qty_net, sub_total, delivery_status, area, hub, …)
      - sales_delivered    → sales filtered to delivery_status='delivered'

    Join on `mobile` to combine.
    """
    try:
        import duckdb
    except ImportError:
        return {"error": "duckdb_missing", "detail": "pip install duckdb"}

    valid, err, q = _validate(query)
    if not valid:
        return {"error": err, "detail": "Query must be a single SELECT/WITH statement; mutations and DDL are blocked."}

    snapshot = session.execute(
        select(DatasetSnapshot).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalars().first()
    if not snapshot:
        return {"error": "no_snapshot"}

    customers_parquet = _materialize_customers_parquet(session, snapshot.id)
    if not customers_parquet:
        return {"error": "customers_unavailable"}
    sales_parquet = CACHE_DIR / "sales.parquet"
    if not sales_parquet.is_file():
        return {"error": "sales_unavailable", "detail": "Upload sales.parquet to backend/.cache/"}

    con = None
    try:
        con = duckdb.connect(database=":memory:")
        con.execute(f"CREATE VIEW customers AS SELECT * FROM read_parquet('{customers_parquet.as_posix()}')")
        con.execute(f"CREATE VIEW sales AS SELECT * FROM read_parquet('{sales_parquet.as_posix()}')")
        con.execute("CREATE VIEW sales_delivered AS SELECT * FROM sales WHERE delivery_status = 'delivered'")
        result = con.execute(q)
        columns = [d[0] for d in result.description]
        raw = result.fetchall()
        rows = [
            {col: _serialize(val) for col, val in zip(columns, row)}
            for row in raw
        ]
        return {
            "engine": "duckdb",
            "query": q,
            "columns": columns,
            "row_count": len(rows),
            "rows": rows,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("duckdb_engine: query failed")
        return {"error": "duckdb_exception", "detail": str(exc), "query": q}
    finally:
        if con is not None:
            try:
                con.close()
            except Exception:  # noqa: BLE001
                pass


def invalidate_customers_parquet(snapshot_id: str | None = None) -> None:
    """Drop the materialized customers parquet so the next call rebuilds it.
    Call this when a new snapshot is committed."""
    if snapshot_id:
        path = _customer_parquet_path(snapshot_id)
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
    else:
        for f in CACHE_DIR.glob("customers-*.parquet"):
            try:
                f.unlink()
            except OSError:
                pass

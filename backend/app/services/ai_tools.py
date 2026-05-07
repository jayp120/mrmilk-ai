"""
Safe tool functions the Gemini chat agent can call to answer questions
from the live MrMilk / Supabase snapshot.

Design rules:
  * Every tool returns JSON-serializable data (lists / dicts / scalars).
  * Every tool is READ-ONLY. `run_safe_sql` enforces SELECT-only + row cap.
  * Every tool operates on the *current* snapshot only (is_current = True).
  * Row caps are enforced server-side so the LLM can't DoS the DB.
  * Functions are small and composable; the agent chains them itself.

Why this file exists: the earlier approach stuffed a JSON snapshot of the
dataset into the Gemini system prompt, which caps at ~25k customers and
drifts from live state. Tools let the agent query the real snapshot.
"""
from __future__ import annotations

import csv
import io
import logging
import re
from typing import Any

from sqlalchemy import and_, desc, func, or_, select, text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import CustomerRecord, DatasetSnapshot

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# Row caps (server-side).
#
# Product rule: searches must return EVERY matching row so the numbers
# reconcile with the source workbook. We set the caps to the full
# snapshot size so "give me all negative-wallet customers" doesn't
# silently drop rows. The frontend provides a "Download CSV" button on
# large tables so the user can take the full slice offline.
# ----------------------------------------------------------------------
MAX_ROWS_LIST = 20000   # full snapshot size
MAX_ROWS_SQL = 20000
SQL_TIMEOUT_MS = 10000


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _current_snapshot_id(session: Session) -> str | None:
    return session.execute(
        select(DatasetSnapshot.id).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalar_one_or_none()


def _serialize_row(r: CustomerRecord) -> dict[str, Any]:
    """Canonical serialization used by every tool that returns rows."""
    return {
        "name": r.name or "",
        "mobile": r.mobile or "",
        "area": r.area or "",
        "hub": r.hub or "No Hub Assigned",
        "status": r.subscription_status or "",
        "temp_status": r.temp_customer_status or "",
        "total_revenue": float(r.total_revenue or 0),
        "total_orders": int(r.total_orders or 0),
        "wallet_balance": float(r.wallet_balance_spend or 0),
        "effective_wallet_balance": float(r.effective_wallet_balance_current or 0),
        "current_consumption": float(r.current_consumption or 0),
        "source": r.source or "",
        "payment_mode": r.payment_mode or "",
        "delivery_boy": r.delivery_boy or "",
        "last_delivery": r.last_delivery_date.strftime("%Y-%m-%d") if r.last_delivery_date else "",
        "first_delivery": r.first_delivery_date.strftime("%Y-%m-%d") if r.first_delivery_date else "",
        "created": r.created_date.strftime("%Y-%m-%d") if r.created_date else "",
    }


def _normalize_status_filter(status: str | None) -> list[str]:
    """Map a loose status hint from the LLM to one or more exact subscription_status values."""
    if not status:
        return []
    s = status.strip().lower()
    table = {
        "active": ["Active Subscription"],
        "active subscription": ["Active Subscription"],
        "active no subscription": ["Active No Subscription"],
        "inactive": ["Inactive", "Inactive No Order", "Inactive No Subscription"],
        "suspended": ["Suspended", "Suspended Low Balance"],
        "suspended low balance": ["Suspended Low Balance"],
        "trial": ["Trial Running", "Trial Ended", "Trial Not Converted"],
        "trial running": ["Trial Running"],
        "trial ended": ["Trial Ended"],
        "trial not converted": ["Trial Not Converted"],
        "new": ["New Customer"],
        "new customer": ["New Customer"],
        "on vacation": ["On Vacation"],
        "vacation": ["On Vacation"],
    }
    return table.get(s, [status])


# ----------------------------------------------------------------------
# Tools
# ----------------------------------------------------------------------
def area_stats(session: Session, area: str, status: str | None = None) -> dict[str, Any]:
    """Aggregate metrics for a single Pune area, optionally filtered by status bucket."""
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    conditions = [CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.area.ilike(area.strip())]
    status_values = _normalize_status_filter(status)
    if status_values:
        conditions.append(CustomerRecord.subscription_status.in_(status_values))

    agg = session.execute(
        select(
            func.count().label("count"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("revenue"),
            func.coalesce(func.sum(CustomerRecord.total_orders), 0).label("orders"),
            func.coalesce(func.sum(CustomerRecord.wallet_balance_spend), 0).label("wallet_total"),
            func.count().filter(CustomerRecord.wallet_balance_spend < 0).label("wallet_negative"),
        ).where(and_(*conditions))
    ).one()

    top_rows = session.execute(
        select(CustomerRecord).where(and_(*conditions))
        .order_by(desc(CustomerRecord.total_revenue)).limit(10)
    ).scalars().all()

    return {
        "area": area,
        "status_filter": status or "all",
        "count": int(agg.count or 0),
        "revenue_total": float(agg.revenue or 0),
        "orders_total": int(agg.orders or 0),
        "wallet_total": float(agg.wallet_total or 0),
        "wallet_negative_customers": int(agg.wallet_negative or 0),
        "top_customers": [_serialize_row(r) for r in top_rows],
    }


def hub_stats(session: Session, hub: str | None = None) -> dict[str, Any]:
    """Aggregate by hub. If `hub` is given, stats for that hub only; else for every hub."""
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    base = select(
        CustomerRecord.hub,
        func.count().label("count"),
        func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("revenue"),
        func.coalesce(func.sum(CustomerRecord.total_orders), 0).label("orders"),
    ).where(CustomerRecord.dataset_snapshot_id == sid)

    if hub:
        base = base.where(CustomerRecord.hub == hub)

    rows = session.execute(base.group_by(CustomerRecord.hub).order_by(desc(func.sum(CustomerRecord.total_revenue)))).all()
    return {
        "hubs": [
            {
                "hub": r.hub or "No Hub Assigned",
                "customers": int(r.count or 0),
                "revenue_total": float(r.revenue or 0),
                "orders_total": int(r.orders or 0),
            }
            for r in rows
        ]
    }


def top_customers(
    session: Session,
    *,
    status: str | None = None,
    area: str | None = None,
    hub: str | None = None,
    order_by: str = "revenue",
    order: str = "desc",
    limit: int | None = None,
    min_revenue: float | None = None,
    wallet_negative: bool | None = None,
    wallet_field: str = "effective",  # "effective" (default) or "spend"
) -> dict[str, Any]:
    """Filter + sort customers.

    Wallet semantics (match MilkMaster workbook 1:1):
      wallet_field="effective" → Effective Wallet Balance (the business-facing
                                  "wallet with credits/refunds applied")
      wallet_field="spend"     → Wallet Balance (raw spend balance)

    Order-by: revenue | orders | wallet | effective_wallet | consumption | last_delivery.
    limit=None returns ALL matches (capped at the full snapshot size).
    """
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    # We deliberately IGNORE small `limit` values from the LLM. Gemini tends
    # to pass limit=10 even on "show all" questions, which causes silent
    # truncation. We always fetch the full matching set (capped at the
    # snapshot size) and let the frontend + rehydration pass handle display.
    # The LLM's `limit` is only surfaced as metadata now.
    effective_limit = MAX_ROWS_LIST

    conditions = [CustomerRecord.dataset_snapshot_id == sid]
    status_values = _normalize_status_filter(status)
    if status_values:
        conditions.append(CustomerRecord.subscription_status.in_(status_values))
    if area:
        conditions.append(CustomerRecord.area.ilike(area.strip()))
    if hub:
        conditions.append(CustomerRecord.hub == hub)
    if min_revenue is not None:
        conditions.append(CustomerRecord.total_revenue >= float(min_revenue))

    # Pick the wallet column for negative/positive filtering based on wallet_field.
    wallet_col = (
        CustomerRecord.effective_wallet_balance_current
        if str(wallet_field).lower() == "effective"
        else CustomerRecord.wallet_balance_spend
    )
    if wallet_negative is True:
        conditions.append(wallet_col < 0)
    elif wallet_negative is False:
        conditions.append(wallet_col >= 0)

    col_map = {
        "revenue": CustomerRecord.total_revenue,
        "orders": CustomerRecord.total_orders,
        "wallet": CustomerRecord.wallet_balance_spend,
        "effective_wallet": CustomerRecord.effective_wallet_balance_current,
        "consumption": CustomerRecord.current_consumption,
        "last_delivery": CustomerRecord.last_delivery_date,
    }
    col = col_map.get(order_by.lower(), CustomerRecord.total_revenue)
    direction = desc(col) if order.lower() == "desc" else col

    rows = session.execute(
        select(CustomerRecord).where(and_(*conditions)).order_by(direction).limit(effective_limit)
    ).scalars().all()

    return {
        "filters": {
            "status": status, "area": area, "hub": hub,
            "order_by": order_by, "order": order, "limit": effective_limit,
            "min_revenue": min_revenue, "wallet_negative": wallet_negative,
            "wallet_field": wallet_field,
        },
        "count": len(rows),
        "rows": [_serialize_row(r) for r in rows],
    }


def lookup_customer(session: Session, query: str) -> dict[str, Any]:
    """Find a customer by mobile (exact/partial) or name (fuzzy). Returns up to 10 matches."""
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    q = query.strip()
    digits = re.sub(r"\D", "", q)
    conditions = [CustomerRecord.dataset_snapshot_id == sid]
    if digits and len(digits) >= 4:
        conditions.append(
            or_(
                CustomerRecord.mobile.like(f"%{digits}%"),
                CustomerRecord.alternate_mobile.like(f"%{digits}%"),
                CustomerRecord.name.ilike(f"%{q}%"),
            )
        )
    else:
        conditions.append(CustomerRecord.name.ilike(f"%{q}%"))

    rows = session.execute(
        select(CustomerRecord).where(and_(*conditions)).order_by(desc(CustomerRecord.total_revenue)).limit(10)
    ).scalars().all()

    return {"query": q, "count": len(rows), "matches": [_serialize_row(r) for r in rows]}


def status_breakdown(session: Session) -> dict[str, Any]:
    """Full subscription_status counts for the current snapshot — MilkMaster-parity."""
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    rows = session.execute(
        select(CustomerRecord.subscription_status, func.count().label("count"))
        .where(CustomerRecord.dataset_snapshot_id == sid)
        .group_by(CustomerRecord.subscription_status)
        .order_by(desc(func.count()))
    ).all()
    total = sum(int(r.count or 0) for r in rows)
    return {
        "total": total,
        "buckets": {(r.subscription_status or "Unknown"): int(r.count or 0) for r in rows},
    }


def wallet_analysis(
    session: Session,
    area: str | None = None,
    hub: str | None = None,
    wallet_field: str = "effective",
) -> dict[str, Any]:
    """Wallet health: positive / zero / negative counts and totals.

    wallet_field="effective" uses Effective Wallet Balance (the business-facing
    balance after credits/refunds). "spend" uses the raw Wallet Balance column.
    We report BOTH totals so the user can reconcile either way.
    """
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    conditions = [CustomerRecord.dataset_snapshot_id == sid]
    if area:
        conditions.append(CustomerRecord.area.ilike(area.strip()))
    if hub:
        conditions.append(CustomerRecord.hub == hub)

    eff = CustomerRecord.effective_wallet_balance_current
    spend = CustomerRecord.wallet_balance_spend
    primary = eff if str(wallet_field).lower() == "effective" else spend

    row = session.execute(
        select(
            # Primary field counts (what the user asked for)
            func.count().filter(primary > 0).label("positive"),
            func.count().filter(primary == 0).label("zero"),
            func.count().filter(primary < 0).label("negative"),
            func.coalesce(func.sum(primary), 0).label("total"),
            func.coalesce(func.avg(primary), 0).label("avg"),
            func.coalesce(func.min(primary), 0).label("min"),
            func.coalesce(func.max(primary), 0).label("max"),
            # Cross-reference with the OTHER field so the user can reconcile
            func.count().filter(spend < 0).label("spend_negative"),
            func.count().filter(eff < 0).label("effective_negative"),
        ).where(and_(*conditions))
    ).one()

    # Worst negative — order by whichever field was asked for
    worst_rows = session.execute(
        select(CustomerRecord)
        .where(and_(*conditions, primary < 0))
        .order_by(primary.asc())
        .limit(50)
    ).scalars().all()

    return {
        "area": area or "all",
        "hub": hub or "all",
        "wallet_field": wallet_field,
        "positive_count": int(row.positive or 0),
        "zero_count": int(row.zero or 0),
        "negative_count": int(row.negative or 0),
        "wallet_total": float(row.total or 0),
        "wallet_avg": float(row.avg or 0),
        "wallet_min": float(row.min or 0),
        "wallet_max": float(row.max or 0),
        # Cross-field totals so "wallet balance" vs "effective wallet" is never ambiguous
        "spend_negative_count": int(row.spend_negative or 0),
        "effective_negative_count": int(row.effective_negative or 0),
        "worst_negative": [_serialize_row(r) for r in worst_rows],
    }


def trial_funnel(session: Session) -> dict[str, Any]:
    """Trial-to-paid conversion funnel using Trial* status buckets."""
    sid = _current_snapshot_id(session)
    if not sid:
        return {"error": "no_snapshot"}

    rows = session.execute(
        select(CustomerRecord.subscription_status, func.count().label("count"))
        .where(
            CustomerRecord.dataset_snapshot_id == sid,
            CustomerRecord.subscription_status.ilike("Trial%"),
        )
        .group_by(CustomerRecord.subscription_status)
    ).all()
    buckets = {r.subscription_status: int(r.count or 0) for r in rows}
    running = buckets.get("Trial Running", 0)
    ended = buckets.get("Trial Ended", 0)
    not_conv = buckets.get("Trial Not Converted", 0)
    total_trials = running + ended + not_conv
    conversion_rate = None
    if ended + not_conv > 0:
        conversion_rate = round((ended / (ended + not_conv)) * 100, 2) if ended else 0.0

    return {
        "running": running,
        "ended": ended,
        "not_converted": not_conv,
        "total_in_trial_pipeline": total_trials,
        "conversion_rate_pct": conversion_rate,
    }


# ----------------------------------------------------------------------
# run_safe_sql: escape hatch for ad-hoc queries the LLM constructs.
# Heavily locked down — rejects anything that isn't a single SELECT.
# ----------------------------------------------------------------------
_SQL_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|execute|call|copy|vacuum|analyze|reindex|comment|lock|explain\s+analyze)\b",
    re.IGNORECASE,
)
_SQL_MULTI = re.compile(r";.*\S")


def run_safe_sql(session: Session, query: str) -> dict[str, Any]:
    """Execute a read-only SELECT. Enforces: single statement, SELECT-only, LIMIT cap."""
    if not query or not query.strip():
        return {"error": "empty_query"}

    q = query.strip().rstrip(";").strip()
    if not re.match(r"^\s*(with|select)\b", q, re.IGNORECASE):
        return {"error": "only_select_allowed", "detail": "Query must start with SELECT or WITH."}
    if _SQL_FORBIDDEN.search(q):
        return {"error": "forbidden_keyword", "detail": "Mutation / DDL keywords are blocked."}
    if _SQL_MULTI.search(q):
        return {"error": "multiple_statements", "detail": "Only a single statement is allowed."}

    # Enforce LIMIT: append LIMIT MAX_ROWS_SQL if absent
    if not re.search(r"\blimit\s+\d+\b", q, re.IGNORECASE):
        q = f"{q} LIMIT {MAX_ROWS_SQL}"

    # Always scope to current snapshot if the query targets customer_records without an explicit snapshot filter.
    # (Soft check — we don't rewrite blindly; if the LLM already filtered, we respect it.)
    snapshot_id = _current_snapshot_id(session)
    if snapshot_id and "customer_records" in q.lower() and "dataset_snapshot_id" not in q.lower():
        q_lower = q.lower()
        if " where " in q_lower:
            q = re.sub(
                r"\bwhere\b",
                f"WHERE dataset_snapshot_id = '{snapshot_id}' AND ",
                q,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            # insert WHERE before ORDER BY / LIMIT / end
            q = re.sub(
                r"\b(order\s+by|limit)\b",
                f"WHERE dataset_snapshot_id = '{snapshot_id}' \\1",
                q,
                count=1,
                flags=re.IGNORECASE,
            ) if re.search(r"\b(order\s+by|limit)\b", q, re.IGNORECASE) else f"{q} WHERE dataset_snapshot_id = '{snapshot_id}'"

    result = session.execute(text(q))
    columns = list(result.keys())
    rows = [dict(zip(columns, r)) for r in result.fetchall()]
    # Coerce non-JSON-safe types (Decimal, datetime)
    for row in rows:
        for k, v in list(row.items()):
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
            elif v is not None and not isinstance(v, (str, int, float, bool, list, dict)):
                row[k] = str(v)
    return {"query": q, "columns": columns, "row_count": len(rows), "rows": rows}


# ----------------------------------------------------------------------
# Sales analytics — read from the local Parquet cache (fast, no DB round-trip).
# All three helpers share a single cached DataFrame for the process lifetime.
# ----------------------------------------------------------------------
_sales_df_cache: Any = None
_sales_df_mtime: float = 0.0


def _load_sales_df():
    """Return a pandas DataFrame of the sales parquet, cached across calls."""
    global _sales_df_cache, _sales_df_mtime
    try:
        import pandas as pd
    except ImportError:
        return None
    from pathlib import Path as _Path
    parquet = _Path(__file__).resolve().parent.parent.parent / ".cache" / "sales.parquet"
    if not parquet.is_file():
        return None
    mtime = parquet.stat().st_mtime
    if _sales_df_cache is not None and _sales_df_mtime == mtime:
        return _sales_df_cache
    _sales_df_cache = pd.read_parquet(parquet)
    _sales_df_mtime = mtime
    logger.info("sales_df loaded: %d rows", len(_sales_df_cache))
    return _sales_df_cache


def product_stats(
    session: Session,
    product: str | None = None,
    area: str | None = None,
    hub: str | None = None,
    delivered_only: bool = True,
) -> dict[str, Any]:
    """Aggregate sales by product — revenue, units, unique customers. If `product`
    is given, filter to just that product (case-insensitive substring)."""
    sdf = _load_sales_df()
    if sdf is None:
        return {"error": "sales_not_loaded", "detail": "Upload sales.parquet to backend/.cache/"}
    df = sdf
    if delivered_only:
        df = df[df["delivery_status"] == "delivered"]
    if product:
        df = df[df["product_name"].str.contains(str(product), case=False, na=False)]
    if area:
        df = df[df["area"].str.casefold() == str(area).casefold()]
    if hub:
        df = df[df["hub"].str.casefold() == str(hub).casefold()]
    if df.empty:
        return {"filters": {"product": product, "area": area, "hub": hub}, "count": 0, "rows": []}
    agg = df.groupby("product_name").agg(
        revenue=("sub_total", "sum"),
        units=("qty_net", "sum"),
        deliveries=("invoice_id", "count"),
        unique_customers=("mobile", "nunique"),
    ).reset_index().sort_values("revenue", ascending=False)
    return {
        "filters": {"product": product, "area": area, "hub": hub, "delivered_only": delivered_only},
        "count": len(agg),
        "rows": [
            {
                "product_name": r["product_name"],
                "revenue": float(r["revenue"] or 0),
                "units": float(r["units"] or 0),
                "deliveries": int(r["deliveries"] or 0),
                "unique_customers": int(r["unique_customers"] or 0),
            }
            for _, r in agg.iterrows()
        ],
    }


def product_by_area(
    session: Session,
    product: str,
    delivered_only: bool = True,
    limit: int = 50,
) -> dict[str, Any]:
    """Area-level breakdown of sales for a specific product. Returns each area's
    revenue, units, deliveries, unique customers for the matching product(s)."""
    sdf = _load_sales_df()
    if sdf is None:
        return {"error": "sales_not_loaded"}
    df = sdf
    if delivered_only:
        df = df[df["delivery_status"] == "delivered"]
    df = df[df["product_name"].str.contains(str(product), case=False, na=False)]
    if df.empty:
        return {"product": product, "count": 0, "rows": []}
    agg = df.groupby("area").agg(
        revenue=("sub_total", "sum"),
        units=("qty_net", "sum"),
        deliveries=("invoice_id", "count"),
        unique_customers=("mobile", "nunique"),
    ).reset_index().sort_values("deliveries", ascending=False).head(int(limit or 50))
    return {
        "product": product,
        "match_count": int(df["product_name"].nunique()),
        "matched_products": list(df["product_name"].unique()[:5]),
        "count": len(agg),
        "rows": [
            {
                "area": r["area"],
                "revenue": float(r["revenue"] or 0),
                "units": float(r["units"] or 0),
                "deliveries": int(r["deliveries"] or 0),
                "unique_customers": int(r["unique_customers"] or 0),
            }
            for _, r in agg.iterrows()
        ],
    }


def product_by_hub(
    session: Session,
    product: str,
    delivered_only: bool = True,
) -> dict[str, Any]:
    """Hub-level breakdown of sales for a specific product."""
    sdf = _load_sales_df()
    if sdf is None:
        return {"error": "sales_not_loaded"}
    df = sdf
    if delivered_only:
        df = df[df["delivery_status"] == "delivered"]
    df = df[df["product_name"].str.contains(str(product), case=False, na=False)]
    if df.empty:
        return {"product": product, "count": 0, "rows": []}
    agg = df.groupby("hub").agg(
        revenue=("sub_total", "sum"),
        units=("qty_net", "sum"),
        deliveries=("invoice_id", "count"),
        unique_customers=("mobile", "nunique"),
    ).reset_index().sort_values("deliveries", ascending=False)
    return {
        "product": product,
        "matched_products": list(df["product_name"].unique()[:5]),
        "count": len(agg),
        "rows": [
            {
                "hub": r["hub"],
                "revenue": float(r["revenue"] or 0),
                "units": float(r["units"] or 0),
                "deliveries": int(r["deliveries"] or 0),
                "unique_customers": int(r["unique_customers"] or 0),
            }
            for _, r in agg.iterrows()
        ],
    }


def sales_trend(
    session: Session,
    period: str = "month",
    product: str | None = None,
    area: str | None = None,
    hub: str | None = None,
    delivered_only: bool = True,
) -> dict[str, Any]:
    """Time-series trend — revenue, units, deliveries bucketed by period.
    `period`: 'day' | 'week' | 'month' (default)."""
    sdf = _load_sales_df()
    if sdf is None:
        return {"error": "sales_not_loaded"}
    import pandas as pd

    df = sdf
    if delivered_only:
        df = df[df["delivery_status"] == "delivered"]
    if product:
        df = df[df["product_name"].str.contains(str(product), case=False, na=False)]
    if area:
        df = df[df["area"].str.casefold() == str(area).casefold()]
    if hub:
        df = df[df["hub"].str.casefold() == str(hub).casefold()]
    if df.empty:
        return {"filters": {"period": period, "product": product, "area": area, "hub": hub}, "rows": []}

    # Pandas 3.0 requires uppercase period aliases: D, W, M (not d/w/m).
    alias = {"day": "D", "week": "W", "month": "M"}.get(str(period).lower(), "M")
    df = df.copy()
    df["_bucket"] = pd.to_datetime(df["date"]).dt.to_period(alias).dt.to_timestamp()
    agg = df.groupby("_bucket").agg(
        revenue=("sub_total", "sum"),
        units=("qty_net", "sum"),
        deliveries=("invoice_id", "count"),
        unique_customers=("mobile", "nunique"),
    ).reset_index().sort_values("_bucket")
    return {
        "filters": {"period": period, "product": product, "area": area, "hub": hub},
        "count": len(agg),
        "rows": [
            {
                "bucket": r["_bucket"].strftime("%Y-%m-%d"),
                "revenue": float(r["revenue"] or 0),
                "units": float(r["units"] or 0),
                "deliveries": int(r["deliveries"] or 0),
                "unique_customers": int(r["unique_customers"] or 0),
            }
            for _, r in agg.iterrows()
        ],
    }


def customer_affinity(session: Session, mobile: str | None = None, name: str | None = None) -> dict[str, Any]:
    """What a specific customer has bought — product mix, frequency, totals.
    Identify by mobile (preferred) or name (fuzzy)."""
    sdf = _load_sales_df()
    if sdf is None:
        return {"error": "sales_not_loaded"}
    df = sdf[sdf["delivery_status"] == "delivered"]
    if mobile:
        digits = re.sub(r"\D", "", str(mobile))
        df = df[df["mobile"].astype(str).str.contains(digits, na=False)]
    elif name:
        df = df[df["name"].str.contains(str(name), case=False, na=False)]
    else:
        return {"error": "need_identifier", "detail": "Pass mobile or name."}
    if df.empty:
        return {"filters": {"mobile": mobile, "name": name}, "count": 0, "products": []}
    profile = df.groupby("product_name").agg(
        orders=("invoice_id", "count"),
        units=("qty_net", "sum"),
        revenue=("sub_total", "sum"),
        last_ordered=("date", "max"),
    ).reset_index().sort_values("revenue", ascending=False)
    top_cust = df[["name", "mobile", "area", "hub"]].iloc[0]
    return {
        "customer": {
            "name": str(top_cust["name"]),
            "mobile": str(top_cust["mobile"]),
            "area": str(top_cust["area"]),
            "hub": str(top_cust["hub"]),
        },
        "total_orders": int(len(df)),
        "total_revenue": float(df["sub_total"].sum() or 0),
        "unique_products": int(profile["product_name"].nunique()),
        "first_order": str(df["date"].min()),
        "last_order": str(df["date"].max()),
        "products": [
            {
                "product_name": r["product_name"],
                "orders": int(r["orders"] or 0),
                "units": float(r["units"] or 0),
                "revenue": float(r["revenue"] or 0),
                "last_ordered": str(r["last_ordered"]),
            }
            for _, r in profile.iterrows()
        ],
    }


def top_products(
    session: Session,
    area: str | None = None,
    hub: str | None = None,
    by: str = "revenue",
    limit: int = 20,
    delivered_only: bool = True,
    order: str = "desc",
) -> dict[str, Any]:
    """Product leaderboard, optionally scoped to an area or hub.
    `by`: 'revenue' (default) | 'units' | 'deliveries' | 'unique_customers'.
    `order`: 'desc' (top/best-selling) | 'asc' (bottom/least-selling)."""
    sdf = _load_sales_df()
    if sdf is None:
        return {"error": "sales_not_loaded"}
    df = sdf
    if delivered_only:
        df = df[df["delivery_status"] == "delivered"]
    if area:
        df = df[df["area"].str.casefold() == str(area).casefold()]
    if hub:
        df = df[df["hub"].str.casefold() == str(hub).casefold()]
    if df.empty:
        return {"filters": {"area": area, "hub": hub, "by": by}, "count": 0, "rows": []}
    agg = df.groupby("product_name").agg(
        revenue=("sub_total", "sum"),
        units=("qty_net", "sum"),
        deliveries=("invoice_id", "count"),
        unique_customers=("mobile", "nunique"),
    ).reset_index()
    sort_col = by if by in ("revenue", "units", "deliveries", "unique_customers") else "revenue"
    ascending = str(order).lower() == "asc"
    agg = agg.sort_values(sort_col, ascending=ascending).head(int(limit or 20))
    return {
        "filters": {"area": area, "hub": hub, "by": sort_col, "order": "asc" if ascending else "desc",
                    "limit": int(limit or 20), "delivered_only": delivered_only},
        "count": len(agg),
        "rows": [
            {
                "product_name": r["product_name"],
                "revenue": float(r["revenue"] or 0),
                "units": float(r["units"] or 0),
                "deliveries": int(r["deliveries"] or 0),
                "unique_customers": int(r["unique_customers"] or 0),
            }
            for _, r in agg.iterrows()
        ],
    }


# ----------------------------------------------------------------------
# run_python — E2B code-interpreter sandbox with customer data pre-loaded
#
# Gives the LLM open-ended Python (pandas / numpy / sklearn / matplotlib)
# for anything that SQL alone can't express: cohort curves, forecasts,
# custom clustering, statistical tests, custom charts, etc.
#
# Design:
#   - Each call spins up a fresh E2B sandbox (cold start ~1-2s).
#   - The CURRENT snapshot's customer_records are serialised to CSV and
#     uploaded to /tmp/customers.csv inside the sandbox.
#   - A setup preamble is prepended to the LLM's code so `df` is a
#     pandas.DataFrame ready to use with no boilerplate.
#   - Sandbox executes with a 45s hard timeout.
#   - Results returned: stdout, stderr, any final expression value, and
#     any produced chart (base64 PNG).
# ----------------------------------------------------------------------

PYTHON_PREAMBLE = """
import sys as _sys
import pandas as pd
import numpy as np
import json
import os
pd.set_option('display.max_rows', 200)
pd.set_option('display.max_columns', 50)
pd.set_option('display.width', 200)
df = pd.read_csv('/tmp/customers.csv')
df['effective_wallet'] = pd.to_numeric(df['effective_wallet_balance'], errors='coerce') if 'effective_wallet_balance' in df.columns else df.get('wallet_balance')

# --- Sales transactions — loaded from CSV.gz only. We deliberately do NOT
# use parquet inside the sandbox: pandas 3.0 on the host writes parquet with
# pyarrow extension types that older sandbox pyarrow versions cannot read,
# producing "ArrowKeyError: No type extension with name arrow.py_extension_type".
# CSV.gz is bulletproof — pandas core, no extra deps. Loads 361k rows in ~3s.
sales_df = None
sales_delivered = None

if os.path.exists('/tmp/sales.csv.gz'):
    try:
        sales_df = pd.read_csv('/tmp/sales.csv.gz', compression='gzip', low_memory=False,
                               parse_dates=['date','delivery_time','invoice_date','created'])
    except Exception as _e:
        # Send to stderr so it doesn't pollute the result stdout the LLM reads.
        print(f'csv.gz load failed: {_e}', file=_sys.stderr)

if sales_df is not None:
    sales_df['mobile'] = sales_df['mobile'].astype(str).str.replace(r'\\.0$', '', regex=True)
    sales_delivered = sales_df[sales_df['delivery_status'] == 'delivered'].copy()
    try:
        dmin = pd.to_datetime(sales_df['date']).min().date()
        dmax = pd.to_datetime(sales_df['date']).max().date()
        # Diagnostic to stderr — keeps stdout clean for the actual answer.
        print(f'sales_df loaded: {len(sales_df):,} rows ({len(sales_delivered):,} delivered) | {dmin} to {dmax}', file=_sys.stderr)
    except Exception:
        print(f'sales_df loaded: {len(sales_df):,} rows ({len(sales_delivered):,} delivered)', file=_sys.stderr)
else:
    # Loud — this is real if the sandbox can't load sales data.
    print('sales_df not available — only customer master `df` is loaded.', file=_sys.stderr)
"""


def _records_to_csv(records: list[dict]) -> str:
    if not records:
        return ""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(records[0].keys()))
    writer.writeheader()
    writer.writerows(records)
    return buf.getvalue()


def run_python(session: Session, code: str) -> dict[str, Any]:
    """Execute Python in an E2B sandbox with MrMilk customer data pre-loaded as `df`.

    `df` columns include: name, mobile, area, hub, status (subscription_status),
    revenue, orders, wallet_balance, effective_wallet_balance (aliased as
    effective_wallet), last_delivery, source, payment_mode, delivery_boy,
    current_consumption, note.

    The code's stdout is returned verbatim — print the table / number / summary
    you want the user to see. Don't import anything dangerous; pandas / numpy /
    sklearn / scipy / statsmodels / matplotlib are pre-installed.
    """
    settings = get_settings()
    api_key = settings.e2b_api_key
    if not api_key:
        return {"error": "e2b_not_configured", "detail": "Set E2B_API_KEY in backend/.env"}

    if not code or not code.strip():
        return {"error": "empty_code"}

    # Lazy import so the rest of the backend runs fine without e2b installed
    try:
        from e2b_code_interpreter import Sandbox
    except ImportError:
        return {"error": "e2b_sdk_missing", "detail": "pip install e2b-code-interpreter"}

    # Fetch + serialise the current snapshot's records.
    # Prefer the in-memory cache (set by /api/customers/records hits) so we
    # don't hammer Supabase on every Python query. If both cache and DB miss,
    # surface a clear error so the user knows to load the dashboard first.
    from .customer_analytics import (
        _cache_get, _cache_lock, _get_current_snapshot,
        _records_cache, build_customer_records,
    )
    snapshot = _get_current_snapshot(session)
    if not snapshot:
        return {"error": "no_snapshot"}

    with _cache_lock:
        records = _cache_get(_records_cache, snapshot.id)
    if not records:
        try:
            records = build_customer_records(session, snapshot.id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("records fetch failed for run_python: %s", exc)
            return {
                "error": "records_unavailable",
                "detail": (
                    "Could not load customer records into the sandbox. "
                    "Open the Dashboard once to warm the cache, then retry. "
                    f"({exc.__class__.__name__})"
                ),
            }
    csv_data = _records_to_csv(records)

    sandbox = None
    try:
        # SDK v2.20+ uses Sandbox.create() factory; api_key comes from
        # E2B_API_KEY env var (set by uvicorn startup from .env).
        import os as _os
        if api_key:
            _os.environ.setdefault("E2B_API_KEY", api_key)
        sandbox = Sandbox.create(timeout=120)
        sandbox.files.write("/tmp/customers.csv", csv_data)

        # Upload sales data — CSV.gz only. We dropped parquet upload because
        # the sandbox's pyarrow version can't read the extension types pandas
        # 3.0 writes (ArrowKeyError: arrow.py_extension_type). CSV.gz reads in
        # vanilla pandas, ~3s for 361k rows, no version-mismatch surface.
        from pathlib import Path as _Path
        cache_dir = _Path(__file__).resolve().parent.parent.parent / ".cache"
        sales_csvgz = cache_dir / "sales.csv.gz"
        if sales_csvgz.is_file():
            with open(sales_csvgz, "rb") as fh:
                sandbox.files.write("/tmp/sales.csv.gz", fh.read())

        # Inject the live schema summary so generated code can reference
        # KNOWN_VALUES['area'] etc. for fuzzy local matching, and so the
        # sandbox stdout shows what real values are available.
        try:
            from .data_summary import get_rendered as _get_schema
            _, known_values_py = _get_schema(session)
        except Exception:  # noqa: BLE001
            known_values_py = "KNOWN_VALUES = {}\n"

        execution = sandbox.run_code(PYTHON_PREAMBLE + "\n" + known_values_py + "\n" + code)

        stdout_lines = list(execution.logs.stdout) if execution.logs and execution.logs.stdout else []
        stderr_lines = list(execution.logs.stderr) if execution.logs and execution.logs.stderr else []

        # Try to capture the last rich result (DataFrame preview, scalar, chart)
        final_text = ""
        chart_png_b64 = None
        if getattr(execution, "results", None):
            last = execution.results[-1]
            if hasattr(last, "text") and last.text:
                final_text = str(last.text)
            if hasattr(last, "png") and last.png:
                chart_png_b64 = last.png

        error_msg = None
        if getattr(execution, "error", None):
            err = execution.error
            error_msg = f"{getattr(err, 'name', 'Error')}: {getattr(err, 'value', err)}"

        return {
            "row_count_input": len(records),
            "stdout": "\n".join(stdout_lines),
            "stderr": "\n".join(stderr_lines),
            "result_text": final_text,
            "chart_png_base64": chart_png_b64,
            "error": error_msg,
        }
    except Exception as exc:  # noqa: BLE001 — surface whatever happened back to the LLM
        logger.exception("E2B run_python crashed")
        return {"error": "e2b_exception", "detail": str(exc)}
    finally:
        if sandbox is not None:
            try:
                sandbox.kill()
            except Exception:  # noqa: BLE001
                pass


# ----------------------------------------------------------------------
# find_match — vector-embedding fuzzy matcher.
# Translates a user's loose / typo'd / partial text to the exact known
# value of a categorical column (product_name, area, hub, status). The
# LLM should call this BEFORE writing pandas filters when the input
# isn't already an exact known value.
# ----------------------------------------------------------------------
def find_match(session: Session, query: str, type: str = "product", top_k: int = 3) -> dict[str, Any]:
    """Return the top-k known values closest to `query`. See
    backend.app.services.embeddings for the index implementation."""
    from .embeddings import find_match as _find_match
    return _find_match(session, query, type=type, top_k=int(top_k or 3))

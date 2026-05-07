from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import case, func, select, text
from sqlalchemy.orm import Session

from ..models import CustomerRecord, DatasetSnapshot

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# Persistent disk cache for customer_records.
#
# Why: the Supabase transaction pooler routinely times out on the 20k-row
# records scan (cross-region, statement_timeout ≈ 120s). Once we've paid
# that cost successfully ONCE for a given snapshot_id, we write the
# serialised rows to a JSON file in backend/.cache/. Subsequent requests
# — from any endpoint or from run_python's E2B upload — read from the
# local file in ~milliseconds, with zero DB round-trip.
#
# Invalidation: the file is keyed on snapshot_id, so a new import
# (which mints a new snapshot_id) naturally reads fresh. import_service
# also calls invalidate_analytics_cache() as a belt-and-suspenders reset.
# ----------------------------------------------------------------------
_DISK_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
_DISK_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _disk_path(snapshot_id: str) -> Path:
    safe = "".join(c for c in snapshot_id if c.isalnum() or c in "-_")
    return _DISK_CACHE_DIR / f"records-{safe}.json"


def _snapshot_id_from_records_path(path: Path) -> str:
    name = path.name
    if name.startswith("records-") and name.endswith(".json"):
        return name[len("records-") : -len(".json")]
    return ""


def _latest_disk_records_path() -> Path | None:
    paths = [p for p in _DISK_CACHE_DIR.glob("records-*.json") if p.is_file()]
    if not paths:
        return None
    return max(paths, key=lambda p: p.stat().st_mtime)


def _disk_read(snapshot_id: str) -> list[dict] | None:
    p = _disk_path(snapshot_id)
    if not p.is_file():
        return None
    try:
        with p.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            logger.info("records: disk-cache hit (%d rows, %s)", len(data), p.name)
            return data
    except Exception as exc:  # noqa: BLE001
        logger.warning("records: disk-cache read failed %s: %s", p.name, exc)
    return None


def _disk_write(snapshot_id: str, rows: list[dict]) -> None:
    p = _disk_path(snapshot_id)
    tmp = p.with_suffix(".json.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(rows, fh, ensure_ascii=False)
        os.replace(tmp, p)
        logger.info("records: disk-cache write (%d rows, %s)", len(rows), p.name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("records: disk-cache write failed %s: %s", p.name, exc)


def build_cached_customer_records() -> dict | None:
    """Return the latest disk-cached customer rows when the DB is unavailable."""
    path = _latest_disk_records_path()
    if path is None:
        return None
    snapshot_id = _snapshot_id_from_records_path(path)
    rows = _disk_read(snapshot_id)
    if not snapshot_id or rows is None:
        return None
    return {
        "snapshot_id": snapshot_id,
        "records": rows,
        "cached_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
    }


def _to_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except Exception:  # noqa: BLE001
        return 0.0


def _to_int(value: Any) -> int:
    return int(round(_to_float(value)))


def _bump(bucket: dict[str, int], key: Any, amount: int = 1) -> None:
    text_value = str(key or "").strip()
    if not text_value:
        return
    bucket[text_value] = bucket.get(text_value, 0) + amount


def _sort_count_dict(bucket: dict[str, int], limit: int | None = None) -> dict[str, int]:
    items = sorted(bucket.items(), key=lambda item: item[1], reverse=True)
    if limit is not None:
        items = items[:limit]
    return dict(items)


def _sort_metric_dict(bucket: dict[str, dict], metric: str, limit: int | None = None) -> dict[str, dict]:
    items = sorted(bucket.items(), key=lambda item: item[1].get(metric, 0), reverse=True)
    if limit is not None:
        items = items[:limit]
    return dict(items)


def _status_counts(status_map: dict[str, int]) -> dict[str, int]:
    inactive = 0
    suspended = 0
    trial = 0
    for status, count in status_map.items():
        key = status.strip().lower()
        if key.startswith("inactive"):
            inactive += count
        if key.startswith("suspended"):
            suspended += count
        if key.startswith("trial"):
            trial += count
    return {
        "active_customers": status_map.get("Active Subscription", 0),
        "active_no_subscription_customers": status_map.get("Active No Subscription", 0),
        "inactive_customers": inactive,
        "suspended_customers": suspended,
        "trial_customers": trial,
        "new_customers": status_map.get("New Customer", 0),
        "on_vacation_customers": status_map.get("On Vacation", 0),
    }


def build_cached_customer_summary() -> dict | None:
    """Build the dashboard summary from the latest disk-cached records file."""
    cached = build_cached_customer_records()
    if cached is None:
        return None

    rows = cached["records"]
    snapshot_id = cached["snapshot_id"]
    cache_dt = datetime.fromisoformat(cached["cached_at"])
    status_map: dict[str, int] = {}
    hub_performance: dict[str, dict] = {}
    top_areas: dict[str, dict] = {}
    wallet_positive = 0
    wallet_zero = 0
    wallet_negative = 0
    wallet_max = 0.0
    payment_mode: dict[str, int] = {}
    sources: dict[str, int] = {}
    top_delivery_boys: dict[str, int] = {}
    total_revenue = 0.0
    total_orders = 0
    total_wallet = 0.0
    total_consumption = 0.0
    consumption_count = 0

    for row in rows:
        status = str(row.get("status") or row.get("Sub. Status") or "Unknown").strip()
        hub = str(row.get("hub") or row.get("Hub") or "No Hub Assigned").strip() or "No Hub Assigned"
        area = str(row.get("area") or row.get("Area") or "Unknown Area").strip() or "Unknown Area"
        revenue = _to_float(row.get("revenue") or row.get("Total Revenue"))
        orders = _to_int(row.get("orders") or row.get("Total Orders"))
        wallet = _to_float(row.get("effective_wallet_balance") if "effective_wallet_balance" in row else row.get("wallet_balance"))
        consumption = _to_float(row.get("current_consumption") or row.get("Current Consumption"))

        _bump(status_map, status)
        total_revenue += revenue
        total_orders += orders
        total_wallet += wallet
        wallet_max = max(wallet_max, wallet)
        if wallet > 0:
            wallet_positive += 1
        elif wallet < 0:
            wallet_negative += 1
        else:
            wallet_zero += 1

        hub_stats = hub_performance.setdefault(hub, {"customers": 0, "revenue": 0.0, "orders": 0})
        hub_stats["customers"] += 1
        hub_stats["revenue"] += revenue
        hub_stats["orders"] += orders

        area_stats = top_areas.setdefault(area, {"customers": 0, "revenue": 0.0})
        area_stats["customers"] += 1
        area_stats["revenue"] += revenue

        _bump(payment_mode, row.get("payment_mode") or row.get("Payment Mode"))
        _bump(sources, row.get("source") or row.get("Source"))
        _bump(top_delivery_boys, row.get("delivery_boy") or row.get("Delivery Boy"))

        if consumption > 0:
            total_consumption += consumption
            consumption_count += 1

    total_customers = len(rows)
    status_totals = _status_counts(status_map)
    top_customers = sorted(rows, key=lambda r: _to_float(r.get("revenue") or r.get("Total Revenue")), reverse=True)[:20]
    inactive = [
        r for r in rows
        if str(r.get("status") or r.get("Sub. Status") or "").strip().lower().startswith("inactive")
        and _to_float(r.get("revenue") or r.get("Total Revenue")) > 0
    ]
    inactive = sorted(inactive, key=lambda r: _to_float(r.get("revenue") or r.get("Total Revenue")), reverse=True)[:10]

    def _proof_row(row: dict) -> dict:
        return {
            "Name": row.get("name") or row.get("Name") or "",
            "Mobile": row.get("mobile") or row.get("Mobile") or "",
            "Area": row.get("area") or row.get("Area") or "",
            "Hub": row.get("hub") or row.get("Hub") or "No Hub Assigned",
            "Sub. Status": row.get("status") or row.get("Sub. Status") or "",
            "Total Revenue": _to_float(row.get("revenue") or row.get("Total Revenue")),
            "Total Orders": _to_int(row.get("orders") or row.get("Total Orders")),
            "Wallet Balance": _to_float(row.get("wallet_balance") or row.get("Wallet Balance")),
            "Last Delivery": row.get("last_delivery") or row.get("Last Delivery") or "",
        }

    return {
        "data_date": f"Cached snapshot from {cache_dt.strftime('%B')} {cache_dt.day}, {cache_dt.year}",
        "snapshot_id": snapshot_id,
        "snapshot_source": "disk-cache",
        "overview": {
            "total_customers": total_customers,
            "total_revenue": round(total_revenue, 2),
            "total_orders": total_orders,
            "avg_revenue_per_customer": round(total_revenue / total_customers, 2) if total_customers else 0,
            "total_wallet_balance": round(total_wallet, 2),
            **status_totals,
            "dnd_customers": 0,
            "blocked_customers": 0,
        },
        "subscription_status": _sort_count_dict(status_map),
        "hub_performance": _sort_metric_dict(hub_performance, "revenue"),
        "top_areas_by_revenue": _sort_metric_dict(top_areas, "revenue", 15),
        "wallet_stats": {
            "customers_with_positive_wallet": wallet_positive,
            "customers_with_zero_wallet": wallet_zero,
            "customers_with_negative_wallet": wallet_negative,
            "avg_wallet_balance": round(total_wallet / total_customers, 2) if total_customers else 0,
            "max_wallet_balance": round(wallet_max, 2),
            "total_wallet": round(total_wallet, 2),
        },
        "payment_mode": _sort_count_dict(payment_mode),
        "sources": _sort_count_dict(sources, 10),
        "top_delivery_boys": _sort_count_dict(top_delivery_boys, 10),
        "consumption": {
            "avg_daily_liters": round(total_consumption / consumption_count, 3) if consumption_count else 0,
            "total_daily_liters": round(total_consumption, 0),
        },
        "top_20_customers": [_proof_row(row) for row in top_customers],
        "high_value_inactive": [_proof_row(row) for row in inactive],
    }


def _disk_prune_stale(current_snapshot_id: str) -> None:
    """Delete any records-*.json files that don't belong to the current snapshot."""
    keep = _disk_path(current_snapshot_id).name
    try:
        for f in _DISK_CACHE_DIR.glob("records-*.json"):
            if f.name != keep:
                f.unlink(missing_ok=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("records: disk-cache prune failed: %s", exc)

# ----------------------------------------------------------------------
# In-process cache, keyed on snapshot_id.
#
# Why: the summary runs ~9 aggregate queries + the records endpoint serialises
# 20k+ rows. Both results are deterministic for a given snapshot_id — a new
# snapshot only lands when the user imports a new workbook, at which point the
# snapshot_id changes. So keying on snapshot_id auto-invalidates on import
# without explicit cache busting.
#
# We keep the cache tiny (last 4 snapshots) and add a soft TTL so a stuck
# process can't pin stale data forever.
# ----------------------------------------------------------------------
_CACHE_TTL_SECONDS = 600  # 10 min ceiling — any snapshot-id change resets anyway
_CACHE_MAX = 4

_cache_lock = threading.Lock()
_summary_cache: dict[str, tuple[float, dict]] = {}
_records_cache: dict[str, tuple[float, list[dict]]] = {}


def _cache_get(bucket: dict, key: str) -> Any:
    entry = bucket.get(key)
    if not entry:
        return None
    stored_at, value = entry
    if time.time() - stored_at > _CACHE_TTL_SECONDS:
        bucket.pop(key, None)
        return None
    return value


def _cache_put(bucket: dict, key: str, value: Any) -> None:
    bucket[key] = (time.time(), value)
    if len(bucket) > _CACHE_MAX:
        # Evict the oldest entry
        oldest = min(bucket.items(), key=lambda item: item[1][0])
        bucket.pop(oldest[0], None)


def invalidate_analytics_cache() -> None:
    """Called by the import pipeline when a new snapshot is promoted to current.
    In practice the snapshot_id change alone invalidates via the key, but this
    gives us a belt-and-suspenders hard reset."""
    with _cache_lock:
        _summary_cache.clear()
        _records_cache.clear()
    logger.info("analytics cache cleared")


def _get_current_snapshot(session: Session) -> DatasetSnapshot | None:
    snapshot_id = session.execute(
        select(DatasetSnapshot.id)
        .where(DatasetSnapshot.is_current.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if not snapshot_id:
        return None
    return session.get(DatasetSnapshot, snapshot_id)


def build_customer_summary(session: Session) -> dict | None:
    snapshot = _get_current_snapshot(session)
    if not snapshot:
        return None

    sid = snapshot.id
    with _cache_lock:
        cached = _cache_get(_summary_cache, sid)
    if cached is not None:
        return cached

    # ------------------------------------------------------------------
    # Overview totals
    # ------------------------------------------------------------------
    ov = session.execute(
        select(
            func.count().label("total_customers"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("total_revenue"),
            func.coalesce(func.sum(CustomerRecord.total_orders), 0).label("total_orders"),
            func.coalesce(func.sum(CustomerRecord.effective_wallet_balance_current), 0).label("total_wallet"),
            func.count(case((CustomerRecord.dnd.is_(True), 1))).label("dnd_customers"),
            func.count(case((CustomerRecord.is_blocked.is_(True), 1))).label("blocked_customers"),
        ).where(CustomerRecord.dataset_snapshot_id == sid)
    ).one()

    total_customers = ov.total_customers or 0
    total_revenue = float(ov.total_revenue or 0)
    total_orders = int(ov.total_orders or 0)
    total_wallet = float(ov.total_wallet or 0)
    avg_revenue = round(total_revenue / total_customers, 2) if total_customers else 0.0

    # ------------------------------------------------------------------
    # Status counts (based on subscription_status — "Sub. Status" column)
    # Values like "Active Subscription", "Inactive No Order", "Trial Running", etc.
    # ------------------------------------------------------------------
    # Match MilkMaster semantics exactly:
    #   Active  = only "Active Subscription" (NOT "Active No Subscription")
    #   Inactive = any "Inactive*" status (Inactive, Inactive No Order, Inactive No Subscription)
    #   Suspended = any "Suspended*" status
    #   Trial = any "Trial*" status (Running, Ended, Not Converted)
    #   New = "New Customer"
    sc = session.execute(
        select(
            func.count(case((CustomerRecord.subscription_status == "Active Subscription", 1))).label("active"),
            func.count(case((CustomerRecord.subscription_status == "Active No Subscription", 1))).label("active_no_sub"),
            func.count(case((CustomerRecord.subscription_status.ilike("Inactive%"), 1))).label("inactive"),
            func.count(case((CustomerRecord.subscription_status.ilike("Suspended%"), 1))).label("suspended"),
            func.count(case((CustomerRecord.subscription_status.ilike("Trial%"), 1))).label("trial"),
            func.count(case((CustomerRecord.subscription_status == "New Customer", 1))).label("new_cust"),
            func.count(case((CustomerRecord.subscription_status == "On Vacation", 1))).label("on_vacation"),
        ).where(CustomerRecord.dataset_snapshot_id == sid)
    ).one()

    # ------------------------------------------------------------------
    # Subscription status breakdown (subscription_status group by)
    # ------------------------------------------------------------------
    subscription_status = {
        row.subscription_status: row.cnt
        for row in session.execute(
            select(CustomerRecord.subscription_status, func.count().label("cnt"))
            .where(
                CustomerRecord.dataset_snapshot_id == sid,
                CustomerRecord.subscription_status != "",
            )
            .group_by(CustomerRecord.subscription_status)
            .order_by(func.count().desc())
        )
    }

    # ------------------------------------------------------------------
    # Hub performance
    # ------------------------------------------------------------------
    hub_performance: dict = {}
    for row in session.execute(
        select(
            CustomerRecord.hub,
            func.count().label("customers"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("revenue"),
            func.coalesce(func.sum(CustomerRecord.total_orders), 0).label("orders"),
        )
        .where(CustomerRecord.dataset_snapshot_id == sid)
        .group_by(CustomerRecord.hub)
        .order_by(func.sum(CustomerRecord.total_revenue).desc().nulls_last())
    ):
        hub_performance[row.hub or "No Hub Assigned"] = {
            "customers": row.customers,
            "revenue": float(row.revenue or 0),
            "orders": int(row.orders or 0),
        }

    # ------------------------------------------------------------------
    # Top 15 areas by revenue
    # ------------------------------------------------------------------
    top_areas_by_revenue: dict = {}
    for row in session.execute(
        select(
            CustomerRecord.area,
            func.count().label("customers"),
            func.coalesce(func.sum(CustomerRecord.total_revenue), 0).label("revenue"),
        )
        .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.area != "")
        .group_by(CustomerRecord.area)
        .order_by(func.sum(CustomerRecord.total_revenue).desc().nulls_last())
        .limit(15)
    ):
        top_areas_by_revenue[row.area] = {
            "customers": row.customers,
            "revenue": float(row.revenue or 0),
        }

    # ------------------------------------------------------------------
    # Wallet stats
    # ------------------------------------------------------------------
    wr = session.execute(
        select(
            func.count(case((CustomerRecord.effective_wallet_balance_current > 0, 1))).label("positive"),
            func.count(case((CustomerRecord.effective_wallet_balance_current == 0, 1))).label("zero"),
            func.count(case((CustomerRecord.effective_wallet_balance_current < 0, 1))).label("negative"),
            func.coalesce(func.avg(CustomerRecord.effective_wallet_balance_current), 0).label("avg_wallet"),
            func.coalesce(func.max(CustomerRecord.effective_wallet_balance_current), 0).label("max_wallet"),
        ).where(CustomerRecord.dataset_snapshot_id == sid)
    ).one()

    wallet_stats = {
        "customers_with_positive_wallet": wr.positive or 0,
        "customers_with_zero_wallet": wr.zero or 0,
        "customers_with_negative_wallet": wr.negative or 0,
        "avg_wallet_balance": round(float(wr.avg_wallet or 0), 2),
        "max_wallet_balance": float(wr.max_wallet or 0),
        "total_wallet": round(total_wallet, 2),
    }

    # ------------------------------------------------------------------
    # Payment mode breakdown
    # ------------------------------------------------------------------
    payment_mode = {
        row.payment_mode: row.cnt
        for row in session.execute(
            select(CustomerRecord.payment_mode, func.count().label("cnt"))
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.payment_mode != "")
            .group_by(CustomerRecord.payment_mode)
            .order_by(func.count().desc())
        )
    }

    # ------------------------------------------------------------------
    # Top 10 acquisition sources
    # ------------------------------------------------------------------
    sources = {
        row.source: row.cnt
        for row in session.execute(
            select(CustomerRecord.source, func.count().label("cnt"))
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.source != "")
            .group_by(CustomerRecord.source)
            .order_by(func.count().desc())
            .limit(10)
        )
    }

    # ------------------------------------------------------------------
    # Top 10 delivery boys by customer count
    # ------------------------------------------------------------------
    top_delivery_boys = {
        row.delivery_boy: row.cnt
        for row in session.execute(
            select(CustomerRecord.delivery_boy, func.count().label("cnt"))
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.delivery_boy != "")
            .group_by(CustomerRecord.delivery_boy)
            .order_by(func.count().desc())
            .limit(10)
        )
    }

    # ------------------------------------------------------------------
    # Consumption
    # ------------------------------------------------------------------
    cr = session.execute(
        select(
            func.coalesce(func.avg(CustomerRecord.current_consumption), 0).label("avg"),
            func.coalesce(func.sum(CustomerRecord.current_consumption), 0).label("total"),
        ).where(
            CustomerRecord.dataset_snapshot_id == sid,
            CustomerRecord.current_consumption > 0,
        )
    ).one()

    # ------------------------------------------------------------------
    # Top 20 customers by total revenue
    # ------------------------------------------------------------------
    top_20_customers = [
        {
            "Name": r.name,
            "Mobile": r.mobile,
            "Area": r.area,
            "Hub": r.hub or "No Hub Assigned",
            "Total Revenue": float(r.total_revenue or 0),
            "Total Orders": r.total_orders or 0,
            "Sub. Status": r.subscription_status,
            "Wallet Balance": float(r.wallet_balance_spend or 0),
        }
        for r in session.execute(
            select(CustomerRecord)
            .where(CustomerRecord.dataset_snapshot_id == sid, CustomerRecord.total_revenue > 0)
            .order_by(CustomerRecord.total_revenue.desc().nulls_last())
            .limit(20)
        ).scalars()
    ]

    # ------------------------------------------------------------------
    # High-value inactive customers
    # ------------------------------------------------------------------
    # High-value inactive: any customer whose subscription_status is one of the
    # "Inactive*" buckets (Inactive / Inactive No Order / Inactive No Subscription)
    # with revenue > 0, ordered by lifetime revenue desc. These are the dormant
    # high-LTV customers worth a win-back call.
    high_value_inactive = [
        {
            "Name": r.name,
            "Mobile": r.mobile,
            "Area": r.area,
            "Hub": r.hub or "No Hub Assigned",
            "Sub. Status": r.subscription_status,
            "Total Revenue": float(r.total_revenue or 0),
            "Total Orders": r.total_orders or 0,
            "Wallet Balance": float(r.wallet_balance_spend or 0),
            "Last Delivery": r.last_delivery_date.strftime("%Y-%m-%d") if r.last_delivery_date else "",
        }
        for r in session.execute(
            select(CustomerRecord)
            .where(
                CustomerRecord.dataset_snapshot_id == sid,
                CustomerRecord.subscription_status.ilike("Inactive%"),
                CustomerRecord.total_revenue > 0,
            )
            .order_by(CustomerRecord.total_revenue.desc().nulls_last())
            .limit(10)
        ).scalars()
    ]

    # ------------------------------------------------------------------
    # data_date from snapshot
    # ------------------------------------------------------------------
    dt = snapshot.imported_at
    data_date = f"{dt.strftime('%B')} {dt.day}, {dt.year}" if dt else "Unknown Date"

    result = {
        "data_date": data_date,
        "snapshot_id": snapshot.id,
        "overview": {
            "total_customers": total_customers,
            "total_revenue": round(total_revenue, 2),
            "total_orders": total_orders,
            "avg_revenue_per_customer": avg_revenue,
            "total_wallet_balance": round(total_wallet, 2),
            "active_customers": sc.active,
            "active_no_subscription_customers": sc.active_no_sub,
            "inactive_customers": sc.inactive,
            "suspended_customers": sc.suspended,
            "trial_customers": sc.trial,
            "new_customers": sc.new_cust,
            "on_vacation_customers": sc.on_vacation,
            "dnd_customers": ov.dnd_customers,
            "blocked_customers": ov.blocked_customers,
        },
        "subscription_status": subscription_status,
        "hub_performance": hub_performance,
        "top_areas_by_revenue": top_areas_by_revenue,
        "wallet_stats": wallet_stats,
        "payment_mode": payment_mode,
        "sources": sources,
        "top_delivery_boys": top_delivery_boys,
        "consumption": {
            "avg_daily_liters": round(float(cr.avg or 0), 3),
            "total_daily_liters": round(float(cr.total or 0), 0),
        },
        "top_20_customers": top_20_customers,
        "high_value_inactive": high_value_inactive,
    }
    with _cache_lock:
        _cache_put(_summary_cache, sid, result)
    return result


def build_customer_records(session: Session, snapshot_id: str) -> list[dict]:
    # 1) In-memory cache (fastest)
    with _cache_lock:
        cached = _cache_get(_records_cache, snapshot_id)
    if cached is not None:
        return cached

    # 2) Disk cache — survives restarts and skips the fragile cross-region scan
    disk = _disk_read(snapshot_id)
    if disk is not None:
        with _cache_lock:
            _cache_put(_records_cache, snapshot_id, disk)
        return disk

    # 3) Fetch from Supabase, paginated so each SELECT stays well inside
    # the pooler's statement_timeout. 5k rows fetches in <5s even over a
    # slow cross-region pooler — no SET LOCAL needed.
    cols = (
        CustomerRecord.name,
        CustomerRecord.mobile,
        CustomerRecord.area,
        CustomerRecord.hub,
        CustomerRecord.subscription_status,
        CustomerRecord.total_revenue,
        CustomerRecord.total_orders,
        CustomerRecord.wallet_balance_spend,
        CustomerRecord.effective_wallet_balance_current,
        CustomerRecord.last_delivery_date,
        CustomerRecord.first_delivery_date,
        CustomerRecord.source,
        CustomerRecord.payment_mode,
        CustomerRecord.delivery_boy,
        CustomerRecord.current_consumption,
        CustomerRecord.note,
    )
    PAGE = 5000
    all_rows: list[Any] = []
    offset = 0
    started = time.time()
    while True:
        page_started = time.time()
        page = session.execute(
            select(*cols)
            .where(CustomerRecord.dataset_snapshot_id == snapshot_id)
            .order_by(CustomerRecord.total_revenue.desc().nulls_last(), CustomerRecord.id.asc())
            .offset(offset)
            .limit(PAGE)
        ).all()
        logger.info("records: page offset=%d got=%d in %.1fs",
                    offset, len(page), time.time() - page_started)
        if not page:
            break
        all_rows.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
        if offset > 200000:  # paranoid safety — shouldn't ever be hit
            logger.warning("records: halting paginated fetch at offset %d", offset)
            break
    logger.info("records: total %d rows in %.1fs", len(all_rows), time.time() - started)

    result = [
        {
            "name": r.name,
            "mobile": r.mobile,
            "area": r.area,
            "hub": r.hub or "No Hub Assigned",
            "status": r.subscription_status,
            "revenue": float(r.total_revenue or 0),
            "orders": r.total_orders or 0,
            "wallet_balance": float(r.wallet_balance_spend or 0),
            "effective_wallet_balance": float(r.effective_wallet_balance_current or 0),
            "last_delivery": r.last_delivery_date.strftime("%Y-%m-%d") if r.last_delivery_date else "",
            "first_delivery": r.first_delivery_date.strftime("%Y-%m-%d") if r.first_delivery_date else "",
            "source": r.source,
            "payment_mode": r.payment_mode,
            "delivery_boy": r.delivery_boy,
            "current_consumption": float(r.current_consumption or 0),
            "note": r.note,
        }
        for r in all_rows
    ]
    with _cache_lock:
        _cache_put(_records_cache, snapshot_id, result)
    _disk_write(snapshot_id, result)
    _disk_prune_stale(snapshot_id)
    return result


def warmup_records_cache(session: Session) -> int:
    """Called at startup and after imports: load records for the current snapshot
    so run_python and /api/customers/records don't pay the first-hit cost."""
    snapshot = _get_current_snapshot(session)
    if not snapshot:
        return 0
    try:
        rows = build_customer_records(session, snapshot.id)
        return len(rows)
    except Exception as exc:  # noqa: BLE001
        logger.warning("records warmup failed: %s", exc)
        return 0

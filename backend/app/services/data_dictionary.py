"""
Auto-generated data dictionary — gives the LLM a complete, accurate profile
of every column in every table so it stops guessing.

For each column we expose:
  * dtype (Python / pandas type)
  * row count, null count + percent
  * cardinality (distinct value count)
  * min / max / mean (numeric only)
  * top-15 categorical values with counts
  * date range (datetime only)
  * a one-line "business meaning" derived from the column name + table

Build is on-demand, cached on disk per snapshot. The agent prompt loads
the JSON at runtime and renders a compact text version.

Cost / size: full profile of customer_records (20k rows, ~40 cols) +
sales_df (361k rows, 36 cols) = ~80KB JSON. Tiny.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DatasetSnapshot

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------------
# Business-meaning lexicon. Lookup is exact column name first, then
# unmapped columns fall back to a small substring lexicon. This avoids
# loose matches like 'route_name' inheriting 'Customer full name'.
# ----------------------------------------------------------------------
_EXACT_MEANING: dict[str, str] = {
    # Customer master
    "effective_wallet_balance_current": "Business-facing wallet balance after credits/refunds — DEFAULT wallet column",
    "wallet_balance_spend": "Raw spend wallet balance (excludes credits/refunds)",
    "subscription_status": "MilkMaster lifecycle status (Active Subscription, Inactive, Trial Running, Suspended, etc.)",
    "temp_customer_status": "Temporary day-of customer flag (vacation, complaint, on-hold)",
    "total_revenue": "Lifetime revenue from this customer (INR)",
    "total_orders": "Lifetime order count",
    "current_consumption": "Current monthly consumption rate (litres or units)",
    "payment_mode": "Wallet | COD | Online | Mixed",
    "payment_type": "Prepaid vs Postpaid",
    "credit_limit": "Per-customer credit allowance (INR)",
    "due_since": "Days since outstanding amount (negative = overdue)",
    "last_payment_before_days": "Days since last payment received",
    "route_name": "Distribution route label",
    "delivery_boy": "Assigned delivery executive name",
    "delivery_boy_id": "Internal delivery-executive id",
    "delivery_preference": "Customer delivery instructions",
    "time_slot": "Delivery time slot",
    "campaign_name": "Marketing campaign that brought the customer",
    "crm_agent": "CRM agent who onboarded the customer",
    "created_by": "Internal user who created the record",
    "customer_type": "B2C | B2B | Hotel | Restaurant",
    "follow_up_date": "Scheduled follow-up date",
    "first_delivery_date": "Date of customer's very first delivery",
    "last_delivery_date": "Date of customer's most recent delivery",
    "created_date": "Date the customer record was created in MilkMaster",
    "created_at": "Backend insert timestamp",
    "imported_at": "Snapshot import timestamp",
    "source": "Acquisition source (Referral, Google Ads, Walk-in, etc.)",
    "sub_source": "Acquisition sub-channel",
    "geo_location_html": "Embedded HTML/Maps snippet for the customer's location",
    "row_hash": "Deduplication hash",
    "fingerprint": "File-level content hash",
    "id": "Internal primary key",
    "source_customer_id": "MilkMaster source-system customer ID",
    "dataset_snapshot_id": "Internal snapshot UUID — filter for current snapshot",
    "is_blocked": "Account-blocked flag",
    "dnd": "Do-not-disturb flag",
    "email_id": "Customer email",
    "gst_number": "Customer GST number (B2B)",

    # Shared / address
    "name": "Customer full name",
    "mobile": "Primary phone (10 digits) — JOIN KEY between customer_records and sales_df",
    "alternate_mobile": "Backup contact number",
    "area": "City sub-area (Wakad, Hadapsar, Kothrud, Kharadi, etc.)",
    "sub_area": "Finer-grained locality within area",
    "hub": "Distribution hub (Pune City Hub, Chinchwad Hub, etc.)",
    "hub_id": "Internal hub identifier",
    "city": "City — typically Pune or PCMC",
    "state": "Maharashtra (single-state operation)",
    "street": "Street address line",
    "address": "Full delivery address",
    "note": "Free-text operational notes",

    # Sales
    "date": "Sales row date — primary time-series column",
    "created": "Sales row creation timestamp",
    "invoice_id": "Single line-item invoice ID (one row per product per delivery)",
    "invoice_date": "Date the invoice was generated",
    "subscription_id": "Recurring subscription identifier",
    "subscription_type": "Daily | Alternate | Weekly | One-Time | etc.",
    "product_name": "Catalog product name (Desi Cow A2 Milk, Mango Pulp, Amrapali Mangoes, etc.)",
    "product_id": "Internal SKU id",
    "product_weight": "Pack size (250ml, 500ml, 1000ml, 1kg, etc.)",
    "product_price": "List price per unit (INR)",
    "net_price": "Net price after tax/discount (INR)",
    "sub_total": "Line-item revenue (price × qty_net) (INR) — primary revenue field",
    "total_tax": "Tax charged on the line item",
    "discount_price": "Discount amount applied",
    "cancel_charge": "Charge applied on cancellation",
    "tax_rate": "GST rate applied (%)",
    "delivery_id": "Internal delivery row id",
    "delivery_status": "Delivered | Cancelled | Curdled | Disputed | Skipped",
    "delivery_shift": "Morning | Evening (delivery time band)",
    "delivery_location": "Specific delivery address text",
    "delivery_time": "Timestamp delivery was logged",
    "qty_delivered": "Units actually delivered",
    "qty_ordered": "Units originally ordered",
    "qty_cancelled": "Units cancelled",
    "qty_disputed": "Units customer disputed",
    "qty_curdled": "Units returned for spoilage",
    "qty_net": "Net delivered units (qty_delivered - returns) — primary qty field",
    "customer_id": "MilkMaster source customer id (sales-side)",
    "effective_wallet_balance": "Business-facing wallet balance (sales-side denormalized copy)",
}

# Substring fallback only used when exact lookup misses
_FALLBACK_SUBSTR: list[tuple[str, str]] = [
    ("wallet", "Wallet-related amount column"),
    ("revenue", "Revenue (INR)"),
    ("orders", "Order count"),
]


def _meaning_for(col: str) -> str:
    exact = _EXACT_MEANING.get(col.lower())
    if exact:
        return exact
    name_l = col.lower()
    for key, meaning in _FALLBACK_SUBSTR:
        if key in name_l:
            return meaning
    return ""


def _serialize_value(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (str, int, float, bool, list, dict)):
        return v
    try:
        return float(v)
    except (TypeError, ValueError):
        return str(v)


# ----------------------------------------------------------------------
# Postgres-side profile (customer_records)
# ----------------------------------------------------------------------
def _profile_customer_records(session: Session, snapshot_id: str) -> dict[str, Any]:
    from ..models import CustomerRecord
    from sqlalchemy import inspect as sa_inspect, func

    mapper = sa_inspect(CustomerRecord)
    columns = list(mapper.columns)
    total_row = session.execute(
        select(func.count()).select_from(CustomerRecord).where(
            CustomerRecord.dataset_snapshot_id == snapshot_id
        )
    ).scalar() or 0

    profile: dict[str, Any] = {}
    for col in columns:
        col_name = col.key
        attr = getattr(CustomerRecord, col_name)
        py_type = str(col.type)

        # Null count
        null_count = session.execute(
            select(func.count()).select_from(CustomerRecord).where(
                CustomerRecord.dataset_snapshot_id == snapshot_id,
                attr.is_(None),
            )
        ).scalar() or 0

        # Cardinality + top values + numeric stats — only on a sane subset
        is_numeric = "Numeric" in py_type or "Integer" in py_type or "Float" in py_type
        is_text = "String" in py_type or "Text" in py_type
        is_date = "DateTime" in py_type or "Date" in py_type
        is_bool = "Boolean" in py_type

        col_profile: dict[str, Any] = {
            "dtype": py_type,
            "rows": int(total_row),
            "nulls": int(null_count),
            "null_pct": round((null_count / total_row * 100) if total_row else 0, 2),
            "meaning": _meaning_for(col_name),
        }

        if is_numeric:
            stats = session.execute(
                select(
                    func.min(attr).label("min"),
                    func.max(attr).label("max"),
                    func.avg(attr).label("avg"),
                ).where(CustomerRecord.dataset_snapshot_id == snapshot_id)
            ).one()
            col_profile.update({
                "min": _serialize_value(stats.min),
                "max": _serialize_value(stats.max),
                "avg": _serialize_value(stats.avg),
            })
        elif is_date:
            stats = session.execute(
                select(
                    func.min(attr).label("min"),
                    func.max(attr).label("max"),
                ).where(CustomerRecord.dataset_snapshot_id == snapshot_id)
            ).one()
            col_profile.update({
                "min": _serialize_value(stats.min),
                "max": _serialize_value(stats.max),
            })
        elif is_text:
            distinct = session.execute(
                select(func.count(func.distinct(attr))).where(
                    CustomerRecord.dataset_snapshot_id == snapshot_id
                )
            ).scalar() or 0
            col_profile["distinct"] = int(distinct)
            if distinct <= 100:
                # Top-15 values
                rows = session.execute(
                    select(attr, func.count().label("c"))
                    .where(CustomerRecord.dataset_snapshot_id == snapshot_id)
                    .group_by(attr)
                    .order_by(func.count().desc())
                    .limit(15)
                ).all()
                col_profile["top_values"] = [
                    {"value": _serialize_value(r[0]), "count": int(r[1])}
                    for r in rows
                ]
        elif is_bool:
            true_count = session.execute(
                select(func.count()).where(
                    CustomerRecord.dataset_snapshot_id == snapshot_id,
                    attr.is_(True),
                )
            ).scalar() or 0
            col_profile["true_count"] = int(true_count)
            col_profile["false_count"] = int(total_row - true_count - null_count)

        profile[col_name] = col_profile

    return {
        "table": "customer_records",
        "row_count": int(total_row),
        "join_key": "mobile",
        "columns": profile,
    }


# ----------------------------------------------------------------------
# Parquet-side profile (sales_df)
# ----------------------------------------------------------------------
def _profile_sales_parquet() -> dict[str, Any] | None:
    parquet = CACHE_DIR / "sales.parquet"
    if not parquet.is_file():
        return None
    try:
        import pandas as pd
    except ImportError:
        return None

    df = pd.read_parquet(parquet)
    profile: dict[str, Any] = {}
    for col in df.columns:
        series = df[col]
        dtype = str(series.dtype)
        nulls = int(series.isna().sum())
        rows = int(len(series))
        col_profile: dict[str, Any] = {
            "dtype": dtype,
            "rows": rows,
            "nulls": nulls,
            "null_pct": round((nulls / rows * 100) if rows else 0, 2),
            "meaning": _meaning_for(col),
        }
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            try:
                col_profile.update({
                    "min": _serialize_value(series.min()),
                    "max": _serialize_value(series.max()),
                    "avg": _serialize_value(series.mean()),
                })
            except Exception:  # noqa: BLE001
                pass
        elif pd.api.types.is_datetime64_any_dtype(series):
            try:
                col_profile.update({
                    "min": _serialize_value(series.min()),
                    "max": _serialize_value(series.max()),
                })
            except Exception:  # noqa: BLE001
                pass
        elif pd.api.types.is_bool_dtype(series):
            col_profile["true_count"] = int(series.sum())
            col_profile["false_count"] = int((~series.fillna(False)).sum())
        else:
            distinct = int(series.nunique(dropna=True))
            col_profile["distinct"] = distinct
            if distinct <= 200:
                top = series.dropna().astype(str).value_counts().head(15)
                col_profile["top_values"] = [
                    {"value": str(idx), "count": int(cnt)}
                    for idx, cnt in top.items()
                ]
        profile[col] = col_profile

    return {
        "table": "sales_df",
        "source": "backend/.cache/sales.parquet",
        "row_count": int(len(df)),
        "join_key": "mobile",
        "columns": profile,
    }


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------
def _cache_path(snapshot_id: str) -> Path:
    safe = "".join(c for c in snapshot_id if c.isalnum() or c in "-_")
    return CACHE_DIR / f"datadict-{safe}.json"


def build(session: Session, force: bool = False) -> dict[str, Any] | None:
    snapshot = session.execute(
        select(DatasetSnapshot).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalars().first()
    if not snapshot:
        return None
    cache = _cache_path(snapshot.id)
    if cache.is_file() and not force:
        try:
            with cache.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            if payload.get("snapshot_id") == snapshot.id:
                return payload
        except Exception as exc:  # noqa: BLE001
            logger.warning("data_dictionary: cache read failed: %s", exc)

    payload: dict[str, Any] = {
        "snapshot_id": snapshot.id,
        "generated_at": datetime.utcnow().isoformat(),
        "tables": {},
    }
    try:
        payload["tables"]["customer_records"] = _profile_customer_records(session, snapshot.id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_dictionary: customer profile failed: %s", exc)
    try:
        sales_profile = _profile_sales_parquet()
        if sales_profile:
            payload["tables"]["sales_df"] = sales_profile
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_dictionary: sales profile failed: %s", exc)

    try:
        with cache.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, default=str)
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_dictionary: cache write failed: %s", exc)
    return payload


def render_for_prompt(payload: dict[str, Any]) -> str:
    """Compact text rendering of the dictionary for injection into the LLM prompt.
    Aims for <8KB so context stays usable."""
    if not payload or not payload.get("tables"):
        return ""
    out: list[str] = ["DATA DICTIONARY (auto-generated from the live snapshot):"]
    for table_name, table in payload["tables"].items():
        out.append("")
        out.append(f"=== {table_name} ({table.get('row_count', 0):,} rows; join key: {table.get('join_key','—')}) ===")
        for col_name, col in table.get("columns", {}).items():
            line = f"- {col_name}: {col.get('dtype','?')}"
            extras: list[str] = []
            if col.get("null_pct", 0) > 0:
                extras.append(f"{col['null_pct']}% null")
            if "distinct" in col:
                extras.append(f"{col['distinct']:,} distinct")
            if "min" in col and "max" in col:
                extras.append(f"range [{col['min']} … {col['max']}]")
            if "avg" in col and col.get("avg") is not None:
                try:
                    extras.append(f"avg {float(col['avg']):.2f}")
                except (TypeError, ValueError):
                    pass
            if extras:
                line += "  (" + "; ".join(extras) + ")"
            if col.get("meaning"):
                line += f" — {col['meaning']}"
            if col.get("top_values"):
                top = col["top_values"][:8]
                vals = ", ".join(f"'{tv['value']}'×{tv['count']}" for tv in top)
                line += f"\n    top: {vals}"
            out.append(line)
    return "\n".join(out)


def warmup(session: Session) -> int:
    payload = build(session)
    if not payload:
        return 0
    return sum(len(t.get("columns", {})) for t in payload.get("tables", {}).values())

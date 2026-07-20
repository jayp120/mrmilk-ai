"""
Sales analytics over the on-disk sales.parquet — powers the Daily Product
Sales panel.

Reads the same Parquet the import pipeline writes (backend/.cache/sales.parquet),
caches the DataFrame in-process keyed by the file's mtime (so a fresh import is
picked up automatically without a restart), and exposes two helpers:

  * list_products()        — distinct product + weight combos for the picker,
                             with per-combo row / qty / revenue totals.
  * daily_product_sales()  — a CONTINUOUS per-day series (every day in the
                             window present, zero-filled when no sales) for a
                             chosen product / weight / date range.

Accuracy notes:
  * "units"   = sum(qty_net)      — net delivered units (qty_delivered - returns)
  * "revenue" = sum(sub_total)    — line-item revenue (INR)
  * Delivered-only by default (status='delivered') so the series reflects
    actually fulfilled sales, not cancelled/pending lines. Pass status='all'
    to include every row.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
PARQUET_PATH = CACHE_DIR / "sales.parquet"

# Narrow projection — only the columns this module needs.
_USE_COLUMNS = [
    "date", "product_name", "product_weight",
    "qty_net", "qty_delivered", "sub_total",
    "delivery_status", "mobile", "hub",
]
_NUMERIC_COLUMNS = ("qty_net", "qty_delivered", "sub_total")
_TEXT_COLUMNS = ("product_name", "product_weight", "delivery_status", "mobile", "hub")

# Empty hub label shown to the user when the source row has no hub.
_NO_HUB = "(No hub)"

# ----------------------------------------------------------------------
# Non-product line items.
#
# MilkMaster records some OPERATIONAL events as sales rows. "Cash Pick Up
# request" is a cash-collection visit, not a sale: 3,034 rows carrying
# sub_total = Rs 0 but a qty_net that sums to 9,922,179 — which is 94% of
# every "unit" in the dataset (the field appears to hold a rupee amount, not
# a quantity).
#
# Left in, these rows:
#   * make any litres/units total meaningless,
#   * appear in the product picker as a selectable "product",
#   * inflate delivery counts with visits where nothing was delivered.
#
# Revenue is unaffected either way (they are Rs 0), so excluding them changes
# no revenue figure anywhere — it only removes the corruption.
#
# Excluded at load time so NOTHING downstream can accidentally include them.
# ----------------------------------------------------------------------
NON_PRODUCT_LINE_ITEMS = frozenset({
    "cash pick up request",
})


def _drop_non_product_rows(df):
    """Remove operational (non-sale) line items. Returns (df, n_dropped)."""
    if "product_name" not in df.columns:
        return df, 0
    mask = df["product_name"].astype(str).str.strip().str.lower().isin(NON_PRODUCT_LINE_ITEMS)
    n = int(mask.sum())
    return (df[~mask], n) if n else (df, 0)

_lock = threading.Lock()
_cache: dict[str, Any] = {"mtime": None, "df": None}


def _load_df():
    """Return the sales DataFrame, (re)loading from Parquet when the file
    changes. Cached in-process so repeated calls are free."""
    import pandas as pd

    if not PARQUET_PATH.is_file():
        return None
    mtime = PARQUET_PATH.stat().st_mtime
    with _lock:
        if _cache["df"] is not None and _cache["mtime"] == mtime:
            return _cache["df"]
        try:
            df = pd.read_parquet(PARQUET_PATH)
        except Exception:  # noqa: BLE001
            logger.exception("sales_analytics: failed to read parquet")
            return None

        cols = [c for c in _USE_COLUMNS if c in df.columns]
        df = df[cols].copy()
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        for c in _NUMERIC_COLUMNS:
            if c in df.columns:
                df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
        for c in _TEXT_COLUMNS:
            if c in df.columns:
                df[c] = df[c].fillna("").astype(str)
        if "hub" in df.columns:
            df["hub"] = df["hub"].str.strip().replace("", _NO_HUB)

        df, dropped = _drop_non_product_rows(df)

        _cache["df"] = df
        _cache["mtime"] = mtime
        logger.info(
            "sales_analytics: loaded %d sales rows (%d non-product line items excluded)",
            len(df), dropped,
        )
        return df


def dataset_overview() -> dict[str, Any] | None:
    df = _load_df()
    if df is None or df.empty:
        return None
    d = df["date"].dropna()
    return {
        "row_count": int(len(df)),
        "date_min": d.min().strftime("%Y-%m-%d") if not d.empty else None,
        "date_max": d.max().strftime("%Y-%m-%d") if not d.empty else None,
        "product_count": int(df["product_name"].nunique()) if "product_name" in df.columns else None,
        "customer_count": int(df["mobile"].nunique()) if "mobile" in df.columns else None,
    }


def list_products(min_rows: int = 1) -> dict[str, Any] | None:
    """Distinct (product_name, product_weight) combos for the picker, grouped
    by product, sorted by row volume."""
    df = _load_df()
    if df is None or df.empty:
        return None

    grp = (
        df.groupby(["product_name", "product_weight"], dropna=False)
          .agg(rows=("date", "size"), qty=("qty_net", "sum"), revenue=("sub_total", "sum"))
          .reset_index()
    )

    products: dict[str, dict] = {}
    for _, r in grp.iterrows():
        name = (r["product_name"] or "").strip() or "(unknown)"
        weight = (r["product_weight"] or "").strip()
        rows = int(r["rows"])
        if rows < min_rows:
            continue
        entry = products.setdefault(name, {
            "product_name": name, "weights": [],
            "total_rows": 0, "total_qty": 0.0, "total_revenue": 0.0,
        })
        entry["weights"].append({
            "weight": weight,
            "rows": rows,
            "qty": round(float(r["qty"]), 2),
            "revenue": round(float(r["revenue"]), 2),
        })
        entry["total_rows"] += rows
        entry["total_qty"] += float(r["qty"])
        entry["total_revenue"] += float(r["revenue"])

    out = sorted(products.values(), key=lambda p: p["total_rows"], reverse=True)
    for p in out:
        p["weights"].sort(key=lambda w: w["rows"], reverse=True)
        p["total_qty"] = round(p["total_qty"], 2)
        p["total_revenue"] = round(p["total_revenue"], 2)

    return {"products": out, "dataset": dataset_overview()}


def _empty_summary(days_in_range: int) -> dict[str, Any]:
    return {
        "total_units": 0.0, "total_revenue": 0.0, "total_lines": 0,
        "total_delivered": 0.0, "days_in_range": days_in_range, "active_days": 0,
        "avg_units_per_day": 0.0, "avg_units_per_active_day": 0.0,
        "peak_day": None, "peak_units": 0.0,
    }


def daily_product_sales(
    product: str,
    weight: str | None = None,
    start: str | None = None,
    end: str | None = None,
    status: str = "delivered",
    hub: str | None = None,
) -> dict[str, Any] | None:
    """Continuous per-day sales series for one product (optionally one weight
    and/or one hub) across a date window. Every day in [start, end] is present;
    days with no sales are zero-filled so the caller can chart/export a complete
    calendar."""
    import pandas as pd

    df = _load_df()
    if df is None or df.empty:
        return None

    mask = df["product_name"] == product
    if weight:
        mask &= df["product_weight"] == weight
    if hub and "hub" in df.columns:
        mask &= df["hub"] == hub
    if status and status.lower() != "all":
        mask &= df["delivery_status"].str.lower() == status.lower()

    sub = df[mask].dropna(subset=["date"]).copy()
    sub["day"] = sub["date"].dt.normalize()

    # Resolve the window: explicit args win; otherwise span the matched rows.
    start_d = pd.to_datetime(start).normalize() if start else (sub["day"].min() if not sub.empty else None)
    end_d = pd.to_datetime(end).normalize() if end else (sub["day"].max() if not sub.empty else None)

    if start_d is None or end_d is None or start_d > end_d:
        return {
            "product": product, "weight": weight, "hub": hub, "status": status,
            "start": start, "end": end, "days": [],
            "summary": _empty_summary(0), "dataset": dataset_overview(),
        }

    sub = sub[(sub["day"] >= start_d) & (sub["day"] <= end_d)]

    full_idx = pd.date_range(start_d, end_d, freq="D")
    if sub.empty:
        agg = pd.DataFrame(
            0, index=full_idx,
            columns=["units", "delivered", "revenue", "lines", "customers"],
        )
    else:
        agg = sub.groupby("day").agg(
            units=("qty_net", "sum"),
            delivered=("qty_delivered", "sum"),
            revenue=("sub_total", "sum"),
            lines=("qty_net", "size"),
            customers=("mobile", "nunique"),
        ).reindex(full_idx, fill_value=0)

    days = [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "units": round(float(row["units"]), 2),
            "delivered": round(float(row["delivered"]), 2),
            "revenue": round(float(row["revenue"]), 2),
            "lines": int(row["lines"]),
            "customers": int(row["customers"]),
        }
        for idx, row in agg.iterrows()
    ]

    total_units = round(sum(d["units"] for d in days), 2)
    total_revenue = round(sum(d["revenue"] for d in days), 2)
    total_delivered = round(sum(d["delivered"] for d in days), 2)
    total_lines = sum(d["lines"] for d in days)
    active_days = sum(1 for d in days if d["lines"] > 0)
    n_days = len(days)
    peak = max(days, key=lambda d: d["units"], default=None)

    summary = {
        "total_units": total_units,
        "total_revenue": total_revenue,
        "total_delivered": total_delivered,
        "total_lines": total_lines,
        "days_in_range": n_days,
        "active_days": active_days,
        "avg_units_per_day": round(total_units / n_days, 2) if n_days else 0.0,
        "avg_units_per_active_day": round(total_units / active_days, 2) if active_days else 0.0,
        "peak_day": peak["date"] if peak and peak["units"] > 0 else None,
        "peak_units": peak["units"] if peak else 0.0,
    }

    return {
        "product": product,
        "weight": weight,
        "hub": hub,
        "status": status,
        "start": start_d.strftime("%Y-%m-%d"),
        "end": end_d.strftime("%Y-%m-%d"),
        "days": days,
        "summary": summary,
        "dataset": dataset_overview(),
    }


def hub_breakdown(
    product: str,
    weight: str | None = None,
    start: str | None = None,
    end: str | None = None,
    status: str = "delivered",
) -> dict[str, Any] | None:
    """Per-hub split for one product over a date window, plus a per-hub daily
    series aligned to a shared date axis (for a stacked chart). Always covers
    ALL hubs for the selection so it can drive a hub filter + comparison."""
    import pandas as pd

    df = _load_df()
    if df is None or df.empty or "hub" not in df.columns:
        return None

    mask = df["product_name"] == product
    if weight:
        mask &= df["product_weight"] == weight
    if status and status.lower() != "all":
        mask &= df["delivery_status"].str.lower() == status.lower()

    sub = df[mask].dropna(subset=["date"]).copy()
    sub["day"] = sub["date"].dt.normalize()

    start_d = pd.to_datetime(start).normalize() if start else (sub["day"].min() if not sub.empty else None)
    end_d = pd.to_datetime(end).normalize() if end else (sub["day"].max() if not sub.empty else None)
    if start_d is None or end_d is None or start_d > end_d:
        return {"product": product, "weight": weight, "status": status, "start": start, "end": end,
                "hubs": [], "dates": [], "units_by_hub": {}, "total_units": 0.0, "total_revenue": 0.0}

    sub = sub[(sub["day"] >= start_d) & (sub["day"] <= end_d)]
    full_idx = pd.date_range(start_d, end_d, freq="D")
    dates = [d.strftime("%Y-%m-%d") for d in full_idx]

    total_units = float(sub["qty_net"].sum()) if not sub.empty else 0.0
    total_revenue = float(sub["sub_total"].sum()) if not sub.empty else 0.0

    hubs: list[dict[str, Any]] = []
    units_by_hub: dict[str, list[float]] = {}

    if not sub.empty:
        agg = sub.groupby("hub").agg(
            units=("qty_net", "sum"),
            delivered=("qty_delivered", "sum"),
            revenue=("sub_total", "sum"),
            lines=("qty_net", "size"),
            customers=("mobile", "nunique"),
            selling_days=("day", "nunique"),
        ).sort_values("units", ascending=False)

        for hub_name, row in agg.iterrows():
            units = float(row["units"])
            hubs.append({
                "hub": hub_name,
                "units": round(units, 2),
                "delivered": round(float(row["delivered"]), 2),
                "revenue": round(float(row["revenue"]), 2),
                "lines": int(row["lines"]),
                "customers": int(row["customers"]),
                "selling_days": int(row["selling_days"]),
                "share_units": round(units / total_units * 100, 2) if total_units else 0.0,
                "share_revenue": round(float(row["revenue"]) / total_revenue * 100, 2) if total_revenue else 0.0,
                "avg_units_per_day": round(units / len(full_idx), 2) if len(full_idx) else 0.0,
            })

            hub_daily = (
                sub[sub["hub"] == hub_name].groupby("day")["qty_net"].sum()
                .reindex(full_idx, fill_value=0)
            )
            units_by_hub[hub_name] = [round(float(v), 2) for v in hub_daily.values]

    return {
        "product": product,
        "weight": weight,
        "status": status,
        "start": start_d.strftime("%Y-%m-%d"),
        "end": end_d.strftime("%Y-%m-%d"),
        "hubs": hubs,
        "dates": dates,
        "units_by_hub": units_by_hub,
        "total_units": round(total_units, 2),
        "total_revenue": round(total_revenue, 2),
    }


def daily_by_hub(
    product: str,
    weight: str | None = None,
    start: str | None = None,
    end: str | None = None,
    status: str = "delivered",
) -> dict[str, Any] | None:
    """Tidy long-format daily sales split by hub: one record per (date, hub)
    that had activity, with full metrics. Lets the export be filtered by hub
    inside Excel. Sorted by date then hub."""
    import pandas as pd

    df = _load_df()
    if df is None or df.empty or "hub" not in df.columns:
        return None

    mask = df["product_name"] == product
    if weight:
        mask &= df["product_weight"] == weight
    if status and status.lower() != "all":
        mask &= df["delivery_status"].str.lower() == status.lower()

    sub = df[mask].dropna(subset=["date"]).copy()
    sub["day"] = sub["date"].dt.normalize()

    start_d = pd.to_datetime(start).normalize() if start else (sub["day"].min() if not sub.empty else None)
    end_d = pd.to_datetime(end).normalize() if end else (sub["day"].max() if not sub.empty else None)
    if start_d is None or end_d is None or start_d > end_d:
        return {"product": product, "weight": weight, "status": status, "start": start, "end": end, "records": []}

    sub = sub[(sub["day"] >= start_d) & (sub["day"] <= end_d)]
    records: list[dict[str, Any]] = []
    if not sub.empty:
        agg = sub.groupby(["day", "hub"]).agg(
            units=("qty_net", "sum"),
            delivered=("qty_delivered", "sum"),
            revenue=("sub_total", "sum"),
            lines=("qty_net", "size"),
            customers=("mobile", "nunique"),
        ).reset_index().sort_values(["day", "hub"])
        for _, r in agg.iterrows():
            records.append({
                "date": r["day"].strftime("%Y-%m-%d"),
                "hub": r["hub"],
                "units": round(float(r["units"]), 2),
                "delivered": round(float(r["delivered"]), 2),
                "revenue": round(float(r["revenue"]), 2),
                "lines": int(r["lines"]),
                "customers": int(r["customers"]),
            })

    return {
        "product": product,
        "weight": weight,
        "status": status,
        "start": start_d.strftime("%Y-%m-%d"),
        "end": end_d.strftime("%Y-%m-%d"),
        "records": records,
    }

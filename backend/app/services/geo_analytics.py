"""
Geographic sales analytics over the on-disk sales.parquet — powers the
Delivery Heat Map panel.

Turns the `delivery_location` column ("lat,lng" strings captured by the
MilkMaster delivery app) into aggregated map points carrying both revenue
and delivery count, so the UI can weight the heat layer by either metric.

Data-quality handling (all of this is measured and reported back to the UI
rather than silently applied):

  * COVERAGE — only ~64% of delivery rows carry coordinates. We lift that to
    ~68% by back-filling a row from any OTHER row of the same customer that
    does have coords (a customer's delivery address doesn't move between
    orders). The remaining gap is structural: ~37% of customers have never
    had a location captured at all. `coverage` in the response states exactly
    what share of rows / revenue the map represents, so nobody reads a
    partial map as the full book.

  * OUT-OF-REGION OUTLIERS — a minority of rows carry coordinates far outside
    Pune/PCMC, overwhelmingly a single cluster near 28.62,77.23 (central
    Delhi) shared by dozens of customers whose recorded `area` is a real Pune
    locality. That is a bad GPS capture / app default, not a real delivery
    location, and left in it becomes the single largest "revenue location" on
    the map and dominates the heat scale. We drop anything outside the
    Pune/PCMC bounding box and report how much was dropped.

Metrics per point:
    revenue    = sum(sub_total)   — line-item revenue (INR)
    deliveries = row count        — delivered line items at that location
    units      = sum(qty_net)     — net delivered units
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
PARQUET_PATH = CACHE_DIR / "sales.parquet"

_USE_COLUMNS = [
    "date", "delivery_location", "customer_id", "mobile", "name",
    "sub_total", "qty_net", "delivery_status", "hub", "area", "product_name",
]

# Pune / PCMC bounding box. Generous enough to cover the whole metro
# (Chinchwad in the NW through Hadapsar/Kharadi in the E) while still
# excluding the Delhi cluster and other stray captures.
PUNE_BBOX = {"lat_min": 18.2, "lat_max": 18.9, "lng_min": 73.5, "lng_max": 74.2}

# Known fallback/default GPS points found INSIDE the valid Pune bbox, so the
# region filter alone cannot catch them. (18.5211, 73.8502) surfaced 65
# customers sharing one exact coordinate whose RECORDED areas span 39
# different, unrelated parts of Pune (Sinhgad Road, Wakad, Kharadi, Moshi,
# Hadapsar, ...) — a real building never has that area diversity. Detected by
# flagging any point where 5+ customers share a coordinate but recorded areas
# among them are also 5+ distinct — a real dense building's customers agree on
# roughly one area; this artifact's customers don't agree on anything.
# Add new entries here if the same detection surfaces more in future data.
KNOWN_FALLBACK_POINTS = frozenset({(18.5211, 73.8502)})

# Default analysis window.
DEFAULT_WINDOW_DAYS = 90

_NO_HUB = "(No hub)"

LOCATIONS_PATH = CACHE_DIR / "customer_locations.json"

_lock = threading.Lock()
_cache: dict[str, Any] = {"mtime": None, "df": None}
_loc_cache: dict[str, Any] = {"mtime": None, "data": None}


def _load_customer_locations() -> dict[str, dict[str, Any]]:
    """Resolved per-customer coordinates (GPS + geocoded) written by
    services/customer_locations.py. Cached on mtime so a fresh backfill is
    picked up without a restart. Returns {} when the backfill hasn't run —
    the map then simply falls back to GPS-only coverage."""
    import json

    if not LOCATIONS_PATH.is_file():
        return {}
    mtime = LOCATIONS_PATH.stat().st_mtime
    with _lock:
        if _loc_cache["data"] is not None and _loc_cache["mtime"] == mtime:
            return _loc_cache["data"]
        try:
            with LOCATIONS_PATH.open("r", encoding="utf-8") as fh:
                raw = json.load(fh)
        except Exception:  # noqa: BLE001
            logger.exception("geo_analytics: failed to read customer_locations")
            return {}
        data = {
            k: v for k, v in raw.items()
            if k != "__meta__" and isinstance(v, dict) and "lat" in v and "lng" in v
        }
        _loc_cache["data"] = data
        _loc_cache["mtime"] = mtime
        return data


def _load_df():
    """Return the geo-relevant sales DataFrame, (re)loading from Parquet when
    the file changes. Cached in-process keyed on mtime, so a fresh import is
    picked up without a restart."""
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
            logger.exception("geo_analytics: failed to read parquet")
            return None

        cols = [c for c in _USE_COLUMNS if c in df.columns]
        df = df[cols].copy()
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        for c in ("sub_total", "qty_net"):
            if c in df.columns:
                df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
        for c in ("delivery_location", "delivery_status", "hub", "area", "name"):
            if c in df.columns:
                df[c] = df[c].fillna("").astype(str)
        if "customer_id" in df.columns:
            df["customer_id"] = (
                df["customer_id"].fillna("").astype(str).str.strip().str.removesuffix(".0")
            )
        if "hub" in df.columns:
            df["hub"] = df["hub"].str.strip().replace("", _NO_HUB)

        # Drop operational non-sale rows (cash-collection visits). Without this
        # they count as "deliveries" on the map — visits where nothing was
        # delivered — and their qty_net dominates any units figure. Single
        # definition lives in sales_analytics so the two modules can't drift.
        from .sales_analytics import _drop_non_product_rows
        df, dropped = _drop_non_product_rows(df)
        if dropped:
            logger.info("geo_analytics: excluded %d non-product line items", dropped)

        _cache["df"] = df
        _cache["mtime"] = mtime
        return df


def _split_coords(series):
    """Parse a 'lat,lng' string Series into two numeric Series. Anything that
    doesn't parse cleanly becomes NaN."""
    import pandas as pd

    s = series.astype(str).str.strip()
    valid = s.str.contains(",", na=False) & ~s.isin(("", "None", "nan", "<NA>"))
    parts = s.where(valid).str.split(",", n=1, expand=True)
    if parts.shape[1] < 2:
        empty = pd.Series([pd.NA] * len(s), index=s.index, dtype="float64")
        return empty, empty
    lat = pd.to_numeric(parts[0], errors="coerce")
    lng = pd.to_numeric(parts[1], errors="coerce")
    return lat, lng


def dataset_meta() -> dict[str, Any] | None:
    """Date bounds of the underlying dataset, for the UI's range picker."""
    df = _load_df()
    if df is None or df.empty:
        return None
    return {
        "row_count": int(len(df)),
        "date_min": df["date"].min().strftime("%Y-%m-%d"),
        "date_max": df["date"].max().strftime("%Y-%m-%d"),
    }


def heatmap_points(
    start: str | None = None,
    end: str | None = None,
    hub: str | None = None,
    status: str = "delivered",
    window_days: int = DEFAULT_WINDOW_DAYS,
    product: str | None = None,
) -> dict[str, Any] | None:
    """Aggregate delivery coordinates into map points for the heat layer.

    Returns points as [lat, lng, revenue, deliveries, units] plus coverage and
    exclusion diagnostics. Defaults to the trailing `window_days` of the
    dataset (not of wall-clock today) so the map always has data even if
    imports lag.
    """
    import pandas as pd

    df = _load_df()
    if df is None or df.empty:
        return None
    if "delivery_location" not in df.columns:
        return None

    date_max_all = df["date"].max()
    date_min_all = df["date"].min()

    # ---- resolve the window -------------------------------------------
    end_ts = pd.to_datetime(end) if end else date_max_all
    if start:
        start_ts = pd.to_datetime(start)
    else:
        start_ts = end_ts - pd.Timedelta(days=window_days - 1)
    start_ts = max(start_ts, date_min_all)
    end_ts = min(end_ts, date_max_all)

    win = df[(df["date"] >= start_ts) & (df["date"] <= end_ts)].copy()

    # Product list is built from the WINDOW BEFORE the product filter is
    # applied — otherwise selecting a product would collapse the dropdown to
    # just that one and strand the user with no way back.
    products_in_window: list[dict[str, Any]] = []
    if "product_name" in win.columns:
        pw = win[win["delivery_status"].str.lower() == status.lower()] if status != "all" else win
        pg = (
            pw.groupby("product_name")
            .agg(revenue=("sub_total", "sum"), lines=("sub_total", "size"))
            .sort_values("revenue", ascending=False)
        )
        total_rev = float(pg["revenue"].sum()) or 1.0
        products_in_window = [
            {
                "product_name": str(name),
                "revenue": round(float(r.revenue), 2),
                "lines": int(r.lines),
                "share_pct": round(100 * float(r.revenue) / total_rev, 2),
            }
            for name, r in pg.iterrows()
            if str(name).strip()
        ]

    if hub:
        win = win[win["hub"] == hub]
    if product:
        win = win[win["product_name"] == product]
    if status != "all":
        win = win[win["delivery_status"].str.lower() == status.lower()]

    rows_in_window = int(len(win))
    if rows_in_window == 0:
        return {
            "start": start_ts.strftime("%Y-%m-%d"),
            "end": end_ts.strftime("%Y-%m-%d"),
            "hub": hub or "",
            "product": product or "",
            "status": status,
            "points": [],
            # Still returned so the picker stays usable after a selection that
            # happens to have no mapped deliveries — the user can pick again.
            "products": products_in_window,
            "hubs": sorted(df["hub"].dropna().unique().tolist()) if "hub" in df.columns else [],
            "totals": {"revenue": 0.0, "deliveries": 0, "units": 0.0, "locations": 0, "customers": 0},
            "coverage": {
                "rows_in_window": 0, "rows_mapped": 0, "row_pct": 0.0,
                "revenue_in_window": 0.0, "revenue_mapped": 0.0, "revenue_pct": 0.0,
                "customers_in_window": 0, "customers_mapped": 0, "customer_pct": 0.0,
                "rows_backfilled": 0,
            },
            "excluded": {"out_of_region_rows": 0, "out_of_region_revenue": 0.0, "clusters": []},
            "dataset": dataset_meta(),
        }

    revenue_in_window = float(win["sub_total"].sum())
    customers_in_window = int(win["customer_id"].nunique()) if "customer_id" in win.columns else 0

    # ---- resolve coordinates, with per-customer back-fill --------------
    lat_raw, lng_raw = _split_coords(win["delivery_location"])
    win["lat"] = lat_raw
    win["lng"] = lng_raw
    has_own = win["lat"].notna() & win["lng"].notna()
    rows_with_own_coords = int(has_own.sum())

    win["coord_source"] = pd.NA
    win.loc[has_own, "coord_source"] = "gps"

    if "customer_id" in win.columns:
        # First non-null coordinate per customer, used to fill that customer's
        # other rows. A customer's delivery address is stable across orders.
        known = win[has_own]
        cust_lat = known.groupby("customer_id")["lat"].first()
        cust_lng = known.groupby("customer_id")["lng"].first()
        filled_lat = win["lat"].fillna(win["customer_id"].map(cust_lat))
        filled_lng = win["lng"].fillna(win["customer_id"].map(cust_lng))
        newly = filled_lat.notna() & win["lat"].isna()
        win["lat"], win["lng"] = filled_lat, filled_lng
        win.loc[newly, "coord_source"] = "gps"

    rows_from_gps = int(win["lat"].notna().sum())

    # Remaining rows: fall back to the geocoded customer locations produced by
    # services/customer_locations.py. These are Google's opinion of where the
    # address is, not a real capture — tagged so the map can distinguish them
    # and so a geocode never masquerades as GPS precision.
    geocoded_lookup = _load_customer_locations()
    low_conf_ids: set[str] = set()
    if geocoded_lookup and "customer_id" in win.columns:
        g_lat = {k: v["lat"] for k, v in geocoded_lookup.items() if v.get("source") == "geocoded"}
        g_lng = {k: v["lng"] for k, v in geocoded_lookup.items() if v.get("source") == "geocoded"}
        low_conf_ids = {
            k for k, v in geocoded_lookup.items()
            if v.get("source") == "geocoded" and v.get("low_confidence")
        }
        filled_lat = win["lat"].fillna(win["customer_id"].map(g_lat))
        filled_lng = win["lng"].fillna(win["customer_id"].map(g_lng))
        newly = filled_lat.notna() & win["lat"].isna()
        win["lat"], win["lng"] = filled_lat, filled_lng
        win.loc[newly, "coord_source"] = "geocoded"

    has_coords = win["lat"].notna() & win["lng"].notna()
    rows_backfilled = rows_from_gps - rows_with_own_coords
    rows_from_geocoding = int(has_coords.sum()) - rows_from_gps
    geo = win[has_coords].copy()

    # Drop known fallback points BEFORE aggregation — otherwise 65 unrelated
    # customers collapse onto one coordinate and render as a single dense
    # "hotspot" that doesn't correspond to any real place.
    if KNOWN_FALLBACK_POINTS:
        fallback_mask = geo.apply(
            lambda r: (round(r["lat"], 4), round(r["lng"], 4)) in KNOWN_FALLBACK_POINTS, axis=1
        )
        geo = geo[~fallback_mask]
    if low_conf_ids and "customer_id" in geo.columns:
        geo["low_confidence"] = geo["customer_id"].isin(low_conf_ids)
    else:
        geo["low_confidence"] = False

    # ---- drop out-of-region captures (the Delhi cluster et al) ---------
    in_box = (
        geo["lat"].between(PUNE_BBOX["lat_min"], PUNE_BBOX["lat_max"])
        & geo["lng"].between(PUNE_BBOX["lng_min"], PUNE_BBOX["lng_max"])
    )
    outliers = geo[~in_box]
    out_rows = int(len(outliers))
    out_revenue = float(outliers["sub_total"].sum())

    # Summarise the biggest offending clusters so ops can go fix the source
    # records rather than just having them silently vanish.
    clusters: list[dict[str, Any]] = []
    if out_rows:
        o = outliers.copy()
        o["pt"] = o["lat"].round(2).astype(str) + "," + o["lng"].round(2).astype(str)
        grouped = (
            o.groupby("pt")
            .agg(
                rows=("sub_total", "size"),
                revenue=("sub_total", "sum"),
                customers=("customer_id", "nunique"),
            )
            .sort_values("revenue", ascending=False)
            .head(5)
        )
        for pt, row in grouped.iterrows():
            lat_s, lng_s = pt.split(",")
            top_areas = (
                o[o["pt"] == pt]["area"].value_counts().head(3).index.tolist()
                if "area" in o.columns else []
            )
            clusters.append({
                "lat": float(lat_s),
                "lng": float(lng_s),
                "rows": int(row["rows"]),
                "revenue": round(float(row["revenue"]), 2),
                "customers": int(row["customers"]),
                "recorded_areas": top_areas,
            })

    geo = geo[in_box]

    # ---- aggregate to map points --------------------------------------
    if geo.empty:
        points: list[list[float]] = []
        totals = {"revenue": 0.0, "deliveries": 0, "units": 0.0, "locations": 0, "customers": 0}
    else:
        # Round to 5dp (~1m) so identical addresses collapse to one point
        # without merging genuinely distinct neighbours.
        geo["lat_r"] = geo["lat"].round(5)
        geo["lng_r"] = geo["lng"].round(5)
        agg = geo.groupby(["lat_r", "lng_r"]).agg(
            revenue=("sub_total", "sum"),
            deliveries=("sub_total", "size"),
            units=("qty_net", "sum"),
            customers=("customer_id", "nunique"),
            gps_rows=("coord_source", lambda s: int((s == "gps").sum())),
            low_conf=("low_confidence", "max"),
        ).reset_index()
        agg = agg.sort_values("revenue", ascending=False)

        points = [
            [
                float(r.lat_r), float(r.lng_r),
                round(float(r.revenue), 2), int(r.deliveries), round(float(r.units), 2),
                int(r.customers),
                # 1 = at least one real GPS capture here, 0 = geocoded only
                1 if r.gps_rows > 0 else 0,
                1 if bool(r.low_conf) else 0,
            ]
            for r in agg.itertuples(index=False)
        ]
        totals = {
            "revenue": round(float(geo["sub_total"].sum()), 2),
            "deliveries": int(len(geo)),
            "units": round(float(geo["qty_net"].sum()), 2),
            "locations": int(len(agg)),
            "customers": int(geo["customer_id"].nunique()) if "customer_id" in geo.columns else 0,
        }

    customers_mapped = totals["customers"]
    revenue_mapped = totals["revenue"]

    # ---- area rollup ---------------------------------------------------
    # Raw coordinates are unreadable to an operator; area names are what they
    # actually think in ("Baner", "Kothrud"). Same numbers, addressable labels.
    areas: list[dict[str, Any]] = []
    if not geo.empty and "area" in geo.columns:
        a = geo.copy()
        a["area"] = a["area"].str.strip().replace("", "(No area)")
        grouped = a.groupby("area").agg(
            revenue=("sub_total", "sum"),
            deliveries=("sub_total", "size"),
            customers=("customer_id", "nunique"),
            lat=("lat", "median"),
            lng=("lng", "median"),
        ).reset_index().sort_values("revenue", ascending=False)
        areas = [
            {
                "area": str(r.area),
                "revenue": round(float(r.revenue), 2),
                "deliveries": int(r.deliveries),
                "customers": int(r.customers),
                "lat": round(float(r.lat), 6),
                "lng": round(float(r.lng), 6),
            }
            for r in grouped.itertuples(index=False)
        ]

    return {
        "start": start_ts.strftime("%Y-%m-%d"),
        "end": end_ts.strftime("%Y-%m-%d"),
        "days": int((end_ts - start_ts).days) + 1,
        "hub": hub or "",
        "product": product or "",
        # Every product sold in this window, revenue-ranked — populates the
        # picker. Built before the product filter so the list never collapses.
        "products": products_in_window,
        "status": status,
        "points": points,
        "point_schema": [
            "lat", "lng", "revenue", "deliveries", "units", "customers",
            "has_gps", "low_confidence",
        ],
        "totals": totals,
        # Area-level rollup of the same mapped rows — for the ranked bar chart.
        "areas": areas,
        "coverage": {
            "rows_in_window": rows_in_window,
            "rows_mapped": totals["deliveries"],
            "row_pct": round(100.0 * totals["deliveries"] / rows_in_window, 1) if rows_in_window else 0.0,
            "revenue_in_window": round(revenue_in_window, 2),
            "revenue_mapped": revenue_mapped,
            "revenue_pct": round(100.0 * revenue_mapped / revenue_in_window, 1) if revenue_in_window else 0.0,
            "customers_in_window": customers_in_window,
            "customers_mapped": customers_mapped,
            "customer_pct": round(100.0 * customers_mapped / customers_in_window, 1) if customers_in_window else 0.0,
            "rows_backfilled": rows_backfilled,
            # Provenance split — how much of the map is real GPS vs geocoded.
            "rows_from_gps": rows_from_gps,
            "rows_from_geocoding": rows_from_geocoding,
            "geocoding_available": bool(geocoded_lookup),
        },
        "excluded": {
            "out_of_region_rows": out_rows,
            "out_of_region_revenue": round(out_revenue, 2),
            "bbox": PUNE_BBOX,
            "clusters": clusters,
        },
        "hubs": sorted(df["hub"].dropna().unique().tolist()) if "hub" in df.columns else [],
        "dataset": dataset_meta(),
    }

"""
Resolved customer coordinates — the merge layer between GPS captures and
geocoded addresses.

Produces backend/.cache/customer_locations.json:

    { "<customer_id>": {lat, lng, source, precision, formatted, address} }

`source` is the whole point of this file:
    "gps"      — a coordinate the delivery app actually captured on site.
                 Trustworthy to a few metres.
    "geocoded" — Google's opinion of where the address is. Usually within
                 10-50m, but `precision` (ROOFTOP / GEOMETRIC_CENTER /
                 APPROXIMATE) says how much to trust it.

Downstream (geo_analytics) keeps these distinguishable so the map never
presents a geocoded guess with the same authority as a real GPS fix.

Resolution order per customer: GPS from any of their sales rows wins; only
customers with no GPS at all get geocoded.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import geocoding

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
LOCATIONS_PATH = CACHE_DIR / "customer_locations.json"
PARQUET_PATH = CACHE_DIR / "sales.parquet"

_ADDRESS_FIELDS = ("street", "sub_area", "area")


def load_locations() -> dict[str, dict[str, Any]]:
    if not LOCATIONS_PATH.is_file():
        return {}
    try:
        with LOCATIONS_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("customer_locations: read failed: %s", exc)
        return {}


def _save_locations(data: dict[str, dict[str, Any]]) -> None:
    tmp = LOCATIONS_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=0)
    os.replace(tmp, LOCATIONS_PATH)


def _load_sales():
    import pandas as pd

    if not PARQUET_PATH.is_file():
        return None
    cols = ["date", "delivery_location", "customer_id", "name",
            "street", "sub_area", "area", "hub", "sub_total", "delivery_status"]
    df = pd.read_parquet(PARQUET_PATH)
    df = df[[c for c in cols if c in df.columns]].copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["customer_id"] = df["customer_id"].fillna("").astype(str).str.strip().str.removesuffix(".0")
    for c in ("delivery_location", "street", "sub_area", "area", "name", "delivery_status"):
        if c in df.columns:
            df[c] = df[c].fillna("").astype(str)
    return df


def build_customer_index(start: str | None = None, end: str | None = None) -> dict[str, Any]:
    """Split customers into GPS-known vs needs-geocoding, with the address text
    to use for the latter. Pure analysis — spends nothing."""
    import pandas as pd

    df = _load_sales()
    if df is None or df.empty:
        return {"error": "no sales dataset"}

    if end:
        df = df[df["date"] <= pd.to_datetime(end)]
    if start:
        df = df[df["date"] >= pd.to_datetime(start)]
    df = df[df["customer_id"] != ""]

    loc = df["delivery_location"].str.strip()
    valid = loc.str.contains(",", na=False) & ~loc.isin(["", "None", "nan", "<NA>"])
    df = df.assign(_has_gps=valid)

    gps_rows = df[df["_has_gps"]]
    parts = gps_rows["delivery_location"].str.split(",", n=1, expand=True)
    gps = gps_rows.assign(
        lat=pd.to_numeric(parts[0], errors="coerce"),
        lng=pd.to_numeric(parts[1], errors="coerce"),
    ).dropna(subset=["lat", "lng"])

    gps_by_cust = gps.groupby("customer_id").agg(lat=("lat", "first"), lng=("lng", "first"))

    with_gps = set(gps_by_cust.index)
    all_cust = set(df["customer_id"].unique())
    need_geo = sorted(all_cust - with_gps)

    # Address text + business weight for the customers we'd geocode.
    addr_rows: dict[str, dict[str, Any]] = {}
    if need_geo:
        sub = df[df["customer_id"].isin(need_geo)]
        agg = sub.groupby("customer_id").agg(
            revenue=("sub_total", "sum"),
            deliveries=("sub_total", "size"),
            name=("name", "first"),
            **{f: (f, lambda s: next((x for x in s if str(x).strip()), "")) for f in _ADDRESS_FIELDS},
        )
        for cid, r in agg.iterrows():
            address = geocoding.normalize_address(*[r.get(f, "") for f in _ADDRESS_FIELDS])
            addr_rows[cid] = {
                "address": address,
                "revenue": float(r["revenue"]),
                "deliveries": int(r["deliveries"]),
                "name": str(r.get("name", "")),
            }

    return {
        "total_customers": len(all_cust),
        "with_gps": len(with_gps),
        "need_geocoding": len(need_geo),
        "gps_by_customer": {k: (float(v.lat), float(v.lng)) for k, v in gps_by_cust.iterrows()},
        "to_geocode": addr_rows,
    }


def _haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    import math

    R = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    x = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(x))


def _area_gps_centroids(start: str | None, end: str | None):
    """Median GPS position per recorded `area`, from customers who DO have a
    real capture. Used to sanity-check geocodes: a vague address can make
    Google confidently return the wrong building (observed: "Mittal house,
    Sadashiv Peth" resolving 4 km away with ROOFTOP precision). Comparing
    against the area's own GPS centroid catches that class of error, which
    Google's own precision field does not."""
    import pandas as pd

    df = _load_sales()
    if df is None or df.empty:
        return {}, {}
    if end:
        df = df[df["date"] <= pd.to_datetime(end)]
    if start:
        df = df[df["date"] >= pd.to_datetime(start)]

    loc = df["delivery_location"].str.strip()
    valid = loc.str.contains(",", na=False) & ~loc.isin(["", "None", "nan", "<NA>"])
    gps = df[valid].copy()
    if gps.empty:
        return {}, {}
    parts = gps["delivery_location"].str.split(",", n=1, expand=True)
    gps["lat"] = pd.to_numeric(parts[0], errors="coerce")
    gps["lng"] = pd.to_numeric(parts[1], errors="coerce")
    gps = gps.dropna(subset=["lat", "lng"])
    gps = gps[
        gps["lat"].between(geocoding.PUNE_BBOX["lat_min"], geocoding.PUNE_BBOX["lat_max"])
        & gps["lng"].between(geocoding.PUNE_BBOX["lng_min"], geocoding.PUNE_BBOX["lng_max"])
    ]
    gps["area"] = gps["area"].str.strip()
    gps = gps[gps["area"] != ""]
    if gps.empty:
        return {}, {}

    ctr = gps.groupby("area")[["lat", "lng"]].median()
    counts = gps.groupby("area").size()
    return (
        {a: (float(r.lat), float(r.lng)) for a, r in ctr.iterrows()},
        {a: int(n) for a, n in counts.items()},
    )


# A geocode further than this from its own recorded area's GPS centroid is
# treated as a bad match. 6 km is deliberately loose — Pune areas such as Camp
# and Kothrud genuinely span several km — so this only catches real errors,
# not merely imprecise ones.
MAX_AREA_DEVIATION_KM = 6.0
# Need at least this many GPS points in an area before its centroid is a
# trustworthy yardstick.
MIN_AREA_GPS_SAMPLES = 5


def backfill(
    start: str | None = None,
    end: str | None = None,
    limit: int | None = None,
    qps: float = geocoding.DEFAULT_QPS,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Resolve every customer to a coordinate, geocoding only those without GPS.

    `limit` caps how many addresses this run geocodes (for a cheap trial run).
    Safe to re-run: GPS is recomputed, geocodes come from the durable cache.
    """
    index = build_customer_index(start=start, end=end)
    if "error" in index:
        return index

    out: dict[str, dict[str, Any]] = {}

    for cid, (lat, lng) in index["gps_by_customer"].items():
        out[cid] = {
            "lat": lat, "lng": lng,
            "source": "gps", "precision": "GPS_CAPTURE",
        }

    to_geo = index["to_geocode"]
    # Geocode the highest-revenue customers first so a capped/interrupted run
    # still buys the most map value.
    ordered = sorted(to_geo.items(), key=lambda kv: kv[1]["revenue"], reverse=True)
    if limit is not None:
        ordered = ordered[:limit]

    addr_to_cids: dict[str, list[str]] = {}
    for cid, meta in ordered:
        addr_to_cids.setdefault(meta["address"], []).append(cid)

    geo_result = geocoding.geocode_batch(
        addr_to_cids.keys(), qps=qps, progress=progress,
    )
    if not geo_result.get("ok") and not geo_result.get("results"):
        return {"error": geo_result.get("error", "geocoding failed"), "stats": geo_result.get("stats")}

    # Area-centroid yardstick for the sanity gate below.
    centroids, area_counts = _area_gps_centroids(start, end)
    import pandas as pd  # noqa: F401  (kept local; _load_sales already imports)

    sales = _load_sales()
    cust_area: dict[str, str] = {}
    if sales is not None and not sales.empty and "area" in sales.columns:
        cust_area = (
            sales[sales["customer_id"] != ""]
            .groupby("customer_id")["area"]
            .agg(lambda s: next((str(x).strip() for x in s if str(x).strip()), ""))
            .to_dict()
        )

    placed = 0
    rejected_region = 0
    rejected_area: list[dict[str, Any]] = []
    for addr, res in geo_result["results"].items():
        if not res.get("ok"):
            continue
        if not res.get("in_region"):
            rejected_region += len(addr_to_cids.get(addr, []))
            continue
        for cid in addr_to_cids.get(addr, []):
            area = cust_area.get(cid, "")
            deviation_km = None
            if area and area in centroids and area_counts.get(area, 0) >= MIN_AREA_GPS_SAMPLES:
                c_lat, c_lng = centroids[area]
                deviation_km = round(
                    _haversine_km(res["lat"], res["lng"], c_lat, c_lng), 2
                )
                if deviation_km > MAX_AREA_DEVIATION_KM:
                    # Google matched something, but not in the area this
                    # customer is recorded in. Better no point than a wrong one.
                    rejected_area.append({
                        "customer_id": cid, "area": area,
                        "deviation_km": deviation_km,
                        "precision": res.get("location_type", ""),
                        "address": addr[:90],
                    })
                    continue

            out[cid] = {
                "lat": res["lat"], "lng": res["lng"],
                "source": "geocoded",
                "precision": res.get("location_type", ""),
                "formatted": res.get("formatted", ""),
                "address": addr,
                "partial_match": res.get("partial_match", False),
                "area_deviation_km": deviation_km,
                # Low confidence = Google resolved only to a rough area, OR it
                # disagrees notably with where this customer's GPS-carrying
                # neighbours actually are.
                #
                # Deliberately NOT using Google's `partial_match`: it fires on
                # 96.5% of these addresses because Indian addresses rarely match
                # Google's canonical format, so it carries no signal here. The
                # discriminating pair is precision + area deviation.
                "low_confidence": bool(
                    res.get("location_type") == "APPROXIMATE"
                    or (deviation_km is not None and deviation_km > 3.0)
                ),
            }
            placed += 1

    existing = load_locations()
    existing.update(out)
    existing["__meta__"] = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "customers_total": index["total_customers"],
        "from_gps": index["with_gps"],
        "from_geocoding": sum(1 for k, v in existing.items()
                              if k != "__meta__" and v.get("source") == "geocoded"),
    }
    _save_locations(existing)

    return {
        "ok": True,
        "customers_total": index["total_customers"],
        "with_gps": index["with_gps"],
        "needed_geocoding": index["need_geocoding"],
        "attempted_this_run": len(ordered),
        "newly_placed": placed,
        "rejected_out_of_region": rejected_region,
        "rejected_wrong_area": len(rejected_area),
        "rejected_wrong_area_sample": rejected_area[:10],
        "low_confidence_placed": sum(
            1 for v in out.values() if v.get("source") == "geocoded" and v.get("low_confidence")
        ),
        "geocode_stats": geo_result["stats"],
        "estimated_cost_usd": geo_result.get("estimated_cost_usd", 0.0),
        "locations_file": str(LOCATIONS_PATH),
    }

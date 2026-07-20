"""
Neighbour-referral engine — turns delivery coordinates into a ranked call list.

WHY THIS EXISTS
---------------
Mr Milk has almost no delivery density: of ~3,600 located buildings, roughly
90% contain exactly ONE customer. That is the most expensive structural fact
about the operation — a delivery boy climbing to a single flat per building has
fundamentally worse economics than one serving eight flats in a tower.

But it is also the cheapest growth available. In each of those buildings there
is already:
  * a customer who has been taking daily delivery for months (social proof),
  * a delivery boy physically standing there every morning (zero marginal
    travel cost to add a neighbour),
  * a doorstep-level demonstration of the product happening in public.

Acquiring a neighbour in a building we already serve costs almost nothing to
fulfil, versus a customer 5km away who adds a new stop to a route. This module
finds those buildings and ranks them by how likely the ask is to land.

WHAT IT PRODUCES
----------------
For each opportunity: the anchor customer to ask, their loyalty evidence, the
delivery boy already on-site, the area's realistic value per customer, and a
score. That is a worklist a business-development person can act on directly,
not a chart.

TRUSTWORTHINESS (this is the important part)
--------------------------------------------
Building-level targeting demands building-level accuracy. Roughly 10% of stored
coordinates are unreliable — a customer recorded in Ravet whose GPS lands 20km
away in central Pune. Aggregate views (the heat map) tolerate this because
errors average out; a doorstep worklist does NOT, because a wrong coordinate
sends someone to the wrong building.

So every opportunity is validated against its own area's GPS consensus, and
anything that disagrees is EXCLUDED rather than ranked. We would rather show a
smaller, correct list than a longer one that wastes field time and erodes trust
in the tool the first time it sends someone to the wrong address.
"""
from __future__ import annotations

import json
import logging
import math
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
PARQUET_PATH = CACHE_DIR / "sales.parquet"
LOCATIONS_PATH = CACHE_DIR / "customer_locations.json"

PUNE_BBOX = {"lat_min": 18.2, "lat_max": 18.9, "lng_min": 73.5, "lng_max": 74.2}

# A coordinate further than this from its own area's GPS consensus is treated
# as untrustworthy for doorstep work. 3km is deliberately strict: Pune areas
# span a few km, so a genuine address is comfortably inside this, while the
# known-bad captures (14-20km off) are well outside.
MAX_AREA_DEVIATION_KM = 3.0
# An area needs this many located customers before its consensus is meaningful.
MIN_AREA_SAMPLE = 15

# Buildings are keyed at 4 decimal places (~11m) — tight enough to mean "this
# building", loose enough to absorb normal GPS jitter between captures.
BUILDING_PRECISION = 4

# Shared with geo_analytics.py: (18.5211, 73.8502) is a fallback/default GPS
# point, not a real building — 65 customers land there whose recorded areas
# span 39 unrelated parts of Pune. A referral pitch built from this point
# would be built for the wrong person's neighbours. Kept as a local literal
# (not an import) so this module has no load-bearing dependency on
# geo_analytics; update both lists together if more are found.
_FALLBACK_POINTS = frozenset({(18.5211, 73.8502)})

# An anchor must look like a genuine habit, not a trial. These thresholds keep
# the list credible: asking a 3-delivery customer to recommend us is premature.
MIN_ANCHOR_DELIVERIES = 30
MIN_ANCHOR_TENURE_DAYS = 60
# "Still a customer" — silent longer than this and the ask is awkward.
MAX_ANCHOR_SILENT_DAYS = 21

_lock = threading.Lock()
_cache: dict[str, Any] = {"mtime": None, "data": None}


def _haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    R = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    x = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(x))


def _in_region(lat: float, lng: float) -> bool:
    return (
        PUNE_BBOX["lat_min"] <= lat <= PUNE_BBOX["lat_max"]
        and PUNE_BBOX["lng_min"] <= lng <= PUNE_BBOX["lng_max"]
    )


def _load_locations() -> dict[str, dict[str, Any]]:
    if not LOCATIONS_PATH.is_file():
        return {}
    try:
        with LOCATIONS_PATH.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception:  # noqa: BLE001
        logger.exception("referral_analytics: could not read customer_locations")
        return {}
    return {
        k: v for k, v in raw.items()
        if k != "__meta__" and isinstance(v, dict) and "lat" in v and "lng" in v
    }


def _build_context():
    """Assemble per-customer facts + per-area consensus. Cached on parquet mtime."""
    import pandas as pd

    if not PARQUET_PATH.is_file():
        return None
    mtime = PARQUET_PATH.stat().st_mtime
    loc_mtime = LOCATIONS_PATH.stat().st_mtime if LOCATIONS_PATH.is_file() else 0
    key = (mtime, loc_mtime)
    with _lock:
        if _cache["data"] is not None and _cache["mtime"] == key:
            return _cache["data"]

    from .sales_analytics import _drop_non_product_rows

    df = pd.read_parquet(PARQUET_PATH)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    for c in ("customer_id", "product_name", "area", "sub_area", "hub",
              "delivery_boy", "name", "mobile", "street", "delivery_status"):
        if c in df.columns:
            df[c] = df[c].fillna("").astype(str).str.strip()
    df["customer_id"] = df["customer_id"].str.removesuffix(".0")
    df, _ = _drop_non_product_rows(df)
    d = df[df["delivery_status"] == "delivered"]
    if d.empty:
        return None

    data_max = d["date"].max()
    per_cust = d.groupby("customer_id").agg(
        deliveries=("sub_total", "size"),
        revenue=("sub_total", "sum"),
        first_date=("date", "min"),
        last_date=("date", "max"),
    )
    latest = d.sort_values("date").groupby("customer_id").agg(
        name=("name", "last"), mobile=("mobile", "last"), area=("area", "last"),
        sub_area=("sub_area", "last"), hub=("hub", "last"),
        delivery_boy=("delivery_boy", "last"), street=("street", "last"),
    )
    cust = per_cust.join(latest)
    cust["silent_days"] = (data_max - cust["last_date"]).dt.days
    cust["tenure_days"] = (cust["last_date"] - cust["first_date"]).dt.days

    locs = _load_locations()

    # Area consensus from in-region coordinates only.
    rows = []
    for cid, v in locs.items():
        if cid in cust.index and _in_region(v["lat"], v["lng"]):
            rows.append({"customer_id": cid, "lat": v["lat"], "lng": v["lng"],
                         "area": cust.loc[cid, "area"]})
    geo = pd.DataFrame(rows)
    consensus, counts = {}, {}
    if not geo.empty:
        geo = geo[geo["area"] != ""]
        cen = geo.groupby("area")[["lat", "lng"]].median()
        cnt = geo.groupby("area").size()
        consensus = {a: (r.lat, r.lng) for a, r in cen.iterrows()}
        counts = {a: int(n) for a, n in cnt.items()}

    ctx = {"cust": cust, "locs": locs, "consensus": consensus,
           "counts": counts, "data_max": data_max}
    with _lock:
        _cache["data"] = ctx
        _cache["mtime"] = key
    return ctx


def _coord_trust(cid: str, ctx) -> tuple[bool, float | None, str]:
    """Is this customer's coordinate safe to send a person to?

    Returns (trusted, deviation_km, reason). Untrusted coordinates are excluded
    from the worklist entirely — see the module docstring on why a shorter
    correct list beats a longer wrong one.
    """
    loc = ctx["locs"].get(cid)
    if not loc:
        return False, None, "no_location"
    if not _in_region(loc["lat"], loc["lng"]):
        return False, None, "outside_region"
    if (round(loc["lat"], 4), round(loc["lng"], 4)) in _FALLBACK_POINTS:
        return False, None, "known_fallback_point"

    area = ctx["cust"].loc[cid, "area"] if cid in ctx["cust"].index else ""
    if not area or area not in ctx["consensus"]:
        # No yardstick to check against. Accept GPS (captured on site) but not a
        # geocode, which is a guess we cannot validate.
        return (loc.get("source") == "gps"), None, "no_area_baseline"
    if ctx["counts"].get(area, 0) < MIN_AREA_SAMPLE:
        return (loc.get("source") == "gps"), None, "sparse_area_baseline"

    c_lat, c_lng = ctx["consensus"][area]
    dev = _haversine_km(loc["lat"], loc["lng"], c_lat, c_lng)
    if dev > MAX_AREA_DEVIATION_KM:
        return False, round(dev, 2), "disagrees_with_area"
    if loc.get("low_confidence"):
        return False, round(dev, 2), "low_confidence_geocode"
    return True, round(dev, 2), "ok"


def find_opportunities(
    min_deliveries: int = MIN_ANCHOR_DELIVERIES,
    max_customers_in_building: int = 1,
    hub: str | None = None,
    area: str | None = None,
    limit: int = 200,
) -> dict[str, Any] | None:
    """Rank buildings where a loyal customer is the ONLY one ordering.

    `max_customers_in_building=1` is the purest case (a solo customer in a whole
    building); raising it to 2-3 surfaces buildings with a small foothold worth
    deepening.
    """
    import pandas as pd

    ctx = _build_context()
    if ctx is None:
        return None
    cust, locs = ctx["cust"], ctx["locs"]

    # ---- group customers into buildings, tracking why any were excluded -----
    buildings: dict[tuple[float, float], list[str]] = {}
    excluded = {"no_location": 0, "outside_region": 0, "disagrees_with_area": 0,
                "low_confidence_geocode": 0, "no_area_baseline": 0,
                "sparse_area_baseline": 0}
    trust_cache: dict[str, tuple[bool, float | None, str]] = {}

    for cid in cust.index:
        t = _coord_trust(cid, ctx)
        trust_cache[cid] = t
        trusted, _dev, reason = t
        if not trusted:
            excluded[reason] = excluded.get(reason, 0) + 1
            continue
        loc = locs[cid]
        key = (round(loc["lat"], BUILDING_PRECISION), round(loc["lng"], BUILDING_PRECISION))
        buildings.setdefault(key, []).append(cid)

    # ---- area economics: what a customer there is realistically worth -------
    area_value = cust.groupby("area")["revenue"].median().to_dict()
    area_counts = cust.groupby("area").size().to_dict()

    opportunities = []
    for (lat, lng), cids in buildings.items():
        if len(cids) > max_customers_in_building:
            continue
        # Anchor = the most established customer in the building.
        anchor = max(cids, key=lambda c: (cust.loc[c, "deliveries"], cust.loc[c, "revenue"]))
        row = cust.loc[anchor]

        if row["deliveries"] < min_deliveries:
            continue
        if row["tenure_days"] < MIN_ANCHOR_TENURE_DAYS:
            continue
        if row["silent_days"] > MAX_ANCHOR_SILENT_DAYS:
            continue          # lapsed — asking for a referral would be tone-deaf
        if hub and row["hub"] != hub:
            continue
        if area and row["area"] != area:
            continue

        a = row["area"]
        est_value = float(area_value.get(a, 0) or 0)
        months = max(row["tenure_days"] / 30.4, 0.1)

        _t, dev, _r = trust_cache[anchor]
        loc = locs[anchor]
        opportunities.append({
            "customer_id": anchor,
            "name": row["name"],
            "mobile": row["mobile"],
            "area": a,
            "sub_area": row["sub_area"],
            "hub": row["hub"],
            "address": row["street"][:160],
            "resolved_address": str(loc.get("formatted", ""))[:160],
            "lat": lat, "lng": lng,
            "deliveries": int(row["deliveries"]),
            "revenue": round(float(row["revenue"]), 2),
            "tenure_months": round(months, 1),
            "silent_days": int(row["silent_days"]),
            "delivery_boy": row["delivery_boy"],
            "customers_in_building": len(cids),
            "est_value_per_new_customer": round(est_value, 2),
            "coord_source": loc.get("source", ""),
            "coord_deviation_km": dev,
        })

    # ---- score -----------------------------------------------------------
    # Scored by PERCENTILE within the candidate pool, not by absolute
    # thresholds. An earlier absolute version (min(deliveries/200, 1.0) etc.)
    # saturated badly: a 226-delivery and a 538-delivery customer both hit the
    # cap, so 500 rows collapsed onto 93 distinct scores with 33-way ties and
    # one area taking half the top 50. A ranked worklist that cannot rank is
    # useless, so each factor is now a rank within the pool — guaranteeing the
    # list spreads across the full range and the top is genuinely the top.
    if opportunities:
        import pandas as pd

        o = pd.DataFrame(opportunities)

        def pct(col: str):
            # rank(pct=True) gives 0-1 position within the pool; ties share a
            # rank rather than being ordered arbitrarily.
            return o[col].rank(pct=True, method="average")

        habit = pct("deliveries")          # strength of the daily routine
        loyalty = pct("tenure_months")     # how long they have trusted us
        own_value = pct("revenue")         # their own spend = enthusiasm proxy
        area_val = pct("est_value_per_new_customer")   # local economics
        # Freshness stays absolute: this is a recency gate, not a competition.
        freshness = 1.0 - (o["silent_days"] / MAX_ANCHOR_SILENT_DAYS).clip(0, 1)

        score = (
            0.30 * habit
            + 0.25 * own_value
            + 0.20 * loyalty
            + 0.15 * area_val
            + 0.10 * freshness
        )
        o["score"] = (100 * score).round(1)
        opportunities = o.to_dict("records")

    opportunities.sort(key=lambda o: -o["score"])
    top = opportunities[:limit]
    total_upside = sum(o["est_value_per_new_customer"] for o in opportunities)

    return {
        "opportunities": top,
        "summary": {
            "buildings_analysed": len(buildings),
            "opportunities_found": len(opportunities),
            "returned": len(top),
            "total_estimated_upside": round(total_upside, 2),
            "avg_value_per_new_customer": round(
                total_upside / len(opportunities), 2) if opportunities else 0,
        },
        # Surfaced so nobody mistakes a filtered list for the whole book — and
        # so the size of the data-quality problem stays visible.
        "excluded_customers": excluded,
        "criteria": {
            "min_deliveries": min_deliveries,
            "min_tenure_days": MIN_ANCHOR_TENURE_DAYS,
            "max_silent_days": MAX_ANCHOR_SILENT_DAYS,
            "max_customers_in_building": max_customers_in_building,
            "max_area_deviation_km": MAX_AREA_DEVIATION_KM,
        },
        "hubs": sorted({str(h) for h in cust["hub"].unique() if h}),
        "areas": sorted({str(a) for a in cust["area"].unique() if a}),
    }

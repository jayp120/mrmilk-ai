"""
Address → coordinate resolution via the Google Geocoding API, with a durable
on-disk cache.

Why this exists: only ~65% of delivery rows carry a GPS coordinate captured by
the delivery app. The remaining customers do have good address text (society
name, road, area, often a PIN), so geocoding recovers them and lifts map
coverage to ~95%. Without this the heat map silently under-represents roughly
Rs 39L of quarterly revenue.

Design constraints this file takes seriously:

  * CACHE FIRST, ALWAYS. Every lookup is keyed by a normalised address hash and
    persisted to backend/.cache/geocode_cache.json. You pay Google once per
    distinct address, ever — re-runs and future sales appends only spend calls
    on genuinely new addresses. Negative results are cached too (with a shorter
    TTL) so unresolvable junk addresses don't get retried on every run.

  * RATE LIMITED + RETRIED. Google throttles aggressively and returns
    OVER_QUERY_LIMIT rather than failing loudly. We pace requests and back off
    exponentially, so a 900-address run doesn't half-fail and leave a
    misleading partial map.

  * PROVENANCE PRESERVED. Every resolved point records `source` ("geocoded"),
    Google's `location_type` (ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER >
    APPROXIMATE) and the formatted address. A geocode is where Google thinks a
    building is; a GPS capture is where the delivery boy actually stood. The map
    keeps them distinguishable rather than blending them into false precision.

  * REGION FENCED. Results outside the Pune/PCMC bounding box are marked
    `out_of_region` and never silently placed on the map — the same guard that
    catches the bad-GPS Delhi cluster.

Cost note: Google bills per request, not per cached read. 910 addresses is a
one-time spend of roughly $4.55 at $5/1000, typically absorbed by the free
monthly allowance.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

from ..config import get_settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_PATH = CACHE_DIR / "geocode_cache.json"

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Same fence used by geo_analytics — keep them in sync.
PUNE_BBOX = {"lat_min": 18.2, "lat_max": 18.9, "lng_min": 73.5, "lng_max": 74.2}

# Pacing. Google's practical ceiling is ~50 req/s, but there is no reason to
# sprint through a one-time backfill — a gentle rate keeps us far away from
# OVER_QUERY_LIMIT and from tripping the daily quota cap.
DEFAULT_QPS = 8.0
MAX_RETRIES = 4
RETRY_BASE_SECONDS = 2.0
REQUEST_TIMEOUT = 20

# Re-try a previously-failed address after this long, but keep successful
# results forever (a building doesn't move).
NEGATIVE_TTL_DAYS = 30

_lock = threading.Lock()
_cache: dict[str, Any] | None = None


# ----------------------------------------------------------------------
# Cache
# ----------------------------------------------------------------------
def _load_cache() -> dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache
    if CACHE_PATH.is_file():
        try:
            with CACHE_PATH.open("r", encoding="utf-8") as fh:
                _cache = json.load(fh)
        except Exception as exc:  # noqa: BLE001
            logger.warning("geocoding: cache read failed (%s), starting empty", exc)
            _cache = {}
    else:
        _cache = {}
    return _cache


def _save_cache() -> None:
    """Atomic write so an interrupted run can never corrupt the cache."""
    cache = _load_cache()
    tmp = CACHE_PATH.with_suffix(".json.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False)
        os.replace(tmp, CACHE_PATH)
    except Exception as exc:  # noqa: BLE001
        logger.warning("geocoding: cache write failed: %s", exc)


def normalize_address(*parts: str) -> str:
    """Build a stable, cache-friendly address string from raw MilkMaster fields.

    Collapses whitespace/newlines (the source data contains literal \\r\\n),
    strips duplicate comma runs, and de-duplicates repeated tokens — the raw
    rows frequently repeat the area in both `street` and `area`, which both
    wastes cache entries and confuses the geocoder.
    """
    chunks: list[str] = []
    for p in parts:
        s = re.sub(r"\s+", " ", str(p or "")).strip(" ,")
        if s and s.lower() not in {"", "none", "nan", "not set", "-"}:
            chunks.append(s)

    seen: set[str] = set()
    kept: list[str] = []
    for c in chunks:
        k = c.lower()
        if k not in seen:
            seen.add(k)
            kept.append(c)

    addr = ", ".join(kept)
    if "pune" not in addr.lower():
        addr += ", Pune"
    if not re.search(r"\bindia\b", addr, re.I):
        addr += ", India"
    return re.sub(r"\s*,\s*", ", ", addr).strip(" ,")


def _cache_key(address: str) -> str:
    return hashlib.sha256(address.strip().lower().encode("utf-8")).hexdigest()[:32]


def _is_expired(entry: dict[str, Any]) -> bool:
    if entry.get("ok"):
        return False  # successful geocodes never expire
    ts = entry.get("cached_at")
    if not ts:
        return True
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(ts)
    except ValueError:
        return True
    return age.days >= NEGATIVE_TTL_DAYS


# ----------------------------------------------------------------------
# Single lookup
# ----------------------------------------------------------------------
def _call_google(address: str, api_key: str) -> dict[str, Any]:
    """One Geocoding request with retry/backoff. Returns a normalised result
    dict; never raises for API-level failures."""
    params = urllib.parse.urlencode({
        "address": address,
        "key": api_key,
        "region": "in",
        "components": "country:IN",
    })
    url = f"{GEOCODE_URL}?{params}"

    last_status = "UNKNOWN"
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_status = f"REQUEST_ERROR: {exc}"
            time.sleep(RETRY_BASE_SECONDS * (2 ** attempt))
            continue

        status = payload.get("status", "UNKNOWN")
        last_status = status

        if status == "OK" and payload.get("results"):
            top = payload["results"][0]
            loc = top["geometry"]["location"]
            lat, lng = float(loc["lat"]), float(loc["lng"])
            in_region = (
                PUNE_BBOX["lat_min"] <= lat <= PUNE_BBOX["lat_max"]
                and PUNE_BBOX["lng_min"] <= lng <= PUNE_BBOX["lng_max"]
            )
            return {
                "ok": True,
                "lat": lat,
                "lng": lng,
                "location_type": top["geometry"].get("location_type", ""),
                "formatted": top.get("formatted_address", ""),
                "types": top.get("types", [])[:4],
                "partial_match": bool(top.get("partial_match", False)),
                "in_region": in_region,
                "source": "geocoded",
            }

        if status == "ZERO_RESULTS":
            return {"ok": False, "status": status, "source": "geocoded"}

        # OVER_QUERY_LIMIT / UNKNOWN_ERROR are transient — back off and retry.
        if status in ("OVER_QUERY_LIMIT", "UNKNOWN_ERROR"):
            time.sleep(RETRY_BASE_SECONDS * (2 ** attempt))
            continue

        # REQUEST_DENIED / INVALID_REQUEST are terminal — surface them.
        return {
            "ok": False,
            "status": status,
            "error_message": payload.get("error_message", ""),
            "terminal": True,
            "source": "geocoded",
        }

    return {"ok": False, "status": last_status, "source": "geocoded"}


def geocode_one(address: str, use_cache: bool = True) -> dict[str, Any]:
    """Resolve a single normalised address, hitting the cache first."""
    settings = get_settings()
    key = settings.google_geocoding_api_key
    if not key:
        return {"ok": False, "status": "NO_API_KEY", "terminal": True}

    ck = _cache_key(address)
    cache = _load_cache()

    if use_cache:
        hit = cache.get(ck)
        if hit is not None and not _is_expired(hit):
            out = dict(hit)
            out["cached"] = True
            return out

    result = _call_google(address, key)
    result["cached_at"] = datetime.now(timezone.utc).isoformat()
    result["address"] = address

    with _lock:
        cache[ck] = result
    result_out = dict(result)
    result_out["cached"] = False
    return result_out


# ----------------------------------------------------------------------
# Batch backfill
# ----------------------------------------------------------------------
def geocode_batch(
    addresses: Iterable[str],
    qps: float = DEFAULT_QPS,
    progress: Callable[[dict[str, Any]], None] | None = None,
    max_calls: int | None = None,
) -> dict[str, Any]:
    """Resolve many addresses, paying Google only for cache misses.

    `max_calls` caps live API calls for this run — a safety valve so a bad
    input list can't burn quota. Returns per-address results plus a summary.
    """
    settings = get_settings()
    if not settings.google_geocoding_api_key:
        return {"ok": False, "error": "GOOGLE_GEOCODING_API_KEY is not configured.", "results": {}}

    unique = []
    seen: set[str] = set()
    for a in addresses:
        a = (a or "").strip()
        if a and a not in seen:
            seen.add(a)
            unique.append(a)

    cache = _load_cache()
    results: dict[str, dict[str, Any]] = {}
    stats = {
        "requested": len(unique), "cache_hits": 0, "api_calls": 0,
        "resolved": 0, "zero_results": 0, "out_of_region": 0,
        "errors": 0, "skipped_cap": 0,
    }

    min_interval = 1.0 / qps if qps > 0 else 0.0
    last_call = 0.0
    terminal_error: str | None = None

    for i, addr in enumerate(unique):
        ck = _cache_key(addr)
        hit = cache.get(ck)
        if hit is not None and not _is_expired(hit):
            stats["cache_hits"] += 1
            results[addr] = hit
        else:
            if terminal_error:
                stats["skipped_cap"] += 1
                continue
            if max_calls is not None and stats["api_calls"] >= max_calls:
                stats["skipped_cap"] += 1
                continue

            wait = min_interval - (time.monotonic() - last_call)
            if wait > 0:
                time.sleep(wait)
            res = _call_google(addr, settings.google_geocoding_api_key)
            last_call = time.monotonic()
            stats["api_calls"] += 1

            res["cached_at"] = datetime.now(timezone.utc).isoformat()
            res["address"] = addr
            with _lock:
                cache[ck] = res
            results[addr] = res

            # A terminal failure (bad key, API not enabled, billing off) will
            # repeat for every address — stop rather than burn the whole list.
            if res.get("terminal"):
                terminal_error = f"{res.get('status')}: {res.get('error_message', '')}".strip(": ")
                logger.error("geocoding: terminal failure, aborting batch — %s", terminal_error)

            if stats["api_calls"] % 50 == 0:
                _save_cache()

        r = results.get(addr, {})
        if r.get("ok"):
            if r.get("in_region"):
                stats["resolved"] += 1
            else:
                stats["out_of_region"] += 1
        elif r.get("status") == "ZERO_RESULTS":
            stats["zero_results"] += 1
        else:
            stats["errors"] += 1

        if progress and (i % 25 == 0 or i == len(unique) - 1):
            progress({"done": i + 1, "total": len(unique), **stats})

    _save_cache()

    return {
        "ok": terminal_error is None,
        "error": terminal_error,
        "stats": stats,
        "results": results,
        "estimated_cost_usd": round(stats["api_calls"] * 5.0 / 1000.0, 2),
    }



# ----------------------------------------------------------------------
# REVERSE geocoding — coordinate -> what Google calls that place.
#
# WHY: MilkMaster's area/sub_area fields are a closed dropdown. When a
# customer's real locality isn't an option, they pick the nearest listed one
# instead — so the record says "Wakad" while they actually live somewhere
# Wakad doesn't cover. The sale still routes fine (GPS drives the map/referral
# work), but a delivery boy reading the TEXT address gets sent to the wrong
# neighbourhood. Reverse geocoding recovers what Google calls that exact spot,
# which is the missing-locality signal: if it doesn't match anything already
# in the area/sub_area master, that name is a gap worth adding.
#
# Separate cache file from forward geocoding — the key spaces don't overlap
# (rounded lat,lng vs. free-text address) and keeping them apart makes each
# cache's hit rate legible on its own.
# ----------------------------------------------------------------------
REVERSE_CACHE_PATH = CACHE_DIR / "reverse_geocode_cache.json"
_reverse_cache: dict[str, Any] | None = None


def _load_reverse_cache() -> dict[str, Any]:
    global _reverse_cache
    if _reverse_cache is not None:
        return _reverse_cache
    if REVERSE_CACHE_PATH.is_file():
        try:
            with REVERSE_CACHE_PATH.open("r", encoding="utf-8") as fh:
                _reverse_cache = json.load(fh)
        except Exception as exc:  # noqa: BLE001
            logger.warning("reverse geocoding: cache read failed (%s), starting empty", exc)
            _reverse_cache = {}
    else:
        _reverse_cache = {}
    return _reverse_cache


def _save_reverse_cache() -> None:
    cache = _load_reverse_cache()
    tmp = REVERSE_CACHE_PATH.with_suffix(".json.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False)
        os.replace(tmp, REVERSE_CACHE_PATH)
    except Exception as exc:  # noqa: BLE001
        logger.warning("reverse geocoding: cache write failed: %s", exc)


def _point_key(lat: float, lng: float) -> str:
    # 4dp ~ 11m — matches the building-level precision used elsewhere, so a
    # point already resolved for one purpose is reused for this one.
    return f"{lat:.4f},{lng:.4f}"


def _call_google_reverse(lat: float, lng: float, api_key: str) -> dict[str, Any]:
    params = urllib.parse.urlencode({"latlng": f"{lat},{lng}", "key": api_key, "result_type": "sublocality|neighborhood|locality"})
    url = f"{GEOCODE_URL}?{params}"

    last_status = "UNKNOWN"
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_status = f"REQUEST_ERROR: {exc}"
            time.sleep(RETRY_BASE_SECONDS * (2 ** attempt))
            continue

        status = payload.get("status", "UNKNOWN")
        last_status = status

        if status == "OK" and payload.get("results"):
            # Prefer the most granular result: Google returns several, ordered
            # coarse-to-fine is NOT guaranteed, so pick by specificity of type.
            def _specificity(r: dict) -> int:
                types = set(r.get("types", []))
                if "sublocality_level_2" in types or "neighborhood" in types:
                    return 3
                if "sublocality_level_1" in types or "sublocality" in types:
                    return 2
                if "locality" in types:
                    return 1
                return 0

            best = max(payload["results"], key=_specificity)
            components = best.get("address_components", [])
            sublocality = next(
                (c["long_name"] for c in components
                 if "sublocality" in c.get("types", []) or "neighborhood" in c.get("types", [])),
                None,
            )
            locality = next((c["long_name"] for c in components if "locality" in c.get("types", [])), None)
            return {
                "ok": True,
                "sublocality": sublocality,
                "locality": locality,
                "formatted": best.get("formatted_address", ""),
                "types": best.get("types", []),
                "specificity": _specificity(best),
            }

        if status == "ZERO_RESULTS":
            return {"ok": False, "status": status}
        if status in ("OVER_QUERY_LIMIT", "UNKNOWN_ERROR"):
            time.sleep(RETRY_BASE_SECONDS * (2 ** attempt))
            continue
        return {"ok": False, "status": status, "error_message": payload.get("error_message", ""), "terminal": True}

    return {"ok": False, "status": last_status}


def reverse_geocode_batch(
    points: list[tuple[float, float]],
    qps: float = DEFAULT_QPS,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Resolve (lat, lng) points to Google's neighbourhood/locality name, cached
    forever per point (a building's neighbourhood doesn't move)."""
    settings = get_settings()
    if not settings.google_geocoding_api_key:
        return {"ok": False, "error": "GOOGLE_GEOCODING_API_KEY is not configured.", "results": {}}

    unique = list(dict.fromkeys(points))  # de-dup, keep order
    cache = _load_reverse_cache()
    results: dict[str, dict[str, Any]] = {}
    stats = {"requested": len(unique), "cache_hits": 0, "api_calls": 0, "resolved": 0, "errors": 0}

    min_interval = 1.0 / qps if qps > 0 else 0.0
    last_call = 0.0

    for i, (lat, lng) in enumerate(unique):
        key = _point_key(lat, lng)
        hit = cache.get(key)
        if hit is not None:
            stats["cache_hits"] += 1
        else:
            wait = min_interval - (time.monotonic() - last_call)
            if wait > 0:
                time.sleep(wait)
            hit = _call_google_reverse(lat, lng, settings.google_geocoding_api_key)
            last_call = time.monotonic()
            stats["api_calls"] += 1
            cache[key] = hit
            if stats["api_calls"] % 50 == 0:
                _save_reverse_cache()

        results[key] = hit
        if hit.get("ok"):
            stats["resolved"] += 1
        else:
            stats["errors"] += 1
        if progress and (i % 50 == 0 or i == len(unique) - 1):
            progress({"done": i + 1, "total": len(unique), **stats})

    _save_reverse_cache()
    return {
        "ok": True, "stats": stats, "results": results,
        "estimated_cost_usd": round(stats["api_calls"] * 5.0 / 1000.0, 2),
    }


def cache_stats() -> dict[str, Any]:
    """Summary of what's already resolved — lets the UI show cache state and
    the true remaining cost before anyone triggers a run."""
    cache = _load_cache()
    ok = sum(1 for v in cache.values() if v.get("ok"))
    in_region = sum(1 for v in cache.values() if v.get("ok") and v.get("in_region"))
    return {
        "cached_addresses": len(cache),
        "resolved": ok,
        "in_region": in_region,
        "failed": len(cache) - ok,
        "cache_file": str(CACHE_PATH),
        "configured": bool(get_settings().google_geocoding_api_key),
    }

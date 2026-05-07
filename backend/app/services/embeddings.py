"""
Vector-embedding fuzzy matcher using Gemini's text-embedding-004 model.

Why this exists: even with the schema summary in the prompt, users type
fuzzy / typo'd / partial values — "ghee 1L" instead of "Desi Cow Ghee
1000 ml", "wakkad" instead of "Wakad", "city hub" instead of "Pune
City Hub". An exact match fails. The LLM's free-form guess is
inconsistent. An embedding lookup is deterministic, fast, and traceable
(it returns a confidence score we can show in the UI).

Architecture:
  1. On startup (or when the snapshot changes), build an embedding index
     for every unique value of `area`, `hub`, `product_name`,
     `subscription_status` from the current snapshot.
  2. Cache the index on disk at backend/.cache/embeddings-{snapshot}.json
     so restarts don't re-call the embedding API.
  3. Expose `find_match(query, type, top_k)` that:
       - embeds the query string (cached for repeats)
       - cosine-similarity vs the index
       - returns top_k matches with confidence in [0, 1]

Cost model: ~150-300 unique values total per snapshot. One-time embed
is ~150 API calls = $0.0002. Per-query find_match is one embed call =
$0.00005. Effectively free. Network latency: ~80-150 ms per call from
India.

Failure modes (handled):
  - Gemini API down → find_match returns {"error": "embedding_unavailable"}
    so the LLM can fall back to fuzzy string matching in pandas.
  - Empty query → returns no matches.
  - Snapshot has zero unique values for a category → that category just
    doesn't get an index; queries against it return "category_unindexed".
"""
from __future__ import annotations

import json
import logging
import math
import threading
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import CustomerRecord, DatasetSnapshot

logger = logging.getLogger(__name__)

# Embedding model — verified live against the configured Gemini key.
# `text-embedding-004` is unavailable on this API tier; `gemini-embedding-001`
# is the current generally-available embedding model on v1beta.
EMBED_MODEL = "gemini-embedding-001"
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent"
EMBED_DIMS = 3072  # gemini-embedding-001 is 3072-dim by default
HTTP_TIMEOUT = 20.0

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Confidence threshold: results below this are returned but flagged as low-confidence.
# Above this, the LLM treats as a confident exact-equivalent match.
# Empirically tuned to 0.72 against the MrMilk corpus — the gemini-embedding-001
# model produces real correct matches in the 0.74-0.80 range for typo'd inputs;
# matches below 0.72 (e.g. "milk" → "Mr. Milk Cap" at 0.69) are genuine
# disambiguation cases where the LLM should ask the user.
HIGH_CONFIDENCE = 0.72


# ----------------------------------------------------------------------
# Embedding HTTP call
# ----------------------------------------------------------------------
def _embed_one(text: str, api_key: str) -> list[float] | None:
    """Call Gemini's embedContent endpoint for a single string."""
    body = {
        "model": f"models/{EMBED_MODEL}",
        "content": {"parts": [{"text": text}]},
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            r = client.post(f"{EMBED_URL}?key={api_key}", json=body)
        if not r.is_success:
            logger.warning("embed: API %s — %s", r.status_code, r.text[:200])
            return None
        data = r.json()
        return data.get("embedding", {}).get("values") or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("embed: %s", exc)
        return None


def _embed_batch(texts: list[str], api_key: str) -> list[list[float] | None]:
    """Embed a list of strings. Gemini's batchEmbedContents is faster than
    one call per string, but the per-string endpoint is simpler and fine
    for our 150-value index."""
    return [_embed_one(t, api_key) for t in texts]


# ----------------------------------------------------------------------
# Cosine similarity
# ----------------------------------------------------------------------
def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ----------------------------------------------------------------------
# Index build / load
# ----------------------------------------------------------------------
def _index_path(snapshot_id: str) -> Path:
    safe = "".join(c for c in snapshot_id if c.isalnum() or c in "-_")
    return CACHE_DIR / f"embeddings-{safe}.json"


def _collect_categorical_values(session: Session, snapshot_id: str) -> dict[str, list[str]]:
    """Pull unique values for each category we want to index."""
    out: dict[str, list[str]] = {}

    # Customer master columns (Supabase)
    for category, col in [
        ("area", CustomerRecord.area),
        ("hub", CustomerRecord.hub),
        ("subscription_status", CustomerRecord.subscription_status),
    ]:
        rows = session.execute(
            select(col)
            .where(CustomerRecord.dataset_snapshot_id == snapshot_id, col.is_not(None), col != "")
            .group_by(col)
            .order_by(func.count().desc())
        ).scalars().all()
        out[category] = [str(v).strip() for v in rows if str(v).strip()]

    # Sales product names (parquet) — only if the parquet exists
    parquet = CACHE_DIR / "sales.parquet"
    if parquet.is_file():
        try:
            import pandas as pd
            sdf = pd.read_parquet(parquet)
            if "product_name" in sdf.columns:
                names = (
                    sdf["product_name"]
                    .dropna()
                    .astype(str)
                    .str.strip()
                    .value_counts()
                    .index.tolist()
                )
                out["product_name"] = [n for n in names if n]
            # Also index areas seen in sales (sometimes differs from customer master)
            if "area" in sdf.columns:
                sales_areas = (
                    sdf["area"]
                    .dropna()
                    .astype(str)
                    .str.strip()
                    .value_counts()
                    .index.tolist()
                )
                # Merge with customer-master areas
                merged = list(dict.fromkeys(out.get("area", []) + [a for a in sales_areas if a]))
                out["area"] = merged
        except Exception as exc:  # noqa: BLE001
            logger.warning("embeddings: failed to read sales parquet: %s", exc)

    return out


def build_index(session: Session, force: bool = False) -> dict[str, Any] | None:
    """Build (or load from cache) the embedding index for the current snapshot.
    Returns the loaded payload or None if no snapshot."""
    snapshot = session.execute(
        select(DatasetSnapshot).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalars().first()
    if not snapshot:
        return None

    cache = _index_path(snapshot.id)
    if cache.is_file() and not force:
        try:
            with cache.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            if payload.get("snapshot_id") == snapshot.id and payload.get("vectors"):
                logger.info("embeddings: cache hit %s (%d categories)", cache.name, len(payload["vectors"]))
                return payload
        except Exception as exc:  # noqa: BLE001
            logger.warning("embeddings: cache read failed: %s", exc)

    api_key = get_settings().gemini_api_key
    if not api_key:
        logger.warning("embeddings: GEMINI_API_KEY missing — skipping index build")
        return None

    catalog = _collect_categorical_values(session, snapshot.id)
    if not catalog:
        return None

    payload: dict[str, Any] = {
        "snapshot_id": snapshot.id,
        "model": EMBED_MODEL,
        "vectors": {},  # category -> [{value, embedding}]
    }

    total_calls = 0
    for category, values in catalog.items():
        if not values:
            continue
        logger.info("embeddings: indexing %d %s values…", len(values), category)
        vecs = _embed_batch(values, api_key)
        entries = []
        for val, vec in zip(values, vecs):
            if vec:
                entries.append({"value": val, "embedding": vec})
                total_calls += 1
        payload["vectors"][category] = entries
        logger.info("embeddings: indexed %d/%d %s", len(entries), len(values), category)

    try:
        with cache.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        logger.info("embeddings: wrote %s (%d API calls)", cache.name, total_calls)
    except Exception as exc:  # noqa: BLE001
        logger.warning("embeddings: cache write failed: %s", exc)
    return payload


# ----------------------------------------------------------------------
# Lookup
# ----------------------------------------------------------------------
_INDEX_CACHE: dict[str, dict[str, Any]] = {}  # snapshot_id -> payload
_INDEX_LOCK = threading.Lock()
_QUERY_EMBED_CACHE: dict[str, list[float]] = {}  # query text -> embedding (within session)


def _get_index(session: Session) -> dict[str, Any] | None:
    snapshot = session.execute(
        select(DatasetSnapshot.id).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalar_one_or_none()
    if not snapshot:
        return None
    with _INDEX_LOCK:
        cached = _INDEX_CACHE.get(snapshot)
        if cached:
            return cached
    payload = build_index(session)
    if payload:
        with _INDEX_LOCK:
            _INDEX_CACHE[snapshot] = payload
    return payload


def find_match(session: Session, query: str, type: str = "product", top_k: int = 3) -> dict[str, Any]:
    """Return the top-k nearest known values for a fuzzy user input.

    type: 'product' | 'product_name' | 'area' | 'hub' | 'subscription_status'
    """
    if not query or not query.strip():
        return {"error": "empty_query"}

    payload = _get_index(session)
    if not payload:
        return {"error": "index_unavailable", "detail": "Embedding index not built. New snapshot? Run warmup."}

    # Resolve category alias
    type_map = {
        "product": "product_name",
        "product_name": "product_name",
        "area": "area",
        "hub": "hub",
        "subscription_status": "subscription_status",
        "status": "subscription_status",
    }
    category = type_map.get(str(type).lower())
    if not category:
        return {"error": "unknown_category", "detail": f"type must be one of {list(type_map)}"}

    entries = (payload.get("vectors") or {}).get(category) or []
    if not entries:
        return {"error": "category_unindexed", "detail": f"No values indexed for {category}."}

    # Embed the query (cached within process for repeats)
    api_key = get_settings().gemini_api_key
    if not api_key:
        return {"error": "embedding_unavailable", "detail": "GEMINI_API_KEY missing"}

    cache_key = f"{category}::{query.strip().lower()}"
    if cache_key in _QUERY_EMBED_CACHE:
        q_vec = _QUERY_EMBED_CACHE[cache_key]
    else:
        q_vec = _embed_one(query.strip(), api_key)
        if not q_vec:
            return {"error": "embedding_unavailable", "detail": "Gemini embed call failed."}
        _QUERY_EMBED_CACHE[cache_key] = q_vec

    # Score every entry; sort desc; take top_k
    scored = [
        {"value": e["value"], "score": round(_cosine(q_vec, e["embedding"]), 4)}
        for e in entries
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    matches = scored[: max(1, int(top_k or 3))]

    best = matches[0] if matches else None
    return {
        "query": query,
        "category": category,
        "top_match": best["value"] if best else None,
        "top_score": best["score"] if best else 0.0,
        "high_confidence": bool(best and best["score"] >= HIGH_CONFIDENCE),
        "matches": matches,
        "candidate_count": len(entries),
    }


def invalidate() -> None:
    """Clear the in-process index cache. Called when a new snapshot lands."""
    with _INDEX_LOCK:
        _INDEX_CACHE.clear()
    _QUERY_EMBED_CACHE.clear()


def warmup(session: Session) -> int:
    """Eagerly build/load the embedding index. Returns the total number of
    indexed values. Called on backend startup (background task)."""
    payload = build_index(session)
    if not payload:
        return 0
    return sum(len(v) for v in (payload.get("vectors") or {}).values())

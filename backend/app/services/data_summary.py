"""
Schema summary — gives the LLM a snapshot of the actual values in each
categorical column so it can pick the correct exact string instead of
guessing one that doesn't exist.

Why this exists: prompts that only describe column names ("the area
column") cause the LLM to hallucinate values like "Pune" when the actual
data has "Pune City Hub". Including the real top-N values eliminates
~30-40% of zero-result queries.

Output is a compact string (caps at ~2 KB) that gets injected into:
  - The Gemini system prompt (persona) so it picks correct values
  - The Python preamble of the E2B sandbox so generated code can also
    reference KNOWN_VALUES if it needs to fuzzy-match locally.

The summary is cached on disk keyed by snapshot_id so we only recompute
when a new MilkMaster workbook is imported.
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import CustomerRecord, DatasetSnapshot

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_path(snapshot_id: str) -> Path:
    safe = "".join(c for c in snapshot_id if c.isalnum() or c in "-_")
    return CACHE_DIR / f"schema-summary-{safe}.json"


def _load_sales_categoricals() -> dict[str, list[tuple[str, int]]]:
    """Pull category frequencies from the sales parquet (if present).
    Returns {column_name: [(value, count), ...]} ordered by count desc."""
    parquet = CACHE_DIR / "sales.parquet"
    if not parquet.is_file():
        return {}
    try:
        import pandas as pd  # local import — backend may run without pandas
        df = pd.read_parquet(parquet)
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_summary: failed to read sales parquet: %s", exc)
        return {}

    out: dict[str, list[tuple[str, int]]] = {}
    for col, top_n in [
        ("product_name", 25),
        ("delivery_status", 10),
        ("subscription_type", 10),
        ("delivery_shift", 10),
    ]:
        if col not in df.columns:
            continue
        counts = df[col].dropna().astype(str).str.strip()
        counts = counts[counts.ne("")]
        if counts.empty:
            continue
        out[col] = [(v, int(c)) for v, c in counts.value_counts().head(top_n).items()]
    return out


def build_schema_summary(session: Session) -> dict[str, Any]:
    """Compute the top values for each categorical column on the current snapshot.
    Disk-cached on snapshot_id."""
    snapshot = session.execute(
        select(DatasetSnapshot).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalars().first()
    if not snapshot:
        return {}

    cache = _cache_path(snapshot.id)
    if cache.is_file():
        try:
            with cache.open("r", encoding="utf-8") as fh:
                logger.info("data_summary: cache hit %s", cache.name)
                return json.load(fh)
        except Exception:  # noqa: BLE001
            pass  # fall through, recompute

    summary: dict[str, list[tuple[str, int]]] = {}

    # Customer master columns (Supabase) — small, run efficient GROUP BYs
    for col_name, col, top_n in [
        ("area", CustomerRecord.area, 30),
        ("hub", CustomerRecord.hub, 15),
        ("subscription_status", CustomerRecord.subscription_status, 13),
        ("payment_mode", CustomerRecord.payment_mode, 10),
        ("source", CustomerRecord.source, 15),
        ("city", CustomerRecord.city, 10),
    ]:
        rows = session.execute(
            select(col, func.count())
            .where(CustomerRecord.dataset_snapshot_id == snapshot.id, col.is_not(None), col != "")
            .group_by(col)
            .order_by(func.count().desc())
            .limit(top_n)
        ).all()
        summary[col_name] = [(str(v).strip(), int(c)) for v, c in rows if str(v).strip()]

    # Sales transaction columns (Parquet)
    sales_cats = _load_sales_categoricals()
    summary.update(sales_cats)

    # Persist
    payload = {
        "snapshot_id": snapshot.id,
        "summary": {k: [list(p) for p in v] for k, v in summary.items()},
    }
    try:
        with cache.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
        logger.info("data_summary: wrote %s (%d categories)", cache.name, len(summary))
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_summary: cache write failed: %s", exc)
    return payload


def render_for_prompt(payload: dict[str, Any], max_chars: int = 2400) -> str:
    """Format the summary as a compact string suitable for a system prompt.
    Output is hard-capped at `max_chars` so the prompt stays small."""
    if not payload or not payload.get("summary"):
        return ""

    summary = payload["summary"]
    pieces = ["KNOWN VALUES (use these exact strings — never invent or guess a substitute):"]

    def _fmt_pair(value: str, count: int) -> str:
        return f"{value} ({count:,})" if count else value

    section_order = [
        ("areas (top by customer count)", "area"),
        ("hubs", "hub"),
        ("subscription_status (all buckets)", "subscription_status"),
        ("product_name (top 25 by sales rows)", "product_name"),
        ("payment_mode", "payment_mode"),
        ("source (acquisition channel)", "source"),
        ("city", "city"),
        ("delivery_status", "delivery_status"),
        ("subscription_type", "subscription_type"),
        ("delivery_shift", "delivery_shift"),
    ]

    for label, key in section_order:
        items = summary.get(key) or []
        if not items:
            continue
        joined = ", ".join(_fmt_pair(v, c) for v, c in items)
        pieces.append(f"\n  {label}:\n    {joined}")

    text = "\n".join(pieces)
    if len(text) > max_chars:
        text = text[: max_chars - 80].rstrip() + "\n  ... (truncated to fit prompt budget) ..."
    return text


def render_for_python(payload: dict[str, Any]) -> str:
    """Inline a Python dict literal of known values so generated pandas
    code can reference KNOWN_VALUES['area'] etc. for fuzzy local matching."""
    if not payload or not payload.get("summary"):
        return "KNOWN_VALUES = {}\n"
    # Strip counts — Python code only needs the value list
    body = {k: [v for (v, _c) in pairs] for k, pairs in payload["summary"].items()}
    return f"KNOWN_VALUES = {json.dumps(body, ensure_ascii=False, indent=None)}\n"


# In-process cache so we don't re-read the JSON on every chat request
_RENDERED_CACHE: dict[str, tuple[str, str]] = {}  # snapshot_id -> (prompt_text, python_text)


def get_rendered(session: Session) -> tuple[str, str]:
    """Return (prompt_text, python_text). Cached per process."""
    payload = build_schema_summary(session)
    sid = payload.get("snapshot_id") or ""
    if sid in _RENDERED_CACHE:
        return _RENDERED_CACHE[sid]
    prompt_text = render_for_prompt(payload)
    python_text = render_for_python(payload)
    _RENDERED_CACHE[sid] = (prompt_text, python_text)
    return prompt_text, python_text


def _format_date(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text[:10] if text else None


def _format_count(value: Any) -> str:
    try:
        return f"{int(value):,}"
    except Exception:  # noqa: BLE001
        return "0"


def _format_display_date(value: Any) -> str | None:
    iso = _format_date(value)
    if not iso:
        return None
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return iso
    return parsed.strftime("%d %b %Y").lstrip("0")


def get_data_coverage(session: Session) -> dict[str, Any]:
    """Return deterministic data coverage for chat answer metadata.

    This is intentionally separate from the LLM response so every answer can
    show the same tiny "what data was used" note, including fallback answers.
    """
    coverage: dict[str, Any] = {}

    snapshot = session.execute(
        select(DatasetSnapshot).where(DatasetSnapshot.is_current.is_(True)).limit(1)
    ).scalars().first()
    if snapshot:
        customer_data_to = session.execute(
            select(func.max(CustomerRecord.last_delivery_date))
            .where(CustomerRecord.dataset_snapshot_id == snapshot.id)
        ).scalar_one_or_none()
        customer_data_to_s = _format_date(customer_data_to)
        customer_imported_at_s = _format_date(snapshot.imported_at)
        coverage.update({
            "snapshot_id": snapshot.id,
            "customer_row_count": int(snapshot.row_count or 0),
            "customer_data_to": customer_data_to_s,
            "customer_imported_at": customer_imported_at_s,
        })

    try:
        from .sales_import import read_meta as _read_sales_meta
        sales_meta = _read_sales_meta() or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_summary: failed to read sales meta: %s", exc)
        sales_meta = {}

    if sales_meta:
        date_range = sales_meta.get("date_range") or {}
        coverage.update({
            "sales_row_count": int(sales_meta.get("row_count") or 0) if sales_meta.get("row_count") is not None else None,
            "sales_data_from": _format_date(date_range.get("from")),
            "sales_data_to": _format_date(date_range.get("to")),
            "sales_uploaded_at": _format_date(sales_meta.get("uploaded_at")),
        })

    parts: list[str] = []
    if coverage.get("customer_row_count") is not None:
        customer_part = f"Customer file: {_format_count(coverage.get('customer_row_count'))} customers"
        if coverage.get("customer_imported_at"):
            customer_part += f", uploaded {_format_display_date(coverage['customer_imported_at'])}"
        if coverage.get("customer_data_to"):
            customer_part += f", latest delivery {_format_display_date(coverage['customer_data_to'])}"
        parts.append(customer_part)

    if coverage.get("sales_row_count") is not None:
        sales_part = f"Sales report: {_format_count(coverage.get('sales_row_count'))} rows"
        if coverage.get("sales_data_from") and coverage.get("sales_data_to"):
            sales_part += f", {_format_display_date(coverage['sales_data_from'])} to {_format_display_date(coverage['sales_data_to'])}"
        elif coverage.get("sales_data_to"):
            sales_part += f", through {_format_display_date(coverage['sales_data_to'])}"
        parts.append(sales_part)

    if parts:
        coverage["data_note"] = "Data used: " + "; ".join(parts) + "."
        coverage["data_date"] = coverage.get("sales_data_to") or coverage.get("customer_data_to") or coverage.get("customer_imported_at")
        coverage["prompt_text"] = "DATA COVERAGE: " + "; ".join(parts) + ". Use these source dates when interpreting words like latest, current, this month, or last 30 days."

    return coverage


def invalidate() -> None:
    """Clear in-process cache. Called by the import pipeline when a new
    snapshot lands."""
    _RENDERED_CACHE.clear()

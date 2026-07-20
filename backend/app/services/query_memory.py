"""
Query memory — persistent few-shot retrieval over past successful agent runs.

Goal: every successful question + the code/SQL the agent used to answer it
becomes a future few-shot example. The agent gets smarter over time without
any explicit training step.

Mechanics:
  1. After each agent run, log (question, embedding, tool_calls, generated_code,
     headline, blocks_summary, validator_verdict) to the `query_memory` table.
  2. Before each new question, embed it, fetch recent rows, do cosine similarity
     in Python, return top-K above a similarity threshold.
  3. Inject those K (question + headline + the actual generated code/SQL) into
     the system prompt as "Past similar successful answers — use as guidance".

We intentionally exclude:
  * Rows with thumbs_down>0 (user-flagged wrong)
  * Rows where the validator returned "issue"
  * Rows from older snapshots (numbers may have changed)

Scale assumption: <5000 rows. Beyond that, switch to pgvector. Cosine over
5000×3072-d vectors in Python is ~150ms — comfortable.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..models import QueryMemory
from .embeddings import _embed_one
from ..config import get_settings

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.70   # below this, the past Q is too unrelated to be useful
MAX_RECENT_ROWS = 2000        # cap for cosine scan
DEFAULT_TOP_K = 3


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _summarise_blocks(blocks: list[dict[str, Any]]) -> str:
    """One-line description of what the answer was."""
    bits: list[str] = []
    for b in blocks or []:
        btype = b.get("type")
        if btype == "big_number":
            v = b.get("value")
            t = b.get("title")
            if v and t:
                bits.append(f"big_number={v!r} ({t})")
        elif btype == "table":
            rows = b.get("rows") or []
            cols = b.get("columns") or []
            bits.append(f"table[{len(rows)}r×{len(cols)}c]={b.get('title')!r}")
        elif btype == "chart":
            bits.append(f"chart[{b.get('variant')}]={b.get('title')!r}")
    if not bits:
        return ""
    return "; ".join(bits)[:600]


def _extract_headline(blocks: list[dict[str, Any]]) -> str | None:
    for b in blocks or []:
        if b.get("type") == "big_number":
            value = b.get("value")
            if value:
                return str(value)[:255]
    return None


def _extract_code(tool_calls: list[dict[str, Any]]) -> str | None:
    """Pull the most useful generated code from the tool log.
    Priority: DuckDB SQL > run_safe_sql > run_python code. Limit to 4000 chars."""
    for tc in tool_calls or []:
        if tc.get("name") == "run_duckdb_sql":
            q = (tc.get("args") or {}).get("query")
            if q:
                return f"-- DuckDB\n{str(q)[:4000]}"
    for tc in tool_calls or []:
        if tc.get("name") == "run_safe_sql":
            q = (tc.get("args") or {}).get("query")
            if q:
                return f"-- Postgres\n{str(q)[:4000]}"
    for tc in tool_calls or []:
        if tc.get("name") == "run_python":
            code = (tc.get("args") or {}).get("code")
            if code:
                return f"# Python\n{str(code)[:4000]}"
    return None


def log_run(
    session: Session,
    *,
    question: str,
    tool_calls: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
    validator_verdict: str = "unknown",
    snapshot_id: str | None = None,
    model_used: str | None = None,
    duration_ms: int | None = None,
) -> int | None:
    """Log a completed agent run. Returns the row id or None if skipped."""
    if not question or not question.strip():
        return None
    settings = get_settings()
    api_key = settings.gemini_api_key
    if not api_key:
        return None

    try:
        embedding = _embed_one(question.strip(), api_key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("query_memory: embed failed: %s", exc)
        embedding = None

    record = QueryMemory(
        snapshot_id=snapshot_id,
        question=question.strip()[:2000],
        embedding=embedding,
        tool_calls=[
            {
                "name": tc.get("name"),
                "args": {k: (str(v)[:1500] if isinstance(v, (str, int, float, bool)) else v)
                         for k, v in (tc.get("args") or {}).items()},
                "summary": tc.get("summary"),
            }
            for tc in (tool_calls or [])
        ],
        generated_code=_extract_code(tool_calls or []),
        headline_value=_extract_headline(blocks or []),
        blocks_summary=_summarise_blocks(blocks or []),
        validator_verdict=validator_verdict,
        model_used=model_used,
        duration_ms=duration_ms,
        thumbs_up=0,
        thumbs_down=0,
        created_at=datetime.utcnow(),
    )
    try:
        session.add(record)
        session.commit()
        return record.id
    except Exception as exc:  # noqa: BLE001
        logger.warning("query_memory: write failed: %s", exc)
        try:
            session.rollback()
        except Exception:  # noqa: BLE001
            pass
        return None


def retrieve_similar(
    session: Session,
    question: str,
    *,
    snapshot_id: str | None = None,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict[str, Any]]:
    """Return top-K most similar past Q&A above SIMILARITY_THRESHOLD."""
    if not question or not question.strip():
        return []
    settings = get_settings()
    api_key = settings.gemini_api_key
    if not api_key:
        return []
    try:
        q_vec = _embed_one(question.strip(), api_key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("query_memory: query embed failed: %s", exc)
        return []
    if not q_vec:
        return []

    stmt = (
        select(QueryMemory)
        .where(QueryMemory.thumbs_down == 0, QueryMemory.validator_verdict != "issue")
        .order_by(desc(QueryMemory.created_at))
        .limit(MAX_RECENT_ROWS)
    )
    if snapshot_id:
        # Prefer same-snapshot matches; if there are none, we'll fall back to all.
        same_snap = session.execute(stmt.where(QueryMemory.snapshot_id == snapshot_id)).scalars().all()
        rows = same_snap if same_snap else session.execute(stmt).scalars().all()
    else:
        rows = session.execute(stmt).scalars().all()

    scored: list[tuple[float, QueryMemory]] = []
    for row in rows:
        emb = row.embedding
        if not isinstance(emb, list) or not emb:
            continue
        score = _cosine(q_vec, emb)
        if score >= SIMILARITY_THRESHOLD:
            scored.append((score, row))

    scored.sort(key=lambda x: -x[0])
    out: list[dict[str, Any]] = []
    for score, row in scored[: max(1, int(top_k))]:
        out.append({
            "id": row.id,
            "score": round(score, 4),
            "question": row.question,
            "headline_value": row.headline_value,
            "blocks_summary": row.blocks_summary,
            "generated_code": row.generated_code,
            "validator_verdict": row.validator_verdict,
            "thumbs_up": row.thumbs_up,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })
    return out


def render_for_prompt(matches: list[dict[str, Any]]) -> str:
    """Compact prompt rendering of retrieved memories. Empty string if no matches."""
    if not matches:
        return ""
    out: list[str] = [
        "PAST SIMILAR ANSWERS (use as guidance for code structure, not as ground truth — re-run on live data):",
    ]
    for m in matches:
        out.append("")
        out.append(f"### Past Q (similarity {m['score']}): {m['question']}")
        if m.get("headline_value"):
            out.append(f"  → Headline answered: {m['headline_value']}")
        if m.get("blocks_summary"):
            out.append(f"  → Blocks emitted: {m['blocks_summary']}")
        if m.get("generated_code"):
            out.append("  → Code that worked:")
            for line in m["generated_code"].splitlines()[:30]:
                out.append(f"      {line}")
            if len(m["generated_code"].splitlines()) > 30:
                out.append("      …")
    return "\n".join(out)


def record_thumb(session: Session, memory_id: int, direction: str) -> bool:
    """Apply a thumb to a past run. direction='up' or 'down'."""
    record = session.get(QueryMemory, memory_id)
    if not record:
        return False
    if direction == "up":
        record.thumbs_up = (record.thumbs_up or 0) + 1
    elif direction == "down":
        record.thumbs_down = (record.thumbs_down or 0) + 1
    else:
        return False
    try:
        session.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("query_memory: thumb write failed: %s", exc)
        try:
            session.rollback()
        except Exception:  # noqa: BLE001
            pass
        return False

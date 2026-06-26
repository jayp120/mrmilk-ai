"""
Validator / critic pass — second LLM call that checks the agent's answer
for accuracy issues before it reaches the user.

Why this exists: even with a strong system prompt, the main agent
occasionally drops a filter, miscounts a join, or invents a number.
A short, focused critic call catches the obvious failures cheaply.

Design:
  * Uses gemini-2.5-flash (fast + cheap) regardless of which model the
    main agent used. The validator only checks structure and arithmetic
    against tool output — it doesn't need Pro.
  * Sees: the user question, the tool calls + their summarised outputs,
    and the final block JSON.
  * Returns one of:
      - {"verdict": "ok"}                   → answer ships unchanged.
      - {"verdict": "issue", "reason": str} → main agent gets one chance
                                              to redo with the reason fed back.
  * Hard-times-out at 8s. On any error / timeout we ship the original answer
    (fail-open — never block the user because the validator is slow).
  * Cost: ~1k tokens in / ~30 tokens out = essentially free.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

VALIDATOR_MODEL = "gemini-3.1-flash-lite"
VALIDATOR_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{VALIDATOR_MODEL}:generateContent"
TIMEOUT = 8.0

CRITIC_PROMPT = """You are a senior data-analytics critic reviewing an answer
produced by another agent against a customer + sales dataset.

Your only job: spot OBVIOUS mistakes that would mislead the user. Be
strict on accuracy, lenient on style. If anything is fine, say so.

Check for these specific failures:
  1. EMPTY-RESULT FALSE NEGATIVE — answer claims "no X in the data" but
     the tool calls actually found rows / didn't search the right column.
     This is the WORST failure mode and gets a hard "issue".
  2. NUMBER ↔ TABLE MISMATCH — headline big_number contradicts the totals
     visible in the table block (e.g. headline says "Rs 5L" but table
     rows sum to Rs 3L).
  3. FILTER DROPPED — user asked for status='Active' but answer doesn't
     mention or apply that filter.
  4. WRONG COLUMN — user asked about wallet but answer reports revenue,
     or vice versa.
  5. DEDUP / DOUBLE-COUNT — counts customers via len(df) instead of
     nunique('mobile'), inflating the number.
  6. SILENT TRUNCATION — answer says "top 10" when user asked for top 50.

Reply ONLY with one of these JSON shapes (no prose, no fences):
  {"verdict": "ok"}
  {"verdict": "issue", "reason": "<one short sentence the agent can act on>"}

Question, tool log, and proposed answer follow.
"""


def _truncate(text: str, n: int = 1500) -> str:
    if not text:
        return ""
    return text if len(text) <= n else text[: n - 1] + "…"


def _summarise_tool_log(tool_calls: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for tc in tool_calls:
        name = tc.get("name", "?")
        args = tc.get("args") or {}
        summary = tc.get("summary") or ""
        # Pull the most useful bits from common args
        arg_bits: list[str] = []
        for key in ("query", "code", "type"):
            if key in args:
                arg_bits.append(f"{key}={_truncate(str(args[key]), 200)}")
        lines.append(f"- {name}({'; '.join(arg_bits)}) → {_truncate(summary, 300)}")
    return "\n".join(lines)


def _summarise_blocks(blocks: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for b in blocks or []:
        btype = b.get("type", "?")
        if btype == "big_number":
            lines.append(f"big_number: {b.get('value')!r} | title={b.get('title')!r} | caption={b.get('caption')!r}")
        elif btype == "text":
            lines.append(f"text: {_truncate(str(b.get('content','')), 600)}")
        elif btype == "table":
            cols = b.get("columns") or []
            rows = b.get("rows") or []
            sample = rows[:3]
            lines.append(
                f"table: title={b.get('title')!r} | cols={cols} | rows={len(rows)} | sample={sample}"
            )
        elif btype == "chart":
            lines.append(f"chart: variant={b.get('variant')!r} | title={b.get('title')!r} | data_pts={len(b.get('data') or [])}")
        elif btype == "image":
            lines.append(f"image: title={b.get('title')!r} (png omitted)")
        elif btype == "input":
            lines.append(f"input suggestions: {b.get('suggestions')}")
        else:
            lines.append(f"{btype}: {_truncate(json.dumps(b, default=str), 200)}")
    return "\n".join(lines)


async def critique(
    question: str,
    tool_calls: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return {"verdict":"ok"} or {"verdict":"issue","reason":...}."""
    settings = get_settings()
    api_key = settings.gemini_api_key
    if not api_key:
        return {"verdict": "ok", "reason": "validator_skipped_no_key"}
    if not blocks:
        return {"verdict": "ok", "reason": "validator_skipped_empty_blocks"}

    body = {
        "systemInstruction": {"parts": [{"text": CRITIC_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"USER QUESTION:\n{question}\n\n"
                            f"TOOL CALLS:\n{_summarise_tool_log(tool_calls)}\n\n"
                            f"PROPOSED ANSWER BLOCKS:\n{_summarise_blocks(blocks)}\n"
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 256,
            "responseMimeType": "application/json",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(f"{VALIDATOR_URL}?key={api_key}", json=body)
        if not r.is_success:
            logger.warning("validator: HTTP %s %s", r.status_code, _truncate(r.text, 200))
            return {"verdict": "ok", "reason": "validator_http_error"}
        data = r.json()
        candidates = data.get("candidates") or []
        if not candidates:
            return {"verdict": "ok", "reason": "validator_no_candidates"}
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if "text" in p).strip()
        if not text:
            return {"verdict": "ok", "reason": "validator_empty_text"}
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            # Sometimes the model adds prose around the JSON; pull the first {}
            start = text.find("{")
            end = text.rfind("}")
            if 0 <= start < end:
                try:
                    parsed = json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    return {"verdict": "ok", "reason": "validator_unparseable"}
            else:
                return {"verdict": "ok", "reason": "validator_unparseable"}
        verdict = str(parsed.get("verdict") or "ok").lower()
        if verdict == "issue":
            return {"verdict": "issue", "reason": str(parsed.get("reason") or "unspecified issue")}
        return {"verdict": "ok"}
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        logger.warning("validator: network %s", exc)
        return {"verdict": "ok", "reason": "validator_timeout"}
    except Exception as exc:  # noqa: BLE001
        logger.warning("validator: %s", exc)
        return {"verdict": "ok", "reason": "validator_exception"}

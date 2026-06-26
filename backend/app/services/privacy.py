"""
PII masking — applied at the API response layer so the data stored on disk
stays raw (CSV exports, internal queries, ops dashboards) while everything
visible in chat answers and downloadable PDF reports is masked.

Masking rule for Indian 10-digit mobiles:
  9876543210  ->  98****3210     (first 2 + last 4 visible)

Why this format:
  • Ops humans can still identify a customer at a glance ("ends in 3210"),
    so the chat answers stay actionable.
  • Middle 4 digits are hidden — enough to prevent shoulder-surfing a full
    number off someone's screen or out of a printed PDF.
  • Reversible only with access to the source data, never from the masked
    string alone.

Where this is applied:
  • Chat agent NotebookResponse — every table row whose column looks like a
    mobile gets masked before the response leaves the backend.
  • PDF report_builder — every table cell in a mobile column gets masked.

Where this is NOT applied:
  • The raw parquet / Postgres / CSV exports. Ops still needs to be able to
    call customers, which requires the full number.
  • run_python / run_duckdb_sql tool RESULTS inside the agent loop (the agent
    still sees raw numbers so it can group by mobile). Masking happens after
    the agent composes the final blocks.
"""
from __future__ import annotations

import re
from typing import Any

# Column names that contain a mobile / phone number, in any of the casings
# the LLM might emit. Match by lowercased, normalised name (alnum/underscore).
_MOBILE_COLUMN_HINTS = (
    "mobile",
    "phone",
    "mobile_number",
    "phone_number",
    "contact",
    "alternate_mobile",
    "alternate_number",
    "alt_mobile",
)


def _normalise_col_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def is_mobile_column(column_name: Any) -> bool:
    """True if the column likely contains a phone number worth masking."""
    norm = _normalise_col_name(column_name)
    if not norm:
        return False
    if norm in _MOBILE_COLUMN_HINTS:
        return True
    # Catch "Mobile.", "Customer Mobile", "Mobile (primary)" — anything that
    # ends with mobile or phone after normalisation
    for hint in _MOBILE_COLUMN_HINTS:
        if norm.endswith(f"_{hint}") or norm == hint:
            return True
    return False


def mask_mobile(value: Any) -> Any:
    """Mask a mobile/phone string to first-2 + last-4 with stars between.
    Pass-through for None / empty / non-digit-shaped values."""
    if value is None:
        return value
    s = str(value).strip()
    if not s:
        return s
    # Strip trailing .0 from float-cast, dashes, spaces, plus signs
    cleaned = re.sub(r"[^0-9]", "", s)
    if cleaned.endswith("0") and s.endswith(".0"):
        cleaned = cleaned[:-1]  # strip the dangling 0 from .0
    if len(cleaned) < 7:
        # Too short to mask meaningfully (e.g. landline, country code only) — return as-is
        return s
    if len(cleaned) <= 6:
        return s
    head = cleaned[:2]
    tail = cleaned[-4:]
    middle = "*" * max(2, len(cleaned) - 6)
    return f"{head}{middle}{tail}"


def mask_blocks_in_place(blocks: list[dict[str, Any]]) -> None:
    """Walk a NotebookResponse blocks list and mask any cell in any column
    that looks like a mobile. Mutates in place.

    Handles:
      • table blocks (columns + rows-of-lists)
      • report block sections that carry a table sub-object
      • text blocks: scrub any 10-digit-looking sequence that begins 6-9 (the
        Indian mobile prefix) — protects against the LLM dropping a full
        number into the prose narrative.
    """
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "table":
            _mask_table(block)
        elif btype == "report":
            for section in block.get("sections") or []:
                if isinstance(section, dict):
                    table = section.get("table")
                    if isinstance(table, dict):
                        _mask_table(table)
                    # Mask numbers in the section body text too
                    body = section.get("body")
                    if isinstance(body, str):
                        section["body"] = _mask_phone_in_text(body)
        elif btype == "text":
            content = block.get("content")
            if isinstance(content, str):
                block["content"] = _mask_phone_in_text(content)
        elif btype == "big_number":
            # The big_number "caption" sometimes carries a mobile when answering
            # "show me 9923400519" — scrub that too.
            for field in ("caption", "title", "value"):
                v = block.get(field)
                if isinstance(v, str):
                    block[field] = _mask_phone_in_text(v)


def _mask_table(block_or_table: dict[str, Any]) -> None:
    """Mask mobile columns inside a table block / table sub-object."""
    columns = block_or_table.get("columns") or []
    rows = block_or_table.get("rows") or []
    if not columns or not rows:
        return
    mobile_indices = [i for i, col in enumerate(columns) if is_mobile_column(col)]
    if not mobile_indices:
        return
    new_rows: list[list[Any]] = []
    for row in rows:
        if not isinstance(row, list):
            new_rows.append(row)
            continue
        masked_row = list(row)
        for idx in mobile_indices:
            if 0 <= idx < len(masked_row):
                masked_row[idx] = mask_mobile(masked_row[idx])
        new_rows.append(masked_row)
    block_or_table["rows"] = new_rows


_INDIAN_MOBILE_RE = re.compile(r"\b([6-9]\d{9})\b")


def _mask_phone_in_text(text: str) -> str:
    """Replace any standalone 10-digit Indian-mobile-looking sequence in text."""
    return _INDIAN_MOBILE_RE.sub(lambda m: mask_mobile(m.group(1)), text)

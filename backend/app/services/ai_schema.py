"""
.deepnote-inspired block schema for the notebook-style chat answers.

Every chat response is a list of these blocks. The frontend maps each
block to a renderer component. The schema intentionally mirrors the
public `@deepnote/blocks` TypeScript types — if the user later moves to
Deepnote Cloud, these responses are already compatible notebook cells.
"""
from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator


class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    content: str = ""  # markdown


class BigNumberBlock(BaseModel):
    type: Literal["big_number"] = "big_number"
    value: str                          # preformatted string ("Rs 8.44 Cr", "1,474")
    title: str | None = None            # "Active customers"
    caption: str | None = None          # "7.2% of base"
    accent: str | None = None           # hex colour hint for the card


class SqlBlock(BaseModel):
    type: Literal["sql"] = "sql"
    title: str | None = None
    query: str = ""
    row_count: int | None = None


class TableBlock(BaseModel):
    type: Literal["table"] = "table"
    title: str | None = None
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    caption: str | None = None

    @field_validator("rows", mode="before")
    @classmethod
    def _normalize_rows(cls, value: Any, info: Any) -> Any:
        """Gemini sometimes emits rows as list[dict] (keyed by column name)
        instead of list[list]. Normalize here so we never fail validation
        on a harmless shape mismatch — the columns order is the source of truth."""
        if not isinstance(value, list):
            return value
        if not value:
            return value
        # Already in list-of-list form
        if all(isinstance(r, (list, tuple)) for r in value):
            return [list(r) for r in value]
        # Convert list-of-dict using the columns the LLM declared
        if all(isinstance(r, dict) for r in value):
            columns = info.data.get("columns") or []
            if not columns:
                # Fallback: infer columns from first row
                columns = list(value[0].keys())
                info.data["columns"] = columns
            # For each row, map by column name case-insensitively + common aliases
            alias_map = {
                "name": ["name", "customer_name", "Name"],
                "mobile": ["mobile", "phone", "Mobile"],
                "area": ["area", "Area"],
                "hub": ["hub", "Hub"],
                "status": ["status", "subscription_status", "Status", "Sub. Status"],
                "revenue": ["revenue", "total_revenue", "Revenue", "Total Revenue"],
                "orders": ["orders", "total_orders", "Orders", "Total Orders"],
                "wallet": ["wallet", "wallet_balance", "Wallet", "Wallet Balance"],
                "effective_wallet": ["effective_wallet", "effective_wallet_balance", "Effective Wallet Balance"],
                "last_delivery": ["last_delivery", "Last Delivery"],
            }
            def _lookup(row: dict, col: str) -> Any:
                # Exact / case-insensitive
                if col in row:
                    return row[col]
                lc = col.lower().replace(" ", "_").replace(".", "")
                for k in row.keys():
                    if k.lower().replace(" ", "_").replace(".", "") == lc:
                        return row[k]
                # Try alias family
                for family, aliases in alias_map.items():
                    if lc.startswith(family) or family.startswith(lc):
                        for alias in aliases:
                            if alias in row:
                                return row[alias]
                return ""
            return [[_lookup(r, c) for c in columns] for r in value]
        return value


class ChartBlock(BaseModel):
    """Minimal chart spec. Frontend renders with ECharts (already bundled)."""
    type: Literal["chart"] = "chart"
    title: str | None = None
    variant: Literal["bar", "line", "pie", "scatter"] = "bar"
    x_label: str | None = None
    y_label: str | None = None
    data: list[dict[str, Any]] = Field(default_factory=list)  # e.g. [{"name": "Hadapsar", "value": 84}, ...]
    caption: str | None = None


class InputBlock(BaseModel):
    """Lets the agent suggest follow-up prompts as click-to-ask chips."""
    type: Literal["input"] = "input"
    title: str | None = None
    suggestions: list[str] = Field(default_factory=list)


class ImageBlock(BaseModel):
    """Raw PNG image (base64) — used for matplotlib / seaborn output from
    the E2B Python sandbox. Frontend renders via <img src="data:image/png;base64,...">.

    `png_base64` is optional because Gemini almost always OMITS it (base64 is
    huge and truncates the response). The backend auto-injects the actual PNG
    from the last run_python's output via the image-block backstop; any client-
    provided image block is either the correct data (rare) or an empty shell
    (common) that we replace."""
    type: Literal["image"] = "image"
    title: str | None = None
    png_base64: str | None = None
    caption: str | None = None


# Discriminated union — Pydantic picks the right block by `type` field.
Block = Annotated[
    Union[TextBlock, BigNumberBlock, SqlBlock, TableBlock, ChartBlock, InputBlock, ImageBlock],
    Field(discriminator="type"),
]


class NotebookMeta(BaseModel):
    data_date: str | None = None          # the snapshot date
    snapshot_id: str | None = None
    data_note: str | None = None
    customer_row_count: int | None = None
    customer_data_to: str | None = None
    customer_imported_at: str | None = None
    sales_row_count: int | None = None
    sales_data_from: str | None = None
    sales_data_to: str | None = None
    sales_uploaded_at: str | None = None
    tool_calls: list[str] = []            # names of tools the agent invoked
    gemini_model: str | None = None
    fallback_used: bool = False           # true if JSON parse failed and we fell back


class NotebookResponse(BaseModel):
    blocks: list[Block]
    meta: NotebookMeta = Field(default_factory=NotebookMeta)


# ----------------------------------------------------------------------
# JSON Schema emitted into the Gemini system prompt so the model knows
# exactly what shape to return.
# ----------------------------------------------------------------------
BLOCK_SCHEMA_HINT = """
Return a single JSON object with this exact shape:

{
  "blocks": [
    { "type": "big_number", "value": "1,474", "title": "Active customers", "caption": "7.2% of base", "accent": "#2fa65d" },
    { "type": "text", "content": "markdown narrative here" },
    { "type": "sql", "title": "Query run", "query": "SELECT ...", "row_count": 10 },
    { "type": "table", "title": "Top 10", "columns": ["Name","Mobile","Revenue"], "rows": [["X","9..",1000],...] },
    { "type": "chart", "title": "Wallet mix", "variant": "bar", "x_label": "bucket", "y_label": "customers", "data": [{"name":"Positive","value":2598},{"name":"Zero","value":17212},{"name":"Negative","value":240}] },
    // IMAGE BLOCKS ARE AUTO-INJECTED when run_python uses matplotlib — you
    // do NOT need to emit an image block yourself. Never include base64 in
    // your JSON; it's huge and will truncate your response.
    { "type": "input", "title": "Drill deeper", "suggestions": ["Show Kharadi only", "Compare with Hadapsar"] }
  ]
}

Rules:
- `type` is always required and exact: "text" | "big_number" | "sql" | "table" | "chart" | "image" | "input".
- TABLE `rows` MUST be an array of arrays (list of lists) parallel to `columns`, NOT an array of objects. Example: `"columns": ["Name","Mobile"], "rows": [["Alice","99..."],["Bob","98..."]]`. Objects will be auto-coerced but you cost retries by emitting them.
- Include a `big_number` block up front for any question that has a headline metric.
- Include a `sql` block showing the exact query that produced the numbers (from run_safe_sql, or describe the tool call you made).
- If you returned a list of customers / rows, include a `table` block.
  * CRITICAL — DO NOT emit more than 10 rows in `rows`. The backend AUTOMATICALLY rehydrates your table with the full set from the tool output. If you inline all 272 rows yourself, your JSON response will truncate mid-string and the user will see an error instead of the data.
  * If the user asks for a specific size such as top/best 50 customers, the tool output must contain all 50 rows; your final JSON table still previews only the first 10.
  * Put the first 10 rows from the tool result into `rows`, with `columns` in the same order.
  * Title the table honestly by the TOTAL count — e.g. "Customers with negative Effective Wallet Balance (272 matches)". NOT "Top 10 ..." because the backend is going to expand your preview into the full list.
- If the answer has a natural numeric distribution (status buckets, wallet buckets, hub splits), include a `chart` block.
- Always include one `text` block with 2-4 sentences of plain-English analysis. State the EXACT count in the text.
- End with an `input` block offering 2-3 follow-up questions.
- Use INR formatting with L / Cr (e.g. "Rs 2.45 L", "Rs 8.44 Cr") in every human-facing string.
- Never invent customers, mobiles, or numbers. Only use what the tools returned.
"""

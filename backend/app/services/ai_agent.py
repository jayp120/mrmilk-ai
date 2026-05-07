"""
Gemini function-calling orchestrator for the notebook-style chat.

This module exposes **two** public entry points:

  * `stream_agent()`  — async generator that yields events as they happen.
                         Use this for SSE endpoints so the UI can show the
                         tool log live, Deepnote-style.
  * `run_agent()`     — non-streaming convenience wrapper. Consumes the
                         same generator internally and returns the final
                         NotebookResponse. Kept for any callers that don't
                         want streaming.

Event types yielded by `stream_agent`:
  plan           → model is about to pick a tool or compose an answer
  model          → {"model": "gemini-2.5-pro"} (re-emitted when fallback kicks in)
  tool_call      → {"name": "area_stats", "args": {...}}
  tool_done      → {"name": "area_stats", "summary": "12 rows", "duration_ms": 340}
  retry          → schema validation failed, asking Gemini to fix JSON
  compose        → no more tool calls, Gemini is writing the final answer
  blocks         → final NotebookResponse payload (terminal)
  error          → unrecoverable error (terminal)
  done           → clean completion marker (always last)
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, AsyncIterator

import httpx
from pydantic import ValidationError

from ..config import get_settings
from . import ai_tools
from .ai_schema import (
    BLOCK_SCHEMA_HINT,
    ImageBlock,
    NotebookMeta,
    NotebookResponse,
    TextBlock,
)

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-2.5-pro"
FALLBACK_MODELS: list[str] = []  # Pro-only by user choice — fail loud on throttle, no silent flash downgrade.
MAX_TOOL_HOPS = 10
HTTP_TIMEOUT = 90.0



# ----------------------------------------------------------------------
# DYNAMIC MODE — Deepnote-style.
#
# We deliberately expose only 3 tools. The user wants the chat to *feel*
# like Deepnote: type anything, watch the AI write and run Python against
# the live data. Fixed-function "product_by_area / sales_trend / etc."
# tools were removed because they turn the chat into a bounded menu.
#
# Retained tools:
#   run_python      — PRIMARY. Full pandas sandbox (E2B) with both `df`
#                     (20,612 customer rows) and `sales_df` (361,094 sales
#                     rows) pre-loaded and joinable on `mobile`. This is
#                     the escape hatch that answers any analytical
#                     question via live Python.
#   run_safe_sql    — Fast SQL against the Supabase customer_records
#                     table. Kept because it's sub-second for simple
#                     aggregates Gemini would otherwise spend 15s
#                     spinning up a sandbox to compute.
#   lookup_customer — 10ms exact-mobile / fuzzy-name search. Kept purely
#                     as a shortcut; expressible in run_python too.
#
# Everything else (product breakdowns, trends, cohorts, churn,
# segmentation, ML, matplotlib, cross-table joins, distributions,
# percentiles, window functions, correlations, anything)
# → run_python with natural-language-translated pandas code.
# ----------------------------------------------------------------------
TOOL_DECLARATIONS = [
    {
        "name": "run_python",
        "description": (
            "PRIMARY TOOL. Full Python sandbox (pandas / numpy / sklearn / scipy / "
            "statsmodels / matplotlib) with the MrMilk data pre-loaded. Write whatever "
            "pandas code answers the question and print the result. This is your "
            "default — use it for ANY analytical question.\n\n"
            "PRE-LOADED VARIABLES:\n"
            "  df              — 20,612 customer master rows.\n"
            "                    cols: name, mobile, area, hub, status (subscription_status),\n"
            "                          revenue (lifetime), orders, wallet_balance,\n"
            "                          effective_wallet_balance (alias: effective_wallet),\n"
            "                          last_delivery, source, payment_mode, delivery_boy,\n"
            "                          current_consumption, note\n"
            "  sales_df        — 361,094 sales transactions (June 2025 → April 2026).\n"
            "                    cols: date, invoice_id, hub, delivery_boy, product_name,\n"
            "                          product_weight, customer_id, mobile (join to df),\n"
            "                          alternate_mobile, effective_wallet_balance,\n"
            "                          credit_limit, delivery_location, product_id,\n"
            "                          qty_delivered, qty_ordered, qty_cancelled,\n"
            "                          qty_disputed, qty_curdled, qty_net, delivery_status,\n"
            "                          product_price, tax_rate, discount_price, net_price,\n"
            "                          sub_total, total_tax, cancel_charge, delivery_boy_id,\n"
            "                          delivery_time, delivery_shift, subscription_id,\n"
            "                          subscription_type, name, street, area, sub_area,\n"
            "                          hub_id, state, invoice_date, delivery_id, created, note\n"
            "  sales_delivered — sales_df filtered to delivery_status=='delivered'.\n\n"
            "JOINS: merge sales_df/sales_delivered with df on 'mobile' to combine\n"
            "customer master attributes (status, wallet, hub) with transaction history.\n\n"
            "OUTPUT RULES:\n"
            "- Print your final numbers / tables to stdout — that's what the user sees.\n"
            "- For a table result, print JSON: `print(df_out.to_json(orient='records'))`.\n"
            "- CRITICAL — print the **FULL** filtered DataFrame, never a `.head(N)` of it. The user\n"
            "  must be able to scroll through every match in the UI and download all of them as CSV.\n"
            "  Wrong:  `print(df_out.head(10).to_json(orient='records'))`     ← truncates silently\n"
            "  Right:  `print(df_out.to_json(orient='records'))`              ← all 63 / 272 / etc.\n"
            "  The frontend handles row count: it shows the full count badge, lets the user scroll,\n"
            "  expand, and download every row. Your job is to PRINT every row to stdout.\n"
            "- Before you print, also print a row-count line: `print(f'TOTAL_ROWS: {len(df_out)}')`\n"
            "  so the rehydration backstop can verify nothing was lost in transit.\n"
            "- If the user asks for a specific list size (for example top/best 50 customers), the\n"
            "  filtered set must be exactly that size — sort/filter to that size, then print all of it.\n"
            "- For simple bar / pie / line charts over <20 buckets, describe the data in\n"
            "  stdout and emit a native `chart` block in the final JSON (bar/pie/line/scatter)\n"
            "  — ECharts renders it natively.\n"
            "- For scatter, heatmap, regression, or any custom plot, USE matplotlib + plt.show().\n"
            "  The backend captures the PNG and auto-injects it as an image block.\n"
            "  DO NOT include the base64 PNG in your JSON — it's huge and will truncate.\n"
            "- Always include the EXACT count in the text block (e.g. 'Found 272 matches').\n\n"
            "RECONCILIATION (MANDATORY FOR ACCURACY):\n"
            "Every analytical answer must compute the headline number TWO independent ways and\n"
            "verify they match. Print both with a clear marker and an assert. Examples:\n"
            "  # Headline:\n"
            "  total_a = df_filtered['revenue'].sum()\n"
            "  # Reconciliation via a second path (e.g. groupby then sum, or join-then-sum):\n"
            "  total_b = df_filtered.groupby('hub')['revenue'].sum().sum()\n"
            "  print(f'RECONCILE: path_a={total_a:.2f}  path_b={total_b:.2f}  delta={abs(total_a-total_b):.4f}')\n"
            "  assert abs(total_a - total_b) < 0.01, 'reconciliation failed — investigate before answering'\n"
            "If the asserts fails, DO NOT answer with a number — re-think the filter / join / dedup and\n"
            "run again. Common reconciliation paths: (1) sum of groupby == grand sum, (2) row count\n"
            "matches len(df_filtered), (3) join doesn't inflate counts (check before/after row count),\n"
            "(4) date range covers what the user asked, (5) dedup on mobile when counting customers."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute. df + sales_df + sales_delivered are pre-loaded.",
                },
            },
            "required": ["code"],
        },
    },
    {
        "name": "run_safe_sql",
        "description": (
            "Fast read-only SELECT against the Supabase customer_records table "
            "(20,612 rows). Use for sub-second customer aggregates (counts by status, "
            "area, hub, wallet buckets) when you don't need sales data. Single statement, "
            "LIMIT capped. For anything that involves sales history, use run_python instead."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Single SELECT statement."}},
            "required": ["query"],
        },
    },
    {
        "name": "lookup_customer",
        "description": (
            "Fast direct lookup of a specific customer by mobile digits or fuzzy name. "
            "Use only when the user names one customer ('find 9923400519', 'show Rupesh Patil'). "
            "For any aggregate question, use run_python."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Mobile digits or partial name."}},
            "required": ["query"],
        },
    },
    {
        "name": "find_match",
        "description": (
            "Vector-embedding fuzzy matcher. Translates a user's loose / typo'd / partial "
            "text to the EXACT known value of a categorical column (product_name, area, hub, "
            "subscription_status). ALWAYS call this BEFORE writing a pandas filter on a "
            "text value if the user's input isn't already an exact known value listed in "
            "KNOWN VALUES. Returns top 3 matches with confidence scores in [0, 1].\n\n"
            "Examples:\n"
            "  find_match(query='ghee 1L', type='product')     → 'Desi Cow Ghee 1000 ml' (0.94)\n"
            "  find_match(query='wakkad', type='area')         → 'Wakad' (0.91)\n"
            "  find_match(query='city hub', type='hub')        → 'Pune City Hub' (0.92)\n"
            "  find_match(query='kothrood', type='area')       → 'Kothrud' (0.89)\n\n"
            "If top_score >= 0.78 the match is high-confidence — use it directly. If lower, "
            "show the user the top 3 matches and ask which one they meant."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Fuzzy / typo'd / partial user text."},
                "type": {"type": "string", "description": "'product' | 'area' | 'hub' | 'subscription_status'"},
                "top_k": {"type": "integer", "description": "How many matches to return (default 3)."},
            },
            "required": ["query", "type"],
        },
    },
]


TOOL_DISPATCH = {
    "run_python": ai_tools.run_python,
    "run_safe_sql": ai_tools.run_safe_sql,
    "lookup_customer": ai_tools.lookup_customer,
    "find_match": ai_tools.find_match,
}


PERSONA_PROMPT = """You are Mr. Milk AI — a senior growth + operations analyst for Mittal Dairy Farms (Pune).

Brand: Mr. Milk is a premium A2 desi cow milk brand serving Pune and PCMC. Own farm, Gir + Sahiwal cows, app-based subscriptions via MilkMaster. You know the city — Hadapsar, Kharadi, Wakad, Aundh, Koregaon Park, Sinhgad Road, Bibwewadi, Chinchwad, Pimpri, Baner, Bavdhan, Kothrud, NIBM, Viman Nagar.

Ethics (non-negotiable):
- Never recommend discounts, price cuts, cashback, or buy-more-save-more framing.
- The only acquisition offer allowed is first-time 7L trial pack (pay for 6L, get 1L extra).
- Retention is service-led: wallet guidance, restart scheduling, premium reassurance.

YOUR APPROACH — DYNAMIC, DEEPNOTE-STYLE:
For ANY analytical question the user asks, the default and correct move is:
  1. Call `run_python` with pandas code that answers the question using df + sales_df.
  2. Print the answer (numbers, tables, chart data) to stdout.
  3. Compose the structured-block JSON response from what your Python printed.

This is how Deepnote feels — the AI writes and executes live code for every question. No bounded menu of canned functions.

ACCURACY PROTOCOL (non-negotiable — accuracy is the product):
Wrong numbers destroy trust. Every analytical answer must pass these checks INSIDE run_python
before you compose the final JSON. If any check fails, re-run with a fix; do not answer until it passes.

  1. EXACT VALUES — Never invent a category, status, area, hub, or product name. If the user's
     wording isn't already in KNOWN VALUES, call `find_match` first. If find_match's top score
     is < 0.78, ask the user to confirm before computing — do NOT guess.
  2. RECONCILE THE HEADLINE — Compute the headline number TWO independent ways inside the same
     run_python call and assert they match (see run_python OUTPUT RULES). Examples of independent
     paths: groupby-then-sum vs. raw sum; row count of filter vs. nunique of mobile; pre-join
     vs. post-join row count. Print both with a `RECONCILE:` label so a human can verify.
  3. JOIN DISCIPLINE — When merging df with sales_df on `mobile`, ALWAYS check the row count
     before/after the merge (`how='inner'` vs `how='left'`) and report any inflation. Many
     "wrong" answers come from accidental row multiplication on a non-unique join key.
  4. DEDUP DISCIPLINE — When counting CUSTOMERS, always `nunique('mobile')`, never `len(df)`.
     When counting ORDERS, use `nunique('invoice_id')` — sales_df has line items, not orders.
  5. NULL DISCIPLINE — Filters on string columns must handle NaN (`.fillna('')` or `.dropna()`)
     because pandas filters silently drop NaN rows AND NaN comparisons return False.
  6. DATE RANGE — Sales data is Jun 2025 → Apr 2026. If the user asks for "last 30 days" or
     "this month", reference `sales_df['date'].max()` as "today", not the real calendar date.
     Always print the actual date range used.
  7. WALLET FIELD — Default to `effective_wallet_balance`. Only use `wallet_balance` if the
     user explicitly says "spend wallet". When the answer hinges on wallet, surface BOTH counts
     so the user can reconcile.
  8. STATUS FIELD — Use the exact MilkMaster labels from KNOWN VALUES verbatim. "active" alone
     is ambiguous (could mean Active Subscription OR Active No Subscription) — ask the user
     which they meant if it's not specified, or report both.
  9. EMPTY-RESULT HONESTY — If the filtered set is empty, say so plainly. Never paper over
     a zero with a generic answer.
 10. NO PRE-SUMMARISATION — Print all rows the user asked for (top 50 = 50 records in stdout).
     The frontend table previews 10; the backend rehydrates from your stdout. If you only print
     10, the user gets 10 even when they asked for 50.

When to use the other tools:
- `find_match` — call this FIRST whenever the user types a fuzzy / typo'd / partial value
  for a product, area, hub, or status that isn't already an exact match in KNOWN VALUES below.
  Examples: 'ghee 1L', 'wakkad', 'kothrood', 'milk', 'city hub'. find_match returns the
  canonical value with a confidence score. If top_score >= 0.78, treat the match as exact
  and pass it to run_python verbatim. If lower, ask the user to clarify between the top 3.
- `run_safe_sql` — only for simple customer-master aggregates where SQL is tangibly faster
  (e.g. "how many active subscriptions"). If the question touches sales / products /
  time-series / joins, use run_python.
- `lookup_customer` — only when the user names ONE specific customer by mobile or name.

DATA YOU HAVE ACCESS TO:
1. **Customer master** (20,612 rows) — Supabase. Lifetime revenue/orders/wallet, subscription status, hub/area.
2. **Sales transactions** (361,094 rows, June 2025 → April 2026) — disk Parquet. Every delivered line item with product_name, qty, price, date, area, hub. Join key to customers: `mobile`.

Both are pre-loaded in run_python as `df` and `sales_df` (and `sales_delivered` = delivered-only).

WALLET FIELD SEMANTICS (accuracy-critical):
- Two wallet columns. They can differ by 50-100+ customers.
- `wallet_balance` = raw spend balance.
- `effective_wallet_balance` (alias `effective_wallet`) = business-facing balance after credits/refunds.
- If user says "effective balance / effective wallet" OR doesn't specify → use `effective_wallet_balance`.
- If user explicitly says "spend wallet" → use `wallet_balance`.
- When numbers are ambiguous, surface BOTH in the text block so the user can reconcile.

RESPONSE FORMAT:
- Your final reply MUST be a valid JSON object matching the block schema. No prose outside the JSON.
- Use INR formatting with L / Cr in human-facing strings: "Rs 8.44 Cr", "Rs 2,45,000".
- Use MilkMaster status labels verbatim: "Active Subscription", "Active No Subscription", "Inactive", "Inactive No Order", "Inactive No Subscription", "Suspended", "Suspended Low Balance", "Trial Running", "Trial Ended", "Trial Not Converted", "New Customer", "On Vacation".
- Never invent customers, mobiles, or numbers. If the tool returned nothing, say so.
- Always include the EXACT total count in the big_number / text / table title.
- Table rows: keep the first 10 in your final JSON; the backend rehydrates to the full set from tool output. For top/best N customer requests, make sure run_python prints all N rows as JSON records before composing the final answer.

PLAN-FIRST FOR COMPLEX QUESTIONS (mandatory):
A question is "complex" when it has 2+ filter dimensions, a join between df and sales_df, a time-series, or a multi-step computation (cohorts, funnels, percentiles, growth rates). For these, your FIRST run_python call MUST start with a `# PLAN:` comment block. The plan is numbered steps PLUS an explicit `# Reconcile:` line stating how the headline number will be verified. The frontend extracts and displays this plan inline above the code, Deepnote-style. Example plan header for "which Active Subscription customers in Kharadi bought ghee in the last 30 days?":

```python
# PLAN:
# 1. Use find_match if needed to canonicalise 'ghee' and 'Kharadi'
# 2. Filter df to status=='Active Subscription' and area=='Kharadi' → eligible customers
# 3. Filter sales_delivered to product_name in ghee variants AND date >= max(date)-30d
# 4. Inner-join on 'mobile' between (2) and (3) → answer set
# 5. Print row count before & after join (catch inflation)
# 6. Output: count = nunique('mobile'), top 10 by sub_total, full JSON table for the user
# Reconcile: total_revenue == sum-of-groupby-by-area; assert |path_a - path_b| < 0.01.
import pandas as pd
...
```

For SIMPLE questions (one filter, one count, one lookup), no plan needed — just execute directly.
But the RECONCILIATION assertion still applies: every numeric answer must be verified two ways
inside the same run_python call before you compose the final JSON.

EXEMPLAR ANSWERS — match this style/depth/structure for every reply:

Example A — simple count
USER: "how many active subscription customers do we have?"
TOOL: run_safe_sql("SELECT COUNT(*) FROM customer_records WHERE subscription_status='Active Subscription' AND dataset_snapshot_id=...")
ANSWER: blocks=[
  big_number(value="1,474", title="Active Subscription customers", caption="7.2% of 20,612 base", accent="#2fa65d"),
  text("There are 1,474 customers on an Active Subscription right now — 7.2% of the 20,612 customer base. This is the only subscription status that's recurring revenue."),
  input(suggestions=["Compare with Inactive", "Show top 10 by lifetime revenue", "Break down by hub"])
]

Example B — fuzzy match + filter
USER: "sales of ghee 1L by area"
TOOLS: find_match(query='ghee 1L', type='product') → 'Desi Cow Ghee 1000 ml' (0.79); run_python(...)
ANSWER: blocks=[
  big_number(value="Rs 15.51 L", title="Total Desi Cow Ghee 1000 ml revenue", caption="across 94 areas, Jun 2025 → Apr 2026"),
  text("**Desi Cow Ghee 1000 ml** generated **Rs 15.51 L** total. Sahakar Nagar leads (Rs 84,000), followed by Hadapsar (Rs 67,200) and Kothrud (Rs 61,500)."),
  table(title="Ghee 1L sales by area (94 matches)", columns=["Area","Revenue","Units","Customers"], rows=[["Sahakar Nagar","Rs 84,000",480,42], ...]),
  chart(variant="bar", title="Top 10 areas — Ghee 1L revenue", data=[{"name":"Sahakar Nagar","value":84000}, ...]),
  input(suggestions=["Show 500ml Ghee comparison", "Trend by month", "Top customers buying ghee"])
]

Example C — multi-filter (PLAN required)
USER: "which Active Subscription customers in Hadapsar have negative effective wallet?"
PLAN+CODE in run_python:
  # PLAN:
  # 1. Filter df to status='Active Subscription' AND area='Hadapsar'
  # 2. Of those, keep ones with effective_wallet_balance < 0
  # 3. Sort by effective_wallet_balance asc (most negative first)
  # 4. Output: count + full row set
ANSWER: blocks=[
  big_number(value="11", title="At-risk Hadapsar customers", caption="Active subscription with negative effective wallet"),
  text("**11 Active Subscription customers in Hadapsar** have a negative Effective Wallet Balance. Combined exposure is Rs -7,940. The most negative is Vikas Sharma at Rs -2,180. These need a same-day call to top up the wallet — they're hours from auto-suspension."),
  table(title="At-risk customers in Hadapsar (11 matches)", columns=["Name","Mobile","Effective Wallet","Lifetime Revenue"], rows=[...11 rows truncated to 10 in JSON...]),
  input(suggestions=["Same view for Kharadi", "Top-up history of these 11", "Predict next month at-risk"])
]

Example D — ambiguous fuzzy match
USER: "milk sales"
TOOL: find_match(query='milk', type='product') → top match 'Mr. Milk Cap' (0.69, low-confidence)
ANSWER: blocks=[
  text("I'm not sure which 'milk' you mean — the top semantic matches are Mr. Milk merchandise, not the actual A2 milk product. The most likely product is **Desi Cow A2 Milk** but I want to confirm."),
  input(title="Pick which one:", suggestions=["Desi Cow A2 Milk sales", "Mr. Milk Cap (merchandise) sales", "Show all products with 'milk' in name"])
]

Example E — time series with chart
USER: "monthly ghee revenue trend"
TOOLS: find_match → 'Desi Cow Ghee 1000 ml'; run_python (with PLAN)
ANSWER: blocks=[
  big_number(value="Rs 15.51 L", title="Total Ghee revenue (11 months)", caption="Jun 2025 → Apr 2026"),
  text("Monthly ghee revenue ranged from Rs 1.08 L (Sep 2025) to Rs 1.85 L (Mar 2026). The +25% lift after Diwali (Oct-Nov) is consistent with festival cooking demand."),
  chart(variant="line", title="Monthly Desi Cow Ghee 1000 ml revenue", x_label="Month", y_label="Revenue (INR)", data=[{"name":"2025-06","value":141200}, ...]),
  table(title="Monthly breakdown (11 months)", columns=["Month","Revenue","Units","Unique customers"], rows=[...]),
  input(suggestions=["Compare with 500ml ghee", "Forecast next 3 months", "Top 10 ghee buyers"])
]

Example F — single customer lookup
USER: "show me 9923400519"
TOOL: lookup_customer(query='9923400519')
ANSWER: blocks=[
  big_number(value="Rs 2,39,024", title="Rupesh Patil — lifetime revenue", caption="Koregaon Park · Status: Suspended"),
  text("**Rupesh co Neha Patil** (9923400519) — Koregaon Park, Pune City Hub. Lifetime: Rs 2,39,024 across 514 orders. Status: **Suspended**. Effective wallet: Rs -12,900 (negative). This is a top-20 lifetime customer who's currently suspended — high priority for a personal call from the founder/team."),
  input(suggestions=["Show their purchase history", "Other suspended top-20 customers", "Pune City Hub at-risk customers"])
]

Example G — empty result honest
USER: "customers buying mango"
TOOLS: find_match(query='mango', type='product') → low-confidence; run_python returns 0 rows
ANSWER: blocks=[
  text("I checked and there are **no customers buying mango products** in the sales history. Mr. Milk's product line is Desi Cow A2 dairy: A2 Milk, Ghee (500ml/1000ml), Paneer, Dahi, Buttermilk. There's no mango category in the catalog."),
  input(suggestions=["Show top dairy products by revenue", "List the full product catalog"])
]

Example H — hub aggregate
USER: "revenue by hub"
TOOL: run_python (simple groupby)
ANSWER: blocks=[
  big_number(value="Rs 8.44 Cr", title="Total revenue across 7 hubs", caption="lifetime, all customers"),
  text("**Pune City Hub** carries 77% of revenue (Rs 6.53 Cr from 11,964 customers). Chinchwad Hub is the only other meaningful hub at Rs 1.90 Cr. The 'No Hub Assigned' bucket (4,407 customers) is operationally concerning — Rs 44k revenue from that segment suggests these are stale or never-onboarded accounts."),
  chart(variant="bar", title="Revenue by hub", data=[{"name":"Pune City","value":65311846},{"name":"Chinchwad","value":19041539},...]),
  table(title="Hub performance (7 hubs)", columns=["Hub","Customers","Revenue","Avg revenue/cust"], rows=[...]),
  input(suggestions=["No-Hub-Assigned audit", "Talegaon hub deep dive", "Compare hub-level conversion"])
]

Style rules from these examples:
- Always one big_number first when there's a headline figure.
- The text block has 2-3 sentences — number first, then ONE insight or implication, then optionally next-step framing. Bold the key number.
- Table title shows "(N matches)" with the EXACT count, even when JSON is truncated to 10 rows.
- Chart only when the data has a natural distribution. Don't force a chart on a single-value answer.
- input suggestions must be data-driven follow-ups, not generic ("Show another area" — bad; "Compare with Wakad" — good when Wakad is the next-largest area).
- Premium-brand voice: "needs a same-day call from the founder/team" not "send them a discount". Never violate the no-discounts ethics.

""" + BLOCK_SCHEMA_HINT



# ----------------------------------------------------------------------
# HTTP + parsing helpers
# ----------------------------------------------------------------------
async def _gemini_call(model: str, api_key: str, contents: list[dict], system_instruction: str | None = None) -> dict:
    body = {
        "systemInstruction": {"parts": [{"text": system_instruction or PERSONA_PROMPT}]},
        "contents": contents,
        "tools": [{"functionDeclarations": TOOL_DECLARATIONS}],
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192,
            "responseMimeType": "text/plain",
        },
    }
    url = f"{GEMINI_BASE}/{model}:generateContent?key={api_key}"
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        r = await client.post(url, json=body)
    data = r.json()
    if not r.is_success:
        raise RuntimeError(data.get("error", {}).get("message") or f"Gemini HTTP {r.status_code}")
    return data


def _extract_candidate(data: dict) -> dict | None:
    candidates = data.get("candidates") or []
    return candidates[0] if candidates else None


def _extract_function_calls(candidate: dict) -> list[dict]:
    parts = (candidate.get("content") or {}).get("parts") or []
    return [p["functionCall"] for p in parts if "functionCall" in p]


def _extract_text(candidate: dict) -> str:
    parts = (candidate.get("content") or {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts if "text" in p).strip()


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _coerce_json_record_rows(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list) and value and all(isinstance(row, dict) for row in value):
        return value
    if isinstance(value, dict):
        for key in ("rows", "records", "customers", "data", "matches"):
            rows = value.get(key)
            if isinstance(rows, list) and rows and all(isinstance(row, dict) for row in rows):
                return rows
    return []


def _extract_json_record_rows(text: str) -> list[dict[str, Any]]:
    """Pull the largest list[dict] JSON payload out of tool text.

    run_python prints setup lines before user stdout, so stdout is rarely a
    single clean JSON value. We scan lines and embedded JSON spans, then keep
    the largest records list. This lets the notebook UI download the complete
    table even when Gemini only emits a 10-row preview in the final schema.
    """
    if not text:
        return []

    candidates: list[list[dict[str, Any]]] = []
    for line in reversed(text.splitlines()):
        stripped = line.strip()
        if not stripped or stripped[0] not in "[{":
            continue
        try:
            rows = _coerce_json_record_rows(json.loads(stripped))
        except json.JSONDecodeError:
            continue
        if rows:
            candidates.append(rows)

    decoder = json.JSONDecoder()
    for start, char in enumerate(text):
        if char not in "[{":
            continue
        try:
            value, _end = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue
        rows = _coerce_json_record_rows(value)
        if rows:
            candidates.append(rows)

    return max(candidates, key=len, default=[])


def _extract_bulk_rows_from_tool_result(name: str, result: dict) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    for key in ("rows", "matches", "worst_negative"):
        rows = result.get(key)
        if isinstance(rows, list) and rows and all(isinstance(row, dict) for row in rows):
            return rows
    if name == "run_python":
        for key in ("stdout", "result_text"):
            rows = _extract_json_record_rows(str(result.get(key) or ""))
            if rows:
                return rows
    return []


def _summarise_tool_result(name: str, result: dict) -> str:
    """Compact human-readable summary for the tool_done event."""
    if not isinstance(result, dict):
        return "ok"
    # Only treat as an error if the 'error' value is truthy — some tools set
    # error=None to mean "no error" in their response envelope.
    if result.get("error"):
        return f"error: {result.get('error')}"
    # run_python special case — surface a meaningful summary, NOT noise.
    # Strategy:
    #   1. If the tool itself errored (sandbox crash, etc.), say so.
    #   2. Otherwise look at the LAST non-empty stdout line — that's almost
    #      always the actual final answer (a JSON dump, a number, or
    #      a print statement). The first line is often a diagnostic
    #      ("sales_df loaded...") that misleads the LLM into thinking
    #      the run failed.
    if name == "run_python":
        stdout = (result.get("stdout") or "").strip()
        if not stdout:
            return f"ran on {result.get('row_count_input',0):,} rows"
        lines = [ln for ln in stdout.splitlines() if ln.strip()]
        if not lines:
            return f"ran on {result.get('row_count_input',0):,} rows"
        last = lines[-1].strip()
        # If the last line is itself JSON, just say "produced N records"
        if last.startswith("[") and last.endswith("]"):
            try:
                import json as _json
                arr = _json.loads(last)
                if isinstance(arr, list):
                    return f"ran on {result.get('row_count_input',0):,} rows -> produced {len(arr):,} records"
            except Exception:  # noqa: BLE001
                pass
        # Otherwise show the truncated last line
        truncated = last[:100] + ("…" if len(last) > 100 else "")
        return f"ran on {result.get('row_count_input',0):,} rows -> {truncated}"
    # Common shapes
    if "count" in result:
        return f"{int(result['count']):,} rows"
    if "matches" in result:
        return f"{len(result['matches'])} match(es)"
    if "rows" in result and isinstance(result["rows"], list):
        return f"{len(result['rows'])} rows"
    if "buckets" in result and isinstance(result["buckets"], dict):
        total = result.get("total", sum(result["buckets"].values()))
        return f"{int(total):,} customers across {len(result['buckets'])} buckets"
    if "hubs" in result and isinstance(result["hubs"], list):
        return f"{len(result['hubs'])} hubs"
    if name == "wallet_analysis":
        p, z, n = result.get("positive_count", 0), result.get("zero_count", 0), result.get("negative_count", 0)
        return f"positive={p}, zero={z}, negative={n}"
    if name == "trial_funnel":
        return f"running={result.get('running',0)}, ended={result.get('ended',0)}, not_conv={result.get('not_converted',0)}"
    return "ok"


# ----------------------------------------------------------------------
# Streaming orchestrator — public entry point for SSE endpoints
# ----------------------------------------------------------------------
async def stream_agent(
    session,
    question: str,
    history: list[dict] | None = None,
    model: str | None = None,
) -> AsyncIterator[dict]:
    """Yield events as the agent runs. Always yields a terminal `done` event."""
    settings = get_settings()
    data_coverage = _safe_data_coverage(session)
    api_key = settings.gemini_api_key
    if not api_key:
        yield {"event": "blocks", "data": _text_only_response(
            "Gemini API key is not configured on the backend. Set GEMINI_API_KEY in backend/.env.",
            model=model or DEFAULT_MODEL,
            coverage=data_coverage,
        ).model_dump()}
        yield {"event": "done", "data": None}
        return

    chosen_model = (model or DEFAULT_MODEL).strip()

    # Build a dynamic system instruction with live schema summary appended.
    # This gives Gemini the actual values present in the data (areas, hubs,
    # products, statuses) so it picks correct strings instead of guessing.
    try:
        from .data_summary import get_rendered as _get_schema
        schema_prompt_text, _ = _get_schema(session)
    except Exception:  # noqa: BLE001
        schema_prompt_text = ""
    system_parts = [PERSONA_PROMPT]
    if schema_prompt_text:
        system_parts.append(schema_prompt_text)
    if data_coverage.get("prompt_text"):
        system_parts.append(str(data_coverage["prompt_text"]))
    system_instruction = "\n\n".join(system_parts)

    contents: list[dict] = []
    for m in history or []:
        role = "model" if m.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": str(m.get("content", ""))}]})
    contents.append({"role": "user", "parts": [{"text": question}]})

    tool_calls_made: list[str] = []
    active_model = chosen_model

    # Backstop for LLM row-truncation: whenever a bulk tool returns a sizeable
    # rows list, remember it here. After the final JSON is parsed, any table
    # with fewer rows than we know the tool returned gets rehydrated from this
    # cache. This is the only reliable way to get Gemini to stop silently
    # pre-summarising tables to "Top 10".
    bulk_rows_cache: dict[str, Any] = {"rows": None, "count": 0, "tool": None, "columns_hint": None}

    # Backstop for matplotlib PNGs — if run_python returns a chart_png_base64
    # but Gemini forgets to emit an image block, we'll inject one.
    last_python_png: dict[str, Any] = {"png": None, "title": None}

    yield {"event": "plan", "data": f"Grounding against the live Supabase snapshot. Planning with {chosen_model}..."}

    async def call_with_fallback(current_contents: list[dict]):
        nonlocal active_model
        last_err: Exception | None = None
        retryable = ("overloaded", "high demand", "429", "503",
                     "quota", "exceeded", "rate limit", "resource_exhausted")
        for candidate_model in [active_model, *[m for m in FALLBACK_MODELS if m != active_model]]:
            try:
                data = await _gemini_call(candidate_model, api_key, current_contents, system_instruction=system_instruction)
                if candidate_model != active_model:
                    active_model = candidate_model
                return data, candidate_model
            except Exception as exc:  # noqa: BLE001
                msg = str(exc).lower()
                if any(k in msg for k in retryable):
                    last_err = exc
                    logger.warning("Model %s throttled (%s), trying next fallback", candidate_model, msg[:140])
                    continue
                raise
        raise last_err or RuntimeError("All Gemini models exhausted")

    yield {"event": "model", "data": {"model": active_model}}

    for hop in range(MAX_TOOL_HOPS):
        try:
            data, used_model = await call_with_fallback(contents)
            if used_model != active_model:
                yield {"event": "model", "data": {"model": used_model, "reason": "fallback"}}
        except Exception as exc:
            logger.exception("Gemini call failed")
            yield {"event": "blocks", "data": _text_only_response(
                f"Gemini error: {exc}", model=active_model, tool_calls=tool_calls_made, coverage=data_coverage,
            ).model_dump()}
            yield {"event": "done", "data": None}
            return

        candidate = _extract_candidate(data)
        if not candidate:
            yield {"event": "blocks", "data": _text_only_response(
                "Gemini returned no candidate.", model=active_model, tool_calls=tool_calls_made, coverage=data_coverage,
            ).model_dump()}
            yield {"event": "done", "data": None}
            return

        fn_calls = _extract_function_calls(candidate)
        if fn_calls:
            # Preserve the model's turn verbatim (including any thoughtSignature
            # fields Gemini 2.5 attaches to function-call parts — stripping them
            # triggers "Function call is missing a thought_signature").
            contents.append(candidate["content"])

            # Gemini 2.5 expects ALL functionResponses for one assistant turn to
            # come back as parts of a SINGLE user turn. Previously we emitted
            # one user turn per call, which broke thought-chain integrity.
            response_parts = []
            for call in fn_calls:
                name = call.get("name", "")
                args = call.get("args") or {}
                tool_calls_made.append(name)
                yield {"event": "tool_call", "data": {"name": name, "args": args}}

                started = time.perf_counter()
                result = await asyncio.to_thread(_execute_tool, session, name, args)
                duration_ms = int((time.perf_counter() - started) * 1000)

                # Capture the full rows list whenever a bulk tool returns one.
                # Used for the table-rehydration backstop below.
                rows_for_cache = _extract_bulk_rows_from_tool_result(name, result)
                if rows_for_cache and len(rows_for_cache) >= bulk_rows_cache["count"]:
                    bulk_rows_cache.update({
                        "rows": rows_for_cache,
                        "count": len(rows_for_cache),
                        "tool": name,
                    })

                # Capture matplotlib PNG for the image-block backstop
                if name == "run_python" and isinstance(result, dict):
                    png = result.get("chart_png_base64")
                    if png:
                        last_python_png["png"] = png
                        last_python_png["title"] = "Python visualization"

                yield {"event": "tool_done", "data": {
                    "name": name,
                    "summary": _summarise_tool_result(name, result),
                    "duration_ms": duration_ms,
                }}

                response_parts.append({
                    "functionResponse": {"name": name, "response": {"result": result}},
                })

            contents.append({"role": "user", "parts": response_parts})
            continue  # loop: Gemini sees all tool results, may call more tools

        # No function call → final textual answer.
        yield {"event": "compose", "data": "Composing the final answer..."}
        text_out = _extract_text(candidate)
        parsed = _extract_json_object(text_out)

        if parsed is not None:
            try:
                nb = NotebookResponse.model_validate(parsed)
                nb.meta = _make_meta(
                    model=active_model,
                    tool_calls=tool_calls_made,
                    coverage=data_coverage,
                    fallback=False,
                )
                _rehydrate_truncated_tables(nb, bulk_rows_cache)
                _ensure_image_block(nb, last_python_png)
                yield {"event": "blocks", "data": nb.model_dump()}
                yield {"event": "done", "data": None}
                return
            except ValidationError as exc:
                logger.warning("Block JSON validation failed: %s", exc)

        if hop < MAX_TOOL_HOPS - 1:
            yield {"event": "retry", "data": "Schema was invalid. Asking Gemini to reformat as strict JSON."}
            contents.append(candidate["content"] if candidate.get("content") else {"role": "model", "parts": [{"text": text_out}]})
            contents.append({
                "role": "user",
                "parts": [{"text": "That response was not valid JSON matching the block schema. Reply with ONLY the JSON object — no prose, no code fences. Same information, correct schema."}],
            })
            continue

        # Give up: wrap text in a fallback block.
        yield {"event": "blocks", "data": _text_only_response(
            text_out or "No answer produced.",
            model=active_model,
            tool_calls=tool_calls_made,
            fallback=True,
            coverage=data_coverage,
        ).model_dump()}
        yield {"event": "done", "data": None}
        return

    yield {"event": "blocks", "data": _text_only_response(
        "Agent exceeded tool hop limit without producing a final answer.",
        model=active_model, tool_calls=tool_calls_made, fallback=True, coverage=data_coverage,
    ).model_dump()}
    yield {"event": "done", "data": None}


# ----------------------------------------------------------------------
# Non-streaming convenience wrapper (kept for callers that don't stream)
# ----------------------------------------------------------------------
async def run_agent(
    session,
    question: str,
    history: list[dict] | None = None,
    model: str | None = None,
) -> NotebookResponse:
    final: NotebookResponse | None = None
    async for event in stream_agent(session, question, history, model):
        if event["event"] == "blocks":
            final = NotebookResponse.model_validate(event["data"])
    if final is None:
        final = _text_only_response("Agent finished without producing an answer.", model=model or DEFAULT_MODEL, fallback=True)
    return final


# ----------------------------------------------------------------------
# Tool executor
# ----------------------------------------------------------------------
def _execute_tool(session, name: str, args: dict) -> dict:
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return {"error": "unknown_tool", "detail": name}
    try:
        return fn(session, **args)
    except TypeError as exc:
        return {"error": "bad_arguments", "detail": str(exc)}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tool %s crashed", name)
        return {"error": "tool_exception", "detail": str(exc)}


def _rehydrate_truncated_tables(nb: NotebookResponse, bulk_cache: dict) -> None:
    """If the LLM pre-truncated a table to fewer rows than the bulk tool actually
    returned, swap in the full rows list. Gemini 2.x has a strong bias toward
    "Top 10" summaries even when told not to — this is a deterministic backstop.

    Columns are preserved from the LLM's chosen layout; we just map the bulk
    row dicts into parallel arrays matching those columns.
    """
    full_rows: list[dict] | None = bulk_cache.get("rows")
    full_count: int = bulk_cache.get("count") or 0
    if not full_rows or full_count <= 0:
        return

    # Heuristic: match common field names between columns and row dicts.
    def coerce_value(row_dict: dict, col: str) -> Any:
        def norm(value: str) -> str:
            return re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")

        k = norm(col)
        if k in row_dict:
            return row_dict[k]
        normalized_keys = {norm(key): key for key in row_dict.keys()}
        if k in normalized_keys:
            return row_dict[normalized_keys[k]]
        # common aliases
        aliases = {
            "name": ["name", "customer_name"],
            "mobile": ["mobile", "phone"],
            "area": ["area"],
            "hub": ["hub"],
            "status": ["status", "subscription_status", "sub._status"],
            "revenue": ["revenue", "total_revenue"],
            "orders": ["orders", "total_orders"],
            "wallet": ["wallet_balance"],
            "wallet_balance": ["wallet_balance"],
            "effective_wallet": ["effective_wallet_balance"],
            "effective_wallet_balance": ["effective_wallet_balance"],
            "last_delivery": ["last_delivery"],
            "source": ["source"],
            "product": ["product_name", "product"],
            "product_name": ["product_name", "product"],
            "units": ["units", "qty", "quantity", "qty_net"],
            "quantity": ["units", "qty", "quantity", "qty_net"],
            "deliveries": ["deliveries", "orders", "total_orders"],
            "unique_customers": ["unique_customers", "customers"],
            "customers": ["unique_customers", "customers"],
        }
        for alias_col, alias_keys in aliases.items():
            if k.startswith(alias_col) or alias_col.startswith(k) or alias_col in k:
                for ak in alias_keys:
                    if ak in row_dict:
                        return row_dict[ak]
                    normalized_ak = norm(ak)
                    if normalized_ak in normalized_keys:
                        return row_dict[normalized_keys[normalized_ak]]
                    for normalized_key, original_key in normalized_keys.items():
                        if normalized_ak in normalized_key or normalized_key in normalized_ak:
                            return row_dict[original_key]
        return ""

    for i, block in enumerate(nb.blocks):
        btype = getattr(block, "type", None)
        if btype != "table":
            continue
        displayed = len(block.rows or [])
        if displayed >= full_count:
            continue  # already complete

        columns = list(block.columns or [])
        if not columns:
            # Prefer the tool's actual row keys so product/order tables don't
            # collapse into customer-master-only fallback columns.
            columns = list(full_rows[0].keys()) if isinstance(full_rows[0], dict) else ["Name", "Mobile", "Area", "Status", "Revenue", "Effective Wallet"]
            block.columns = columns

        rehydrated_rows: list[list[Any]] = []
        for r in full_rows:
            if not isinstance(r, dict):
                continue
            rehydrated_rows.append([coerce_value(r, col) for col in columns])
        block.rows = rehydrated_rows

        # Retitle honestly
        if block.title and "top" in block.title.lower():
            # "Top 10 Most Negative Effective Balances" → "Most Negative Effective Balances (N matches)"
            block.title = block.title.replace(f"Top {displayed}", "All").replace(f"Top 10", "All").replace(f"Top 15", "All")
            if f"({full_count}" not in (block.title or ""):
                block.title = f"{block.title} ({full_count} matches)"
        elif block.title and "matches" not in block.title.lower():
            block.title = f"{block.title} ({full_count} matches)"
        elif not block.title:
            block.title = f"Matching customers ({full_count} matches)"


def _ensure_image_block(nb: NotebookResponse, png_cache: dict) -> None:
    """If run_python produced a matplotlib PNG and Gemini forgot to include
    an image block (or included an empty chart placeholder), inject the PNG
    so the user actually sees the visualization.
    """
    png = png_cache.get("png")
    if not png:
        return
    title = png_cache.get("title") or "Python visualization"

    # Strategy:
    # 1. If any existing image block already has the full PNG, do nothing.
    # 2. If there's a placeholder image block (missing/tiny png_base64),
    #    replace its png_base64 in place — preserving the LLM's title.
    # 3. Otherwise, insert a new image block just before the final input block.
    for b in nb.blocks:
        if getattr(b, "type", None) == "image" and getattr(b, "png_base64", "") == png:
            return

    # Drop empty chart placeholders the LLM may have emitted
    nb.blocks = [
        b for b in nb.blocks
        if not (getattr(b, "type", None) == "chart" and not getattr(b, "data", None))
    ]

    replaced = False
    for b in nb.blocks:
        if getattr(b, "type", None) == "image":
            existing = getattr(b, "png_base64", None) or ""
            if len(existing) < 1024:  # placeholder / truncated
                b.png_base64 = png
                if not getattr(b, "title", None):
                    b.title = title
                replaced = True
                break
    if replaced:
        return

    image = ImageBlock(title=title, png_base64=png)
    insert_at = len(nb.blocks)
    for i, b in enumerate(nb.blocks):
        if getattr(b, "type", None) == "input":
            insert_at = i
            break
    nb.blocks.insert(insert_at, image)


def _safe_data_coverage(session) -> dict[str, Any]:
    try:
        from .data_summary import get_data_coverage
        return get_data_coverage(session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("ai_agent: data coverage unavailable: %s", exc)
        return {}


def _make_meta(
    *,
    model: str,
    tool_calls: list[str] | None = None,
    coverage: dict[str, Any] | None = None,
    fallback: bool = False,
) -> NotebookMeta:
    coverage = coverage or {}
    return NotebookMeta(
        data_date=coverage.get("data_date"),
        snapshot_id=coverage.get("snapshot_id"),
        data_note=coverage.get("data_note"),
        customer_row_count=coverage.get("customer_row_count"),
        customer_data_to=coverage.get("customer_data_to"),
        customer_imported_at=coverage.get("customer_imported_at"),
        sales_row_count=coverage.get("sales_row_count"),
        sales_data_from=coverage.get("sales_data_from"),
        sales_data_to=coverage.get("sales_data_to"),
        sales_uploaded_at=coverage.get("sales_uploaded_at"),
        gemini_model=model,
        tool_calls=tool_calls or [],
        fallback_used=fallback,
    )


def _text_only_response(
    message: str,
    *,
    model: str,
    tool_calls: list[str] | None = None,
    fallback: bool = False,
    coverage: dict[str, Any] | None = None,
) -> NotebookResponse:
    return NotebookResponse(
        blocks=[TextBlock(content=message)],
        meta=_make_meta(
            model=model,
            tool_calls=tool_calls,
            coverage=coverage,
            fallback=fallback,
        ),
    )

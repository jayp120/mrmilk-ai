# MilkMaster ↔ Mr. Milk AI — Integration Plan (Meeting Brief)

_Prepared for the MilkMaster meeting. Goal: get sales data flowing automatically into Mr. Milk AI, without depending on anyone exporting CSVs by hand._

---

## TL;DR (read this in the meeting)

- **We do NOT need to know what database MilkMaster uses.** We only need ONE of these, in order of preference:
  1. **A read-only API + key** (best), or
  2. **A scheduled daily file export** (CSV/Excel) to a folder / SFTP / Google Drive / email (easiest for them), or
  3. **Read-only database access** (only if they self-host and agree), or
  4. **Manual export** — what we already do today (our safety net).
- **80% is already built.** The app already ingests MilkMaster's export format, dedupes, and runs the dashboards. Any of the options above just replaces the "someone exports a CSV" step.
- **One decision to get out of the meeting:** _"Which of the 4 ways can you give us, and what are the connection details?"_

---

## What we already have (so this is low-risk)

- A working ingest pipeline that reads MilkMaster's report columns, **auto-detects overlap, dedupes, and appends** — no history wiped.
- Live dashboards: per-day product sales, hub-wise split, monthly/seasonality, exports (Excel + interactive HTML dashboard).
- We already know the **exact fields** we need (below), because we parse their export today.

So whatever connection MilkMaster gives us, it plugs into machinery that's already running.

---

## The data we need (show them this list)

**Must-have (powers everything today):**

| Field | Meaning |
|---|---|
| `date` | Delivery date (the time axis) |
| `mobile` / `customer_id` | Customer key |
| `product_name`, `product_weight` | What was sold (e.g. Desi Cow A2 Milk, 1 litre) |
| `qty_delivered`, `qty_net` | Units delivered / net of returns |
| `sub_total` (or `net_price`) | Line revenue (₹) |
| `delivery_status` | delivered / cancelled / pending |
| `hub` (and `area`, `city`) | Distribution hub & location |
| `invoice_id` | Used to detect duplicates on import |

**Nice-to-have (unlocks more analysis later):** `qty_ordered`, `qty_cancelled`, `qty_disputed`, `qty_curdled`, `delivery_boy`, `route`, `subscription_id`, `subscription_type`, `payment_mode`, wallet balance.

> Tip for the meeting: ask MilkMaster to confirm they can provide the **must-have** fields. Everything we built runs on those.

---

## The 4 ways to connect (ranked best → fallback)

### Option 1 — Official API (BEST) 🥇
**How it works:** the app calls MilkMaster's API on a schedule and pulls JSON.
**We need from them:** base URL, a **read-only API key**, the "sales/delivery history" endpoint, a date filter (`from`/`to`), pagination, and one sample response.
**Pros:** fully automatic, always fresh, **database-agnostic** (we don't care what's behind it).
**Cons:** only works if they have an API.
**Build effort (us):** ~1–2 days once we have the details.

_Example:_
```
GET https://api.milkmaster.co/v1/sales?from=2026-06-13&to=2026-06-24
Authorization: Bearer <API_KEY>
→ { "data": [ { "delivery_date":"2026-06-13", "phone":"99...", "product":"Desi Cow A2 Milk",
                "pack":"1 litre", "qty":2, "amount":190, "status":"delivered", "hub":"Pune City Hub" } ] }
```

### Option 2 — Scheduled file export (EASIEST for them) 🥈
**How it works:** MilkMaster automatically drops a daily/weekly CSV or Excel to a shared place — an **SFTP folder, Google Drive, S3 bucket, or even an email inbox** — and our app watches that place and imports new files by itself.
**We need from them:** the drop location + credentials, the file format, and a delivery schedule (e.g. "every night at 1 AM").
**Pros:** works even if they have **no API**; database-agnostic; very easy for them (most systems can schedule an export).
**Cons:** not real-time (daily), file-based.
**Build effort (us):** ~1 day.

### Option 3 — Read-only database access (only if self-hosted) 🥉
**How it works:** they give us a **read-only** connection string to a replica of their database; we query it directly.
**We need from them:** DB type (Postgres / MySQL / etc.), host, read-only username/password, the relevant table/view names. **This is the only option where their database type matters.**
**Pros:** richest, most real-time data.
**Cons:** couples us to their schema; security-sensitive; many SaaS vendors won't allow it.
**Build effort (us):** ~1–2 days, plus careful access controls.

### Option 4 — Manual export (FALLBACK — already works today) ✅
**How it works:** what we do now — export a report, upload in *Import Ops*. We keep this **regardless**, as a backup for when the API/feed is down.
**We need from them:** nothing new.

---

## Decision tree (use this live in the meeting)

```
Do you have a REST API we can call with a key?
   ├─ YES → Option 1 (API). Get: base URL, key, endpoint, date filter, sample.   ★ best
   └─ NO  → Can you auto-export a daily file to SFTP / Drive / S3 / email?
              ├─ YES → Option 2 (scheduled export). Get: location, creds, format, schedule.  ★ easiest
              └─ NO  → Can you give read-only DB access (or a replica)?
                         ├─ YES → Option 3 (DB). Get: DB type, host, read-only creds, tables.
                         └─ NO  → Option 4: keep manual upload, agree a cadence (e.g. weekly).
```

---

## The exact questions to ask MilkMaster (copy–paste)

1. Do you offer a **REST API**? If yes, please share the **base URL, documentation, and a read-only API key**.
2. Which endpoint returns **sales / delivery history**, and can we **filter by date range** (`from`/`to`)?
3. How is the response **paginated** (page/limit or cursor)? What are the **rate limits**?
4. Can you send a **sample response** (one JSON example) so we can confirm the fields?
5. If no API: can you **schedule an automatic export** (CSV/Excel) to an **SFTP folder, Google Drive, S3, or email**? How often, and in what format?
6. If neither: would you allow **read-only database access** (or a read replica)? If so, what **database** is it (Postgres/MySQL/…), and which tables/views hold deliveries?
7. Can you confirm you can provide our **must-have fields** (date, customer, product, qty, amount, status, hub, invoice id)?
8. Is there a **sandbox/test environment** we can build against first?
9. Who is our **technical contact** for integration questions?

---

## Our recommendation

1. **Aim for Option 1 (API).** It's automatic, always-fresh, and we never touch their database.
2. **If no API, take Option 2 (scheduled export).** Easiest for them to set up and just as automatic on our side.
3. **Option 3 (DB) only** if they self-host and are comfortable giving read-only access.
4. **Keep Option 4 (manual)** running as the safety net in all cases.

> The beauty: **Options 1 and 2 don't depend on their database at all.** So even if they can't tell us their stack tomorrow, we can still move forward.

---

## Security & ownership (good to state in the meeting)

- We only ever need **read-only** access — we never write to MilkMaster.
- Keys/credentials live in the backend's `.env` (server-side), **never in the app or shared**.
- Access can be **revoked anytime** by MilkMaster.
- All data stays in **your** systems; the AI layer runs on our backend.

---

## Timeline (once we have the connection details)

| Step | Owner | Time |
|---|---|---|
| Get connection details (API key / export location / DB creds) | MilkMaster | meeting + a few days |
| Build the connector + field mapping | Us | 1–2 days |
| "Sync now" button + nightly auto-sync | Us | ~1 day |
| Test against sandbox, verify totals match the dashboard | Us + you | 1 day |
| Go live (auto-updating dashboards) | — | — |

---

## What "done" looks like for you

Open the app any morning → **yesterday's sales are already there**, dashboards and exports up to date, **zero manual uploads** — with the manual upload still available as a backup.

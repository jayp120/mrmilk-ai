# Mr Milk AI Backend

Import-first FastAPI backend for MilkMaster customer snapshots.

## What This Backend Does

- accepts full customer snapshot imports
- profiles and normalizes workbook rows
- stores import job history for the UI
- keeps only one active customer dataset in Postgres
- keeps the AI layer server-side instead of in the browser

## Local Setup

1. Create `backend/.env` from `backend/.env.example`
2. Create a Python virtual environment
3. Install dependencies:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt
```

4. Run the API:

```powershell
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8100
```

## Supabase Connection Note

Use the `Session pooler` or `Transaction pooler` connection string from Supabase `Connect` for `DATABASE_URL`.

- Do not use the direct `db.<project>.supabase.co:5432` host on IPv4-only local networks.
- If your database password contains `@`, the backend now repairs that automatically.
- The API will still boot in degraded mode if Postgres is unreachable, so workbook profiling remains usable.

## Import Behavior

- Every upload is treated as a full customer snapshot.
- A successful upload replaces the active customer dataset.
- Older parsed customer rows are deleted after the new dataset is committed.
- Import job history remains available through `GET /api/imports/history`.
- Only the current upload file is retained in storage by default.

## Required Secrets

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Do not commit real secrets into the repo. If you previously pasted backend secrets into chat, rotate them.

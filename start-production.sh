#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$ROOT/backend/.venv/bin/python"
PORT="${PORT:-8100}"
WORKERS="${WEB_CONCURRENCY:-1}"

export APP_ENV=production

if [[ ! -f "$ROOT/dist/index.html" ]]; then
  echo "ERROR: dist/ folder not found. Run npm run build first." >&2
  exit 1
fi

args=(
  -m uvicorn app.main:app
  --app-dir "$ROOT/backend"
  --host 0.0.0.0
  --port "$PORT"
)

if [[ "$WORKERS" -gt 1 ]]; then
  args+=(--workers "$WORKERS")
fi

exec "$PYTHON" "${args[@]}"

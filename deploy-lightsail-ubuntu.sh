#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mrmilk-ai}"
APP_USER="${APP_USER:-ubuntu}"
PORT="${PORT:-8100}"
WORKERS="${WEB_CONCURRENCY:-1}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "APP_DIR not found: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip nodejs npm

python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from example. Edit it with real secrets before starting." >&2
  exit 1
fi

sudo tee /etc/systemd/system/mrmilk-ai.service >/dev/null <<SERVICE
[Unit]
Description=Mr Milk AI OS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=APP_ENV=production
Environment=PORT=$PORT
Environment=WEB_CONCURRENCY=$WORKERS
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_DIR/start-production.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

chmod +x start-production.sh
sudo systemctl daemon-reload
sudo systemctl enable mrmilk-ai
sudo systemctl restart mrmilk-ai
sudo systemctl --no-pager status mrmilk-ai

# ============================================================
# Mr Milk AI OS - VPS Deploy Script (Windows Server)
# Run this once on your VPS to set everything up.
# After that, run start-production.ps1 to start the app.
# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Mr Milk AI OS - VPS Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------
# Step 1: Check prerequisites
# ------------------------------------------
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

$python = Get-Command python -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue

if (-not $python) {
    Write-Host "ERROR: Python not found. Install Python 3.11+ from python.org" -ForegroundColor Red
    exit 1
}
if (-not $node) {
    Write-Host "ERROR: Node.js not found. Install Node.js 18+ from nodejs.org" -ForegroundColor Red
    exit 1
}
if (-not $npm) {
    Write-Host "ERROR: npm not found." -ForegroundColor Red
    exit 1
}

Write-Host "  Python: $(python --version)" -ForegroundColor Green
Write-Host "  Node:   $(node --version)" -ForegroundColor Green
Write-Host "  npm:    $(npm --version)" -ForegroundColor Green

# ------------------------------------------
# Step 2: Backend - Python venv + deps
# ------------------------------------------
Write-Host ""
Write-Host "[2/5] Setting up Python backend..." -ForegroundColor Yellow

$venvPath = Join-Path $ROOT "backend\.venv"
if (-not (Test-Path $venvPath)) {
    python -m venv $venvPath
    Write-Host "  Created virtual environment" -ForegroundColor Green
}

& "$venvPath\Scripts\pip" install --quiet -r "$ROOT\backend\requirements.txt"
Write-Host "  Backend dependencies installed" -ForegroundColor Green

# ------------------------------------------
# Step 3: Frontend - npm install + build
# ------------------------------------------
Write-Host ""
Write-Host "[3/5] Building frontend for production..." -ForegroundColor Yellow

Set-Location $ROOT
npm install --silent 2>$null
Write-Host "  Node modules installed" -ForegroundColor Green

npm run build
Write-Host "  Frontend built to dist/" -ForegroundColor Green

# ------------------------------------------
# Step 4: Check .env exists
# ------------------------------------------
Write-Host ""
Write-Host "[4/5] Checking backend/.env..." -ForegroundColor Yellow

$envPath = Join-Path $ROOT "backend\.env"
if (-not (Test-Path $envPath)) {
    Copy-Item "$ROOT\backend\.env.example" $envPath
    Write-Host "  Created backend/.env from example - edit it with your real keys." -ForegroundColor Red
    Write-Host "  Open: $envPath" -ForegroundColor Red
    exit 1
}

Write-Host "  backend/.env exists" -ForegroundColor Green

# ------------------------------------------
# Step 5: Done
# ------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Run this to start the app:" -ForegroundColor White
Write-Host "    .\start-production.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  The app will be at:" -ForegroundColor White
Write-Host "    http://YOUR_VPS_IP:8100" -ForegroundColor Yellow
Write-Host ""

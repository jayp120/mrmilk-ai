# ============================================================
# Mr Milk AI OS - Start Production Server
# Runs FastAPI which serves both the API and the React frontend.
# One process. One port.
# ============================================================

$ROOT = $PSScriptRoot
$venvPython = Join-Path $ROOT "backend\.venv\Scripts\python.exe"

if (-not (Test-Path (Join-Path $ROOT "dist\index.html"))) {
    Write-Host "ERROR: dist/ folder not found. Run deploy-vps.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Mr Milk AI OS - Production" -ForegroundColor Cyan
Write-Host "  http://0.0.0.0:8100" -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

& $venvPython -m uvicorn app.main:app `
    --app-dir "$ROOT\backend" `
    --host 0.0.0.0 `
    --port 8100 `
    --workers 2

# ============================================================
# Mr Milk AI OS - Start Production Server
# Runs FastAPI which serves both the API and the React frontend.
# One process. One port.
# ============================================================

$ROOT = $PSScriptRoot
$venvPython = Join-Path $ROOT "backend\.venv\Scripts\python.exe"
$port = if ($env:PORT) { [int]$env:PORT } else { 8100 }
$workers = if ($env:WEB_CONCURRENCY) { [int]$env:WEB_CONCURRENCY } else { 1 }
$env:APP_ENV = "production"

if (-not (Test-Path (Join-Path $ROOT "dist\index.html"))) {
    Write-Host "ERROR: dist/ folder not found. Run deploy-vps.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Mr Milk AI OS - Production" -ForegroundColor Cyan
Write-Host "  http://0.0.0.0:$port" -ForegroundColor Yellow
Write-Host "  workers: $workers" -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

$uvicornArgs = @(
    "-m", "uvicorn", "app.main:app",
    "--app-dir", "$ROOT\backend",
    "--host", "0.0.0.0",
    "--port", "$port"
)

if ($workers -gt 1) {
    $uvicornArgs += @("--workers", "$workers")
}

& $venvPython @uvicornArgs

# ============================================================
#  Mr Milk AI OS - Open LAN access
#  Adds a Windows Firewall rule so other devices on your
#  Wi-Fi / LAN can reach the app on ports 5000 (frontend) and
#  8100 (backend). Run this ONCE. Right-click > Run with
#  PowerShell, or just double-click - it self-elevates (UAC).
# ============================================================

# --- self-elevate to Administrator ---
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting administrator permission..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$ruleName = "MrMilk AI LAN"
try {
    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $ruleName
    }
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort 5000,8100 -Profile Private,Public -ErrorAction Stop | Out-Null
    Write-Host ""
    Write-Host "  Firewall opened for TCP 5000 (frontend) + 8100 (backend)." -ForegroundColor Green

    # Show the LAN URLs to share
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.InterfaceAlias -notmatch 'WSL|vEthernet|Loopback' }
    Write-Host ""
    Write-Host "  Open this on any phone/laptop on the same Wi-Fi:" -ForegroundColor Cyan
    foreach ($ip in $ips) {
        Write-Host ("     http://" + $ip.IPAddress + ":5000   (" + $ip.InterfaceAlias + ")") -ForegroundColor White
    }
    Write-Host ""
    Write-Host "  To remove later:  Remove-NetFirewallRule -DisplayName '$ruleName'" -ForegroundColor DarkGray
}
catch {
    Write-Host ("  Failed: " + $_.Exception.Message) -ForegroundColor Red
}
Write-Host ""
Read-Host "Press Enter to close"

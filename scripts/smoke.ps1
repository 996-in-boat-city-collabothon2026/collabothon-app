# Owner: Pair 1. End-to-end check. Usage:  ./scripts/smoke.ps1 -Base https://warsztat-cfo-xyz.apps.cluster
param([string]$Base = "http://localhost:8080")

$checks = @(
  @{ m = "GET";  p = "/api/health" },
  @{ m = "GET";  p = "/api/llm/health" },
  @{ m = "GET";  p = "/api/state" },
  @{ m = "POST"; p = "/api/auth/demo-login" },
  @{ m = "GET";  p = "/api/forecast?days=30" },
  @{ m = "GET";  p = "/api/expenses?days=30" },
  @{ m = "GET";  p = "/api/alerts" },
  @{ m = "POST"; p = "/api/autopilot/run" },
  @{ m = "GET";  p = "/api/actions" },
  @{ m = "GET";  p = "/api/activity" },
  @{ m = "GET";  p = "/api/ksef/invoices" },
  @{ m = "GET";  p = "/api/settings" },
  @{ m = "POST"; p = "/api/boardroom" }
)
$failed = 0
foreach ($c in $checks) {
  try {
    $r = Invoke-RestMethod -Method $c.m -Uri "$Base$($c.p)" -TimeoutSec 60 -ContentType "application/json" -Body $(if ($c.m -eq "POST") { "{}" } else { $null })
    Write-Host "OK   $($c.m) $($c.p)" -ForegroundColor Green
    if ($c.p -eq "/api/llm/health") { Write-Host "     LLM mode: $($r.mode)  model: $($r.model)  ok: $($r.ok)" }
  } catch {
    Write-Host "FAIL $($c.m) $($c.p): $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}
if ($failed) { Write-Host "$failed check(s) failed" -ForegroundColor Red; exit 1 } else { Write-Host "All checks passed" -ForegroundColor Green }

# Owner: Pair 1. End-to-end check. Usage:
#   ./scripts/smoke.ps1                                                   (local, mock is fine)
#   ./scripts/smoke.ps1 -Base https://warsztat-cfo-xyz.apps.cluster -RequireModel   (cluster: must use the real model)
param(
  [string]$Base = "http://localhost:8080",
  [switch]$RequireModel  # fail if /api/llm/health is not openai_compat + ok
)

$checks = @(
  @{ m = "GET";  p = "/api/health" },
  @{ m = "GET";  p = "/api/llm/health" },
  @{ m = "POST"; p = "/api/auth/demo-login" },
  @{ m = "GET";  p = "/api/auth/me" },
  @{ m = "GET";  p = "/api/state" },
  @{ m = "GET";  p = "/api/forecast?days=30" },
  @{ m = "GET";  p = "/api/expenses?days=30" },
  @{ m = "GET";  p = "/api/alerts" },
  @{ m = "POST"; p = "/api/autopilot/run" },
  @{ m = "GET";  p = "/api/actions" },
  @{ m = "GET";  p = "/api/activity" },
  @{ m = "GET";  p = "/api/ksef/invoices" },
  @{ m = "GET";  p = "/api/settings" },
  @{ m = "POST"; p = "/api/ask"; b = '{"question":"Czy kurs euro to problem?"}' },
  @{ m = "POST"; p = "/api/boardroom" }
)
$failed = 0
foreach ($c in $checks) {
  try {
    $body = if ($c.m -eq "POST") { if ($c.b) { $c.b } else { "{}" } } else { $null }
    $time = Measure-Command {
      $r = Invoke-RestMethod -Method $c.m -Uri "$Base$($c.p)" -TimeoutSec 90 -ContentType "application/json; charset=utf-8" -Body $body
    }
    Write-Host "OK   $($c.m) $($c.p)  ($([int]$time.TotalMilliseconds) ms)" -ForegroundColor Green
    if ($c.p -eq "/api/llm/health") {
      Write-Host "     LLM mode: $($r.mode)  model: $($r.model)  ok: $($r.ok)  latency: $($r.latencyMs) ms $($r.error)"
      if ($RequireModel -and ($r.mode -ne "openai_compat" -or -not $r.ok)) {
        Write-Host "FAIL -RequireModel: the app is not using the OpenShift AI model" -ForegroundColor Red
        $failed++
      }
    }
    if ($c.p -eq "/api/ask") { Write-Host "     answered by: $($r.cfo)" }
    if ($c.p -eq "/api/boardroom" -and $time.TotalSeconds -gt 25) {
      Write-Host "WARN boardroom took over 25 s (target < 25 s)" -ForegroundColor Yellow
    }
  } catch {
    Write-Host "FAIL $($c.m) $($c.p): $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}
if ($failed) { Write-Host "$failed check(s) failed" -ForegroundColor Red; exit 1 } else { Write-Host "All checks passed" -ForegroundColor Green }

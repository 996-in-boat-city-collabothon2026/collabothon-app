# Owner: Pair 1. Demo duty kit (plan step 6.4). Windows PowerShell 5.1. Usage:
#   ./scripts/demo-duty.ps1           status only (changes nothing): pods, model, live image, ready commands
#   ./scripts/demo-duty.ps1 -Mock     Plan B: the model is down -> switch the app to mock mode (rule text)
#   ./scripts/demo-duty.ps1 -Real     back to the real model (OpenShift AI)
# Rollback of a bad build is NOT in here on purpose: follow deploy/README.md section 1 by hand.
param(
  [switch]$Mock,
  [switch]$Real,
  [string]$Base = "https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com",
  [string]$App = "warsztat-cfo"  # only to try the script on the test copy: -App warsztat-cfo-test -Base <test URL>
)
$ns = "my-first-model"

function Get-LlmMode {
  try { (Invoke-RestMethod -Uri "$Base/api/llm/health" -TimeoutSec 10) } catch { $null }
}

function Show-Health {
  $h = Get-LlmMode
  if ($null -eq $h) { Write-Host "App:   NOT ANSWERING at $Base" -ForegroundColor Red; return }
  $colour = if ($h.mode -eq "openai_compat" -and $h.ok) { "Green" } else { "Yellow" }
  Write-Host "App:   mode=$($h.mode)  model=$($h.model)  ok=$($h.ok)  latency=$($h.latencyMs) ms" -ForegroundColor $colour
}

function Switch-Mode([string]$mode) {
  Write-Host "Switching the app to LLM_MODE=$mode ..." -ForegroundColor Cyan
  oc set env deploy/$App LLM_MODE=$mode -n $ns
  oc rollout status deploy/$App -n $ns --timeout=180s
  # The old pod can still answer for 30-60 s while it stops, so wait until health shows the new mode.
  for ($i = 0; $i -lt 18; $i++) {
    $h = Get-LlmMode
    if ($h -and $h.mode -eq $mode) { break }
    Start-Sleep -Seconds 5
  }
  Show-Health
}

if ($Mock -and $Real) { Write-Host "Use -Mock or -Real, not both." -ForegroundColor Red; exit 1 }
if ($Mock) { Switch-Mode "mock"; exit 0 }
if ($Real) { Switch-Mode "openai_compat"; exit 0 }

# Status only: nothing below changes the cluster.
$project = oc project -q
if ($project -ne $ns) { Write-Host "WARNING: oc project is '$project', run: oc project $ns" -ForegroundColor Red }
Show-Health
Write-Host ""
oc get pods -n $ns --field-selector=status.phase!=Succeeded
Write-Host ""
Write-Host "Models (live: llama-31-8b-instruct in cfo-llm; llama-32-3b-instruct in $ns is the stopped fallback):"
oc get inferenceservice -A
Write-Host ""
Write-Host "Last builds:"; oc get builds -n $ns --sort-by=.metadata.creationTimestamp | Select-Object -Last 3
Write-Host ""
Write-Host "Ready commands (copy one into this window):" -ForegroundColor Cyan
Write-Host "  Watch pods:        oc get pods -w -n $ns"
Write-Host "  Model is down:     ./scripts/demo-duty.ps1 -Mock"
Write-Host "  Model is back:     ./scripts/demo-duty.ps1 -Real"
Write-Host "  App logs:          oc logs deploy/$App -n $ns --tail=20"
Write-Host "  Reset the demo:    Invoke-RestMethod -Method Post -ContentType 'application/json' -Body '{}' $Base/api/demo/reset"
Write-Host "  Bad build:         rollback steps in deploy/README.md section 1 (oc tag, NOT oc rollout undo)"

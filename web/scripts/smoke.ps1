# Smoke test (Windows): GET / (API index) + POST /api/* validation 400.
# Usage:  $env:BASE_URL="http://localhost:3000"; powershell -File web/scripts/smoke.ps1
$BaseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:3000" }
$Pass = 0; $Fail = 0

function Check($Label, $Want, $Got) {
  if ($Want -eq $Got) { Write-Host "PASS $Label ($Got)"; $script:Pass++ }
  else { Write-Host "FAIL $Label (want $Want, got $Got)"; $script:Fail++ }
}

function Get-Code($Url) {
  try { (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15).StatusCode }
  catch {
    if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  }
}

function Post-Code($Url, $Body) {
  try {
    (Invoke-WebRequest -Uri $Url -Method POST -ContentType "application/json" -Body $Body -UseBasicParsing -TimeoutSec 15).StatusCode
  } catch {
    if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  }
}

Check "GET /" 200 (Get-Code "$BaseUrl/")
Check "POST /api/search {} -> 400" 400 (Post-Code "$BaseUrl/api/search" '{}')
Check "POST /api/shortlists {} -> 400" 400 (Post-Code "$BaseUrl/api/shortlists" '{}')
Check "POST /api/contacts {} -> 400" 400 (Post-Code "$BaseUrl/api/contacts" '{}')

Write-Host "--- $Pass passed, $Fail failed ---"
if ($Fail -gt 0) { exit 1 }

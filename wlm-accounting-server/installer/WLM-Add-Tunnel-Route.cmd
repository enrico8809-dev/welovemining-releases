@echo off
setlocal
title WLM Accounting — add the tunnel route

rem Adds accounting.welovemining.co.za to the Cloudflare tunnel already running
rem on this PC, and then checks whether the whole path works.
rem
rem The configuration file lives under System32 where it cannot comfortably be
rem opened by hand, which is the reason this exists. It copies the file aside
rem before touching it, asks cloudflared to validate the result, and puts the
rem copy back if cloudflared objects — so the CRM's own routes are never left
rem in a state nobody checked.
rem
rem One file: batch below, PowerShell after the marker. Nothing is installed.

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Needs administrator. Re-opening...
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'" >nul 2>&1
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0'); $m='#PS'+'START#'; Invoke-Expression $t.Substring($t.IndexOf($m)+$m.Length)"

echo.
pause
exit /b

#PSSTART#

$ErrorActionPreference = "Stop"

$Hostname = "accounting.welovemining.co.za"
$Port     = 4610

function Line($text) { Write-Host "  $text" }
function Head($text) { Write-Host ""; Write-Host "  $text"; Write-Host "  $('-' * $text.Length)" }

Write-Host ""
Write-Host "  WLM Accounting — adding $Hostname"
Write-Host "  ============================================================"

# --- find the tunnel, its config and its binary -----------------------------

$service = Get-CimInstance Win32_Service -Filter "Name='cloudflared'" -ErrorAction SilentlyContinue
if (-not $service) {
  Line "No cloudflared service on this PC. Nothing to add a route to."
  return
}

$config = $null
if ($service.PathName -match '--config\s+"?([^"]+\.ya?ml)"?') { $config = $Matches[1] }
if (-not $config) {
  Line "The tunnel service names no --config file, so it is configured in the"
  Line "Cloudflare dashboard rather than here. Add the hostname there instead."
  return
}

$cloudflared = $null
if ($service.PathName -match '^"?([^"]+cloudflared\.exe)') { $cloudflared = $Matches[1] }
if (-not $cloudflared -or -not (Test-Path $cloudflared)) {
  $found = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if ($found) { $cloudflared = $found.Source }
}

Head "What it is running with"
Line "config      $config"
Line "cloudflared $cloudflared"

if (-not (Test-Path $config)) { Line ""; Line "That file does not exist. Stopping."; return }

$lines = @(Get-Content -LiteralPath $config)

Head "Routes before"
foreach ($l in $lines) { if ($l -match 'hostname:|service:|ingress:') { Write-Host "    $l" } }

# --- insert, unless it is already there -------------------------------------

if ($lines -match [regex]::Escape($Hostname)) {
  Line ""
  Line "$Hostname is already in this file — leaving it alone."
} else {
  $catchAll = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*-\s*service:\s*http_status:') { $catchAll = $i; break }
  }
  if ($catchAll -lt 0) {
    Line ""
    Line "No catch-all rule found, so this file is not shaped as expected."
    Line "Nothing has been changed."
    return
  }

  # Match the file's own indentation: YAML counts spaces, and a rule below the
  # catch-all never matches, so position matters as much as content.
  $indent = ([regex]::Match($lines[$catchAll], '^(\s*)')).Groups[1].Value
  $addition = @("$indent- hostname: $Hostname", "$indent  service: http://127.0.0.1:$Port")

  $backup = "$config.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Copy-Item -LiteralPath $config -Destination $backup
  Head "Changing it"
  Line "backup      $backup"

  $updated = @()
  $updated += $lines[0..($catchAll - 1)]
  $updated += $addition
  $updated += $lines[$catchAll..($lines.Count - 1)]
  Set-Content -LiteralPath $config -Value $updated

  Line "added:"
  foreach ($l in $addition) { Write-Host "      $l" }

  # --- it has to parse before anything restarts -----------------------------

  $ok = $false
  if ($cloudflared) {
    # --config is a global flag: after the subcommand cloudflared prints its
    # usage instead of validating, which must not be mistaken for a pass.
    $out = & $cloudflared --config $config tunnel ingress validate 2>&1
    $ok = ($LASTEXITCODE -eq 0) -and ($out -notmatch "OPTIONS:") -and ($out -notmatch "USAGE:")
    if (-not $ok) {
      Copy-Item -LiteralPath $backup -Destination $config -Force
      Line ""
      Write-Warning "cloudflared rejected the result, so the original is back:"
      Write-Host ($out | Out-String)
      Write-Warning "The tunnel has not been restarted. Nothing has changed."
      return
    }
    Line "cloudflared validated the file."
  } else {
    Line "cloudflared.exe not found, so the file could not be validated."
  }

  Line "restarting the tunnel..."
  Restart-Service -Name cloudflared -Force
  Start-Sleep -Seconds 4
  Line "tunnel service is $((Get-Service cloudflared).Status)"
}

Head "Routes now"
foreach ($l in @(Get-Content -LiteralPath $config)) {
  if ($l -match 'hostname:|service:|ingress:') { Write-Host "    $l" }
}

# --- DNS --------------------------------------------------------------------

$tunnel = $null
foreach ($l in @(Get-Content -LiteralPath $config)) {
  if ($l -match '^\s*tunnel:\s*(.+?)\s*$') { $tunnel = $Matches[1].Trim('"').Trim("'"); break }
}

Head "DNS"
$resolves = $false
try {
  $answer = Resolve-DnsName -Name $Hostname -Server 1.1.1.1 -ErrorAction Stop
  $resolves = $true
  Line "$Hostname resolves to:"
  foreach ($a in $answer) { if ($a.IPAddress) { Write-Host "      $($a.IPAddress)" } }
} catch {
  Line "$Hostname does not resolve."
}

if (-not $resolves -and $tunnel -and $cloudflared) {
  Line "asking cloudflared to create the record..."
  $dns = & $cloudflared tunnel route dns $tunnel $Hostname 2>&1
  if ($LASTEXITCODE -eq 0) {
    Line "created."
  } else {
    Line "could not create it from here:"
    Write-Host ($dns | Out-String)
    Line "Add it in the Cloudflare dashboard, on welovemining.co.za -> DNS:"
    Write-Host ""
    Write-Host "      Type    CNAME"
    Write-Host "      Name    $($Hostname.Split('.')[0])"
    Write-Host "      Target  $tunnel.cfargotunnel.com"
    Write-Host "      Proxy   Proxied — the ORANGE cloud, not grey"
    Write-Host ""
    Line "A grey cloud is why a record can exist and still not resolve:"
    Line "cfargotunnel.com only answers through Cloudflare's proxy."
  }
}

# --- did any of it work -----------------------------------------------------

Head "Does it work"

try {
  $local = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
  Line "on this PC .... answering$(if ($local.claimed) { ', owner account exists' } else { ', no account yet' })"
} catch {
  Line "on this PC .... NOT answering on port $Port"
}

try {
  $outside = Invoke-WebRequest "https://$Hostname/api/health" -TimeoutSec 20 -UseBasicParsing
  Line "from outside .. $($outside.StatusCode) — working"
  Write-Host ""
  Line "Put this into both apps, under Settings -> Cloud sync:"
  Line "    https://$Hostname"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code) {
    Line "from outside .. $code"
    if ($code -eq 530) { Line "                DNS is right but no tunnel serves this hostname yet." }
    if ($code -eq 404) { Line "                Reached the tunnel; no rule matched this hostname." }
    if ($code -eq 502) { Line "                Route is right; nothing answered on port $Port." }
  } else {
    Line "from outside .. no answer — DNS has not taken effect yet."
    Line "                If the record is new, give it a minute and re-run this."
  }
}

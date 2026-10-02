<#
  Adds this server's hostname to the Cloudflare tunnel already running on this PC.

  That tunnel is what the CRM reaches the outside through, and its routes live in
  a configuration file here rather than in the dashboard. Editing that file by
  hand is a reasonable way to take the CRM down — a tab instead of spaces, or a
  rule placed below the catch-all, and nothing works with nothing to explain it.

  So this script does it defensively:

    1. finds the file the tunnel service is actually running with
    2. does nothing at all if the hostname is already there
    3. copies the file aside before touching it
    4. inserts the rule above the catch-all, matching the file's own indentation
    5. asks cloudflared to validate the result
    6. puts the backup back if it doesn't validate, and stops
    7. only then restarts the tunnel

  It leaves the CRM's own rules untouched; it adds one entry.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Hostname,
  [Parameter(Mandatory = $true)][int]    $Port,
  [string] $ConfigPath,
  [string] $CloudflaredPath,
  # For testing the file edit without a tunnel service present.
  [switch] $SkipServiceRestart,
  [switch] $SkipDns
)

$ErrorActionPreference = "Stop"

function Say($text) { Write-Host "  $text" }

function Find-Cloudflared {
  if ($CloudflaredPath -and (Test-Path $CloudflaredPath)) { return $CloudflaredPath }

  $beside = Join-Path $PSScriptRoot "cloudflared.exe"
  if (Test-Path $beside) { return $beside }

  $onPath = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue)
  if ($onPath) { return $onPath.Source }

  throw "cloudflared.exe not found. Pass -CloudflaredPath with its location."
}

function Find-Config {
  if ($ConfigPath) { return $ConfigPath }

  # The service's own command line is the only authority on which file it reads:
  # there can be several, and the wrong one is edited silently and uselessly.
  $service = Get-CimInstance Win32_Service -Filter "Name='cloudflared'" -ErrorAction SilentlyContinue
  if ($service -and $service.PathName -match '--config\s+"?([^"]+\.ya?ml)"?') {
    return $Matches[1]
  }

  $candidates = @(
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:SystemRoot\System32\config\systemprofile\.cloudflared\config.yml",
    "$env:ProgramData\Cloudflare\cloudflared\config.yml"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }

  throw "Could not find the tunnel's configuration file. Run 'sc qc cloudflared' to see which file it uses, then pass it with -ConfigPath."
}

function Get-TunnelId($lines) {
  foreach ($line in $lines) {
    if ($line -match '^\s*tunnel:\s*(.+?)\s*$') { return $Matches[1].Trim('"').Trim("'") }
  }
  return $null
}

# --- find what we are editing -----------------------------------------------

$cloudflared = Find-Cloudflared
$config = Find-Config

Write-Host ""
Write-Host "  Adding $Hostname to the tunnel on this PC"
Write-Host "  ======================================================"
Say "config     $config"
Say "cloudflared $cloudflared"

$lines = @(Get-Content -LiteralPath $config)

if ($lines -match [regex]::Escape($Hostname)) {
  Say ""
  Say "$Hostname is already in this file. Nothing to change."
  exit 0
}

# --- work out where the rule goes -------------------------------------------

# Ingress rules are matched top to bottom and the catch-all answers everything,
# so anything below it is dead. The new rule goes immediately above it.
$catchAll = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*-\s*service:\s*http_status:') { $catchAll = $i; break }
}

if ($catchAll -lt 0) {
  Write-Warning "No catch-all rule (- service: http_status:404) found in $config."
  Write-Warning "This file is not shaped the way this script expects, so it has not been touched."
  Write-Warning "Add this by hand, above any catch-all rule:"
  Write-Host ""
  Write-Host "  - hostname: $Hostname"
  Write-Host "    service: http://127.0.0.1:$Port"
  exit 1
}

# Match the file's own indentation rather than imposing any: YAML counts spaces.
$indent = ([regex]::Match($lines[$catchAll], '^(\s*)')).Groups[1].Value

$addition = @(
  "$indent- hostname: $Hostname",
  "$indent  service: http://127.0.0.1:$Port"
)

# --- edit, with a way back ---------------------------------------------------

$backup = "$config.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
Copy-Item -LiteralPath $config -Destination $backup
Say "backup     $backup"

$updated = @()
$updated += $lines[0..($catchAll - 1)]
$updated += $addition
$updated += $lines[$catchAll..($lines.Count - 1)]
Set-Content -LiteralPath $config -Value $updated

Say ""
Say "added:"
foreach ($line in $addition) { Write-Host "    $line" }

# --- prove it still parses before anything restarts --------------------------

$validation = & $cloudflared tunnel ingress validate --config $config 2>&1
if ($LASTEXITCODE -ne 0) {
  Copy-Item -LiteralPath $backup -Destination $config -Force
  Write-Host ""
  Write-Warning "cloudflared rejected the edited file, so the original has been put back:"
  Write-Host ($validation | Out-String)
  Write-Warning "The tunnel was not restarted and nothing has changed."
  exit 1
}

Say ""
Say "cloudflared validated the file."

# --- restart the tunnel so it reads the file ---------------------------------

if (-not $SkipServiceRestart) {
  Say "restarting the tunnel service…"
  Restart-Service -Name cloudflared -Force
  Start-Sleep -Seconds 3
  $state = (Get-Service -Name cloudflared).Status
  Say "tunnel service is $state"
}

# --- DNS ---------------------------------------------------------------------

$tunnel = Get-TunnelId $lines

if (-not $SkipDns -and $tunnel) {
  # Works when this PC holds the certificate from `cloudflared tunnel login`,
  # which a locally-managed tunnel almost always does. It is also harmless to
  # repeat: an existing record for this hostname is reported, not duplicated.
  $dns = & $cloudflared tunnel route dns $tunnel $Hostname 2>&1
  if ($LASTEXITCODE -eq 0) {
    Say ""
    Say "DNS record created for $Hostname."
  } else {
    Say ""
    Write-Warning "The DNS record could not be created from here:"
    Write-Host ($dns | Out-String)
    Write-Host "  Add it in the Cloudflare dashboard instead — DNS -> Add record:"
    Write-Host ""
    Write-Host "    Type    CNAME"
    Write-Host "    Name    $($Hostname.Split('.')[0])"
    Write-Host "    Target  $tunnel.cfargotunnel.com"
    Write-Host "    Proxy   Proxied (orange cloud)"
  }
}

Write-Host ""
Say "Done. Check it with the Server status shortcut."
Write-Host ""

# Installs cloudflared on Windows and connects it to Cloudflare as a service.
#
# Prerequisite (one-time, in the Cloudflare dashboard):
#   Zero Trust -> Networks -> Tunnels -> Create a tunnel (choose "Cloudflared")
#   -> add a Public Hostname:
#        Subdomain/Domain: miners.welovemining.co.za
#        Service:          HTTP  ->  localhost:8787
#   -> copy the connector token it shows.
#
# Then run this script as Administrator:
#   powershell -ExecutionPolicy Bypass -File setup-cloudflared.ps1 -Token "<CONNECTOR_TOKEN>"

param(
  [Parameter(Mandatory = $true)] [string] $Token
)

$ErrorActionPreference = "Stop"
$dir = "$env:ProgramFiles\cloudflared"
$exe = "$dir\cloudflared.exe"

New-Item -ItemType Directory -Force -Path $dir | Out-Null
if (-not (Test-Path $exe)) {
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $exe
}

Write-Host "Installing cloudflared as a Windows service..."
& $exe service install $Token

Write-Host "Done. The tunnel is live once the service connects (a few seconds)."
Write-Host "Check Cloudflare Zero Trust -> Tunnels: status should be HEALTHY."

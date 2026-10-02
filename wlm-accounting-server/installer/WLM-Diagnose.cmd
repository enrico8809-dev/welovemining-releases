@echo off
setlocal
title WLM Accounting — what is actually broken

rem Walks the whole path from this PC to the outside and records what it finds
rem at each step, rather than one message for four different faults.
rem
rem Everything is written to a report on the Desktop and then shown on screen,
rem so the same text can be read here and sent on. It only reads; it changes
rem nothing.

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Needs administrator — the tunnel's configuration lives under Windows
  echo   and a normal account cannot read it. Re-opening...
  echo.
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'" >nul 2>&1
  exit /b
)

set "REPORT=%USERPROFILE%\Desktop\wlm-diagnosis.txt"
set "WLM_HOST=accounting.welovemining.co.za"
set "WLM_PORT=4610"
set "WLM_DATA_DIR=C:\ProgramData\WLM Accounting"
set "APPDIR=%ProgramFiles%\WLM Accounting Server"

rem The installed settings win, so this checks what is actually in use.
if exist "%APPDIR%\settings.cmd" call "%APPDIR%\settings.cmd"
if exist "%~dp0settings.cmd" call "%~dp0settings.cmd"

echo Collecting... this takes about twenty seconds.

> "%REPORT%" (
  echo WLM Accounting diagnosis
  echo ========================
  echo date      %DATE% %TIME%
  echo host      %WLM_HOST%
  echo port      %WLM_PORT%
  echo app dir   %APPDIR%
  echo.

  echo [1] BOOKS SERVER SERVICE
  sc query WLMAccountingServer 2>&1
  echo.

  echo [2] IS ANYTHING LISTENING ON %WLM_PORT%
  netstat -ano ^| findstr /r /c:":%WLM_PORT% .*LISTENING" 2>&1
  echo.

  echo [3] THE SERVER, FROM THIS PC
  curl -s -m 5 -w "   http status %%{http_code}" "http://127.0.0.1:%WLM_PORT%/api/health" 2>&1
  echo.
  echo.

  echo [4] DNS FOR %WLM_HOST%
  nslookup %WLM_HOST% 2>&1
  echo.

  echo [5] THE SAME, VIA CLOUDFLARE'S RESOLVER
  echo     ^(ignores this PC's cache, so it shows what the world sees^)
  nslookup %WLM_HOST% 1.1.1.1 2>&1
  echo.

  echo [6] TUNNEL SERVICE
  sc query cloudflared 2>&1
  echo.

  echo [7] WHICH CONFIG THE TUNNEL SERVICE RUNS WITH
  sc qc cloudflared 2>&1
  echo.

  echo [8] THAT CONFIG'S ROUTES
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-CimInstance Win32_Service -Filter \"Name='cloudflared'\" -ErrorAction SilentlyContinue; $cfg = $null; if ($s -and $s.PathName -match '--config\s+\"?([^\"]+\.ya?ml)\"?') { $cfg = $Matches[1] }; if (-not $cfg) { foreach ($p in @(\"$env:USERPROFILE\.cloudflared\config.yml\", \"$env:SystemRoot\System32\config\systemprofile\.cloudflared\config.yml\", \"$env:ProgramData\Cloudflare\cloudflared\config.yml\")) { if (Test-Path $p) { $cfg = $p; break } } }; if (-not $cfg) { 'No config file found — this may be a token-based tunnel configured in the dashboard.'; exit }; \"file: $cfg\"; ''; if (-not (Test-Path $cfg)) { 'THAT FILE DOES NOT EXIST.'; exit }; Get-Content -LiteralPath $cfg; ''; $l = Get-Content -LiteralPath $cfg; $h = ($l ^| Select-String -SimpleMatch '%WLM_HOST%' ^| Select-Object -First 1); $c = ($l ^| Select-String -SimpleMatch 'http_status:' ^| Select-Object -First 1); if (-not $h) { 'VERDICT: our hostname is NOT in this file.' } elseif (-not $c) { 'VERDICT: our hostname is present; there is no catch-all rule.' } elseif ($h.LineNumber -lt $c.LineNumber) { 'VERDICT: our hostname is present and above the catch-all, which is correct.' } else { 'VERDICT: our hostname is BELOW the catch-all, so it never matches.' }" 2>&1
  echo.

  echo [9] BACKUPS LEFT BY THE ROUTE SCRIPT ^(shows whether it ran^)
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path \"$env:USERPROFILE\.cloudflared\", \"$env:SystemRoot\System32\config\systemprofile\.cloudflared\", \"$env:ProgramData\Cloudflare\cloudflared\" -Filter '*.bak-*' -ErrorAction SilentlyContinue ^| Select-Object FullName, LastWriteTime ^| Format-List; 'none found means the script never edited anything'" 2>&1
  echo.

  echo [10] FROM THE OUTSIDE
  curl -s -o nul -m 15 -w "   https status %%{http_code}" "https://%WLM_HOST%/api/health" 2>&1
  echo.
  echo.
  curl -s -m 15 -i "https://%WLM_HOST%/api/health" 2>&1
  echo.

  echo [11] THE BOOKS
  dir "%WLM_DATA_DIR%" 2>&1
)

cls
type "%REPORT%"
echo.
echo   ------------------------------------------------------------------
echo   Saved to: %REPORT%
echo.
echo   What the https status in [10] means:
echo.
echo     200  working — use https://%WLM_HOST% in both apps
echo     000  nothing resolved or connected: DNS, or the proxy cloud is grey
echo     530  DNS is right, but no tunnel is serving this hostname
echo     404  reached the tunnel, nothing matched: rule below the catch-all
echo     502  route is right, nothing answering on port %WLM_PORT%
echo     403  something in front is blocking it, e.g. Cloudflare Access
echo   ------------------------------------------------------------------
echo.
pause

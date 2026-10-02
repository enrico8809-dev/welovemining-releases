@echo off
setlocal
rem Answers the only question worth asking when the phone stops syncing: which
rem half is down, the server or the tunnel? Checks them separately and says so.

if exist "%~dp0settings.cmd" call "%~dp0settings.cmd"
if "%WLM_PORT%"=="" set WLM_PORT=4600

echo.
echo   WLM Accounting Server
echo   =====================
echo.

rem --- the service ---------------------------------------------------------
sc query WLMAccountingServer | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo   Service ......... NOT RUNNING
  echo.
  echo   Start it with:  sc start WLMAccountingServer
  echo   Or see why it stopped:  notepad "%~dp0wlm-accounting-service.out.log"
) else (
  echo   Service ......... running
)

rem --- the server itself ---------------------------------------------------
curl -s -m 5 "http://127.0.0.1:%WLM_PORT%/api/health" > "%TEMP%\wlm-health.json" 2>nul
if errorlevel 1 (
  echo   On this PC ...... no answer on port %WLM_PORT%
) else (
  findstr /c:"\"ok\":true" "%TEMP%\wlm-health.json" >nul
  if errorlevel 1 (
    echo   On this PC ...... answered, but not as expected
  ) else (
    findstr /c:"\"claimed\":true" "%TEMP%\wlm-health.json" >nul
    if errorlevel 1 (
      echo   On this PC ...... running, no account yet
      echo                     Open the app, point it here and claim it — the
      echo                     first account created becomes the owner.
    ) else (
      echo   On this PC ...... running, claimed
    )
  )
)
del "%TEMP%\wlm-health.json" >nul 2>nul

rem --- the tunnel ----------------------------------------------------------
if "%WLM_HOST%"=="" (
  echo   From outside .... no hostname set up
  echo                     The apps can only sync on this PC's own network
  echo                     until a Cloudflare tunnel is pointed at port %WLM_PORT%.
) else (
  sc query cloudflared | findstr /i "RUNNING" >nul
  if errorlevel 1 (
    echo   Tunnel service .. NOT RUNNING
  ) else (
    echo   Tunnel service .. running
  )
  curl -s -m 10 "https://%WLM_HOST%/api/health" | findstr /c:"\"ok\":true" >nul
  if errorlevel 1 (
    echo   From outside .... https://%WLM_HOST% is NOT answering
    echo                     The server above is fine; it's the tunnel or DNS.
  ) else (
    echo   From outside .... https://%WLM_HOST% answering
    echo.
    echo   Put this in both apps under Settings:  https://%WLM_HOST%
  )
)

echo.
echo   Books ........... %WLM_DATA_DIR%\ledger.json
echo.
pause

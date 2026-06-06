@echo off
REM Quick foreground run of the WLM gateway on Windows.
REM Requires Node.js 18+ (https://nodejs.org). Double-click or run from a terminal.
cd /d "%~dp0\.."
echo Starting WLM Gateway...
node server.js
pause

@echo off
REM Starts the Auto-Trader. PAPER mode unless LIVE_TRADING=true in .env.
REM Leave this window open. Close it (or press Ctrl+C) to stop the bot.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
:loop
python -m bot.trader
REM If the bot stopped by itself (not by the kill switch), restart it after 60 seconds
python -c "from bot.storage import StateStore; import sys; sys.exit(1 if StateStore().get('stop_requested') else 0)"
if errorlevel 1 goto end
echo Bot stopped unexpectedly. Restarting in 60 seconds (close this window to cancel)...
timeout /t 60
goto loop
:end
echo Bot stopped by the kill switch.
pause

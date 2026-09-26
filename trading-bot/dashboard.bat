@echo off
REM Opens the dashboard in your browser. Leave this window open while you use it.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
start "" http://localhost:8050
python -m bot.dashboard
pause

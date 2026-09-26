@echo off
REM Shows positions, balances, halts and the last trades.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m bot.trader --status
pause

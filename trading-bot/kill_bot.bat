@echo off
REM KILL SWITCH: cancels open orders, blocks all new trades and stops the running bot.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m bot.trader --kill
pause

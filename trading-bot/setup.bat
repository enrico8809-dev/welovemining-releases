@echo off
REM One-time setup: creates a private Python environment (.venv) and installs the packages.
cd /d "%~dp0"
py -3.11 -m venv .venv || python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if not exist .env copy .env.example .env
echo.
echo Setup done. Next: run  .venv\Scripts\activate  then  python -m data.downloader
pause

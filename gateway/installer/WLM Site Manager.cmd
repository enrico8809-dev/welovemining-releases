@echo off
rem Opens the WLM Site Manager dashboard as a desktop app window (Edge app
rem mode: own window, no tabs or address bar). Falls back to the default
rem browser if Edge is unavailable.
start "" msedge --app=http://localhost:8787/
if errorlevel 1 start "" http://localhost:8787/

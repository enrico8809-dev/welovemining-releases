@echo off
rem Opens the WLM Hub dashboard as a desktop app window.
start "" msedge --app=http://localhost:8900/
if errorlevel 1 start "" http://localhost:8900/

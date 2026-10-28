@echo off
rem Tungsten Desk V4 - Institutional Front-End Launcher
cd /d "%~dp0"
where python >NUL 2>NUL
if errorlevel 1 (
  echo [ERROR] Python not found on PATH. Please install Python 3.9+ to launch Tungsten Desk.
  pause
  exit /b 1
)
python launcher.py
if errorlevel 1 (
  start "" http://localhost:8787
  python -m http.server 8787 --directory site
)

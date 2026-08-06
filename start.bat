@echo off
rem Tungsten Desk - no-dependency launcher (fallback if the exe is not available)
cd /d "%~dp0"
where python >NUL 2>NUL
if errorlevel 1 (
  echo [ERROR] Python not found on PATH. Use TungstenDesk.exe instead.
  pause
  exit /b 1
)
start "" http://localhost:8787
python -m http.server 8787 --directory site

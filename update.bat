@echo off
rem Tungsten Desk — Automated Data Refresh
cd /d "%~dp0"
echo ===================================================
echo   T U N G S T E N   D E S K   R E F R E S H
echo ===================================================
where python >NUL 2>NUL
if errorlevel 1 (
  echo [ERROR] Python not found on PATH.
  pause
  exit /b 1
)
python scripts/update.py
echo.
pause

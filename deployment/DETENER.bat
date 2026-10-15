@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0_internal\scripts\detener.ps1"
set "resultado=%errorlevel%"
if "%resultado%"=="0" (
  timeout /t 5 >nul
  exit /b 0
)
pause
exit /b %resultado%

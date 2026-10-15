@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0_internal\scripts\iniciar.ps1" %*
set "resultado=%errorlevel%"
if "%resultado%"=="0" exit /b 0
echo.
echo NeuroDatics no se pudo iniciar. Lee el mensaje anterior.
pause
exit /b %resultado%

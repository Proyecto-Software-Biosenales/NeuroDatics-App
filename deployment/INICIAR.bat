@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar.ps1" %*
set "resultado=%errorlevel%"
echo.
if "%resultado%"=="3010" echo Reinicia Windows. La instalacion continuara al iniciar sesion.
if not "%resultado%"=="0" if not "%resultado%"=="3010" echo No se completo la instalacion. Revisa el mensaje anterior.
pause
exit /b %resultado%

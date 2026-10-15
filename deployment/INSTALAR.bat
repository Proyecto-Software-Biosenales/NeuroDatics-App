@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0_internal\scripts\instalar.ps1" %*
set "resultado=%errorlevel%"
echo.
if "%resultado%"=="0" (
  echo Instalacion terminada. Desde ahora abre el icono NeuroDatics del escritorio o INICIAR.bat.
  echo Esta ventana se cerrara en unos segundos.
  timeout /t 15 >nul
  exit /b 0
)
if "%resultado%"=="3010" (
  echo Reinicia Windows. La instalacion continuara sola al iniciar sesion.
) else (
  echo No se completo la instalacion. Revisa el mensaje anterior.
)
pause
exit /b %resultado%

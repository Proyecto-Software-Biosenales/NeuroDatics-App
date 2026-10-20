# Solo para administradores: define la cuenta de Google Drive que guarda los archivos de
# todos los usuarios. La aplicación no ofrece esta opción a quien la usa.
#   powershell -ExecutionPolicy Bypass -File _internal\scripts\conectar-drive.ps1           (conectar o sustituir)
#   powershell -ExecutionPolicy Bypass -File _internal\scripts\conectar-drive.ps1 -Estado   (solo consultar)
param([switch]$Estado)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
$anteriores = @{}
try {
    $directorio = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $docker = Find-Docker (Find-DockerDesktop)
    if (-not $docker) { throw 'No se encontró Docker Desktop.' }
    $motor = Get-MotorDocker $docker
    if (-not $motor.Listo) { throw 'Docker Desktop está apagado. Inicia NeuroDatics con INICIAR.bat y repite.' }
    $anteriores = Set-EntornoCompose $directorio
    $argumentos = $motor.Args + @(Get-ComposeArgs $directorio)
    $accion = if ($Estado) { 'estado' } else { 'conectar' }
    $salida = Invoke-Nativo $docker ($argumentos + @('exec', '-T', 'backend', 'python', '-m',
        'neurodatics.modules.integrations.google_drive.admin', $accion))
    Write-Host $salida.Texto
    $enlace = ($salida.Texto -split "`n" | Where-Object { $_ -like 'https://accounts.google.com/*' } | Select-Object -First 1)
    if ($enlace) {
        Write-Host "`nSe abrirá el navegador. Inicia sesión con la cuenta que guardará los archivos y acepta los permisos." -ForegroundColor Green
        Start-Process $enlace.Trim()
    }
    exit 0
} catch {
    Write-Host "No se pudo completar: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Restore-EntornoCompose $anteriores
}

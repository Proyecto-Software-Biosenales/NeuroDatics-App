$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
$anteriores = @{}
try {
    $directorio = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $docker = Find-Docker (Find-DockerDesktop)
    if (-not $docker) { throw 'No se encontró Docker Desktop.' }
    $motor = Get-MotorDocker $docker
    if (-not $motor.Listo) {
        Write-Host 'NeuroDatics ya está detenida: Docker Desktop está apagado.' -ForegroundColor Green
        exit 0
    }
    $anteriores = Set-EntornoCompose $directorio
    $argumentos = $motor.Args + @(Get-ComposeArgs $directorio)
    Write-Paso 'Deteniendo NeuroDatics sin eliminar contenedores ni datos.'
    $null = Invoke-Nativo $docker ($argumentos + @('stop', '--timeout', '30'))
    Write-Host 'Aplicación detenida. Para volver a usarla abre el icono NeuroDatics del escritorio o INICIAR.bat.' -ForegroundColor Green
    exit 0
} catch {
    Write-Host "No se pudo detener: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Restore-EntornoCompose $anteriores
}

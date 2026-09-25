$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
$anteriores = @{}
try {
    $directorio = Split-Path -Parent $PSScriptRoot
    $anteriores = Set-EntornoCompose $directorio
    $docker = Find-Docker (Find-DockerDesktop)
    if (-not $docker) { throw 'No se encontró Docker Desktop.' }
    $argumentos = @(Get-DockerLocalArgs $docker) + @(Get-ComposeArgs $directorio)
    Write-Paso 'Deteniendo NeuroDatics sin eliminar contenedores ni datos.'
    $null = Invoke-Nativo $docker ($argumentos + @('stop', '--timeout', '30'))
    Write-Host 'Aplicación detenida. Puedes volver a iniciarla desde Docker Desktop > Containers > neurodatics.' -ForegroundColor Green
    exit 0
} catch {
    Write-Host "No se pudo detener: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Restore-EntornoCompose $anteriores
}

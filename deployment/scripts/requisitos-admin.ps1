# Solo este proceso se eleva. Docker y la aplicación se ejecutan como el usuario original.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
function Install-RequisitosWindows {
    $reiniciar = $false
    foreach ($nombre in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
        $estado = Get-WindowsOptionalFeature -Online -FeatureName $nombre
        if ($estado.State -eq 'EnablePending') { $reiniciar = $true }
        elseif ($estado.State -ne 'Enabled') {
            $resultado = Enable-WindowsOptionalFeature -Online -FeatureName $nombre -All -NoRestart
            if ($resultado.RestartNeeded) { $reiniciar = $true }
        }
    }
    $servicio = Get-Service -Name LanmanServer
    if ($servicio.StartType -ne 'Automatic') { Set-Service -Name LanmanServer -StartupType Automatic }
    if ($servicio.Status -ne 'Running') { Start-Service -Name LanmanServer }
    if ($reiniciar) { return 3010 }
    $wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
    $version = Invoke-Nativo $wsl @('--version') -PermitirError
    if ($version.Codigo -ne 0 -or (Get-VersionNumerica $version.Texto) -eq [version]'0.0.0') {
        $resultado = Invoke-Nativo $wsl @('--install', '--no-distribution', '--web-download') -PermitirError
    } elseif ((Get-VersionNumerica $version.Texto) -lt [version]'2.1.5') {
        $resultado = Invoke-Nativo $wsl @('--update', '--web-download') -PermitirError
    } else { return 0 }
    if ($resultado.Codigo -in @(3010, 1641)) { return 3010 }
    if ($resultado.Codigo -ne 0) { throw 'No se pudo instalar o actualizar WSL. Comprueba Internet, Windows Update y las políticas del equipo. Consulta SOLUCION-DE-PROBLEMAS.md.' }
    $null = Invoke-Nativo $wsl @('--set-default-version', '2')
    return 0
}
try {
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Windows necesita autorización de administrador para habilitar WSL.'
    }
    exit (Install-RequisitosWindows)
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

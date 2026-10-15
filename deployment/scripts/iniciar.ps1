[CmdletBinding()]
param(
    # Las instalaciones anteriores registraban «INICIAR.bat -Proyecto» para continuar
    # después de reiniciar; el argumento se sigue aceptando.
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$Proyecto = 'neurodatics',
    [switch]$SinAbrirNavegador
)

# Uso diario: nunca instala, descarga, pide permisos de administrador ni cambia .env.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'comun.ps1')
$directorio = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$codigoSalida = 0
$mutex = $null
$bloqueado = $false

function Stop-NoInstalado {
    throw 'NeuroDatics no está instalado o la instalación quedó incompleta: ejecuta INSTALAR.'
}

function Get-Instalacion([string]$Raiz) {
    $desktop = Find-DockerDesktop
    $archivoEnv = Join-Path $Raiz '.env'
    if (-not $desktop -or -not (Test-Path -LiteralPath $archivoEnv -PathType Leaf)) { Stop-NoInstalado }
    # Una continuación pendiente después de reiniciar indica una instalación a medias.
    if (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'NeuroDaticsInstalacion' -ErrorAction SilentlyContinue) { Stop-NoInstalado }
    $valores = Read-Configuracion $archivoEnv
    foreach ($clave in @('POSTGRES_PASSWORD', 'AUTH_JWT_SECRET', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET')) {
        if (Test-Marcador $valores[$clave]) { Stop-NoInstalado }
    }
    try { $manifest = Get-Manifiesto $Raiz -SinArchivos } catch { Stop-NoInstalado }
    return [pscustomobject]@{ Desktop = $desktop; Puerto = (Get-PuertoConfiguracion $valores); Manifest = $manifest }
}

function Assert-ImagenesInstaladas([string]$Docker, [string[]]$DockerArgs, $Manifest) {
    # Comparación por ID con el manifiesto, sin recalcular huellas ni cargar archivos.
    $etiquetas = @($Manifest.images | ForEach-Object { $_.tag })
    $esperado = @($Manifest.images | ForEach-Object { "$($_.id) $($Manifest.platform)" })
    $actual = Invoke-Nativo $Docker ($DockerArgs + @('image', 'inspect', '--format', '{{.Id}} {{.Os}}/{{.Architecture}}') + $etiquetas) -PermitirError
    $lineas = @($actual.Texto -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($actual.Codigo -ne 0 -or ($lineas -join ',') -ne ($esperado -join ',')) {
        throw 'La aplicación cargada en Docker no coincide con esta carpeta (por ejemplo, después de actualizarla) o falta alguna parte: ejecuta INSTALAR.'
    }
}

function Open-Aplicacion([string]$Url) {
    if (-not $SinAbrirNavegador) { Start-ComoUsuario $Url }
}

function Invoke-Inicio {
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    Assert-CuentaDeSesion
    $instalacion = Get-Instalacion $directorio
    $url = "http://localhost:$($instalacion.Puerto)"
    if (Test-Aplicacion $url 5) {
        Write-Host "NeuroDatics ya estaba abierta. Abriendo $url" -ForegroundColor Green
        Open-Aplicacion $url
        return 0
    }
    $docker = Find-Docker $instalacion.Desktop
    if (-not $docker) { Stop-NoInstalado }
    $motor = Get-MotorDocker $docker
    if (-not $motor.Listo) {
        Write-Paso 'Encendiendo Docker Desktop. Suele tardar menos de un minuto.'
        $motor = Wait-MotorDocker $docker $instalacion.Desktop 240
        if (-not $motor.Listo) {
            throw 'Docker Desktop no terminó de encenderse en 4 minutos. Ábrelo desde el menú Inicio, espera a que indique que está en marcha y vuelve a abrir INICIAR.bat.'
        }
    }
    Assert-MotorLinux $motor 'INICIAR.bat'
    Write-Paso 'Comprobando la aplicación instalada.'
    Assert-ImagenesInstaladas $docker $motor.Args $instalacion.Manifest
    Assert-Puerto $docker $motor.Args $Proyecto $instalacion.Puerto
    Write-Paso 'Iniciando NeuroDatics. Tus datos se conservan.'
    $entorno = Set-EntornoCompose $directorio
    try {
        $composeArgs = $motor.Args + @(Get-ComposeArgs $directorio $Proyecto)
        # Crea los contenedores que falten y arranca los detenidos; nunca borra volúmenes.
        $arranque = Invoke-Nativo $docker ($composeArgs + @('up', '-d', '--no-build', '--pull', 'never', '--remove-orphans', '--wait', '--wait-timeout', '300')) -PermitirError
    } finally { Restore-EntornoCompose $entorno }
    if ($arranque.Codigo -ne 0) {
        throw "Los servicios de NeuroDatics no arrancaron. Abre de nuevo INICIAR.bat; si se repite, consulta _internal\SOLUCION-DE-PROBLEMAS.md.`nDetalle de Docker: $($arranque.Texto)"
    }
    Wait-Aplicacion $url
    Write-Host "NeuroDatics está lista en $url ($([int]$reloj.Elapsed.TotalSeconds) s)." -ForegroundColor Green
    Open-Aplicacion $url
    return 0
}

try {
    # El mismo mutex que el instalador: nunca corren dos a la vez.
    $mutex = New-Object Threading.Mutex($false, 'Local\NeuroDaticsInstalacion')
    try { $bloqueado = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $bloqueado = $true }
    if (-not $bloqueado) { throw 'NeuroDatics ya se está iniciando o instalando en otra ventana. Espera a que termine.' }
    Write-Host 'NeuroDatics: iniciando' -ForegroundColor Green
    $codigoSalida = Invoke-Inicio
} catch {
    $codigoSalida = 1
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($bloqueado -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
exit $codigoSalida

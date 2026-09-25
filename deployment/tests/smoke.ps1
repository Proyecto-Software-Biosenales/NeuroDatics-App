#Requires -Version 7.0
[CmdletBinding()]
param([string]$Paquete, [int]$Puerto = 3317, [switch]$Conservar)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Paquete) { $Paquete = Join-Path $repo 'delivery/NeuroDatics-App' }
. (Join-Path $repo 'deployment/scripts/comun.ps1')
$docker = (Get-Command docker).Source
$dockerArgs = @(Get-DockerLocalArgs $docker)
$id = [guid]::NewGuid().ToString('N').Substring(0, 8)
$proyecto = "neurodatics-prueba-$id"
$prueba = Join-Path $repo "output/entrega-prueba-$id"
$null = New-Item -ItemType Directory -Path $prueba
$guardadas = @{}
$resultado = Join-Path $prueba 'resultado.txt'
$iniciado = $false
try {
    $manifest = Get-Manifiesto $Paquete -VerificarArchivos
    foreach ($archivo in $manifest.files) {
        $origen = Join-Path $Paquete $archivo.path
        $destino = Join-Path $prueba $archivo.path
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $destino) -Force
        if ($archivo.path -like 'images/*') {
            $null = New-Item -ItemType HardLink -Path $destino -Target $origen
        } else { Copy-Item -LiteralPath $origen -Destination $destino }
    }
    Copy-Item -LiteralPath (Join-Path $Paquete 'manifest.json') -Destination $prueba
    Copy-Item -LiteralPath (Join-Path $Paquete 'images/SHA256SUMS.txt') -Destination (Join-Path $prueba 'images/SHA256SUMS.txt')
    Copy-Item -LiteralPath (Join-Path $prueba '.env.example') -Destination (Join-Path $prueba '.env')
    $ruta = Join-Path $prueba '.env'
    $sinteticos = @{
        FRONTEND_PORT = "$Puerto"; DATABASE_URL = ''; POSTGRES_PASSWORD = (New-Secreto); AUTH_JWT_SECRET = (New-Secreto)
        GOOGLE_OAUTH_CLIENT_ID = 'prueba-sintetica.apps.googleusercontent.com'; GOOGLE_OAUTH_CLIENT_SECRET = 'solo-prueba-local'
        GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:$Puerto/authorize"
        GOOGLE_DRIVE_OAUTH_REDIRECT_URI = "http://localhost:$Puerto/api/integrations/google-drive/callback"
        CORS_ALLOWED_ORIGINS = "http://localhost:$Puerto"
    }
    foreach ($clave in $sinteticos.Keys) { Set-Configuracion $ruta $clave $sinteticos[$clave] }
    $compose = Get-Content -LiteralPath (Join-Path $prueba 'docker-compose.yml') -Raw | ConvertFrom-Json -AsHashtable
    # Evita que variables del shell del mantenedor desvíen la prueba a otra base.
    $claves = @($compose.services.backend.environment.Keys) + @('POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_USER', 'FRONTEND_PORT', 'COMPOSE_PROFILES')
    foreach ($clave in $claves | Select-Object -Unique) {
        $guardadas[$clave] = [Environment]::GetEnvironmentVariable($clave, 'Process')
        Remove-Item -LiteralPath "Env:$clave" -ErrorAction SilentlyContinue
    }
    $composeArgs = $dockerArgs + @(Get-ComposeArgs $prueba $proyecto)
    $config = (Invoke-Nativo $docker ($composeArgs + @('config', '--format', 'json'))).Texto | ConvertFrom-Json -AsHashtable
    if (($config.services.Keys | Sort-Object) -join ',' -ne 'backend,db,frontend,redis') { throw 'Cantidad de servicios incorrecta.' }
    foreach ($servicio in $config.services.Values) {
        if ($servicio.Contains('build') -or $servicio.pull_policy -ne 'never') { throw 'La entrega intentaría construir o descargar imágenes.' }
    }
    foreach ($volumen in $config.volumes.Values) {
        if (-not $volumen.name.StartsWith($proyecto + '_')) { throw 'Volumen no aislado: se cancela la prueba.' }
    }
    $null = Invoke-Nativo $docker ($composeArgs + @('config', '--quiet'))
    Assert-Puerto $docker $dockerArgs $proyecto $Puerto
    foreach ($imagen in $manifest.images) {
        Write-Paso "Comprobando la importación real del archivo $($imagen.file)."
        $null = Invoke-Nativo $docker ($dockerArgs + @('load', '--input', (Join-Path $prueba $imagen.file)))
    }
    Write-Paso 'Ejecutando el instalador real en Windows PowerShell 5.1 con configuración sintética.'
    $iniciado = $true
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $prueba 'scripts/instalar.ps1') -NoInteractivo -SinAbrirNavegador -Proyecto $proyecto
    if ($LASTEXITCODE -ne 0) { throw 'Falló la primera ejecución del instalador.' }
    $null = Invoke-Nativo $docker ($composeArgs + @('exec', '-T', 'backend', 'sh', '-c', 'test ! -e /app/data/auth_users.json && test ! -e /app/.env'))
    $url = "http://localhost:$Puerto"
    foreach ($rutaHttp in @('/', '/docs', '/configuracion', '/openapi.json')) {
        $respuesta = Invoke-WebRequest -Uri "$url$rutaHttp" -TimeoutSec 20
        if ($respuesta.StatusCode -ne 200) { throw "No responde $rutaHttp." }
    }
    $oauth = Invoke-RestMethod -Uri "$url/api/auth/google/login-url?redirect_uri=$([uri]::EscapeDataString("$url/authorize"))"
    if ($oauth.authorization_url -notlike 'https://accounts.google.com/*') { throw 'No se generó la URL de Google.' }
    $anonimo = Invoke-WebRequest -Uri "$url/api/integrations/google-drive/connection" -SkipHttpErrorCheck
    if ($anonimo.StatusCode -ne 401) { throw 'La configuración de Drive no está protegida.' }
    # La migración actual debe haberse aplicado a la base recién creada.
    $migracion = (Invoke-Nativo $docker ($composeArgs + @('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'neurodatics', '-Atc', 'SELECT version_num FROM alembic_version;'))).Texto.Trim()
    if (-not $migracion) { throw 'No se aplicaron migraciones.' }
    $null = Invoke-Nativo $docker ($composeArgs + @('exec', '-T', 'backend', 'sh', '-c', 'printf conservado > /data/prueba-entrega.txt'))
    $idsAntes = (Invoke-Nativo $docker ($composeArgs + @('ps', '-aq'))).Texto -split "`n" | Sort-Object
    $hashAntes = (Get-FileHash -LiteralPath $ruta).Hash
    Write-Paso 'Repetición del instalador: comprobar idempotencia y conservación de configuración.'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $prueba 'scripts/instalar.ps1') -NoInteractivo -SinAbrirNavegador -Proyecto $proyecto
    if ($LASTEXITCODE -ne 0) { throw 'Falló la segunda ejecución del instalador.' }
    if ((Get-FileHash -LiteralPath $ruta).Hash -ne $hashAntes) { throw 'El instalador alteró la configuración existente.' }
    Write-Paso 'Deteniendo y arrancando los mismos contenedores, sin Compose up, como Docker Desktop.'
    $null = Invoke-Nativo $docker ($composeArgs + @('stop', '--timeout', '30'))
    $idsDespues = (Invoke-Nativo $docker ($composeArgs + @('ps', '-aq'))).Texto -split "`n" | Sort-Object
    if (($idsAntes -join ',') -ne ($idsDespues -join ',')) { throw 'Se eliminaron o recrearon contenedores al detener.' }
    $null = Invoke-Nativo $docker ($dockerArgs + @('start') + $idsDespues)
    $limite = (Get-Date).AddMinutes(5)
    do {
        $salud = (Invoke-Nativo $docker ($dockerArgs + @('inspect', '--format', '{{.State.Health.Status}}') + $idsDespues)).Texto -split "`n"
        if (@($salud | Where-Object { $_.Trim() -ne 'healthy' }).Count -eq 0) { break }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $limite)
    if (@($salud | Where-Object { $_.Trim() -ne 'healthy' }).Count) { throw 'El arranque directo no recuperó la salud de todos los servicios.' }
    $dato = (Invoke-Nativo $docker ($composeArgs + @('exec', '-T', 'backend', 'cat', '/data/prueba-entrega.txt'))).Texto.Trim()
    if ($dato -ne 'conservado') { throw 'No se conservó el volumen de datos.' }
    $null = Invoke-WebRequest -Uri "$url/configuracion" -TimeoutSec 20
    @('PRUEBA CORRECTA', "Fecha: $(Get-Date -Format o)", "Proyecto aislado: $proyecto", "Migración: $migracion", 'Instalador Windows PowerShell 5.1: primera ejecución y repetición correctas', 'Cuatro servicios saludables, proxy y autenticación protegida', 'Parada y arranque directo: conserva contenedores, configuración y volumen', 'Google: credenciales sintéticas; no se ensayó consentimiento real', 'WSL/Docker: ya estaban instalados en el anfitrión') | Set-Content -LiteralPath $resultado -Encoding utf8NoBOM
    Write-Host "Prueba correcta. Evidencia: $resultado" -ForegroundColor Green
} finally {
    if ($iniciado -and -not $Conservar) {
        # Solo recursos temporales cuyo proyecto fue generado por esta prueba.
        if ($proyecto -notmatch '^neurodatics-prueba-[a-f0-9]{8}$') { throw 'Nombre de proyecto de prueba no válido; no se borrará.' }
        $null = Invoke-Nativo $docker ($composeArgs + @('down', '--volumes')) -PermitirError
    }
    foreach ($clave in $guardadas.Keys) {
        if ($null -eq $guardadas[$clave]) { Remove-Item -LiteralPath "Env:$clave" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($clave, $guardadas[$clave], 'Process') }
    }
}

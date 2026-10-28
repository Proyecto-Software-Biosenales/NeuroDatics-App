#Requires -Version 7.0
[CmdletBinding()]
param([string]$Destino, [string]$Configuracion)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/comun.ps1')
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Destino) { $Destino = Join-Path $repo 'delivery/NeuroDatics-App' }
$Destino = [IO.Path]::GetFullPath($Destino)
if ($Destino -eq $repo -or $Destino -eq $PSScriptRoot) { throw 'Elige una carpeta de entrega separada del código fuente.' }
$null = New-Item -ItemType Directory -Path $Destino -Force
# Raíz: solo los lanzadores, la guía y el .env privado; el resto va en _internal.
$interno = Get-Interno $Destino
$visibles = @('INSTALAR.bat', 'INICIAR.bat', 'DETENER.bat', 'LEEME-PRIMERO.txt')
$docker = (Get-Command docker -ErrorAction Stop).Source
$baseArgs = @('compose', '--env-file', (Join-Path $repo '.env.example'), '-f', (Join-Path $repo 'docker-compose.yml'), '-f', (Join-Path $repo 'docker-compose.delivery.yml'))

function Get-HuellaCodigo {
    $huellas = @(foreach ($relativa in (Invoke-Nativo 'git' @('-C', $repo, '-c', 'core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'backend', 'frontend', 'deployment', 'docker-compose.yml', 'docker-compose.delivery.yml')).Texto -split "`n" | Sort-Object -Unique) {
        $ruta = Join-Path $repo $relativa
        if (Test-Path -LiteralPath $ruta -PathType Leaf) { "$relativa $((Get-FileHash -LiteralPath $ruta -Algorithm SHA256).Hash)" }
    })
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($huellas -join "`n")))).ToLowerInvariant() }
    finally { $sha.Dispose() }
}
$sourceHash = Get-HuellaCodigo

# Variables sintéticas para construir sin leer .env privados ni aplicar migraciones.
$guardadas = @{}
foreach ($clave in @('POSTGRES_PASSWORD', 'AUTH_JWT_SECRET', 'DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET')) {
    $guardadas[$clave] = [Environment]::GetEnvironmentVariable($clave, 'Process')
    [Environment]::SetEnvironmentVariable($clave, $(if ($clave -in @('POSTGRES_PASSWORD', 'AUTH_JWT_SECRET')) { New-Secreto } else { '' }), 'Process')
}
try {
    Write-Paso 'Construyendo las imágenes desde el código actual (incluye los cambios sin confirmar).'
    & $docker @baseArgs build --provenance=false --sbom=false backend frontend
    if ($LASTEXITCODE -ne 0) { throw 'Falló la construcción; no se exportaron imágenes.' }
    $null = Invoke-Nativo $docker @('pull', '--platform', 'linux/amd64', 'postgres:16-alpine')
    $null = Invoke-Nativo $docker @('pull', '--platform', 'linux/amd64', 'redis:7-alpine')

    # Solo después de construir: una construcción fallida deja la entrega anterior como estaba.
    $null = Remove-EntregaAnterior $Destino
    $sobrantes = @(Get-ChildItem -LiteralPath $Destino -Force | Where-Object { $_.Name -notin ($visibles + @('.env', '_internal')) })
    if ($sobrantes) { throw "La carpeta de entrega contiene archivos que no son de esta entrega: $(($sobrantes | ForEach-Object Name) -join ', '). Retíralos o elige otro destino." }
    $null = New-Item -ItemType Directory -Path $interno -Force

    $json = Invoke-Nativo $docker ($baseArgs + @('config', '--no-interpolate', '--no-path-resolution', '--format', 'json'))
    $compose = $json.Texto | ConvertFrom-Json -AsHashtable
    $null = $compose.Remove('x-backend-environment')
    foreach ($red in $compose.networks.Values) { $null = $red.Remove('name') }
    foreach ($volumen in $compose.volumes.Values) { $null = $volumen.Remove('name') }
    foreach ($servicio in $compose.services.Values) {
        $null = $servicio.Remove('build')
        $servicio['pull_policy'] = 'never'
        $servicio['platform'] = 'linux/amd64'
    }
    $compose.services.frontend.ports = @('127.0.0.1:${FRONTEND_PORT:-3000}:3000')
    # La URL local respeta usuario y base elegidos, sin incorporar secretos al paquete.
    $compose.services.backend.environment.DATABASE_URL = '${DATABASE_URL:-postgresql+psycopg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}@db:5432/${POSTGRES_DB:-neurodatics}}'
    foreach ($servicio in $compose.services.Values) {
        if ($servicio.Contains('environment')) {
            foreach ($clave in @($servicio.environment.Keys)) {
                $servicio.environment[$clave] = ([string]$servicio.environment[$clave]).Replace('Set POSTGRES_PASSWORD in .env before starting Docker.', 'Falta POSTGRES_PASSWORD en .env').Replace('Set AUTH_JWT_SECRET in .env before starting Docker.', 'Falta AUTH_JWT_SECRET en .env')
            }
        }
    }
    $compose | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath (Join-Path $interno 'docker-compose.yml') -Encoding utf8NoBOM
    foreach ($archivo in @('INSTALAR.bat', 'INICIAR.bat', 'DETENER.bat')) {
        $texto = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $archivo)) -replace '\r?\n', "`r`n"
        [IO.File]::WriteAllText((Join-Path $Destino $archivo), $texto, (New-Object Text.UTF8Encoding($false)))
    }
    # El Bloc de notas reconoce las tildes con BOM y CRLF, como la guía de la edición local.
    $guia = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'LEEME-PRIMERO.txt')) -replace '\r?\n', "`r`n"
    [IO.File]::WriteAllText((Join-Path $Destino 'LEEME-PRIMERO.txt'), $guia, (New-Object Text.UTF8Encoding($true)))
    foreach ($archivo in @('.env.example', 'README.md', 'CONFIGURACION-GOOGLE.md', 'SOLUCION-DE-PROBLEMAS.md')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $archivo) -Destination (Join-Path $interno $archivo) -Force
    }
    Copy-Item -LiteralPath (Join-Path $repo 'frontend/app/favicon.ico') -Destination (Join-Path $interno 'neurodatics.ico') -Force
    $scripts = Join-Path $interno 'scripts'
    $null = New-Item -ItemType Directory -Path $scripts -Force
    $fuentes = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'scripts') -File)
    foreach ($archivo in $fuentes) {
        # BOM para tildes en Windows PowerShell 5.1.
        $texto = [IO.File]::ReadAllText($archivo.FullName)
        [IO.File]::WriteAllText((Join-Path $scripts $archivo.Name), $texto, (New-Object Text.UTF8Encoding($archivo.Extension -eq '.ps1')))
    }
    # Scripts retirados del código fuente; _internal/scripts solo lo escribe este generador.
    Get-ChildItem -LiteralPath $scripts -File -Force | Where-Object { $_.Name -notin $fuentes.Name } | Remove-Item -Force
    if ($Configuracion) {
        $origen = (Resolve-Path -LiteralPath $Configuracion).Path
        $target = Join-Path $Destino '.env'
        if (Test-Path -LiteralPath $target) { throw 'La entrega ya contiene .env. Se conserva; elige otro destino para suministrar una configuración diferente.' }
        Copy-Item -LiteralPath $origen -Destination $target
    }
    $imagenes = @(
        @{ tag = 'neurodatics-backend:delivery'; file = '_internal/images/neurodatics-backend.tar.gz' },
        @{ tag = 'neurodatics-frontend:delivery'; file = '_internal/images/neurodatics-frontend.tar.gz' },
        @{ tag = 'postgres:16-alpine'; file = '_internal/images/postgres-16-alpine.tar.gz' },
        @{ tag = 'redis:7-alpine'; file = '_internal/images/redis-7-alpine.tar.gz' }
    )
    $null = New-Item -ItemType Directory -Path (Join-Path $interno 'images') -Force
    foreach ($imagen in $imagenes) {
        Write-Paso "Exportando $($imagen.tag)."
        $info = (Invoke-Nativo $docker @('image', 'inspect', $imagen.tag)).Texto | ConvertFrom-Json
        if ($info[0].Os -ne 'linux' -or $info[0].Architecture -ne 'amd64') { throw 'Una imagen no es linux/amd64.' }
        $imagen['id'] = $info[0].Id
        $tar = Join-Path $Destino ($imagen.file + '.tmp.tar')
        $gzip = Join-Path $Destino $imagen.file
        $null = Invoke-Nativo $docker @('save', '--output', $tar, $imagen.tag)
        $entrada = [IO.File]::OpenRead($tar)
        $salida = [IO.File]::Create($gzip + '.nuevo')
        $compresor = New-Object IO.Compression.GZipStream($salida, [IO.Compression.CompressionLevel]::Fastest)
        try { $entrada.CopyTo($compresor) }
        finally { $compresor.Dispose(); $salida.Dispose(); $entrada.Dispose() }
        # Sustituir el archivo terminado evita truncar una copia enlazada usada por pruebas.
        [IO.File]::Move($gzip + '.nuevo', $gzip, $true)
        # Archivo temporal individual, creado por esta ejecución; no se borra ningún dato de usuario.
        Remove-Item -LiteralPath $tar
    }
    # -Force: _internal puede estar oculta desde una generación anterior.
    $contenido = @($visibles | ForEach-Object { Get-Item -LiteralPath (Join-Path $Destino $_) }) + @(Get-ChildItem -LiteralPath $interno -Recurse -File -Force)
    $archivos = @($contenido | Where-Object {
        $_.Name -notin @('manifest.json', 'VERSION.txt', 'SHA256SUMS.txt', 'instalacion.log', 'instalacion-anterior.log')
    } | ForEach-Object {
        @{ path = [IO.Path]::GetRelativePath($Destino, $_.FullName).Replace('\', '/'); bytes = $_.Length;
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    $commit = (Invoke-Nativo 'git' @('-C', $repo, 'rev-parse', 'HEAD')).Texto.Trim()
    $estado = (Invoke-Nativo 'git' @('-C', $repo, 'status', '--porcelain')).Texto
    if ((Get-HuellaCodigo) -ne $sourceHash) { throw 'El código cambió durante la construcción. Repite la generación antes de distribuir el paquete.' }
    $manifest = [ordered]@{ schema = 1; platform = 'linux/amd64'; generated_at = (Get-Date).ToUniversalTime().ToString('o');
        commit = $commit; working_tree_modified = [bool]$estado; source_sha256 = $sourceHash; images = $imagenes; files = $archivos }
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $interno 'manifest.json') -Encoding utf8NoBOM
    $archivos | Where-Object { $_.path -like '_internal/images/*' } | ForEach-Object { "$($_.sha256)  $([IO.Path]::GetFileName($_.path))" } | Set-Content -LiteralPath (Join-Path $interno 'images/SHA256SUMS.txt') -Encoding ascii
    @("NeuroDatics: entrega generada el $($manifest.generated_at)", "Commit base: $commit", "Incluye cambios sin confirmar: $([bool]$estado)", "Huella del código: $sourceHash", 'Plataforma: linux/amd64', 'Servicios: frontend, backend, db, redis', 'Pruebas: consulta deployment/MANTENIMIENTO.md en el repositorio; generar el paquete no equivale a probarlo.') | Set-Content -LiteralPath (Join-Path $interno 'VERSION.txt') -Encoding utf8NoBOM
    $null = Get-Manifiesto $Destino -VerificarArchivos
    # Visible aquí: Compress-Archive y otros compresores omiten las carpetas ocultas.
    # INSTALAR la oculta en el equipo del usuario.
    $carpeta = Get-Item -LiteralPath $interno -Force
    $carpeta.Attributes = $carpeta.Attributes -band (-bnot [IO.FileAttributes]::Hidden)
    $mostrados = @(Get-ChildItem -LiteralPath $Destino -File | Where-Object Name -ne '.env' | ForEach-Object Name)
    if (Compare-Object ($mostrados | Sort-Object) ($visibles | Sort-Object)) { throw "La carpeta de entrega muestra $($mostrados -join ', ') en lugar de $($visibles -join ', ')." }
    Write-Host "Entrega generada y verificada: $Destino" -ForegroundColor Green
    Write-Host 'Se conservó .env si ya existía. No se incluyeron credenciales del repositorio automáticamente.'
} finally {
    Restore-EntornoCompose $guardadas
}

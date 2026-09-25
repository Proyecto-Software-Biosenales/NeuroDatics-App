# Compatible con Windows PowerShell 5.1, incluido en Windows.
Set-StrictMode -Version 2.0

function Write-Paso([string]$Mensaje) { Write-Host "`n> $Mensaje" -ForegroundColor Cyan }

function Invoke-Nativo {
    param([string]$Archivo, [string[]]$Argumentos, [switch]$PermitirError)
    # PowerShell 5.1 trata stderr como ErrorRecord incluso cuando el comando tiene éxito.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $salida = @(& $Archivo @Argumentos 2>&1 | ForEach-Object { "$_" })
        $codigo = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if (-not $PermitirError -and $codigo -ne 0) {
        throw "Falló $Archivo (código $codigo). $($salida -join [Environment]::NewLine)"
    }
    [pscustomobject]@{ Codigo = $codigo; Texto = ($salida -join "`n") }
}

function Read-Configuracion([string]$Ruta) {
    $valores = @{}
    foreach ($linea in [IO.File]::ReadAllLines($Ruta)) {
        if ($linea -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $clave = $Matches[1]; $valor = $Matches[2].Trim()
            if ($valor.StartsWith("'") -and $valor.EndsWith("'")) {
                $valor = $valor.Substring(1, $valor.Length - 2).Replace("\'", "'")
            } elseif ($valor.StartsWith('"') -and $valor.EndsWith('"')) {
                $valor = $valor.Substring(1, $valor.Length - 2)
            } else { $valor = ($valor -replace '\s+#.*$', '').Trim() }
            $valores[$clave] = $valor
        }
    }
    return $valores
}

function Set-Configuracion([string]$Ruta, [string]$Clave, [string]$Valor) {
    if ($Valor -match "[`r`n]") { throw "El valor de $Clave debe ocupar una sola línea." }
    # Comillas simples: Compose no interpola dólares en contraseñas ni credenciales.
    $nueva = $Clave + "='" + $Valor.Replace("'", "\'") + "'"
    $encontrada = $false
    $lineas = @(foreach ($linea in [IO.File]::ReadAllLines($Ruta)) {
        if ($linea -match ('^\s*' + [regex]::Escape($Clave) + '\s*=')) {
            if (-not $encontrada) { $nueva }; $encontrada = $true
        } else { $linea }
    })
    if (-not $encontrada) { $lineas += $nueva }
    [IO.File]::WriteAllLines($Ruta, $lineas, (New-Object Text.UTF8Encoding($false)))
}

function New-Secreto {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Test-Marcador([string]$Valor) {
    return ([string]::IsNullOrWhiteSpace($Valor) -or $Valor -match '^(replace-|change-|neurodatics-local-development-secret|CAMBIAR|REEMPLAZAR)')
}

function Initialize-Configuracion([string]$Directorio, [switch]$NoInteractivo) {
    $ruta = Join-Path $Directorio '.env'
    $nuevo = -not (Test-Path -LiteralPath $ruta)
    if ($nuevo) { Copy-Item -LiteralPath (Join-Path $Directorio '.env.example') -Destination $ruta }
    $valores = Read-Configuracion $ruta
    foreach ($clave in @('POSTGRES_PASSWORD', 'AUTH_JWT_SECRET')) {
        if (Test-Marcador $valores[$clave]) {
            if (-not $nuevo -and $clave -eq 'POSTGRES_PASSWORD') {
                throw 'El .env existente no tiene una contraseña PostgreSQL válida. Recupera su contraseña original; no se cambia automáticamente para proteger los datos.'
            }
            Set-Configuracion $ruta $clave (New-Secreto)
        }
    }
    $valores = Read-Configuracion $ruta
    foreach ($clave in @('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET')) {
        if (Test-Marcador $valores[$clave]) {
            if ($NoInteractivo) { throw "Falta $clave. El responsable debe completar .env; consulta CONFIGURACION-GOOGLE.md." }
            Write-Host 'El responsable del proyecto debe proporcionar las credenciales de Google. Consulta CONFIGURACION-GOOGLE.md.'
            if ($clave -eq 'GOOGLE_OAUTH_CLIENT_SECRET') {
                $seguro = Read-Host 'Secreto de cliente de Google (no se mostrará)' -AsSecureString
                $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
                try { $valor = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
                finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
            } else { $valor = Read-Host 'ID de cliente de Google' }
            if (Test-Marcador $valor) { throw "Falta $clave. Vuelve a iniciar cuando tengas las credenciales." }
            Set-Configuracion $ruta $clave $valor
        }
    }
    $valores = Read-Configuracion $ruta
    if ($valores['AUTH_JWT_SECRET'].Length -lt 32) { throw 'AUTH_JWT_SECRET debe tener al menos 32 caracteres. Revisa .env.' }
    $puerto = 3000
    if ($valores['FRONTEND_PORT']) {
        if (-not [int]::TryParse($valores['FRONTEND_PORT'], [ref]$puerto) -or $puerto -lt 1 -or $puerto -gt 65535) {
            throw 'FRONTEND_PORT debe ser un número entre 1 y 65535.'
        }
    }
    if (-not $valores['DATABASE_URL']) {
        if ($valores['POSTGRES_PASSWORD'] -match '[^a-zA-Z0-9._~-]') {
            throw 'La contraseña local contiene caracteres reservados de URL. Configura DATABASE_URL con la contraseña codificada; no cambies la contraseña de una base existente.'
        }
    }
    foreach ($par in @(
        @('GOOGLE_OAUTH_REDIRECT_URI', "http://localhost:$puerto/authorize"),
        @('GOOGLE_DRIVE_OAUTH_REDIRECT_URI', "http://localhost:$puerto/api/integrations/google-drive/callback")
    )) {
        if (-not $valores[$par[0]]) { Set-Configuracion $ruta $par[0] $par[1] }
        elseif ($valores[$par[0]] -ne $par[1]) {
            throw "$($par[0]) no coincide con el puerto local $puerto. Consulta CONFIGURACION-GOOGLE.md antes de cambiar la dirección."
        }
    }
    return $puerto
}

function Get-Manifiesto([string]$Directorio, [switch]$VerificarArchivos) {
    $ruta = Join-Path $Directorio 'manifest.json'
    if (-not (Test-Path -LiteralPath $ruta)) { throw 'Falta manifest.json. Descarga y extrae el paquete completo.' }
    $manifest = Get-Content -LiteralPath $ruta -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.platform -ne 'linux/amd64' -or @($manifest.images).Count -ne 4) {
        throw 'El manifiesto no corresponde a una entrega compatible.'
    }
    foreach ($archivo in $manifest.files) {
        $base = [IO.Path]::GetFullPath($Directorio).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        $completa = [IO.Path]::GetFullPath((Join-Path $Directorio $archivo.path))
        if (-not $completa.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta inválida en manifest.json.' }
        if (-not (Test-Path -LiteralPath $completa -PathType Leaf)) { throw "Falta $($archivo.path). Extrae todo el paquete fuera del ZIP." }
        if ($VerificarArchivos) {
            if ((Get-Item -LiteralPath $completa).Length -ne $archivo.bytes -or
                (Get-FileHash -LiteralPath $completa -Algorithm SHA256).Hash -ne $archivo.sha256) {
                throw "El archivo $($archivo.path) está incompleto o modificado. Descarga de nuevo la entrega." }
        }
    }
    foreach ($imagen in $manifest.images) {
        if ($imagen.id -notmatch '^sha256:[0-9a-f]{64}$' -or
            -not ($manifest.files | Where-Object { $_.path -eq $imagen.file })) { throw 'Imagen inválida en manifest.json.' }
    }
    return $manifest
}

function Find-DockerDesktop {
    $candidatos = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    )
    foreach ($ruta in $candidatos) { if (Test-Path -LiteralPath $ruta) { return $ruta } }
    foreach ($clave in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop')) {
        $registro = Get-ItemProperty -LiteralPath $clave -ErrorAction SilentlyContinue
        if ($registro -and $registro.PSObject.Properties['InstallLocation']) {
            $ruta = Join-Path $registro.InstallLocation 'Docker Desktop.exe'
            if (Test-Path -LiteralPath $ruta) { return $ruta }
        }
    }
    return $null
}

function Find-Docker([string]$Desktop) {
    if ($Desktop) {
        $ruta = Join-Path (Split-Path -Parent $Desktop) 'resources\bin\docker.exe'
        if (Test-Path -LiteralPath $ruta) { return $ruta }
    }
    $comando = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($comando) { return $comando.Source }
    return $null
}

function Get-VersionNumerica([string]$Texto) {
    $limpio = $Texto.Replace([string][char]0, '')
    if ($limpio -match '(\d+\.\d+\.\d+)') { return [version]$Matches[1] }
    return [version]'0.0.0'
}

function Get-DockerLocalArgs([string]$Docker) {
    # Contexto explícito: jamás configurar accidentalmente un motor remoto.
    $contextos = Invoke-Nativo $Docker @('context', 'ls', '--format', '{{.Name}}')
    $nombre = 'default'
    if (($contextos.Texto -split "`n") -contains 'desktop-linux') { $nombre = 'desktop-linux' }
    $contexto = Invoke-Nativo $Docker @('context', 'inspect', $nombre, '--format', '{{.Endpoints.docker.Host}}')
    if ($contexto.Texto.Trim() -notmatch '^npipe://') { throw 'No se encontró el motor local de Docker Desktop. Ábrelo y selecciona contenedores Linux.' }
    return @('--context', $nombre)
}

function Set-EntornoCompose([string]$Directorio) {
    # El .env del paquete manda: una consola de desarrollo puede heredar la URL
    # de otra base. Nunca debemos ejecutar migraciones allí por accidente.
    $texto = [IO.File]::ReadAllText((Join-Path $Directorio 'docker-compose.yml'))
    $claves = @([regex]::Matches($texto, '\$\{([A-Z][A-Z0-9_]*)') | ForEach-Object { $_.Groups[1].Value }) + @('COMPOSE_PROFILES')
    $anteriores = @{}
    foreach ($clave in $claves | Select-Object -Unique) {
        $anteriores[$clave] = [Environment]::GetEnvironmentVariable($clave, 'Process')
        # Compose lee y desescapa el .env; eliminar la variable heredada evita
        # duplicar o modificar sus reglas de comillas/interpolación.
        Remove-Item -LiteralPath "Env:$clave" -ErrorAction SilentlyContinue
    }
    return $anteriores
}

function Restore-EntornoCompose([hashtable]$Anteriores) {
    foreach ($clave in $Anteriores.Keys) {
        if ($null -eq $Anteriores[$clave]) { Remove-Item -LiteralPath "Env:$clave" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($clave, $Anteriores[$clave], 'Process') }
    }
}

function Import-Imagenes([string]$Docker, [string[]]$DockerArgs, [string]$Directorio, $Manifest) {
    foreach ($imagen in $Manifest.images) {
        $actual = Invoke-Nativo $Docker ($DockerArgs + @('image', 'inspect', $imagen.tag, '--format', '{{.Id}}')) -PermitirError
        if ($actual.Codigo -ne 0 -or $actual.Texto.Trim() -ne $imagen.id) {
            Write-Paso "Cargando $($imagen.tag). Puede tardar varios minutos."
            $null = Invoke-Nativo $Docker ($DockerArgs + @('load', '--input', (Join-Path $Directorio $imagen.file)))
        }
        $actual = Invoke-Nativo $Docker ($DockerArgs + @('image', 'inspect', $imagen.tag, '--format', '{{.Id}} {{.Os}}/{{.Architecture}}'))
        if ($actual.Texto.Trim() -ne "$($imagen.id) $($Manifest.platform)") { throw "La imagen $($imagen.tag) no coincide con esta entrega." }
    }
}

function Get-ComposeArgs([string]$Directorio, [string]$Proyecto = 'neurodatics') {
    return @('compose', '--project-name', $Proyecto, '--project-directory', $Directorio,
        '--env-file', (Join-Path $Directorio '.env'), '-f', (Join-Path $Directorio 'docker-compose.yml'))
}

function Assert-Puerto([string]$Docker, [string[]]$DockerArgs, [string]$Proyecto, [int]$Puerto) {
    $puertos = Invoke-Nativo $Docker ($DockerArgs + @('ps', '--filter', "label=com.docker.compose.project=$Proyecto", '--filter', 'label=com.docker.compose.service=frontend', '--format', '{{.Ports}}'))
    if ($puertos.Texto -match (':' + $Puerto + '->3000/tcp')) { return }
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Puerto)
    try { $listener.Start() } catch { throw "El puerto $Puerto está ocupado. Cierra la otra aplicación o consulta CONFIGURACION-GOOGLE.md para cambiarlo." }
    finally { $listener.Stop() }
}

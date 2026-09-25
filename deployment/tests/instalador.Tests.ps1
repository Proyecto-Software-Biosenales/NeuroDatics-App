# Sin Pester ni herramientas de desarrollo: ejecutar con Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$fuente = Split-Path -Parent $PSScriptRoot
. (Join-Path $fuente 'scripts/comun.ps1')
$temporal = Join-Path ([IO.Path]::GetTempPath()) ('NeuroDatics pruebas ' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporal
$script:correctas = 0
function Assert([bool]$Condicion, [string]$Nombre) {
    if (-not $Condicion) { throw "FALLO: $Nombre" }
    $script:correctas++
    Write-Host "OK: $Nombre"
}
function Assert-Error([scriptblock]$Accion, [string]$Patron, [string]$Nombre) {
    $errorEncontrado = $null
    try { & $Accion } catch { $errorEncontrado = $_.Exception.Message }
    Assert ($errorEncontrado -and $errorEncontrado -match $Patron) $Nombre
}

# Analizar todos los scripts con el parser de la versión que realmente ejecutará el usuario.
foreach ($archivo in Get-ChildItem (Join-Path $fuente 'scripts') -Filter '*.ps1') {
    $tokens = $null; $errores = $null
    $null = [Management.Automation.Language.Parser]::ParseFile($archivo.FullName, [ref]$tokens, [ref]$errores)
    Assert ($errores.Count -eq 0) "Sintaxis compatible: $($archivo.Name)"
}
Assert ((New-Secreto) -match '^[0-9a-f]{64}$') 'Secreto aleatorio apto para URL y producción'
Assert ((New-Secreto) -ne (New-Secreto)) 'Los secretos no se repiten'
Assert ((Get-VersionNumerica ("W`0S`0L`0: 2`0.6`0.3`0.0`0")) -eq [version]'2.6.3') 'Detecta WSL aunque su salida incluya NUL'
Assert ((Get-VersionNumerica 'Docker Compose version v5.0.2') -ge [version]'2.20.0') 'Compose v5 satisface el mínimo'
Assert ((Get-VersionNumerica 'WSL no instalado') -eq [version]'0.0.0') 'No inventa una versión para WSL ausente'

$ejemplo = Join-Path $temporal '.env.example'
Copy-Item -LiteralPath (Join-Path $fuente '.env.example') -Destination $ejemplo
Set-Configuracion $ejemplo 'GOOGLE_OAUTH_CLIENT_ID' 'cliente-sintetico.apps.googleusercontent.com'
Set-Configuracion $ejemplo 'GOOGLE_OAUTH_CLIENT_SECRET' 'secreto-sintetico'
Assert ((Initialize-Configuracion $temporal -NoInteractivo) -eq 3000) 'Primera instalación crea configuración local'
$ruta = Join-Path $temporal '.env'
$config = Read-Configuracion $ruta
Assert ($config['AUTH_JWT_SECRET'].Length -eq 64 -and $config['POSTGRES_PASSWORD'].Length -eq 64) 'Genera ambos secretos locales'
$antes = (Get-FileHash -LiteralPath $ruta).Hash
$null = Initialize-Configuracion $temporal -NoInteractivo
Assert ((Get-FileHash -LiteralPath $ruta).Hash -eq $antes) 'Repetir no cambia credenciales ni configuración'
Set-Configuracion $ruta 'PRUEBA' 'valor $literal con espacios y ñ'
Assert ((Read-Configuracion $ruta)['PRUEBA'] -eq 'valor $literal con espacios y ñ') 'Conserva dólares, tildes y espacios'
Set-Configuracion $ruta 'PRUEBA' "valor con ' comilla"
Assert ((Read-Configuracion $ruta)['PRUEBA'] -eq "valor con ' comilla") 'Conserva comillas en dotenv'
Assert-Error { Set-Configuracion $ruta 'PRUEBA' "dos`nlineas" } 'sola' 'Rechaza valores multilínea'
Set-Configuracion $ruta 'FRONTEND_PORT' '70000'
Assert-Error { Initialize-Configuracion $temporal -NoInteractivo } '65535' 'Rechaza puertos fuera de rango'
Set-Configuracion $ruta 'FRONTEND_PORT' '3100'
Assert-Error { Initialize-Configuracion $temporal -NoInteractivo } 'no coincide' 'No cambia redirects de Google silenciosamente'
Set-Configuracion $ruta 'FRONTEND_PORT' '3000'
Set-Configuracion $ruta 'GOOGLE_OAUTH_CLIENT_ID' ''
Assert-Error { Initialize-Configuracion $temporal -NoInteractivo } 'GOOGLE_OAUTH_CLIENT_ID' 'Explica credenciales Google ausentes'
Set-Configuracion $ruta 'GOOGLE_OAUTH_CLIENT_ID' 'sintetico'
Set-Configuracion $ruta 'POSTGRES_PASSWORD' ''
Assert-Error { Initialize-Configuracion $temporal -NoInteractivo } 'contrase' 'No sustituye contraseña de una base existente'

# Un paquete mínimo permite probar corrupción, faltantes y escape de directorios.
$ficheros = @(); $imagenes = @()
foreach ($i in 1..4) {
    $archivo = Join-Path $temporal "imagen-$i.tar.gz"
    [IO.File]::WriteAllText($archivo, "imagen sintética $i")
    $ficheros += @{ path = "imagen-$i.tar.gz"; bytes = (Get-Item $archivo).Length; sha256 = (Get-FileHash $archivo).Hash }
    $imagenes += @{ tag = "sintetica-$i`:entrega"; id = 'sha256:' + ('a' * 64); file = "imagen-$i.tar.gz" }
}
$manifest = @{ schema = 1; platform = 'linux/amd64'; images = $imagenes; files = $ficheros }
$manifestPath = Join-Path $temporal 'manifest.json'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
$leido = Get-Manifiesto $temporal -VerificarArchivos
Assert ($leido.images.Count -eq 4) 'Verifica archivos y hashes de un paquete íntegro'
[IO.File]::WriteAllText((Join-Path $temporal 'imagen-1.tar.gz'), 'archivo truncado')
Assert-Error { Get-Manifiesto $temporal -VerificarArchivos } 'incompleto' 'Rechaza imagen corrupta antes de instalar'
$manifest.files[0].path = 'falta.tar.gz'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Assert-Error { Get-Manifiesto $temporal } 'Falta' 'Detecta descarga incompleta'
$manifest.files[0].path = '../fuera.tar.gz'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Assert-Error { Get-Manifiesto $temporal } 'Ruta inv' 'Rechaza rutas fuera del paquete'

$nativoReal = ${function:Invoke-Nativo}
try {
    $script:cargadas = 0
    $script:imagenActual = 'sha256:' + ('b' * 64)
    function Invoke-Nativo([string]$Archivo, [string[]]$Argumentos, [switch]$PermitirError) {
        if ($Argumentos -contains 'load') { $script:cargadas++; $script:imagenActual = 'sha256:' + ('a' * 64); return [pscustomobject]@{ Codigo = 0; Texto = 'cargada' } }
        $texto = $script:imagenActual
        if ($Argumentos -contains '{{.Id}} {{.Os}}/{{.Architecture}}') { $texto += ' linux/amd64' }
        return [pscustomobject]@{ Codigo = 0; Texto = $texto }
    }
    Import-Imagenes 'docker-simulado' @() $temporal $leido
    Assert ($script:cargadas -eq 1) 'Recarga una etiqueta que existe pero apunta a una imagen vieja'
    Import-Imagenes 'docker-simulado' @() $temporal $leido
    Assert ($script:cargadas -eq 1) 'No recarga imágenes que coinciden por ID y arquitectura'
    function Invoke-Nativo([string]$Archivo, [string[]]$Argumentos, [switch]$PermitirError) {
        if ($Argumentos -contains 'ls') { return [pscustomobject]@{ Codigo = 0; Texto = 'default' } }
        return [pscustomobject]@{ Codigo = 0; Texto = 'tcp://servidor-remoto:2376' }
    }
    Assert-Error { Get-DockerLocalArgs 'docker-simulado' } 'motor local' 'Nunca configura accidentalmente un motor remoto'
} finally { Set-Item -Path Function:Invoke-Nativo -Value $nativoReal }

$cmd = Join-Path $env:SystemRoot 'System32\cmd.exe'
Assert ((Invoke-Nativo $cmd @('/d', '/c', 'exit', '7') -PermitirError).Codigo -eq 7) 'Conserva códigos de salida nativos'
Assert-Error { Invoke-Nativo $cmd @('/d', '/c', 'exit', '7') } 'código 7' 'Un error nativo no se anuncia como éxito'

# Extraer funciones para simular requisitos, sin ejecutar el cuerpo del instalador.
$tokens = $null; $errores = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $fuente 'scripts/instalar.ps1'), [ref]$tokens, [ref]$errores)
$funciones = $ast.FindAll({ param($nodo) $nodo -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
foreach ($funcion in $funciones) { Invoke-Expression $funcion.Extent.Text }
$nativoReal = ${function:Invoke-Nativo}
try {
    $script:wslVersion = '2.6.3'; $script:wslExit = 0; $script:servicioEstado = 'Running'
    function Invoke-Nativo([string]$Archivo, [string[]]$Argumentos, [switch]$PermitirError) {
        [pscustomobject]@{ Codigo = $script:wslExit; Texto = $script:wslVersion }
    }
    function Get-Service { [pscustomobject]@{ Status = $script:servicioEstado; StartType = 'Automatic' } }
    Assert (Test-Requisitos) 'WSL actual y servicios listos no requieren elevación'
    $script:wslVersion = '1.0.0'
    Assert (-not (Test-Requisitos)) 'WSL antiguo requiere preparación'
    $script:wslExit = 1
    Assert (-not (Test-Requisitos)) 'WSL con error no pasa la comprobación'
    $script:wslExit = 0; $script:wslVersion = '2.6.3'; $script:servicioEstado = 'Stopped'
    Assert (-not (Test-Requisitos)) 'Detecta servicio Windows detenido'
} finally { Set-Item -Path Function:Invoke-Nativo -Value $nativoReal }

$heredada = $env:DATABASE_URL
try {
    $env:DATABASE_URL = 'postgresql://otra-base-que-no-debe-tocarse'
    [IO.File]::WriteAllText((Join-Path $temporal 'docker-compose.yml'), 'DATABASE_URL: ${DATABASE_URL:-local}')
    $anteriores = Set-EntornoCompose $temporal
    Assert (-not (Test-Path Env:DATABASE_URL)) 'Ignora una base heredada del entorno de desarrollo'
    Restore-EntornoCompose $anteriores
    Assert ($env:DATABASE_URL -eq 'postgresql://otra-base-que-no-debe-tocarse') 'Restaura el entorno después de configurar'
} finally {
    if ($null -eq $heredada) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
    else { $env:DATABASE_URL = $heredada }
}

$astAdmin = [Management.Automation.Language.Parser]::ParseFile((Join-Path $fuente 'scripts/requisitos-admin.ps1'), [ref]$tokens, [ref]$errores)
$funcionAdmin = $astAdmin.Find({ param($nodo) $nodo -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
Invoke-Expression $funcionAdmin.Extent.Text
$nativoReal = ${function:Invoke-Nativo}
try {
    $script:estadoFeature = 'Disabled'; $script:reinicioFeature = $true; $script:habilitadas = 0
    $script:versionAdmin = '2.6.3'; $script:comandosWsl = @(); $script:salidaInstalacion = 0
    function Get-WindowsOptionalFeature { [pscustomobject]@{ State = $script:estadoFeature } }
    function Enable-WindowsOptionalFeature { $script:habilitadas++; [pscustomobject]@{ RestartNeeded = $script:reinicioFeature } }
    function Get-Service { [pscustomobject]@{ Status = 'Running'; StartType = 'Automatic' } }
    function Invoke-Nativo([string]$Archivo, [string[]]$Argumentos, [switch]$PermitirError) {
        $script:comandosWsl += ($Argumentos -join ' ')
        if ($Argumentos -contains '--version') {
            return [pscustomobject]@{ Codigo = $(if ($script:versionAdmin) { 0 } else { 1 }); Texto = $script:versionAdmin }
        }
        return [pscustomobject]@{ Codigo = $script:salidaInstalacion; Texto = '' }
    }
    Assert ((Install-RequisitosWindows) -eq 3010 -and $script:habilitadas -eq 2) 'PC nueva habilita dos componentes y pide reiniciar sin forzarlo'
    Assert ($script:comandosWsl.Count -eq 0) 'Espera el reinicio antes de instalar WSL'
    $script:estadoFeature = 'EnablePending'
    Assert ((Install-RequisitosWindows) -eq 3010) 'Reconoce un reinicio de componentes todavía pendiente'
    $script:estadoFeature = 'Enabled'; $script:versionAdmin = ''
    Assert ((Install-RequisitosWindows) -eq 0) 'Instala WSL cuando los componentes ya están listos'
    Assert ($script:comandosWsl -contains '--install --no-distribution --web-download') 'Instala WSL sin Ubuntu ni Microsoft Store'
    $script:versionAdmin = '1.0.0'; $script:comandosWsl = @()
    Assert ((Install-RequisitosWindows) -eq 0 -and $script:comandosWsl -contains '--update --web-download') 'Actualiza WSL antiguo desde el proveedor'
    $script:salidaInstalacion = 3010
    Assert ((Install-RequisitosWindows) -eq 3010) 'Propaga el reinicio solicitado por WSL'
    $script:salidaInstalacion = 5
    Assert-Error { Install-RequisitosWindows } 'No se pudo' 'Un fallo al instalar WSL no se anuncia como éxito'
} finally { Set-Item -Path Function:Invoke-Nativo -Value $nativoReal }

$directorio = $temporal
try {
    $script:buildPrueba = 26200; $script:arquitecturaPrueba = 9; $script:ramPrueba = 16GB; $script:virtualizacionPrueba = $true
    function Get-CimInstance([string]$ClassName) {
        switch ($ClassName) {
            'Win32_OperatingSystem' { return [pscustomobject]@{ BuildNumber = $script:buildPrueba; ProductType = 1 } }
            'Win32_ComputerSystem' { return [pscustomobject]@{ TotalPhysicalMemory = $script:ramPrueba; HypervisorPresent = $false } }
            'Win32_Processor' { return [pscustomobject]@{ Architecture = $script:arquitecturaPrueba; VirtualizationFirmwareEnabled = $script:virtualizacionPrueba; SecondLevelAddressTranslationExtensions = $true } }
        }
    }
    $script:arquitecturaPrueba = 12
    Assert-Error { Assert-Equipo } 'ARM64' 'Da una explicación para Windows ARM'
    $script:arquitecturaPrueba = 9; $script:ramPrueba = 4GB
    Assert-Error { Assert-Equipo } '8 GB' 'Detecta memoria insuficiente'
    $script:ramPrueba = 16GB; $script:virtualizacionPrueba = $false
    Assert-Error { Assert-Equipo } 'BIOS' 'Explica cómo habilitar virtualización en firmware'
    $script:virtualizacionPrueba = $true; $script:buildPrueba = 19041
    Assert-Error { Assert-Equipo } 'Actualiza Windows' 'Rechaza Windows anterior al mínimo de Docker'
} finally { Remove-Item Function:Get-CimInstance }

$runOnce = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
$nombreReanudar = 'NeuroDaticsInstalacion'; $Proyecto = 'neurodatics'; $directorio = $temporal
$script:comandoReanudacion = ''
try {
    function Test-Path { return $true }
    function New-Item { throw 'No se debe recrear una clave RunOnce existente.' }
    function New-ItemProperty {
        param($Path, $Name, $Value, $PropertyType, [switch]$Force)
        $script:comandoReanudacion = $Value
    }
    Register-Reanudacion
    Assert ($script:comandoReanudacion -like '*INICIAR.bat*' -and $script:comandoReanudacion.Length -le 260) 'Reanuda con rutas con espacios sin sobrescribir otras entradas de Windows'
} finally { Remove-Item Function:Test-Path,Function:New-Item,Function:New-ItemProperty }

$script:estadoFirma = 'Valid'; $script:proveedorFirma = 'CN=Docker Inc., O=Docker Inc., C=US'; $script:ejecucionesInstalador = 0; $script:codigoInstalador = 0
try {
    function Write-Registro { }
    function New-Item { }
    function Invoke-WebRequest { }
    function Get-AuthenticodeSignature { [pscustomobject]@{ Status = $script:estadoFirma; SignerCertificate = [pscustomobject]@{ Subject = $script:proveedorFirma } } }
    function Start-Process { $script:ejecucionesInstalador++; [pscustomobject]@{ ExitCode = $script:codigoInstalador } }
    Assert ((Install-DockerDesktop) -eq 0 -and $script:ejecucionesInstalador -eq 1) 'Ejecuta el instalador únicamente con firma válida de Docker'
    $script:estadoFirma = 'HashMismatch'
    Assert-Error { Install-DockerDesktop } 'firma' 'Rechaza un instalador descargado corrupto'
    $script:estadoFirma = 'Valid'; $script:proveedorFirma = 'CN=Otro proveedor'
    Assert-Error { Install-DockerDesktop } 'firma' 'Rechaza un ejecutable firmado por otro proveedor'
    Assert ($script:ejecucionesInstalador -eq 1) 'Los ejecutables rechazados nunca se ejecutan'
    $script:proveedorFirma = 'CN=Docker Inc.'; $script:codigoInstalador = 3010
    Assert ((Install-DockerDesktop) -eq 3010) 'Docker puede solicitar reinicio sin perder la continuación'
    $script:codigoInstalador = 1
    Assert-Error { Install-DockerDesktop } 'no se instaló' 'Un fallo del instalador de Docker detiene el proceso'
} finally {
    Remove-Item Function:Write-Registro,Function:New-Item,Function:Invoke-WebRequest,Function:Get-AuthenticodeSignature,Function:Start-Process
}
Write-Host "RESULTADO: $script:correctas comprobaciones correctas. Archivos de prueba: $temporal" -ForegroundColor Green

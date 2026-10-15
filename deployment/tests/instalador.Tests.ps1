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

$interno = Join-Path $temporal '_internal'
$null = New-Item -ItemType Directory -Path $interno
$ejemplo = Join-Path $interno '.env.example'
Copy-Item -LiteralPath (Join-Path $fuente '.env.example') -Destination $ejemplo
Set-Configuracion $ejemplo 'GOOGLE_OAUTH_CLIENT_ID' 'cliente-sintetico.apps.googleusercontent.com'
Set-Configuracion $ejemplo 'GOOGLE_OAUTH_CLIENT_SECRET' 'secreto-sintetico'
Assert ((Initialize-Configuracion $temporal -NoInteractivo) -eq 3000) 'Primera instalación crea configuración local'
$ruta = Join-Path $temporal '.env'
Assert (-not (Test-Path -LiteralPath (Join-Path $interno '.env'))) 'El .env queda en la raíz, fuera de la carpeta que se reemplaza al actualizar'
$config = Read-Configuracion $ruta
Assert ($config['AUTH_JWT_SECRET'].Length -eq 64 -and $config['POSTGRES_PASSWORD'].Length -eq 64) 'Genera ambos secretos locales'
Assert ($config['BACKEND_MEM_LIMIT'] -eq (Get-LimiteMemoriaBackend (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory)) 'Ajusta la memoria del backend al equipo'
Assert ((@(4, 8, 12, 16, 32, 64) | ForEach-Object { Get-LimiteMemoriaBackend ($_ * 1GB) }) -join ',' -eq '2g,2g,3g,4g,8g,8g') 'Memoria del backend entre 2 y 8 GB según la RAM'
Assert ((Get-LimiteMemoriaBackend (15.9 * 1GB)) -eq '4g') 'Redondea la RAM que Windows informa por debajo'
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
$manifestPath = Join-Path $interno 'manifest.json'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
$leido = Get-Manifiesto $temporal -VerificarArchivos
Assert ($leido.images.Count -eq 4) 'Verifica archivos y hashes de un paquete íntegro'
[IO.File]::WriteAllText((Join-Path $temporal 'imagen-1.tar.gz'), 'archivo truncado')
Assert-Error { Get-Manifiesto $temporal -VerificarArchivos } 'incompleto' 'Rechaza imagen corrupta antes de instalar'
$manifest.files[0].path = 'falta.tar.gz'
$manifest.images[0].file = 'falta.tar.gz'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Assert-Error { Get-Manifiesto $temporal } 'Falta' 'Detecta descarga incompleta'
Assert ((Get-Manifiesto $temporal -SinArchivos).images.Count -eq 4) 'El uso diario lee las imágenes sin exigir los archivos de instalación'
$manifest.images[0].file = 'imagen-1.tar.gz'
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
    [IO.File]::WriteAllText((Join-Path $interno 'docker-compose.yml'), 'DATABASE_URL: ${DATABASE_URL:-local}')
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
    Assert ($script:comandoReanudacion -like '*INSTALAR.bat" -Proyecto neurodatics"' -and $script:comandoReanudacion.Length -le 260) 'Reanuda la instalación (no el uso diario) con rutas con espacios sin sobrescribir otras entradas de Windows'
} finally { Remove-Item Function:Test-Path,Function:New-Item,Function:New-ItemProperty }

$script:estadoFirma = 'Valid'; $script:proveedorFirma = 'CN=Docker Inc., O=Docker Inc., C=US'; $script:ejecucionesInstalador = 0; $script:codigoInstalador = 0
try {
    function Write-Registro { }
    function New-Item { }
    function Invoke-WebRequest { }
    function Get-AuthenticodeSignature { [pscustomobject]@{ Status = $script:estadoFirma; SignerCertificate = [pscustomobject]@{ Subject = $script:proveedorFirma } } }
    function Start-Process { $script:ejecucionesInstalador++; $script:argumentosInstalador = ($args | Out-String); [pscustomobject]@{ ExitCode = $script:codigoInstalador } }
    Assert ((Install-DockerDesktop) -eq 0 -and $script:ejecucionesInstalador -eq 1) 'Ejecuta el instalador únicamente con firma válida de Docker'
    Assert ($script:argumentosInstalador -match '--accept-license' -and $script:argumentosInstalador -match '--user') 'Instala Docker para el usuario y acepta su licencia sin otra ventana'
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
# Una entrega anterior (todo en la raíz) se ordena sin perder .env ni archivos modificados.
$vieja = Join-Path $temporal 'entrega anterior'
$null = New-Item -ItemType Directory -Path (Join-Path $vieja 'scripts'), (Join-Path $vieja 'images'), (Join-Path $vieja '_internal')
$listados = @()
foreach ($relativa in @('scripts/instalar.ps1', 'images/backend.tar.gz', 'README.md', 'docker-compose.yml', 'INICIAR.bat', 'modificado.md')) {
    $completa = Join-Path $vieja $relativa
    [IO.File]::WriteAllText($completa, "versión anterior de $relativa")
    $listados += @{ path = $relativa; bytes = (Get-Item $completa).Length; sha256 = (Get-FileHash $completa).Hash.ToLowerInvariant() }
}
@{ schema = 1; files = $listados } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $vieja 'manifest.json') -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $vieja 'modificado.md'), 'cambiado por el responsable')
[IO.File]::WriteAllText((Join-Path $vieja 'INICIAR.bat'), 'lanzador nuevo')
[IO.File]::WriteAllText((Join-Path $vieja '.env'), "POSTGRES_PASSWORD='secreto-real'")
$huellaEnv = (Get-FileHash (Join-Path $vieja '.env')).Hash
[IO.File]::WriteAllText((Join-Path $vieja 'VERSION.txt'), 'entrega anterior')
[IO.File]::WriteAllText((Join-Path $vieja 'images/SHA256SUMS.txt'), 'sumas')
[IO.File]::WriteAllText((Join-Path $vieja 'ABRIR-NEURODATICS.url'), "[InternetShortcut]`r`nURL=http://localhost:3000/configuracion`r`n")
[IO.File]::WriteAllText((Join-Path $vieja 'instalacion.log'), 'etapas')
$borrados = Remove-EntregaAnterior $vieja
Assert ((Get-FileHash (Join-Path $vieja '.env')).Hash -eq $huellaEnv) 'Migrar la carpeta no toca el .env con secretos'
Assert (-not (Test-Path (Join-Path $vieja 'scripts')) -and -not (Test-Path (Join-Path $vieja 'images')) -and -not (Test-Path (Join-Path $vieja 'manifest.json'))) 'Retira scripts, imágenes y manifiesto de la entrega anterior'
Assert (-not (Test-Path (Join-Path $vieja 'ABRIR-NEURODATICS.url')) -and -not (Test-Path (Join-Path $vieja 'VERSION.txt'))) 'Retira los archivos generados por la entrega anterior'
Assert ((Test-Path (Join-Path $vieja 'modificado.md')) -and ([IO.File]::ReadAllText((Join-Path $vieja 'INICIAR.bat')) -eq 'lanzador nuevo')) 'Conserva archivos modificados y los lanzadores actuales'
Assert ((Test-Path (Join-Path $vieja '_internal/instalacion-anterior.log')) -and $borrados -eq 7) 'Guarda el registro anterior dentro de _internal'
Assert ((Remove-EntregaAnterior $vieja) -eq 0) 'Una carpeta ya ordenada no se vuelve a tocar'

# Acceso directo del escritorio: uno solo, y nunca reemplaza un acceso ajeno.
$escritorio = Join-Path $temporal 'Escritorio'
$null = New-Item -ItemType Directory -Path $escritorio
$directorio = $vieja
Install-AccesoDirecto $escritorio
Install-AccesoDirecto $escritorio
$shell = New-Object -ComObject WScript.Shell
$accesos = @(Get-ChildItem -LiteralPath $escritorio -Filter '*.lnk')
Assert ($accesos.Count -eq 1 -and $shell.CreateShortcut($accesos[0].FullName).TargetPath -eq (Join-Path $vieja 'INICIAR.bat')) 'Crea un único acceso NeuroDatics que abre INICIAR.bat'
$ajeno = $shell.CreateShortcut((Join-Path $escritorio 'NeuroDatics.lnk')); $ajeno.TargetPath = (Join-Path $env:SystemRoot 'notepad.exe'); $ajeno.Save()
Install-AccesoDirecto $escritorio
Assert ($shell.CreateShortcut((Join-Path $escritorio 'NeuroDatics.lnk')).TargetPath -like '*notepad.exe') 'No cambia un acceso NeuroDatics que abre otra cosa'

# Elevación: misma cuenta sí; otra cuenta (credenciales de otro administrador) no.
Assert ((Get-CuentaEscritorio) -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) 'Reconoce la cuenta dueña del escritorio de esta sesión'
Assert-CuentaDeSesion
Assert $true 'La cuenta de la sesión puede instalar e iniciar'
$cuentaReal = ${function:Get-CuentaEscritorio}
$elevadoReal = ${function:Test-Elevado}
try {
    function Get-CuentaEscritorio { 'S-1-5-21-1-2-3-9999' }
    Assert-Error { Assert-CuentaDeSesion } 'otra cuenta' 'Aborta si la ventana elevada pertenece a otra cuenta'
    function Get-CuentaEscritorio { $null }
    Assert-CuentaDeSesion
    Assert $true 'Sin escritorio identificable no bloquea'
    $script:lanzado = $null
    function Test-Elevado { $true }
    function Start-Process { param($FilePath, $ArgumentList) $script:lanzado = "$FilePath|$ArgumentList" }
    Start-ComoUsuario 'C:\Docker\Docker Desktop.exe'
    Assert ($script:lanzado -like '*\explorer.exe|"C:\Docker\Docker Desktop.exe"') 'Desde una ventana elevada abre Docker Desktop y el navegador sin privilegios'
} finally {
    Set-Item -Path Function:Get-CuentaEscritorio -Value $cuentaReal
    Set-Item -Path Function:Test-Elevado -Value $elevadoReal
    Remove-Item Function:Start-Process -ErrorAction SilentlyContinue
}

# INICIAR: extraer sus funciones y simular Docker, la red y el navegador.
$astInicio = [Management.Automation.Language.Parser]::ParseFile((Join-Path $fuente 'scripts/iniciar.ps1'), [ref]$tokens, [ref]$errores)
Assert (@($astInicio.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath }) -contains 'Proyecto') 'INICIAR acepta -Proyecto de una continuación RunOnce antigua'
foreach ($funcion in $astInicio.FindAll({ param($nodo) $nodo -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) { Invoke-Expression $funcion.Extent.Text }
$inicio = Join-Path $temporal 'inicio'
$null = New-Item -ItemType Directory -Path (Join-Path $inicio '_internal')
$manifestInicio = @{ schema = 1; platform = 'linux/amd64'; files = @(); images = @(foreach ($i in 1..4) {
    @{ tag = "sintetica-$i`:entrega"; id = 'sha256:' + ([string]$i * 64); file = "_internal/imagen-$i.tar.gz" } }) }
$manifestInicio.files = @(foreach ($imagen in $manifestInicio.images) { @{ path = $imagen.file; bytes = 1; sha256 = 'x' } })
$manifestInicio | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $inicio '_internal/manifest.json') -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $inicio '_internal/docker-compose.yml'), 'image: ${FRONTEND_PORT:-3000}')
function New-EnvInicio {
    Copy-Item -LiteralPath $ruta -Destination (Join-Path $inicio '.env') -Force
    Set-Configuracion (Join-Path $inicio '.env') 'POSTGRES_PASSWORD' (New-Secreto)
}
New-EnvInicio
$directorio = $inicio; $Proyecto = 'neurodatics'; $SinAbrirNavegador = $false
$reales = @{}
foreach ($nombre in @('Find-DockerDesktop', 'Find-Docker', 'Get-MotorDocker', 'Wait-MotorDocker', 'Test-Aplicacion', 'Wait-Aplicacion', 'Start-ComoUsuario', 'Assert-Puerto', 'Invoke-Nativo', 'Get-CuentaEscritorio')) {
    $reales[$nombre] = (Get-Item "Function:$nombre").ScriptBlock
}
function Reset-Simulacion {
    $script:desktopSimulado = 'C:\Docker\Docker Desktop.exe'; $script:appActiva = $false; $script:motorEncendido = $true
    $script:motorEnciende = $true; $script:idsDocker = @($manifestInicio.images | ForEach-Object { "$($_.id) linux/amd64" })
    $script:abiertas = @(); $script:esperas = 0; $script:comandos = @(); $script:cuentaEscritorio = $null
}
try {
    function Find-DockerDesktop { $script:desktopSimulado }
    function Find-Docker { 'docker-simulado' }
    function Get-CuentaEscritorio { $script:cuentaEscritorio }
    function Test-Aplicacion { $script:appActiva }
    function Wait-Aplicacion { }
    function Start-ComoUsuario([string]$Destino) { $script:abiertas += $Destino }
    function Assert-Puerto { }
    function Get-MotorDocker { [pscustomobject]@{ Args = @('--context', 'desktop-linux'); Listo = $script:motorEncendido; Tipo = 'linux' } }
    function Wait-MotorDocker { $script:esperas++; [pscustomobject]@{ Args = @('--context', 'desktop-linux'); Listo = $script:motorEnciende; Tipo = 'linux' } }
    function Invoke-Nativo([string]$Archivo, [string[]]$Argumentos, [switch]$PermitirError) {
        $script:comandos += ($Argumentos -join ' ')
        if ($Argumentos -contains 'inspect') { return [pscustomobject]@{ Codigo = 0; Texto = ($script:idsDocker -join "`n") } }
        return [pscustomobject]@{ Codigo = 0; Texto = '' }
    }

    Reset-Simulacion; $script:desktopSimulado = $null
    Assert-Error { Invoke-Inicio } 'no está instalado.*ejecuta INSTALAR' 'Sin Docker Desktop remite a INSTALAR'
    Reset-Simulacion; Remove-Item -LiteralPath (Join-Path $inicio '.env')
    Assert-Error { Invoke-Inicio } 'ejecuta INSTALAR' 'Sin .env remite a INSTALAR sin crearlo'
    Assert (-not (Test-Path -LiteralPath (Join-Path $inicio '.env'))) 'INICIAR nunca crea ni cambia .env'
    New-EnvInicio
    Set-Configuracion (Join-Path $inicio '.env') 'GOOGLE_OAUTH_CLIENT_SECRET' ''
    Assert-Error { Invoke-Inicio } 'ejecuta INSTALAR' 'Una instalación interrumpida antes de las credenciales remite a INSTALAR'
    New-EnvInicio
    $huellaInicio = (Get-FileHash (Join-Path $inicio '.env')).Hash

    Reset-Simulacion; $script:appActiva = $true
    Assert ((Invoke-Inicio) -eq 0 -and $script:abiertas.Count -eq 1 -and $script:comandos.Count -eq 0) 'Con la aplicación activa abre el navegador sin tocar Docker'

    Reset-Simulacion; $script:motorEncendido = $false
    Assert ((Invoke-Inicio) -eq 0 -and $script:esperas -eq 1) 'Con Docker apagado lo enciende y espera'
    $arranque = @($script:comandos | Where-Object { $_ -match ' up ' })
    Assert ($arranque.Count -eq 1 -and $arranque[0] -match '--no-build --pull never' -and $arranque[0] -match '--wait' -and $arranque[0] -match '--env-file .*\\inicio\\\.env') 'Arranca con compose up sin construir, sin descargar y con el .env de la raíz'
    Assert (-not ($script:comandos -match ' down|--volumes| -v | rm | load ')) 'Nunca borra contenedores ni volúmenes ni carga imágenes'
    Assert ($script:abiertas -contains 'http://localhost:3000') 'Abre el navegador en la aplicación'
    Assert ((Get-FileHash (Join-Path $inicio '.env')).Hash -eq $huellaInicio) 'Iniciar no modifica .env'

    Reset-Simulacion; $script:motorEncendido = $false; $script:motorEnciende = $false
    Assert-Error { Invoke-Inicio } 'no terminó de encenderse' 'Avisa si Docker no enciende en el tiempo límite'

    Reset-Simulacion; $script:idsDocker[1] = 'sha256:' + ('f' * 64) + ' linux/amd64'
    Assert-Error { Invoke-Inicio } 'no coincide.*ejecuta INSTALAR' 'Imágenes distintas del manifiesto remiten a INSTALAR'
    Assert (-not ($script:comandos -match ' up ')) 'Con imágenes distintas no arranca contenedores'

    Reset-Simulacion; $script:cuentaEscritorio = 'S-1-5-21-1-2-3-9999'
    Assert-Error { Invoke-Inicio } 'otra cuenta' 'INICIAR abierto con otra cuenta se detiene con un mensaje claro'

    Reset-Simulacion
    function Get-ItemProperty { [pscustomobject]@{ NeuroDaticsInstalacion = 'pendiente' } }
    Assert-Error { Invoke-Inicio } 'ejecuta INSTALAR' 'Con un reinicio de instalación pendiente remite a INSTALAR'
} finally {
    foreach ($nombre in $reales.Keys) { Set-Item -Path "Function:$nombre" -Value $reales[$nombre] }
    Remove-Item Function:Get-ItemProperty -ErrorAction SilentlyContinue
}

# El lanzador real, como lo ejecuta una continuación RunOnce antigua: no instala nada.
$lanzadorPrueba = Join-Path $temporal 'lanzador con espacios'
$null = New-Item -ItemType Directory -Path (Join-Path $lanzadorPrueba '_internal/scripts')
foreach ($archivo in Get-ChildItem (Join-Path $fuente 'scripts') -File) { Copy-Item -LiteralPath $archivo.FullName -Destination (Join-Path $lanzadorPrueba '_internal/scripts') }
$bat = [IO.File]::ReadAllText((Join-Path $fuente 'INICIAR.bat')) -replace '\r?\n', "`r`n"
[IO.File]::WriteAllText((Join-Path $lanzadorPrueba 'INICIAR.bat'), $bat)
$salida = (& $cmd /d /c "echo.| `"$(Join-Path $lanzadorPrueba 'INICIAR.bat')`" -Proyecto neurodatics" 2>&1 | Out-String)
$codigoBat = $LASTEXITCODE
Assert ($codigoBat -eq 1 -and $salida -match 'ejecuta INSTALAR') 'INICIAR.bat -Proyecto (RunOnce antiguo) sin instalación remite a INSTALAR'
Assert (-not (Test-Path (Join-Path $lanzadorPrueba '.env'))) 'El lanzador sin instalación no crea configuración'

Write-Host "RESULTADO: $script:correctas comprobaciones correctas. Archivos de prueba: $temporal" -ForegroundColor Green

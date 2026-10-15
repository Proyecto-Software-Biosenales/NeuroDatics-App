[CmdletBinding()]
param(
    [switch]$SoloComprobar,
    [switch]$NoInteractivo,
    [switch]$SinAbrirNavegador,
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$Proyecto = 'neurodatics'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'comun.ps1')
# Raíz de la entrega: los lanzadores y .env; el resto está en _internal.
$directorio = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$registro = Join-Path (Get-Interno $directorio) 'instalacion.log'
$runOnce = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
$nombreReanudar = 'NeuroDaticsInstalacion'
$codigoSalida = 0
$mutex = $null
$bloqueado = $false
$entornoCompose = @{}

function Write-Registro([string]$Mensaje) {
    Write-Paso $Mensaje
    Add-Content -LiteralPath $registro -Value "$(Get-Date -Format s) $Mensaje" -Encoding UTF8
}

function Register-Reanudacion {
    $ejecutable = Join-Path $env:SystemRoot 'System32\cmd.exe'
    # Después de reiniciar continúa la instalación, no el uso diario.
    $lanzador = Join-Path $directorio 'INSTALAR.bat'
    $comando = '"' + $ejecutable + '" /d /c ""' + $lanzador + '" -Proyecto ' + $Proyecto + '"'
    if ($comando.Length -gt 260) {
        throw 'La ruta es demasiado larga para continuar después del reinicio. Mueve la carpeta a C:\NeuroDatics y vuelve a ejecutar INSTALAR.bat.'
    }
    if (-not (Test-Path -LiteralPath $runOnce)) { $null = New-Item -Path $runOnce }
    $null = New-ItemProperty -Path $runOnce -Name $nombreReanudar -Value $comando -PropertyType String -Force
}

function Unregister-Reanudacion {
    Remove-ItemProperty -LiteralPath $runOnce -Name $nombreReanudar -ErrorAction SilentlyContinue
}

function Install-AccesoDirecto([string]$Escritorio = [Environment]::GetFolderPath('Desktop')) {
    # Un único acceso «NeuroDatics» en el escritorio que abre INICIAR.bat.
    if (-not $Escritorio -or -not (Test-Path -LiteralPath $Escritorio -PathType Container)) { return }
    $ruta = Join-Path $Escritorio 'NeuroDatics.lnk'
    $lanzador = Join-Path $directorio 'INICIAR.bat'
    $shell = New-Object -ComObject WScript.Shell
    if (Test-Path -LiteralPath $ruta) {
        $actual = $shell.CreateShortcut($ruta).TargetPath
        if ($actual -eq $lanzador) { return }
        # Se actualiza el de una carpeta anterior de NeuroDatics; otro acceso con ese nombre no se toca.
        if ([IO.Path]::GetFileName($actual) -ne 'INICIAR.bat') {
            Write-Host 'Ya hay en el escritorio un acceso «NeuroDatics» que abre otra cosa; no se cambió. Usa INICIAR.bat de esta carpeta.'
            return
        }
    }
    $acceso = $shell.CreateShortcut($ruta)
    $acceso.TargetPath = $lanzador
    $acceso.WorkingDirectory = $directorio
    $acceso.Description = 'Inicia NeuroDatics y abre el navegador'
    $icono = Join-Path (Get-Interno $directorio) 'neurodatics.ico'
    if (Test-Path -LiteralPath $icono) { $acceso.IconLocation = $icono }
    $acceso.Save()
}

function Assert-Equipo {
    if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess) {
        throw 'Esta entrega necesita Windows de 64 bits y Windows PowerShell de 64 bits.'
    }
    $sistema = Get-CimInstance Win32_OperatingSystem
    $equipo = Get-CimInstance Win32_ComputerSystem
    $cpu = @(Get-CimInstance Win32_Processor)[0]
    $build = [int]$sistema.BuildNumber
    if ($sistema.ProductType -ne 1 -or $build -lt 19045 -or ($build -ge 22000 -and $build -lt 22631)) {
        throw 'Actualiza Windows antes de continuar: Windows 11 23H2 o posterior, o Windows 10 22H2 con soporte vigente. Windows Server no es compatible.'
    }
    if ($cpu.Architecture -ne 9) { throw 'Este paquete es para procesadores Intel/AMD x64. Solicita una entrega ARM64 para Windows ARM.' }
    if ($equipo.TotalPhysicalMemory -lt 7.5GB) { throw 'Se necesitan al menos 8 GB de memoria RAM; se recomiendan 16 GB.' }
    if (-not $equipo.HypervisorPresent -and (-not $cpu.VirtualizationFirmwareEnabled -or -not $cpu.SecondLevelAddressTranslationExtensions)) {
        throw 'Activa virtualización Intel VT-x/AMD-V en BIOS/UEFI. Si es una máquina virtual, habilita virtualización anidada. Después vuelve a ejecutar INSTALAR.bat.'
    }
    foreach ($unidad in @([IO.Path]::GetPathRoot($env:LOCALAPPDATA), [IO.Path]::GetPathRoot($directorio)) | Select-Object -Unique) {
        $disco = New-Object IO.DriveInfo($unidad)
        if ($disco.IsReady -and $disco.AvailableFreeSpace -lt 15GB) { throw "Libera al menos 15 GB en $unidad para Docker, imágenes y datos." }
    }
    Write-Host "Windows y hardware compatibles. RAM: $([math]::Round($equipo.TotalPhysicalMemory / 1GB, 1)) GB."
}

function Test-Requisitos {
    $wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
    if (-not (Test-Path -LiteralPath $wsl)) { return $false }
    $version = Invoke-Nativo $wsl @('--version') -PermitirError
    if ($version.Codigo -ne 0 -or (Get-VersionNumerica $version.Texto) -lt [version]'2.1.5') { return $false }
    $estado = Invoke-Nativo $wsl @('--status') -PermitirError
    if ($estado.Codigo -ne 0) { return $false }
    $servicio = Get-Service -Name LanmanServer -ErrorAction SilentlyContinue
    return ($servicio -and $servicio.Status -eq 'Running' -and $servicio.StartType -eq 'Automatic')
}

function Install-DockerDesktop {
    Write-Registro 'Descargando Docker Desktop desde el sitio oficial.'
    $cache = Join-Path $env:LOCALAPPDATA 'NeuroDatics\instaladores'
    $null = New-Item -ItemType Directory -Path $cache -Force
    $instalador = Join-Path $cache 'Docker Desktop Installer.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $instalador -UseBasicParsing -TimeoutSec 900
    $firma = Get-AuthenticodeSignature -LiteralPath $instalador
    if ($firma.Status -ne 'Valid' -or $firma.SignerCertificate.Subject -notmatch '(CN|O)=Docker Inc\.?([, ]|$)') {
        throw 'El instalador de Docker no tiene una firma válida de Docker Inc. No se ejecutó; vuelve a descargarlo o consulta al responsable.'
    }
    Write-Registro 'Instalando Docker Desktop para tu usuario. Este paso puede tardar varios minutos.'
    # Instalar implica aceptar las condiciones de Docker (aviso en LEEME-PRIMERO.txt).
    $proceso = Start-Process -FilePath $instalador -ArgumentList @('install', '--user', '--quiet', '--accept-license', '--backend=wsl-2') -Wait -PassThru -WindowStyle Hidden
    if ($proceso.ExitCode -in @(3010, 1641)) { return 3010 }
    if ($proceso.ExitCode -ne 0) { throw "Docker Desktop no se instaló (código $($proceso.ExitCode)). Consulta _internal\SOLUCION-DE-PROBLEMAS.md." }
    return 0
}

try {
    # El mutex impide dos instalaciones concurrentes para el mismo usuario.
    $mutex = New-Object Threading.Mutex($false, 'Local\NeuroDaticsInstalacion')
    try { $bloqueado = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $bloqueado = $true }
    if (-not $bloqueado) { throw 'Ya hay otra instalación de NeuroDatics abierta. Continúa en esa ventana.' }
    Write-Host 'NeuroDatics: instalación y configuración' -ForegroundColor Green
    Assert-CuentaDeSesion
    if (-not $SoloComprobar) {
        $interno = Get-Interno $directorio
        if (Test-Path -LiteralPath $interno -PathType Container) { Set-CarpetaOculta $interno }
        $anteriores = Remove-EntregaAnterior $directorio
        if ($anteriores) { Write-Host "Se retiraron $anteriores archivos de la versión anterior de la carpeta; .env se conserva." }
    }
    Write-Registro 'Comprobando los archivos y sus huellas SHA256.'
    $manifest = Get-Manifiesto $directorio -VerificarArchivos
    Assert-Equipo
    $requisitos = Test-Requisitos
    $desktop = Find-DockerDesktop
    if ($SoloComprobar) {
        Write-Host "WSL y servicios listos: $requisitos. Docker Desktop instalado: $([bool]$desktop)."
        if (-not $requisitos -or -not $desktop) { throw 'Faltan requisitos. INSTALAR.bat los instalará.' }
        if (-not (Test-Path -LiteralPath (Join-Path $directorio '.env'))) { throw 'Falta .env. INSTALAR.bat lo creará.' }
        $valores = Read-Configuracion (Join-Path $directorio '.env')
        foreach ($clave in @('POSTGRES_PASSWORD', 'AUTH_JWT_SECRET', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET')) {
            if (Test-Marcador $valores[$clave]) { throw "Falta configurar $clave. Ejecuta INSTALAR.bat o consulta CONFIGURACION-GOOGLE.md." }
        }
        Write-Host 'Comprobación terminada. No se instalaron requisitos ni se iniciaron contenedores.'
    } else {
        if (-not $requisitos) {
            if ($NoInteractivo) { throw 'Faltan requisitos del sistema. Ejecuta INSTALAR.bat de forma interactiva.' }
            Register-Reanudacion
            # Solo este paso se eleva; si la ventana ya es de administrador, Windows no vuelve a preguntar.
            Write-Registro $(if (Test-Elevado) { 'Preparando WSL 2.' } else { 'Preparando WSL 2. Acepta la solicitud de administrador de Windows.' })
            $argumentos = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'requisitos-admin.ps1') + '"'
            $proceso = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $argumentos -Verb RunAs -Wait -PassThru -WindowStyle Hidden
            if ($proceso.ExitCode -eq 3010) {
                Write-Registro 'Guarda tus documentos y reinicia Windows. Continuaremos al volver a iniciar sesión; también puedes abrir INSTALAR.bat de nuevo.'
                $codigoSalida = 3010
            } elseif ($proceso.ExitCode -ne 0 -or -not (Test-Requisitos)) {
                throw 'No se pudieron preparar WSL 2 y los servicios de Windows. Revisa _internal\SOLUCION-DE-PROBLEMAS.md, la conexión y los permisos de administrador.'
            }
        }
        if ($codigoSalida -eq 0) {
            if (-not $desktop) {
                if ($NoInteractivo) { throw 'Falta Docker Desktop. Ejecuta INSTALAR.bat de forma interactiva.' }
                Register-Reanudacion
                $codigoSalida = Install-DockerDesktop
                $desktop = Find-DockerDesktop
                if ($codigoSalida -eq 0 -and -not $desktop) { throw 'No se encontró Docker Desktop después de la instalación.' }
            }
            if ($codigoSalida -eq 3010) { Write-Registro 'Reinicia Windows para continuar automáticamente con Docker Desktop.' }
        }
        if ($codigoSalida -eq 0) {
            $docker = Find-Docker $desktop
            if (-not $docker) { throw 'No se encontró docker.exe. Repara Docker Desktop y vuelve a iniciar.' }
            $motor = Get-MotorDocker $docker
            if (-not $motor.Listo) {
                if ($NoInteractivo) { throw 'El motor de Docker Desktop no está encendido.' }
                Write-Registro 'Abriendo Docker Desktop. Si muestra una bienvenida o una encuesta, puedes omitirla: no necesitas una cuenta de Docker.'
                $motor = Wait-MotorDocker $docker $desktop 600
            }
            if (-not $motor.Listo) { throw 'Docker Desktop no terminó de iniciar. Revisa su ventana y _internal\SOLUCION-DE-PROBLEMAS.md; después repite INSTALAR.bat.' }
            Assert-MotorLinux $motor 'INSTALAR.bat'
            $dockerArgs = $motor.Args
            $compose = Invoke-Nativo $docker ($dockerArgs + @('compose', 'version', '--short'))
            if ((Get-VersionNumerica $compose.Texto) -lt [version]'2.20.0') { throw 'Actualiza Docker Desktop: se necesita Docker Compose 2.20 o posterior.' }
            Unregister-Reanudacion
            Write-Registro 'Preparando la configuración. Se conservarán tus credenciales y datos existentes.'
            $puerto = Initialize-Configuracion $directorio -NoInteractivo:$NoInteractivo
            $entornoCompose = Set-EntornoCompose $directorio
            $composeArgs = $dockerArgs + @(Get-ComposeArgs $directorio $Proyecto)
            $null = Invoke-Nativo $docker ($composeArgs + @('config', '--quiet'))
            Assert-Puerto $docker $dockerArgs $Proyecto $puerto
            Import-Imagenes $docker $dockerArgs $directorio $manifest
            Write-Registro 'Iniciando los cuatro servicios y esperando su comprobación de salud.'
            $null = Invoke-Nativo $docker ($composeArgs + @('up', '-d', '--no-build', '--pull', 'never', '--remove-orphans', '--wait', '--wait-timeout', '300'))
            $url = "http://localhost:$puerto"
            Wait-Aplicacion $url
            if (-not $SinAbrirNavegador) { Install-AccesoDirecto }
            Write-Registro "Servicios listos en $url. Abre Configuración, inicia sesión con Google y comprueba la conexión de Drive."
            Write-Host 'Desde ahora, para usar NeuroDatics abre el icono «NeuroDatics» del escritorio o INICIAR.bat.' -ForegroundColor Green
            Write-Host 'Los datos se conservan. No hace falta repetir la instalación.'
            if (-not $SinAbrirNavegador) { Start-ComoUsuario "$url/configuracion" }
        }
    }
} catch {
    $codigoSalida = 1
    # Solo registrar la etapa y un error general: los errores de servicios pueden incluir datos privados.
    Add-Content -LiteralPath $registro -Value "$(Get-Date -Format s) ERROR: no se completó el proceso. Revisa el mensaje de la ventana." -Encoding UTF8 -ErrorAction SilentlyContinue
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Puedes repetir INSTALAR.bat después de corregir el problema. Consulta _internal\SOLUCION-DE-PROBLEMAS.md.'
} finally {
    Restore-EntornoCompose $entornoCompose
    if ($codigoSalida -ne 3010 -and -not $SoloComprobar -and $bloqueado) { Unregister-Reanudacion }
    if ($bloqueado -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
exit $codigoSalida

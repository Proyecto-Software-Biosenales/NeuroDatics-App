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
$directorio = Split-Path -Parent $PSScriptRoot
$registro = Join-Path $directorio 'instalacion.log'
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
    $lanzador = Join-Path $directorio 'INICIAR.bat'
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
    $proceso = Start-Process -FilePath $instalador -ArgumentList @('install', '--user', '--quiet', '--backend=wsl-2') -Wait -PassThru -WindowStyle Hidden
    if ($proceso.ExitCode -in @(3010, 1641)) { return 3010 }
    if ($proceso.ExitCode -ne 0) { throw "Docker Desktop no se instaló (código $($proceso.ExitCode)). Consulta SOLUCION-DE-PROBLEMAS.md." }
    return 0
}

try {
    # El mutex impide dos instalaciones concurrentes para el mismo usuario.
    $mutex = New-Object Threading.Mutex($false, 'Local\NeuroDaticsInstalacion')
    try { $bloqueado = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $bloqueado = $true }
    if (-not $bloqueado) { throw 'Ya hay otra instalación de NeuroDatics abierta. Continúa en esa ventana.' }
    Write-Host 'NeuroDatics: instalación y configuración' -ForegroundColor Green
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
            Write-Registro 'Preparando WSL 2. Acepta la solicitud de administrador de Windows.'
            $argumentos = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'requisitos-admin.ps1') + '"'
            $proceso = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $argumentos -Verb RunAs -Wait -PassThru -WindowStyle Hidden
            if ($proceso.ExitCode -eq 3010) {
                Write-Registro 'Guarda tus documentos y reinicia Windows. Continuaremos al volver a iniciar sesión; también puedes abrir INSTALAR.bat de nuevo.'
                $codigoSalida = 3010
            } elseif ($proceso.ExitCode -ne 0 -or -not (Test-Requisitos)) {
                throw 'No se pudieron preparar WSL 2 y los servicios de Windows. Revisa SOLUCION-DE-PROBLEMAS.md, conexión y permisos de administrador.'
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
            $dockerArgs = @(Get-DockerLocalArgs $docker)
            $motor = Invoke-Nativo $docker ($dockerArgs + @('info', '--format', '{{.OSType}}')) -PermitirError
            if ($motor.Codigo -ne 0) {
                Write-Registro 'Abriendo Docker Desktop. Completa su bienvenida y acepta sus condiciones para continuar. No necesitas iniciar sesión en Docker Hub.'
                if ($NoInteractivo) { throw 'El motor de Docker Desktop no está encendido.' }
                $null = Start-Process -FilePath $desktop -PassThru
                $limite = (Get-Date).AddMinutes(10)
                do {
                    Start-Sleep -Seconds 5
                    $dockerArgs = @(Get-DockerLocalArgs $docker)
                    $motor = Invoke-Nativo $docker ($dockerArgs + @('info', '--format', '{{.OSType}}')) -PermitirError
                } while ($motor.Codigo -ne 0 -and (Get-Date) -lt $limite)
            }
            if ($motor.Codigo -ne 0) { throw 'Docker Desktop no terminó de iniciar. Revisa su ventana y SOLUCION-DE-PROBLEMAS.md; después repite INSTALAR.bat.' }
            if ($motor.Texto.Trim() -ne 'linux') { throw 'Docker está en modo Windows containers. En su menú selecciona Switch to Linux containers y repite INSTALAR.bat.' }
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
            $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
            $null = Invoke-WebRequest -Uri "$url/api/auth/google/login-url?redirect_uri=$([uri]::EscapeDataString("$url/authorize"))" -UseBasicParsing -TimeoutSec 20
            $acceso = "[InternetShortcut]`r`nURL=$url/configuracion`r`n"
            [IO.File]::WriteAllText((Join-Path $directorio 'ABRIR-NEURODATICS.url'), $acceso)
            Write-Registro "Servicios listos en $url. Abre Configuración, inicia sesión con Google y comprueba la conexión de Drive."
            Write-Host "Uso diario: Docker Desktop > Containers > $Proyecto > Iniciar (triángulo). Para detener usa el cuadrado del grupo."
            Write-Host 'Los datos y contenedores se conservan. No hace falta repetir la instalación.'
            if (-not $SinAbrirNavegador) { Start-Process "$url/configuracion" }
        }
    }
} catch {
    $codigoSalida = 1
    # Solo registrar la etapa y un error general: los errores de servicios pueden incluir datos privados.
    Add-Content -LiteralPath $registro -Value "$(Get-Date -Format s) ERROR: no se completó el proceso. Revisa el mensaje de la ventana." -Encoding UTF8 -ErrorAction SilentlyContinue
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Puedes repetir INSTALAR.bat después de corregir el problema. Consulta SOLUCION-DE-PROBLEMAS.md.'
} finally {
    Restore-EntornoCompose $entornoCompose
    if ($codigoSalida -ne 3010 -and -not $SoloComprobar -and $bloqueado) { Unregister-Reanudacion }
    if ($bloqueado -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
exit $codigoSalida

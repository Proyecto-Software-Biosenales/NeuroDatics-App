# Run on the test laptop, after extracting the package. It records what the machine is and proves the
# app starts, runs a real experiment through it and stops cleanly, then packs a report to send back.
#
#   powershell -ExecutionPolicy Bypass -File .\laptop-test.ps1 [-Package <folder>] [-RawZip <experiment.zip>]
#
# Written for Windows PowerShell 5.1 (what a laptop has), and ASCII only so no encoding can break it.
# It uses its own temporary data folder, so it does not touch a real student profile. It needs no
# internet: turn Wi-Fi off first for the offline test (the report says whether the machine was online).
# It does NOT replace the by-hand steps in docs\student\LAPTOP-TEST.md (double-click, SmartScreen).
param(
    [string]$Package = '',
    [string]$RawZip = '',
    [string]$OutDir = ''
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutDir) { $OutDir = Join-Path $here 'resultados' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$run = Join-Path $OutDir ("prueba-{0}-{1}" -f $env:COMPUTERNAME, $stamp)
New-Item -ItemType Directory -Force $run | Out-Null

function Quote($p) { '"' + $p + '"' }
function Try-Get($block) { try { & $block } catch { "unavailable: $($_.Exception.Message)" } }

if (-not $Package) {
    foreach ($candidate in @((Join-Path $here 'NeuroDatics Estudiantes'), (Split-Path -Parent $here), (Get-Location).Path)) {
        if (Test-Path (Join-Path $candidate 'neurodatics-estudiantes.exe')) { $Package = $candidate; break }
    }
}
if (-not $Package -or -not (Test-Path (Join-Path $Package 'neurodatics-estudiantes.exe'))) {
    throw 'Could not find neurodatics-estudiantes.exe. Pass -Package <the extracted folder>.'
}
$Package = (Resolve-Path $Package).Path
$exe = Join-Path $Package 'neurodatics-estudiantes.exe'

# --- who is this machine ----------------------------------------------------------------------------------
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$disk = Get-PSDrive -Name ($Package.Substring(0, 1)) -ErrorAction SilentlyContinue
$sac = Try-Get { (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState).VerifiedAndReputablePolicyState }
$sacText = switch ($sac) { 0 { 'Off' } 1 { 'On (enforcing)' } 2 { 'Evaluation' } default { "$sac" } }
$vc = Try-Get { $k = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64'; "installed=$($k.Installed) version=$($k.Version)" }
$av = Try-Get { (Get-CimInstance -Namespace 'root\SecurityCenter2' -ClassName AntiVirusProduct | ForEach-Object { $_.displayName }) -join '; ' }
$defender = Try-Get { $m = Get-MpComputerStatus; "realtime=$($m.RealTimeProtectionEnabled) engine=$($m.AMEngineVersion)" }
$mark = Try-Get {
    if (Get-Item -LiteralPath $exe -Stream 'Zone.Identifier' -ErrorAction SilentlyContinue) { (Get-Content -LiteralPath $exe -Stream 'Zone.Identifier') -join ' ' } else { 'none' }
}
function Online { try { [bool](Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction Stop) } catch { $false } }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$machine = [ordered]@{
    computer             = $env:COMPUTERNAME
    windows              = "$($os.Caption) build $($os.BuildNumber) ($($os.OSArchitecture))"
    cpu                  = "$($cpu.Name.Trim()), $($cpu.NumberOfLogicalProcessors) logical processors"
    ram_gb               = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    ram_free_gb_at_start = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    free_disk_gb         = if ($disk) { [math]::Round($disk.Free / 1GB, 1) } else { 'unknown' }
    user_profile         = $env:USERPROFILE
    accent_or_space_in_profile = ($env:USERPROFILE -match '[^\x00-\x7F ]') -or ($env:USERPROFILE -match ' ')
    package_path         = $Package
    package_path_length  = $Package.Length
    package_in_onedrive  = ($Package -match 'OneDrive')
    exe_mark_of_the_web  = $mark
    smart_app_control    = $sacText
    vc_runtime_installed = $vc
    antivirus            = $av
    defender             = $defender
    elevated             = $isAdmin
    online_at_start      = (Online)
    powershell           = $PSVersionTable.PSVersion.ToString()
}
if ($isAdmin) { $machine | ConvertTo-Json | Set-Content (Join-Path $run 'maquina.json'); throw 'Run this from a normal (not administrator) PowerShell: the app refuses to run elevated.' }

# --- the automatic run --------------------------------------------------------------------------------------
$checks = [ordered]@{}
$data = Join-Path $env:TEMP 'NeuroDatics-prueba\datos'
if (Test-Path $data) { Remove-Item $data -Recurse -Force }
$stop = Join-Path $run 'stop.txt'
$outFile = Join-Path $run 'app.out.txt'; $errFile = Join-Path $run 'app.err.txt'
$seen = @{}; $peak = 0; $samples = 0
function Sample {
    $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$Package*" })
    $ids = @($procs | ForEach-Object { $_.Id })
    foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess })) {
        if ($c.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::')) { $script:seen["$($c.RemoteAddress):$($c.RemotePort)"] = $true }
    }
    $sum = ($procs | Measure-Object WorkingSet64 -Sum).Sum
    if ($sum -gt $script:peak) { $script:peak = $sum }
    $script:samples++
}

$clock = [Diagnostics.Stopwatch]::StartNew()
$server = Start-Process -FilePath $exe -ArgumentList @('serve', '--port', '0', '--no-browser', '--offline-guard', '--data-dir', (Quote $data), '--stop-file', (Quote $stop)) `
    -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
$null = $server.Handle   # Windows PowerShell 5.1 reports no ExitCode unless the handle is held while the process runs
$url = $null
try {
    $info = Join-Path $data 'instance.json'
    while ($clock.Elapsed.TotalSeconds -lt 300 -and -not (Test-Path $info) -and -not $server.HasExited) { Start-Sleep -Milliseconds 300; Sample }
    if (Test-Path $info) {
        $checks.seconds_to_ready = [math]::Round($clock.Elapsed.TotalSeconds, 1)
        $url = ((Get-Content $info -Raw | ConvertFrom-Json).url).TrimEnd('/')
        $checks.app_started = $true
    } else { $checks.app_started = $false }

    if ($url) {
        $page = Invoke-WebRequest "$url/" -UseBasicParsing
        $checks.home_page = ($page.StatusCode -eq 200) -and ($page.Content -match 'NeuroDatics')
        $session = Invoke-RestMethod "$url/api/auth/local-session" -Method Post -ContentType 'application/json' -Body '{}'
        $checks.session = [bool]$session.access_token
        if ($RawZip) {
            $rawPath = (Resolve-Path $RawZip).Path
            $t = [Diagnostics.Stopwatch]::StartNew()
            $check = Start-Process -FilePath $exe -ArgumentList @('http-check', '--url', $url, '--zip', (Quote $rawPath), '--data-dir', (Quote $data), '--out', (Quote (Join-Path $run 'http-check.json'))) `
                -RedirectStandardOutput (Join-Path $run 'http-check.out.txt') -RedirectStandardError (Join-Path $run 'http-check.err.txt') -PassThru -WindowStyle Hidden
            $null = $check.Handle
            while (-not $check.HasExited) { Sample; Start-Sleep -Milliseconds 500 }
            $check.WaitForExit()
            $checks.real_experiment_seconds = [math]::Round($t.Elapsed.TotalSeconds, 1)
            $checks.real_experiment_exit_code = $check.ExitCode
            $checks.real_experiment_passed = ($null -ne $check.ExitCode) -and ($check.ExitCode -eq 0)
        } else { $checks.real_experiment_passed = 'not run (no -RawZip)' }
    }
} catch {
    $checks.error = $_.Exception.Message
} finally {
    Sample
    New-Item -ItemType File $stop -Force | Out-Null
    if (-not $server.WaitForExit(90000)) { $server.Kill(); $checks.forced_kill = $true }
}
$checks.exit_code = $server.ExitCode
$checks.clean_exit = ($null -ne $server.ExitCode) -and ($server.ExitCode -eq 0)
$checks.postgres_left_running = @(Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$Package*" }).Count
$checks.non_loopback_connections_seen = $seen.Count
$checks.connection_samples = $samples
$checks.peak_memory_mb_all_app_processes = [math]::Round($peak / 1MB)
$outText = (Get-Content $outFile, $errFile -Raw -ErrorAction SilentlyContinue) -join "`n"
$checks.tracebacks_in_output = ([regex]::Matches($outText, 'Traceback')).Count
$checks.offline_guard_blocked = if ($outText -match '"offline_guard_blocked": (\[[^\]]*\])') { $Matches[1] } else { 'no report' }
$checks.online_at_end = (Online)
$logs = Join-Path $data 'logs'
if (Test-Path $logs) { Copy-Item $logs (Join-Path $run 'logs-de-la-app') -Recurse -Force }

$passed = $checks.app_started -and $checks.home_page -and $checks.session -and $checks.clean_exit -and
    ($checks.postgres_left_running -eq 0) -and ($checks.non_loopback_connections_seen -eq 0) -and
    ($checks.tracebacks_in_output -eq 0) -and ($checks.offline_guard_blocked -eq '[]') -and
    ($checks.real_experiment_passed -ne $false)
$report = [ordered]@{ automatic_checks_passed = [bool]$passed; machine = $machine; checks = $checks; when = (Get-Date).ToString('o') }
$report | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $run 'informe.json') -Encoding UTF8

$lines = @("NeuroDatics laptop test  $($report.when)", '')
$lines += $machine.GetEnumerator() | ForEach-Object { "  {0,-28} {1}" -f $_.Key, $_.Value }
$lines += ''
$lines += $checks.GetEnumerator() | ForEach-Object { "  {0,-34} {1}" -f $_.Key, $_.Value }
$lines += ''
$lines += "AUTOMATIC CHECKS: " + $(if ($passed) { 'PASSED' } else { 'FAILED' })
$lines | Set-Content (Join-Path $run 'informe.txt') -Encoding UTF8
Remove-Item $stop -ErrorAction SilentlyContinue
if (Test-Path $data) { Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue }

$zip = "$run.zip"
Compress-Archive -Path (Join-Path $run '*') -DestinationPath $zip -Force
$lines | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host "Report folder: $run"
Write-Host "Send back:     $zip"
Write-Host 'Now do the by-hand steps in docs\student\LAPTOP-TEST.md (double-click, SmartScreen, closing, reopening).'

# Assemble the student package and run every gate against the frozen build.
#
#   student\run-frozen.ps1 -Assemble        build the package folder from the frozen runtime
#   student\run-frozen.ps1 [-Only <gate>]   selftest | pg | serve | race   (default: all four)
#                                          serve drives the app twice: over HTTP (http-check) and in a
#                                          real browser with name resolution off (frontend\tests\local)
#
# Inputs, all under <Work> (default output\student, git-ignored) unless overridden:
#   dist\neurodatics-estudiantes   from build.ps1
#   frontend\                      the static web app, also from build.ps1
#   tools\                         ffmpeg.exe and ffprobe.exe
#   pgsql\                         bin, lib and share of the EDB PostgreSQL 16 Windows zip
#   %TEMP%\ndtest\pg-template      a cluster built with `initdb -A trust -U postgres -E UTF8 --locale=C`
#                                  from an ASCII path (initdb fails on accented ones)
#   data\saio-raw.zip              a raw experiment ZIP with images and a video (private, not committed)
#
# The accents and spaces in the default package and data paths are deliberate: they are the
# non-ASCII paths Spanish user profiles produce.
param(
    [string]$Work = (Join-Path $PSScriptRoot '..\output\student'),
    [string]$Pkg = '',
    [string]$PgSource = '',
    [string]$TemplateSource = (Join-Path $env:TEMP 'ndtest\pg-template'),
    [string]$Zip = '',
    [switch]$Assemble,
    [string]$Only = ''
)
$ErrorActionPreference = 'Stop'
$Work = (Resolve-Path $Work).Path
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# The serve gate strips PATH and moves the profile; the browser part still needs node and the
# Chromium that `npx playwright install chromium` put in the real profile, so find them first.
$realLocalAppData = $env:LOCALAPPDATA
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
if (-not $Pkg) { $Pkg = Join-Path $Work 'Estudiantes ñandú\NeuroDatics Estudiantes' }
if (-not $PgSource) { $PgSource = Join-Path $Work 'pgsql' }
if (-not $Zip) { $Zip = Join-Path $Work 'data\saio-raw.zip' }
$exe = Join-Path $Pkg 'neurodatics-estudiantes.exe'
$results = Join-Path $Work 'frozen-results'
New-Item -ItemType Directory -Force $results | Out-Null

function MB($p) { [math]::Round(((Get-ChildItem $p -Recurse -File -Force | Measure-Object Length -Sum).Sum) / 1048576, 1) }
function PackageProcesses($name) { @(Get-Process $name -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Pkg*" }) }
function Quote($p) { "`"$p`"" }   # Start-Process does not quote array elements

if ($Assemble) {
    $dist = "$Work\dist\neurodatics-estudiantes"
    foreach ($src in @(
        @{ Path = $dist;               Hint = 'run student\build.ps1 first' },
        @{ Path = "$Work\frontend\index.html"; Hint = 'run student\build.ps1 first (it builds the web app too)' },
        @{ Path = "$Work\tools";       Hint = 'put ffmpeg.exe and ffprobe.exe there' },
        @{ Path = $PgSource;           Hint = 'extract bin, lib and share from the EDB PostgreSQL 16 zip there, or pass -PgSource' },
        @{ Path = $TemplateSource;     Hint = 'build it with initdb (see the header), or pass -TemplateSource' }
    )) {
        if (-not (Test-Path $src.Path)) { throw "missing input: $($src.Path)  ($($src.Hint))" }
    }
    if (Test-Path $Pkg) { Remove-Item $Pkg -Recurse -Force }
    New-Item -ItemType Directory -Force $Pkg | Out-Null
    robocopy $dist $Pkg /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy "$Work\tools" "$Pkg\tools" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy "$Work\frontend" "$Pkg\frontend" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy $PgSource "$Pkg\pgsql" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy $TemplateSource "$Pkg\pg-template" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    # The PostgreSQL zip does not ship the Visual C++ runtime its 44 executables import, and a
    # laptop without the redistributable would fail to start the database. The frozen runtime
    # carries copies; put them beside the executables that need them.
    $runtime = @(Get-ChildItem "$Pkg\_internal" -Filter 'vcruntime140*.dll' -File)
    if ($runtime.Count -lt 1) { throw "no vcruntime140*.dll in $Pkg\_internal to ship beside PostgreSQL" }
    $runtime | ForEach-Object { Copy-Item $_.FullName "$Pkg\pgsql\bin" -Force }
    foreach ($needed in @('vcruntime140.dll')) {
        if (-not (Test-Path "$Pkg\pgsql\bin\$needed")) { throw "$needed is not beside postgres.exe" }
    }
    "assembled: $Pkg"
    "  exe+_internal MB : " + (MB $dist)
    "  tools MB         : " + (MB "$Pkg\tools")
    "  frontend MB      : " + (MB "$Pkg\frontend")
    "  pgsql MB         : " + (MB "$Pkg\pgsql") + "  (runtime dlls: " + (($runtime | ForEach-Object Name) -join ', ') + ")"
    "  pg-template MB   : " + (MB "$Pkg\pg-template")
    "  TOTAL MB         : " + (MB $Pkg)
    $global:LASTEXITCODE = 0   # robocopy reports "files copied" as exit code 1
    return
}

# A stripped environment: no Python, no repo venv, no Chocolatey ffmpeg on PATH.
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
Remove-Item Env:PYTHONPATH, Env:PYTHONHOME, Env:VIRTUAL_ENV -ErrorAction SilentlyContinue
if (-not (Test-Path $exe)) { throw "no package at $Pkg (run -Assemble first, or pass -Pkg)" }
if (-not (Test-Path $Zip)) { throw "no raw experiment ZIP at $Zip (it is private data and is not committed)" }
Set-Location $results
$stamp = Get-Date -Format 'HHmmss'

# ---------------------------------------------------------------------------------------------
if ($Only -in @('', 'selftest')) {
    "=== selftest (frozen)"
    & $exe selftest --zip $Zip --workdir "$results\work" --out "$results\selftest.json" 2>&1 | Select-Object -Last 6
    "selftest exit=$LASTEXITCODE"
}

if ($Only -in @('', 'pg')) {
    "=== pg-check (frozen): leaving the server running to simulate a dead launcher"
    $dataRoot = "$results\datos pg ñ $stamp"
    & $exe pg-check --data-root $dataRoot --out "$results\pg-check.json" --leave-running 2>&1 | Select-Object -Last 4
    "pg-check exit=$LASTEXITCODE"
    "orphan postgres processes: " + (PackageProcesses 'postgres').Count
    "=== pg-adopt (frozen): a new launch adopts the orphan, then stops it"
    & $exe pg-adopt --data-root $dataRoot --out "$results\pg-adopt.json" 2>&1 | Select-Object -Last 3
    "pg-adopt exit=$LASTEXITCODE"
    "postgres processes left after adopt+stop: " + (PackageProcesses 'postgres').Count
}

if ($Only -in @('', 'serve')) {
    "=== serve (frozen): the real app in a brand-new empty profile, driven over HTTP, connections sampled"
    $fresh = "$results\fresh-profile $stamp"
    foreach ($d in @("$fresh\AppData\Roaming", "$fresh\AppData\Local", "$fresh\Temp")) { New-Item -ItemType Directory -Force $d | Out-Null }
    $env:USERPROFILE = $fresh; $env:HOME = $fresh; $env:APPDATA = "$fresh\AppData\Roaming"
    $env:LOCALAPPDATA = "$fresh\AppData\Local"; $env:TEMP = "$fresh\Temp"; $env:TMP = "$fresh\Temp"
    $stop = "$fresh\stop.txt"
    # A failure below must not leave the app and its database running.
    trap { New-Item -ItemType File $stop -Force | Out-Null; Start-Sleep -Seconds 15; break }
    # No --data-dir: the data must land in the (fresh) profile, where students' data lives.
    $server = Start-Process -FilePath $exe -ArgumentList @('serve', '--port', '0', '--no-browser', '--offline-guard', '--stop-file', (Quote $stop)) `
        -RedirectStandardOutput "$fresh\serve.out.txt" -RedirectStandardError "$fresh\serve.err.txt" -PassThru -WindowStyle Hidden
    $dataDir = "$fresh\AppData\Local\NeuroDatics Estudiantes"
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while ($clock.Elapsed.TotalSeconds -lt 120 -and -not (Test-Path "$dataDir\instance.json") -and -not $server.HasExited) { Start-Sleep -Milliseconds 300 }
    if (-not (Test-Path "$dataDir\instance.json")) { Get-Content "$fresh\serve.out.txt", "$fresh\serve.err.txt"; throw 'the app did not come up' }
    $info = Get-Content "$dataDir\instance.json" -Raw | ConvertFrom-Json
    "time to a published address: " + [math]::Round($clock.Elapsed.TotalSeconds, 1) + " s -> $($info.url)"

    $check = Start-Process -FilePath $exe -ArgumentList @('http-check', '--url', $info.url.TrimEnd('/'), '--zip', (Quote $Zip), '--data-dir', (Quote $dataDir), '--out', (Quote "$results\http-check.json")) `
        -RedirectStandardOutput "$results\http-check.out.txt" -RedirectStandardError "$results\http-check.err.txt" -PassThru -WindowStyle Hidden
    $seen = @{}; $script:samples = 0; $peak = @{}
    function Sample-While($driver) {
        while (-not $driver.HasExited) {
            $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$Pkg*" })
            $ids = @($procs | ForEach-Object { $_.Id })
            foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess })) {
                if ($c.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::')) { $seen["$($c.OwningProcess) $($c.RemoteAddress):$($c.RemotePort) $($c.State)"] = $true }
            }
            foreach ($p in $procs) { if (-not $peak.ContainsKey($p.ProcessName) -or $peak[$p.ProcessName] -lt $p.WorkingSet64) { $peak[$p.ProcessName] = $p.WorkingSet64 } }
            $script:samples++
            Start-Sleep -Milliseconds 500
        }
    }
    Sample-While $check
    "http-check exit=" + $check.ExitCode
    Get-Content "$results\http-check.out.txt" | Select-Object -Last 1

    # The same running app, now through its web pages in a real browser that cannot resolve any name
    # but loopback. The spec also fails on any request that leaves the machine.
    $raw = "$results\raw-folder\Experimento SAIO"
    if (Test-Path $raw) { Remove-Item $raw -Recurse -Force }
    # Python, not Expand-Archive: the real experiment's file names are not valid UTF-8.
    & "$repo\.venv\Scripts\python.exe" -c "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" $Zip $raw
    if ($LASTEXITCODE) { throw "could not extract $Zip" }
    if (-not $node -or -not $npx) { throw 'node and npx must be on PATH for the browser part of the serve gate' }
    $env:PATH = "$(Split-Path $node);$env:SystemRoot\System32;$env:SystemRoot"
    $env:PLAYWRIGHT_BROWSERS_PATH = "$realLocalAppData\ms-playwright"
    $env:STUDENT_BASE_URL = $info.url.TrimEnd('/')
    $env:STUDENT_RAW_FOLDER = $raw
    $browser = Start-Process -FilePath $npx -ArgumentList @('--no-install', 'playwright', 'test', '-c', 'playwright.local.config.ts') `
        -WorkingDirectory "$repo\frontend" -RedirectStandardOutput "$results\browser.out.txt" -RedirectStandardError "$results\browser.err.txt" `
        -PassThru -WindowStyle Hidden
    Sample-While $browser
    "browser exit=" + $browser.ExitCode
    Get-Content "$results\browser.out.txt" | Select-String '^\s+(ok|x|-)\s|passed|failed|skipped'
    "connection samples=$($script:samples), non-loopback TCP connections seen from package processes: " + $seen.Count
    $seen.Keys | ForEach-Object { "  $_" }
    "  private-memory peak MB by process: " + (($peak.GetEnumerator() | ForEach-Object { "$($_.Key)=" + [math]::Round($_.Value / 1MB) }) -join ', ')
    $listing = Get-ChildItem "$dataDir\logs", $dataDir -File -ErrorAction SilentlyContinue | ForEach-Object Name
    "data directory (in the profile): " + (($listing | Sort-Object -Unique) -join ', ')

    New-Item -ItemType File $stop | Out-Null
    $server | Wait-Process -Timeout 90
    "serve exit=" + $server.ExitCode
    $serverOut = Get-Content "$fresh\serve.out.txt" -Raw
    $blocked = if ($serverOut -match '"offline_guard_blocked": (\[[^\]]*\])') { $Matches[1] } else { 'no report' }
    "in-process offline guard (socket + asyncio) blocked: $blocked"
    "postgres processes left after exit: " + (PackageProcesses 'postgres').Count
    "stray files in the profile outside the app's data directory and Temp: " +
        @(Get-ChildItem $fresh -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -notlike "$dataDir\*" -and $_.FullName -notlike "$fresh\Temp\*" -and $_.FullName -notlike "$fresh\serve.*" -and $_.FullName -ne $stop }).Count

    [ordered]@{
        kind                 = 'served-app-offline-evidence'
        note                 = 'Real HTTP app, real routes, empty profile on the dev machine. NOT the clean-machine, network-off proof gate.'
        recorded_utc         = (Get-Date).ToUniversalTime().ToString('o')
        machine              = $env:COMPUTERNAME
        package              = $Pkg
        http_check_exit_code = $check.ExitCode
        browser_exit_code    = $browser.ExitCode
        serve_exit_code      = $server.ExitCode
        connection_samples   = $script:samples
        non_loopback_count   = $seen.Count
        non_loopback         = @($seen.Keys)
        offline_guard        = $blocked
        profile_mb           = (MB $fresh)
        blind_spots          = @(
            'native code (ffmpeg, Typst) does not go through the Python socket module; only the TCP sampling covers it',
            'sampling every 500 ms can miss a short-lived connection'
        )
    } | ConvertTo-Json -Depth 4 | Set-Content "$results\serve-evidence.json" -Encoding utf8
}

if ($Only -in @('', 'race')) {
    "=== race (frozen): two launches started at the same instant on one data directory"
    $raceRoot = "$results\datos race ñ $stamp"
    $stopRace = "$results\stop-race-$stamp.txt"
    $args1 = @('serve', '--data-dir', (Quote $raceRoot), '--port', '0', '--no-browser', '--stop-file', (Quote $stopRace))
    $a = Start-Process -FilePath $exe -ArgumentList $args1 -RedirectStandardOutput "$results\race-a.out.txt" -RedirectStandardError "$results\race-a.err.txt" -PassThru -WindowStyle Hidden
    $b = Start-Process -FilePath $exe -ArgumentList $args1 -RedirectStandardOutput "$results\race-b.out.txt" -RedirectStandardError "$results\race-b.err.txt" -PassThru -WindowStyle Hidden
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while ($clock.Elapsed.TotalSeconds -lt 150 -and -not ($a.HasExited -or $b.HasExited)) { Start-Sleep -Milliseconds 300 }
    $loser = if ($a.HasExited) { $a } else { $b }
    $winner = if ($loser -eq $a) { $b } else { $a }
    "one launch turned away after " + [math]::Round($clock.Elapsed.TotalSeconds, 1) + " s, exit code " + $loser.ExitCode
    $postgres = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.ExecutablePath -like "$Pkg*" })
    $ids = @($postgres | ForEach-Object { $_.ProcessId })
    $postmasters = @($postgres | Where-Object { $ids -notcontains $_.ParentProcessId })
    "postmasters running for the data directory: " + $postmasters.Count
    New-Item -ItemType File $stopRace | Out-Null
    $winner | Wait-Process -Timeout 90
    $outputs = Get-Content "$results\race-a.out.txt", "$results\race-a.err.txt", "$results\race-b.out.txt", "$results\race-b.err.txt" -Raw
    "winner exit=" + $winner.ExitCode + "; tracebacks in either launch: " + @($outputs | Where-Object { $_ -match 'Traceback' }).Count
    "postgres processes left after exit: " + (PackageProcesses 'postgres').Count
    Get-Content "$results\race-a.out.txt", "$results\race-b.out.txt" | Select-String 'ya esta abierto|esta listo|Otra ventana'
}

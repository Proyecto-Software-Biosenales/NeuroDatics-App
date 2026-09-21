# M1 frozen-runtime test driver. Assembles the package at an accented path with spaces,
# then runs selftest, pg-lifecycle, orphan adoption and the real FastAPI app.
#
# Every path defaults to somewhere under this script's own folder, so a copy of m1-spike/
# placed anywhere (including the clean VM that owes us the proof gate) runs unchanged.
# The accents and spaces in the default package name are deliberate: they are the
# non-ASCII install path the spike has to keep exercising.
param(
    [string]$Pkg = (Join-Path $PSScriptRoot 'Estudiantes ñandú\NeuroDatics Estudiantes'),
    [string]$PgSource = (Join-Path $PSScriptRoot 'pgsql'),
    [string]$TemplateSource = (Join-Path $env:TEMP 'ndtest\pg-template'),
    [switch]$Assemble,
    [string]$Only = ''
)
$ErrorActionPreference = 'Stop'
$m1 = $PSScriptRoot
$exe = Join-Path $Pkg 'neurodatics-m1.exe'
$results = Join-Path $m1 'frozen-results'
New-Item -ItemType Directory -Force $results | Out-Null

function MB($p) { [math]::Round(((Get-ChildItem $p -Recurse -File -Force | Measure-Object Length -Sum).Sum) / 1048576, 1) }

if ($Assemble) {
    # Fail with the missing input named, not with an empty package that fails much later.
    foreach ($src in @(
        @{ Path = "$m1\dist\neurodatics-m1"; Hint = 'run build.ps1 first' },
        @{ Path = "$m1\tools";               Hint = 'put ffmpeg.exe and ffprobe.exe there' },
        @{ Path = $PgSource;                 Hint = 'extract bin, lib and share from the EDB PostgreSQL 16 zip there, or pass -PgSource' },
        @{ Path = $TemplateSource;           Hint = 'build it with initdb -A trust -E UTF8 --locale=C from an ASCII path, or pass -TemplateSource' }
    )) {
        if (-not (Test-Path $src.Path)) { throw "missing input: $($src.Path)  ($($src.Hint))" }
    }
    New-Item -ItemType Directory -Force $Pkg | Out-Null
    robocopy "$m1\dist\neurodatics-m1" $Pkg /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy "$m1\tools" "$Pkg\tools" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy $PgSource "$Pkg\pgsql" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy $TemplateSource "$Pkg\pg-template" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    "assembled: $Pkg"
    "  from pgsql      : $PgSource"
    "  from template   : $TemplateSource"
    "  exe+_internal MB : " + (MB "$m1\dist\neurodatics-m1")
    "  tools MB         : " + (MB "$Pkg\tools")
    "  pgsql MB         : " + (MB "$Pkg\pgsql")
    "  pg-template MB   : " + (MB "$Pkg\pg-template")
    "  TOTAL MB         : " + (MB $Pkg)
    return
}

# A stripped environment: no Python, no repo venv, no Chocolatey ffmpeg on PATH.
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
Remove-Item Env:PYTHONPATH, Env:PYTHONHOME, Env:VIRTUAL_ENV -ErrorAction SilentlyContinue
$zip = "$m1\data\saio-raw.zip"
if (-not (Test-Path $exe)) { throw "no package at $Pkg (run -Assemble first, or pass -Pkg)" }
if (-not (Test-Path $zip)) { throw "no raw experiment ZIP at $zip (it is private data and is not committed)" }
Set-Location $results

if ($Only -in @('', 'selftest')) {
    "=== selftest (frozen)"
    & $exe selftest --zip $zip --workdir "$results\work" --out "$results\selftest.json" 2>&1 | Select-Object -Last 12
    "selftest exit=$LASTEXITCODE"
}
if ($Only -in @('', 'pg')) {
    "=== pg-lifecycle (frozen), leaving the server running to simulate a dead launcher"
    $dataRoot = "$results\datos ñ estudiantes " + (Get-Date -Format 'HHmmss')
    & $exe pg-lifecycle --data-root $dataRoot --out "$results\pg-lifecycle.json" --leave-running 2>&1 | Select-Object -Last 8
    "pg-lifecycle exit=$LASTEXITCODE"
    $pgProcs = Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Pkg*" }
    "orphan postgres processes: " + @($pgProcs).Count +
        "  private MB total: " + [math]::Round((($pgProcs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1048576, 0) +
        "  working set MB total (shared counted repeatedly): " + [math]::Round((($pgProcs | Measure-Object WorkingSet64 -Sum).Sum) / 1048576, 0)
    "=== pg-adopt (frozen): new launch adopts the orphan, then stops it"
    & $exe pg-adopt --data-root $dataRoot --out "$results\pg-adopt.json" 2>&1 | Select-Object -Last 4
    "pg-adopt exit=$LASTEXITCODE"
    "postgres processes left after adopt+stop: " + @(Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Pkg*" }).Count
}
if ($Only -in @('', 'serve')) {
    "=== serve (frozen): real FastAPI app on embedded PG"
    $serveOut = "$results\serve.out.txt"
    $serveRoot = "$results\datos serve ñ " + (Get-Date -Format 'HHmmss')
    # Start-Process does not quote array elements: a path with spaces must carry its own quotes.
    $proc = Start-Process -FilePath $exe -ArgumentList @('serve', '--data-root', "`"$serveRoot`"", '--port', '8765', '--exit-after', '60') `
        -RedirectStandardOutput $serveOut -RedirectStandardError "$results\serve.err.txt" -PassThru -WindowStyle Hidden
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $health = $null
    while ($sw.Elapsed.TotalSeconds -lt 90 -and -not $health -and -not $proc.HasExited) {
        try { $health = Invoke-RestMethod 'http://127.0.0.1:8765/health' -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 500 }
    }
    "time to first /health: " + [math]::Round($sw.Elapsed.TotalSeconds, 1) + " s -> " + ($health | ConvertTo-Json -Compress)
    try { Invoke-RestMethod 'http://127.0.0.1:8765/health/ready' -TimeoutSec 8 | ConvertTo-Json -Compress } catch { "ready -> HTTP " + $_.Exception.Response.StatusCode.value__ + " " + $_.ErrorDetails.Message }
    $openapi = Invoke-RestMethod 'http://127.0.0.1:8765/openapi.json' -TimeoutSec 20
    "openapi paths (all routes imported in the frozen app): " + ($openapi.paths.PSObject.Properties | Measure-Object).Count
    $procs = Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Pkg*" }
    $api = Get-Process neurodatics-m1 -ErrorAction SilentlyContinue
    "postgres processes: " + @($procs).Count + " private MB " + [math]::Round((($procs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1048576, 0) +
        " | api launcher working set MB " + [math]::Round((($api | Measure-Object WorkingSet64 -Sum).Sum) / 1048576, 0)
    $proc | Wait-Process -Timeout 90
    "serve exit code: " + $proc.ExitCode
    Get-Content $serveOut
    "postgres processes left after serve exit: " + @(Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Pkg*" }).Count
}

if ($Only -eq 'offline') {
    "=== offline proxy: brand-new empty profile, 4 logical cores, sampling TCP connections of every package process"
    $fresh = "$results\fresh-profile " + (Get-Date -Format 'HHmmss')
    foreach ($d in @("$fresh\AppData\Roaming", "$fresh\AppData\Local", "$fresh\Temp", "$fresh\work")) { New-Item -ItemType Directory -Force $d | Out-Null }
    $env:USERPROFILE = $fresh; $env:HOME = $fresh; $env:APPDATA = "$fresh\AppData\Roaming"
    $env:LOCALAPPDATA = "$fresh\AppData\Local"; $env:TEMP = "$fresh\Temp"; $env:TMP = "$fresh\Temp"
    $proc = Start-Process -FilePath $exe -ArgumentList @('selftest', '--zip', "`"$zip`"", '--workdir', "`"$fresh\work`"", '--out', "`"$fresh\selftest.json`"") `
        -RedirectStandardOutput "$fresh\selftest.out.txt" -RedirectStandardError "$fresh\selftest.err.txt" -PassThru -WindowStyle Hidden
    $proc.ProcessorAffinity = [IntPtr]0xF
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $seen = @{}; $samples = 0
    while (-not $proc.HasExited) {
        $ids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$Pkg*" } | ForEach-Object { $_.Id })
        if ($ids.Count) {
            foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess })) {
                $remote = $c.RemoteAddress
                if ($remote -notin @('127.0.0.1', '::1', '0.0.0.0', '::')) { $seen["$($c.OwningProcess) $remote`:$($c.RemotePort) $($c.State)"] = $true }
            }
        }
        $samples++
        Start-Sleep -Milliseconds 700
    }
    "selftest exit=" + $proc.ExitCode + " wall seconds=" + [math]::Round($watch.Elapsed.TotalSeconds, 1) + " connection samples=$samples"
    "non-loopback TCP connections seen from package processes: " + $seen.Count
    $seen.Keys | ForEach-Object { "  $_" }
    Get-Content "$fresh\selftest.out.txt" | Select-Object -Last 3
    "fresh profile grew to MB: " + (MB $fresh)
    $strays = @(Get-ChildItem $fresh -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike "$fresh\work\*" -and $_.FullName -notlike "$fresh\selftest*" })
    "files created in the fresh profile outside work/: " + $strays.Count
    $strays | Select-Object -First 8 | ForEach-Object { "  " + $_.FullName.Substring($fresh.Length) + "  " + $_.Length }

    # This run is the stand-in for the clean-profile proof gate, so it has to leave an
    # artifact behind. Console-only numbers cannot be diffed against the real VM run.
    $selftest = $null
    $tripwireBlocked = @()
    if (Test-Path "$fresh\selftest.json") {
        $selftest = Get-Content "$fresh\selftest.json" -Raw | ConvertFrom-Json
        $tripwireBlocked = @($selftest.network_attempts_blocked)
    }
    [ordered]@{
        kind                    = 'offline-substitute-evidence'
        note                    = 'Empty profile on the dev machine with 4 logical cores. NOT the clean-machine, network-off proof gate.'
        recorded_utc            = (Get-Date).ToUniversalTime().ToString('o')
        machine                 = $env:COMPUTERNAME
        package                 = $Pkg
        profile_root            = $fresh
        processor_affinity_mask = '0xF'
        selftest_exit_code      = $proc.ExitCode
        wall_seconds            = [math]::Round($watch.Elapsed.TotalSeconds, 1)
        connection_samples      = $samples
        non_loopback_count      = $seen.Count
        non_loopback            = @($seen.Keys)
        profile_mb              = (MB $fresh)
        files_outside_work      = $strays.Count
        python_tripwire_blocked = $tripwireBlocked
        selftest_all_ok         = $selftest.all_ok
        tripwire_blind_spots    = @(
            'native code (ffmpeg, Typst) does not go through the Python socket module',
            'asyncio on Windows connects through ConnectEx, not socket.socket.connect, so it evades the tripwire; only the TCP sampling below covers it',
            'sampling every 700 ms can miss a short-lived connection'
        )
    } | ConvertTo-Json -Depth 4 | Set-Content "$results\offline-evidence.json" -Encoding utf8
    "wrote $results\offline-evidence.json"
}

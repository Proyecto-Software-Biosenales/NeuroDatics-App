# M1 frozen-runtime test driver. Assembles the package at an accented path with spaces,
# then runs selftest, pg-lifecycle, orphan adoption and the real FastAPI app.
param(
    [string]$Pkg = 'C:\AAMisArchivos\AAprogramming\AAAWebDeb\Bioseñales\NeuroDatics-App\output\student-m1\Estudiantes ñandú\NeuroDatics Estudiantes',
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
    New-Item -ItemType Directory -Force $Pkg | Out-Null
    robocopy "$m1\dist\neurodatics-m1" $Pkg /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy "$m1\tools" "$Pkg\tools" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy "$m1\prueba ñandú áéí\NeuroDatics Estudiantes\pgsql" "$Pkg\pgsql" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    robocopy 'C:\Users\jacob\AppData\Local\Temp\ndtest\pg-template' "$Pkg\pg-template" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    "assembled: $Pkg"
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
    "files created in the fresh profile outside work/: "
    Get-ChildItem $fresh -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike "$fresh\work\*" -and $_.FullName -notlike "$fresh\selftest*" } | Select-Object -First 8 | ForEach-Object { "  " + $_.FullName.Substring($fresh.Length) + "  " + $_.Length }
}

# Turn the assembled student package into the file students download, and prove that file.
#
#   student\package.ps1 [-Work <dir>] [-Version <text>] [-SkipVerify]
#
# Run student\build.ps1 and student\run-frozen.ps1 -Assemble first. This script then:
#   1. adds LEEME.txt (the student guide) and THIRD-PARTY-NOTICES.txt to the package folder
#   2. zips it to <Work>\release\NeuroDatics-Estudiantes-<Version>-win64.zip, with a SHA-256 file
#   3. extracts that zip into a fresh folder with an accented path and starts the real app from it
#      in an empty profile, offline-guarded, then stops it (skip with -SkipVerify)
#   4. writes package-report.json: sizes, hash, what was checked and the release blockers still open
#   5. copies laptop-test.ps1 beside the zip: the script to run on the test laptop
#   6. lays the whole delivery out in delivery\NeuroDatics-Estudiantes (git-ignored, like the server edition's
#      delivery\NeuroDatics-App): the ready-to-run folder, the zip, its hash, the laptop kit (skip with -NoDelivery)
#
# The extracted-zip check is a smoke test. The full gates (run-frozen.ps1 -Pkg <extracted> -Only serve)
# still apply and are the way to prove the exact file that will be uploaded.
param(
    [string]$Work = (Join-Path $PSScriptRoot '..\output\student'),
    [string]$Pkg = '',
    [string]$Version = 'prueba',
    [switch]$SkipVerify,
    [switch]$NoDelivery,
    [string]$DeliveryDir = (Join-Path $PSScriptRoot '..\delivery\NeuroDatics-Estudiantes')
)
$ErrorActionPreference = 'Stop'
$Work = (Resolve-Path $Work).Path
$student = $PSScriptRoot
$repo = (Resolve-Path "$student\..").Path
if (-not $Pkg) { $Pkg = Join-Path $Work 'Estudiantes ñandú\NeuroDatics Estudiantes' }
$exe = Join-Path $Pkg 'neurodatics-estudiantes.exe'
if (-not (Test-Path $exe)) { throw "no assembled package at $Pkg (run student\build.ps1, then student\run-frozen.ps1 -Assemble)" }
$py = "$Work\build-venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "no build venv at $Work\build-venv" }
$release = Join-Path $Work 'release'
New-Item -ItemType Directory -Force $release | Out-Null
$zipPath = Join-Path $release "NeuroDatics-Estudiantes-$Version-win64.zip"

function MB($p) { [math]::Round(((Get-ChildItem -LiteralPath $p -Recurse -File -Force | Measure-Object Length -Sum).Sum) / 1048576, 1) }

# --- 1. the documents that travel with the program -------------------------------------------------
# Notepad opens UTF-8 with a BOM as UTF-8; without it the accents in the guide come out wrong.
$guide = [IO.File]::ReadAllText("$student\LEEME.txt") -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText("$Pkg\LEEME.txt", $guide, (New-Object Text.UTF8Encoding($true)))
$env:PYTHONIOENCODING = 'utf-8'
& $py "$student\make-notices.py" --pkg $Pkg --out "$Pkg\THIRD-PARTY-NOTICES.txt"
if ($LASTEXITCODE) { throw 'could not write the third-party notices' }

# --- release blockers: things a script cannot settle --------------------------------------------------
$blockers = @()
$ffmpegBanner = (& "$Pkg\tools\ffmpeg.exe" -version 2>&1 | Out-String)
$gpl = $ffmpegBanner -match '--enable-gpl'
if (-not (Get-ChildItem "$Pkg\tools" -Filter 'LICENSE*' -File -ErrorAction SilentlyContinue)) {
    $blockers += if ($gpl) {
        'ffmpeg is a GPL build and tools\ has no LICENSE file: add the license text that came with the build, or switch to an LGPL build (owner decision, PLAN.md open items)'
    } else { 'tools\ has no LICENSE file for ffmpeg: add the license text that came with the build' }
} elseif ($gpl) {
    $blockers += 'ffmpeg is a GPL build: the license text is present, but the owner has not confirmed GPL is acceptable versus an LGPL build (PLAN.md open items)'
}
$blockers += 'no real-laptop run yet: SmartScreen, Smart App Control, antivirus, missing runtimes and student RAM are unproven (docs/student/LAPTOP-TEST.md)'
$blockers += 'governance of raw participant data handed to students is not confirmed by the owner (PLAN.md open items)'

# --- 2. the zip -----------------------------------------------------------------------------------------
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$clock = [Diagnostics.Stopwatch]::StartNew()
# includeBaseDirectory: the zip holds one folder, so "Extract all" cannot scatter files across a Downloads folder.
[IO.Compression.ZipFile]::CreateFromDirectory($Pkg, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true)
$zipSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 1)
$hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash
$zipName = Split-Path $zipPath -Leaf
"$hash *$zipName" | Set-Content "$release\SHA256.txt" -Encoding ascii
Copy-Item "$student\laptop-test.ps1" $release -Force
$pkgFiles = @(Get-ChildItem -LiteralPath $Pkg -Recurse -File -Force)
"zip: $zipName  " + [math]::Round((Get-Item $zipPath).Length / 1MB, 1) + " MiB in $zipSeconds s; package $($pkgFiles.Count) files, " + (MB $Pkg) + " MiB"
"sha256: $hash"

# --- 3. the file a student receives, extracted and started ---------------------------------------------
$verify = [ordered]@{ skipped = [bool]$SkipVerify }
if (-not $SkipVerify) {
    $check = Join-Path $Work 'release-check'
    if (Test-Path $check) { Remove-Item $check -Recurse -Force }
    # An accented, spaced path like the ones Spanish user profiles produce.
    $extractRoot = Join-Path $check 'Descargas ñ Estudiante'
    $clock.Restart()
    [IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractRoot)
    $extracted = Join-Path $extractRoot (Split-Path $Pkg -Leaf)
    $extractedFiles = @(Get-ChildItem -LiteralPath $extracted -Recurse -File -Force)
    $verify.extract_seconds = [math]::Round($clock.Elapsed.TotalSeconds, 1)
    $verify.files_match = ($extractedFiles.Count -eq $pkgFiles.Count) -and
        (($extractedFiles | Measure-Object Length -Sum).Sum -eq ($pkgFiles | Measure-Object Length -Sum).Sum)
    if (-not $verify.files_match) { throw "the extracted zip differs from the package ($($extractedFiles.Count) vs $($pkgFiles.Count) files)" }
    foreach ($needed in 'neurodatics-estudiantes.exe', 'LEEME.txt', 'THIRD-PARTY-NOTICES.txt', 'pgsql\bin\postgres.exe', 'pgsql\bin\vcruntime140.dll', 'pg-template\PG_VERSION', 'tools\ffprobe.exe', 'frontend\index.html') {
        if (-not (Test-Path (Join-Path $extracted $needed))) { throw "the extracted package lacks $needed" }
    }
    $verify.longest_relative_path = ($extractedFiles | ForEach-Object { $_.FullName.Substring($extracted.Length + 1).Length } | Measure-Object -Maximum).Maximum

    # Start it as a student's profile would see it: nothing on PATH, an empty profile, no name resolution
    # allowed by the in-process guard. The variables are restored afterwards so this session is unchanged.
    $profile1 = Join-Path $check 'perfil vacio'
    foreach ($d in @("$profile1\AppData\Roaming", "$profile1\AppData\Local", "$profile1\Temp")) { New-Item -ItemType Directory -Force $d | Out-Null }
    $names = 'PATH', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV'
    $saved = @{}; foreach ($n in $names) { $saved[$n] = [Environment]::GetEnvironmentVariable($n) }
    $stop = "$profile1\stop.txt"
    $dataDir = "$profile1\AppData\Local\NeuroDatics Estudiantes"
    $extractedExe = Join-Path $extracted 'neurodatics-estudiantes.exe'
    try {
        $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
        $env:USERPROFILE = $profile1; $env:HOME = $profile1; $env:APPDATA = "$profile1\AppData\Roaming"
        $env:LOCALAPPDATA = "$profile1\AppData\Local"; $env:TEMP = "$profile1\Temp"; $env:TMP = "$profile1\Temp"
        Remove-Item Env:PYTHONPATH, Env:PYTHONHOME, Env:VIRTUAL_ENV -ErrorAction SilentlyContinue
        $clock.Restart()
        $server = Start-Process -FilePath $extractedExe -ArgumentList @('serve', '--port', '0', '--no-browser', '--offline-guard', '--stop-file', "`"$stop`"") `
            -RedirectStandardOutput "$profile1\serve.out.txt" -RedirectStandardError "$profile1\serve.err.txt" -PassThru -WindowStyle Hidden
    } finally {
        foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $saved[$n]) }
    }
    try {
        while ($clock.Elapsed.TotalSeconds -lt 180 -and -not (Test-Path "$dataDir\instance.json") -and -not $server.HasExited) { Start-Sleep -Milliseconds 300 }
        if (-not (Test-Path "$dataDir\instance.json")) {
            Get-Content "$profile1\serve.out.txt", "$profile1\serve.err.txt" -ErrorAction SilentlyContinue
            throw 'the extracted package did not come up'
        }
        $verify.seconds_to_ready = [math]::Round($clock.Elapsed.TotalSeconds, 1)
        $url = ((Get-Content "$dataDir\instance.json" -Raw | ConvertFrom-Json).url).TrimEnd('/')
        $page = Invoke-WebRequest "$url/" -UseBasicParsing
        $verify.home_status = [int]$page.StatusCode
        $verify.home_is_the_app = $page.Content -match 'NeuroDatics'
        $verify.health_status = [int](Invoke-WebRequest "$url/health" -UseBasicParsing).StatusCode
        $session = Invoke-RestMethod "$url/api/auth/local-session" -Method Post -ContentType 'application/json' -Body '{}'
        $verify.session_token_issued = [bool]$session.access_token
        if (-not ($verify.home_status -eq 200 -and $verify.home_is_the_app -and $verify.health_status -eq 200 -and $verify.session_token_issued)) {
            throw "the extracted app answered wrongly: $($verify | ConvertTo-Json -Compress)"
        }
    } finally {
        New-Item -ItemType File $stop -Force | Out-Null
        if (-not $server.WaitForExit(90000)) { $server.Kill() }
    }
    $verify.exit_code = $server.ExitCode
    $out = Get-Content "$profile1\serve.out.txt", "$profile1\serve.err.txt" -Raw -ErrorAction SilentlyContinue
    $verify.tracebacks = @($out | Where-Object { $_ -match 'Traceback' }).Count
    $verify.postgres_left = @(Get-Process postgres -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$extractRoot*" }).Count
    $verify.offline_guard_blocked = if (($out -join "`n") -match '"offline_guard_blocked": (\[[^\]]*\])') { $Matches[1] } else { 'no report' }
    $verify.extracted_path = $extracted
    "extracted zip started from an accented path: ready in $($verify.seconds_to_ready) s, exit $($verify.exit_code), postgres left $($verify.postgres_left), guard blocked $($verify.offline_guard_blocked)"
    if ($verify.exit_code -ne 0 -or $verify.tracebacks -or $verify.postgres_left -or $verify.offline_guard_blocked -ne '[]') { throw "the extracted package did not behave: $($verify | ConvertTo-Json -Compress)" }
}

# --- 4. the report --------------------------------------------------------------------------------------
[ordered]@{
    recorded_utc = (Get-Date).ToUniversalTime().ToString('o')
    machine      = $env:COMPUTERNAME
    zip          = $zipName
    zip_mib      = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    sha256       = $hash
    package_files = $pkgFiles.Count
    package_mib  = MB $Pkg
    ffmpeg       = if ($gpl) { 'GPL build' } else { 'LGPL or other build' }
    smoke        = $verify
    release_blockers = $blockers
} | ConvertTo-Json -Depth 5 | Set-Content "$release\package-report.json" -Encoding utf8
"release blockers still open: $($blockers.Count) (see $release\package-report.json)"

# --- 5. the delivery folder ---------------------------------------------------------------------------
if (-not $NoDelivery) {
    New-Item -ItemType Directory -Force $DeliveryDir | Out-Null
    $DeliveryDir = (Resolve-Path $DeliveryDir).Path
    robocopy $Pkg (Join-Path $DeliveryDir (Split-Path $Pkg -Leaf)) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    foreach ($f in @($zipPath, "$release\SHA256.txt", "$release\laptop-test.ps1", "$release\package-report.json", "$repo\docs\student\LAPTOP-TEST.md")) {
        Copy-Item $f $DeliveryDir -Force
    }
    $copied = @(Get-ChildItem -LiteralPath (Join-Path $DeliveryDir (Split-Path $Pkg -Leaf)) -Recurse -File -Force)
    if ($copied.Count -ne $pkgFiles.Count) { throw "the delivery folder has $($copied.Count) files, the package $($pkgFiles.Count)" }
    "delivery: $DeliveryDir  (" + (MB $DeliveryDir) + " MiB)"
}
$global:LASTEXITCODE = 0

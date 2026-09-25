# Freeze the student edition (real neurodatics code) with PyInstaller 6, onedir.
#
#   student\build.ps1 [-Work <dir>]
#
# <Work> (default: output\student, git-ignored) holds everything the build needs or produces:
#   build-venv\  a venv made from student\requirements-frozen.txt (Google's libraries are not in it)
#   dist\        the frozen runtime, neurodatics-estudiantes\
#   frontend\    the static web app (a copy of frontend\.next-local, built here)
# No source under backend\ or frontend\ is modified; the web build writes only frontend\.next-local.
param([string]$Work = (Join-Path $PSScriptRoot '..\output\student'))
$ErrorActionPreference = 'Stop'
$student = $PSScriptRoot
$repo = (Resolve-Path "$student\..").Path
$Work = (Resolve-Path $Work).Path
$py = "$Work\build-venv\Scripts\python.exe"
$backend = "$repo\backend"
if (-not (Test-Path $py)) {
    throw "no build venv at $Work\build-venv (python -m venv it, then pip install -r student\requirements-frozen.txt)"
}

# The packages that compute results must be the ones the test suite ran on, and the build venv
# must be what requirements.txt says.
& "$repo\.venv\Scripts\python.exe" "$student\check-pins.py"
if ($LASTEXITCODE) { throw 'student pins drifted from the tested environment' }
& $py "$student\check-pins.py" --against $py
if ($LASTEXITCODE) { throw 'build venv does not match student\requirements.txt' }

# The web app: a static export that the local backend serves. NEXT_PUBLIC_APP_MODE=local turns
# off sign-in, Google Drive and the server-only rewrites at build time.
$frontend = "$repo\frontend"
Push-Location $frontend
try {
    $env:NEXT_PUBLIC_APP_MODE = 'local'
    $env:NEXT_TELEMETRY_DISABLED = '1'
    & npx.cmd --no-install next build
    if ($LASTEXITCODE) { throw "web app build failed (exit $LASTEXITCODE)" }
} finally {
    Remove-Item Env:NEXT_PUBLIC_APP_MODE -ErrorAction SilentlyContinue
    Pop-Location
}
if (-not (Test-Path "$frontend\.next-local\index.html")) { throw 'the web build produced no index.html' }
robocopy "$frontend\.next-local" "$Work\frontend" /MIR /XF .gitkeep /NFL /NDL /NJH /NJS /NP | Out-Null
$global:LASTEXITCODE = 0   # robocopy reports "files copied" as exit code 1
$site = @(Get-ChildItem "$Work\frontend" -Recurse -File)

# Nothing from the teacher's environment files may ride along, and nothing may ask a third party
# for a font or a script.
$leaks = @()
foreach ($envFile in (Get-ChildItem $frontend -Force -File -Filter '.env*' | Where-Object { $_.Name -ne '.env.example' })) {
    foreach ($line in (Get-Content $envFile.FullName)) {
        if ($line -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*"?([^"#]{8,}?)"?\s*$') {
            $hit = $site | Select-String -SimpleMatch $Matches[1] -List
            if ($hit) { $leaks += "$($envFile.Name) value found in $($hit[0].Path)" }
        }
    }
}
if ($leaks) { throw "web build contains environment values:`n" + ($leaks -join "`n") }
$remote = $site | Where-Object { $_.Extension -in '.html', '.css', '.js' } |
    Select-String -Pattern 'fonts\.googleapis\.com|fonts\.gstatic\.com|apis\.google\.com|accounts\.google\.com/gsi' -List
if ($remote) { throw "web build still references a remote font or script: $($remote[0].Path)" }
"web app: $($site.Count) files, " + [math]::Round((($site | Measure-Object Length -Sum).Sum) / 1MB, 1) + " MiB at $Work\frontend"

& $py -m PyInstaller --noconfirm --clean --onedir --name neurodatics-estudiantes `
    --distpath "$Work\dist" --workpath "$Work\build-work" --specpath "$Work\spec" `
    --paths "$backend\src" --paths "$student\src" `
    --add-data "$backend\migrations;migrations" `
    --add-data "$backend\src\neurodatics\modules\reports\application\assets;neurodatics/modules/reports/application/assets" `
    --add-data "$backend\src\neurodatics\modules\reports\infrastructure\templates;neurodatics/modules/reports/infrastructure/templates" `
    --hidden-import logging.config `
    --hidden-import matplotlib.backends.backend_svg `
    --hidden-import matplotlib.backends.backend_agg `
    --hidden-import sqlalchemy.dialects.postgresql.psycopg `
    --collect-submodules alembic `
    --collect-submodules psycopg `
    --collect-all psycopg_binary `
    --collect-submodules uvicorn `
    --collect-submodules jose `
    --collect-all typst `
    --exclude-module googleapiclient --exclude-module google_auth_httplib2 --exclude-module httplib2 `
    --exclude-module google.auth --exclude-module google.oauth2 --exclude-module google.api_core `
    --exclude-module google.protobuf --exclude-module oauth2client `
    --exclude-module tkinter --exclude-module IPython --exclude-module pytest `
    "$student\src\student_entry.py"
if ($LASTEXITCODE) { throw "PyInstaller failed (exit $LASTEXITCODE)" }
"built $Work\dist\neurodatics-estudiantes"

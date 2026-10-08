param([ValidatePattern("^g[0-9]{2}(-[a-z0-9]+)*$")][string]$Run = "g02-local")
# G02 static compatibility build only; no packaging or distribution.
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$taskOutput = Join-Path $taskRoot "output/perf-$Run/frontend"
$taskEvidence = Join-Path $taskRoot 'docs/perf/ejecucion/evidencia/g02'
if (Test-Path -LiteralPath $taskOutput) { throw 'Use a new output directory; do not overwrite a prior static run.' }
New-Item -ItemType Directory -Force $taskOutput | Out-Null
$taskSources = @(git -C $taskRoot ls-files frontend) + @(git -C $taskRoot ls-files --others --exclude-standard frontend)
foreach ($taskRelative in $taskSources | Sort-Object -Unique) {
    if ($taskRelative -match '(^|/)\.env($|\.)') { continue }
    $taskSource = Join-Path $taskRoot $taskRelative
    if (-not (Test-Path -LiteralPath $taskSource -PathType Leaf)) { continue }
    $taskTarget = Join-Path $taskOutput $taskRelative.Substring('frontend/'.Length)
    New-Item -ItemType Directory -Force (Split-Path $taskTarget) | Out-Null
    Copy-Item -LiteralPath $taskSource -Destination $taskTarget
}
New-Item -ItemType Junction -Path (Join-Path $taskOutput 'node_modules') -Target (Join-Path $taskRoot 'frontend/node_modules') | Out-Null
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NEXT_PUBLIC_APP_MODE = 'local'
Push-Location $taskOutput
try {
    & node.exe node_modules/next/dist/bin/next build --webpack *> (Join-Path $taskEvidence "$Run-build.log")
    if ($LASTEXITCODE -ne 0) { throw "Static compatibility build failed: $LASTEXITCODE" }
} finally { Pop-Location }

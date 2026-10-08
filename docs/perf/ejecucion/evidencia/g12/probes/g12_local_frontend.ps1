param([ValidatePattern('^g12-local(-[a-z0-9]+)?$')][string]$Run = 'g12-local')
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../../..')).Path
$taskOutput = Join-Path $taskRoot "output/perf-$Run/frontend"
$taskEvidence = Join-Path $taskRoot 'docs/perf/ejecucion/evidencia/g12'
if (Test-Path -LiteralPath $taskOutput) { throw 'Use a new output directory; do not overwrite a prior local run.' }
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
$taskOldMode = $env:NEXT_PUBLIC_APP_MODE
$taskOldTelemetry = $env:NEXT_TELEMETRY_DISABLED
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NEXT_PUBLIC_APP_MODE = 'local'
Push-Location $taskOutput
try {
    & node.exe node_modules/next/dist/bin/next build --webpack *> (Join-Path $taskEvidence 'frontend-local-build.log')
    if ($LASTEXITCODE -ne 0) { throw "Isolated local export failed: $LASTEXITCODE" }
    if (-not (Test-Path -LiteralPath (Join-Path $taskOutput '.next-local/index.html'))) {
        throw 'Local export did not produce .next-local/index.html'
    }
} finally {
    Pop-Location
    $env:NEXT_PUBLIC_APP_MODE = $taskOldMode
    $env:NEXT_TELEMETRY_DISABLED = $taskOldTelemetry
}

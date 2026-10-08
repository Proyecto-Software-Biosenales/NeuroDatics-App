param([switch]$Serve, [int]$Port = 3317, [ValidatePattern('^g[0-9]{2}(-[a-z0-9]+)?$')][string]$Run = 'g00')
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$taskIsolated = Join-Path $taskRoot "output/perf-$Run/frontend"
$taskEvidence = Join-Path $taskRoot "docs/perf/ejecucion/evidencia/$Run"
if (-not $Serve) {
    New-Item -ItemType Directory -Force $taskIsolated | Out-Null
    New-Item -ItemType Directory -Force $taskEvidence | Out-Null
    $taskSources = @(git -C $taskRoot ls-files frontend) + @(git -C $taskRoot ls-files --others --exclude-standard frontend)
    foreach ($taskRelative in $taskSources | Sort-Object -Unique) {
        if ($taskRelative -match '(^|/)\.env($|\.)') { continue }
        $taskSource = Join-Path $taskRoot $taskRelative
        if (-not (Test-Path -LiteralPath $taskSource -PathType Leaf)) { continue }
        $taskTarget = Join-Path $taskIsolated $taskRelative.Substring('frontend/'.Length)
        New-Item -ItemType Directory -Force (Split-Path $taskTarget) | Out-Null
        Copy-Item -LiteralPath $taskSource -Destination $taskTarget
    }
    $taskModules = Join-Path $taskIsolated 'node_modules'
    if (-not (Test-Path -LiteralPath $taskModules)) {
        New-Item -ItemType Junction -Path $taskModules -Target (Join-Path $taskRoot 'frontend/node_modules') | Out-Null
    }
}
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NEXT_PUBLIC_APP_MODE = 'server'
$env:NEXT_INTERNAL_API_BASE_URL = 'http://127.0.0.1:9'
Push-Location $taskIsolated
try {
    if ($Serve) { & node.exe node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $Port }
    else {
        & node.exe node_modules/next/dist/bin/next build --webpack *> (Join-Path $taskEvidence 'frontend-build.log')
        if ($LASTEXITCODE -ne 0) { throw "Isolated frontend build failed: $LASTEXITCODE" }
    }
} finally { Pop-Location }

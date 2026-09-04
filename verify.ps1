param([int]$MaxLintErrors = 0, [int]$MaxLintWarnings = 8)

$ErrorActionPreference = 'Stop'
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$taskOldPythonPath = $env:PYTHONPATH
$taskOldEncoding = $env:PYTHONIOENCODING

function Assert-Exit([string]$Gate) {
    if ($LASTEXITCODE -ne 0) { throw "$Gate failed (exit $LASTEXITCODE)" }
}

try {
    $env:PYTHONIOENCODING = 'utf-8'
    Push-Location (Join-Path $PSScriptRoot 'backend')
    try {
        & $taskPython -m pytest -q --disable-warnings
        Assert-Exit 'Backend tests'
        & $taskPython -m ruff check src
        Assert-Exit 'Backend lint'
        & $taskPython -m vulture src tests vulture_whitelist.py --min-confidence 100
        Assert-Exit 'Backend dead-code ratchet'
        & $taskPython -m deptry .
        Assert-Exit 'Backend dependency declarations'
        $env:PYTHONPATH = 'src'
        & $taskPython -c "import runpy; runpy.run_path('tests/conftest.py'); from fastapi.routing import APIRoute; from neurodatics.main import app; print('App boot: %s HTTP operations' % sum(len(route.methods or []) for route in app.routes if isinstance(route, APIRoute)))"
        Assert-Exit 'App boot'
        & (Join-Path $PSScriptRoot '.venv/Scripts/lint-imports.exe') --no-cache
        Assert-Exit 'Backend import boundaries'
    } finally { Pop-Location }

    Push-Location (Join-Path $PSScriptRoot 'frontend')
    try {
        & npx.cmd --no-install tsc --noEmit
        Assert-Exit 'TypeScript'
        & npm.cmd run test:comparison-click
        Assert-Exit 'Frontend tests'
        & npm.cmd run test:hooks
        Assert-Exit 'React hook browser regressions (install Chromium with npx playwright install chromium)'
        $taskLintJson = & npx.cmd --no-install eslint . --format json
        $taskLintExit = $LASTEXITCODE
        if ($taskLintExit -gt 1) { throw "ESLint could not run (exit $taskLintExit)" }
        $taskLint = ($taskLintJson -join "`n") | ConvertFrom-Json
        $taskErrors = ($taskLint | Measure-Object -Property errorCount -Sum).Sum
        $taskWarnings = ($taskLint | Measure-Object -Property warningCount -Sum).Sum
        Write-Host "ESLint: $taskErrors errors, $taskWarnings warnings (ratchet: $MaxLintErrors/$MaxLintWarnings)"
        if ($taskErrors -gt $MaxLintErrors -or $taskWarnings -gt $MaxLintWarnings) {
            throw 'ESLint baseline regressed'
        }
    } finally { Pop-Location }
    Write-Host 'ALL GREEN' -ForegroundColor Green
} finally {
    $env:PYTHONPATH = $taskOldPythonPath
    $env:PYTHONIOENCODING = $taskOldEncoding
}

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\..")).Path
$base = Join-Path $root "output\perf-g10\base"
$output = Join-Path $PSScriptRoot "own.patch"
$paths = @(
  "backend/src/neurodatics/modules/analytics/api/routes.py",
  "backend/src/neurodatics/modules/analytics/api/schemas.py",
  "backend/src/neurodatics/modules/analytics/application/services/comparison_chart_config.py",
  "backend/tests/characterization/test_analytics_http_contracts.py",
  "backend/tests/characterization/test_comparison_statistics_contract.py",
  "frontend/features/analytics/types.ts",
  "frontend/features/analytics/api/analyticsApi.ts",
  "frontend/features/analytics/hooks/useAnalyticsData.ts",
  "frontend/features/analytics/analyticsCache.ts",
  "frontend/features/analytics/comparison/useComparisonData.ts",
  "frontend/features/analytics/comparison/ComparisonStatistics.tsx",
  "frontend/tests/e2e/comparison-dashboard.spec.ts",
  "docs/CHANGELOG.md"
)
$chunks = [System.Collections.Generic.List[string]]::new()
Push-Location $root
try {
  foreach ($path in $paths) {
    if ($path -eq "docs/CHANGELOG.md") {
      $received = Join-Path $root "output/perf-g10/changelog-received.md"
      $receivedRelative = "output/perf-g10/changelog-received.md"
    } else {
      $received = Join-Path $base $path
      $receivedRelative = "output/perf-g10/base/$path"
    }
    if (Test-Path -LiteralPath $received -PathType Leaf) {
      $lines = & git diff --no-index --binary -- $receivedRelative $path
      if ($LASTEXITCODE -notin 0, 1) { throw "git diff failed for $path" }
      $text = ($lines -join "`n") -replace "a/output/perf-g10/base/", "a/"
      $text = $text -replace "a/output/perf-g10/changelog-received.md", "a/docs/CHANGELOG.md"
    } else {
      $lines = & git diff --no-index --binary -- NUL $path
      if ($LASTEXITCODE -notin 0, 1) { throw "git diff failed for new $path" }
      $text = $lines -join "`n"
    }
    if ($text) { $chunks.Add($text) }
  }
} finally {
  Pop-Location
}
[System.IO.File]::WriteAllText($output, (($chunks -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))

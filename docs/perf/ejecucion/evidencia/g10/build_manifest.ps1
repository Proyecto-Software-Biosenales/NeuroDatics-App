$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\..")).Path
$spec = @(
  @("backend/src/neurodatics/modules/analytics/api/routes.py", "source"),
  @("backend/src/neurodatics/modules/analytics/api/schemas.py", "source"),
  @("backend/src/neurodatics/modules/analytics/application/services/comparison_chart_config.py", "source"),
  @("backend/tests/characterization/test_analytics_http_contracts.py", "test"),
  @("backend/tests/characterization/test_comparison_statistics_contract.py", "test"),
  @("frontend/features/analytics/types.ts", "source"),
  @("frontend/features/analytics/api/analyticsApi.ts", "source"),
  @("frontend/features/analytics/hooks/useAnalyticsData.ts", "source"),
  @("frontend/features/analytics/analyticsCache.ts", "source"),
  @("frontend/features/analytics/comparison/useComparisonData.ts", "source"),
  @("frontend/features/analytics/comparison/ComparisonStatistics.tsx", "source"),
  @("frontend/tests/e2e/comparison-dashboard.spec.ts", "test"),
  @("docs/CHANGELOG.md", "documentation"),
  @("docs/perf/ejecucion/G10.md", "delivery"),
  @("docs/perf/ejecucion/ESTADO.md", "coordination-status"),
  @("docs/perf/ejecucion/evidencia/g10/API.md", "contract"),
  @("docs/perf/ejecucion/evidencia/g10/backend-runtime.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/backend-supported.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/benchmark_g10.py", "benchmark-probe"),
  @("docs/perf/ejecucion/evidencia/g10/benchmark-result.json", "measurement"),
  @("docs/perf/ejecucion/evidencia/g10/build_own_patch.ps1", "reproduction"),
  @("docs/perf/ejecucion/evidencia/g10/build_manifest.ps1", "reproduction"),
  @("docs/perf/ejecucion/evidencia/g10/build-production.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/cierre-benchmark-verificacion.json", "closure-check"),
  @("docs/perf/ejecucion/evidencia/g10/cierre-e2e-production.log", "closure-check-log"),
  @("docs/perf/ejecucion/evidencia/g10/cierre-entorno-preservacion.json", "closure-check"),
  @("docs/perf/ejecucion/evidencia/g10/cierre-eslint.log", "closure-check-log"),
  @("docs/perf/ejecucion/evidencia/g10/cierre-patch-reverse-check.log", "closure-check-log"),
  @("docs/perf/ejecucion/evidencia/g10/comandos.md", "evidence"),
  @("docs/perf/ejecucion/evidencia/g10/e2e-production.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/frontend-checks.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/inventario-inicial.json", "received-inventory"),
  @("docs/perf/ejecucion/evidencia/g10/own.patch", "patch"),
  @("docs/perf/ejecucion/evidencia/g10/patch-reverse-check.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/preservacion.json", "preservation"),
  @("docs/perf/ejecucion/evidencia/g10/ruff.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g10/snapshot-scope.json", "received-snapshot"),
  @("docs/perf/ejecucion/evidencia/g10/verificacion.json", "verification")
)
$entries = foreach ($item in $spec) {
  $relative = $item[0]
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing manifest file: $relative" }
  [ordered]@{
    path = $relative
    bytes = (Get-Item -LiteralPath $path).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    role = $item[1]
  }
}
$document = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  head = "f310003bd734203a41268f40a4627bd99d5a3233"
  entry_count = $entries.Count
  entries = $entries
  exclusions = @(
    "manifiesto-final.json self",
    "ORQUESTACION/ASIGNACION/REVISION root controls",
    "agente*/implementador*/respuesta* CLI/root operational logs (including live closure capture)",
    "reconciliacion-* root evidence",
    "capture_received_state.ps1 received root helper",
    "output/perf-g10/build ignored isolated build tree"
  )
}
$json = $document | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "manifiesto-final.json"), ($json + "`n"), [System.Text.UTF8Encoding]::new($false))

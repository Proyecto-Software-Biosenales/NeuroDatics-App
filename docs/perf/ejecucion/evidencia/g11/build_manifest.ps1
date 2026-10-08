$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
$spec = @(
  @("docs/CHANGELOG.md", "documentation"),
  @("docs/perf/ejecucion/ESTADO.md", "coordination-status"),
  @("docs/perf/ejecucion/G11.md", "delivery"),
  @("docs/perf/ejecucion/evidencia/g11/benchmark_topography.mjs", "benchmark-probe"),
  @("docs/perf/ejecucion/evidencia/g11/summarize_topography.mjs", "measurement-reducer"),
  @("docs/perf/ejecucion/evidencia/g11/profile-base.json", "preliminary-measurement"),
  @("docs/perf/ejecucion/evidencia/g11/profile-base-fresh.json", "base-measurement"),
  @("docs/perf/ejecucion/evidencia/g11/profile-candidate.json", "candidate-measurement"),
  @("docs/perf/ejecucion/evidencia/g11/measurement-summary.json", "measurement-summary"),
  @("docs/perf/ejecucion/evidencia/g11/profile-base.log", "benchmark-log"),
  @("docs/perf/ejecucion/evidencia/g11/profile-base-fresh.log", "benchmark-log"),
  @("docs/perf/ejecucion/evidencia/g11/profile-candidate.log", "benchmark-log"),
  @("docs/perf/ejecucion/evidencia/g11/summary.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g11/probe-check.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g11/presentation-tests.log", "candidate-equivalence-log"),
  @("docs/perf/ejecucion/evidencia/g11/inventario-inicial.json", "received-inventory"),
  @("docs/perf/ejecucion/evidencia/g11/snapshot-scope.json", "received-snapshot"),
  @("docs/perf/ejecucion/evidencia/g11/git-status-inicial.txt", "received-status"),
  @("docs/perf/ejecucion/evidencia/g11/source-restoration.json", "restoration-check"),
  @("docs/perf/ejecucion/evidencia/g11/preservacion.json", "preservation"),
  @("docs/perf/ejecucion/evidencia/g11/preservation.log", "check-log"),
  @("docs/perf/ejecucion/evidencia/g11/verificacion.json", "verification"),
  @("docs/perf/ejecucion/evidencia/g11/comandos.md", "reproduction"),
  @("docs/perf/ejecucion/evidencia/g11/verify_preservation.ps1", "reproduction"),
  @("docs/perf/ejecucion/evidencia/g11/build_own_patch.ps1", "reproduction"),
  @("docs/perf/ejecucion/evidencia/g11/build_manifest.ps1", "reproduction"),
  @("docs/perf/ejecucion/evidencia/g11/own.patch", "patch"),
  @("docs/perf/ejecucion/evidencia/g11/patch-reverse-check.log", "check-log")
)
$entries = foreach ($item in $spec) {
  $relative = $item[0]
  $absolute = Join-Path $repo $relative
  if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) { throw "Missing manifest file: $relative" }
  [ordered]@{
    path = $relative
    bytes = (Get-Item -LiteralPath $absolute).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $absolute).Hash.ToLowerInvariant()
    role = $item[1]
  }
}
$document = [ordered]@{
  generated_at = [DateTime]::UtcNow.ToString("o")
  head = (git -C $repo rev-parse HEAD)
  entry_count = $entries.Count
  entries = $entries
  exclusions = @(
    "manifiesto-final.json self",
    "ORQUESTACION/ASIGNACION/REVISION root controls",
    "agente*/respuesta*/implementador* live root/CLI logs",
    "output/perf-g11 ignored received snapshot and transient browser artifacts"
  )
}
[IO.File]::WriteAllText(
  (Join-Path $PSScriptRoot "manifiesto-final.json"),
  (($document | ConvertTo-Json -Depth 6) + "`n"),
  [Text.UTF8Encoding]::new($false)
)
Write-Output "manifest_entries=$($entries.Count)"

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
$base = Join-Path $repo "output/perf-g11/base"
$output = Join-Path $PSScriptRoot "own.patch"
$paths = @(
  "docs/CHANGELOG.md",
  "docs/perf/ejecucion/ESTADO.md",
  "docs/perf/ejecucion/G11.md",
  "docs/perf/ejecucion/evidencia/g11/benchmark_topography.mjs",
  "docs/perf/ejecucion/evidencia/g11/summarize_topography.mjs",
  "docs/perf/ejecucion/evidencia/g11/comandos.md",
  "docs/perf/ejecucion/evidencia/g11/verify_preservation.ps1",
  "docs/perf/ejecucion/evidencia/g11/build_own_patch.ps1",
  "docs/perf/ejecucion/evidencia/g11/build_manifest.ps1"
)
$chunks = [Collections.Generic.List[string]]::new()
Push-Location $repo
try {
  foreach ($path in $paths) {
    $received = Join-Path $base $path
    if (Test-Path -LiteralPath $received -PathType Leaf) {
      $receivedRelative = "output/perf-g11/base/$path"
      $lines = & git diff --no-index --binary -- $receivedRelative $path
      if ($LASTEXITCODE -notin 0, 1) { throw "git diff failed for $path" }
      $text = ($lines -join "`n") -replace "a/output/perf-g11/base/", "a/"
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
[IO.File]::WriteAllText($output, (($chunks -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
$inventory = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "inventario-inicial.json") | ConvertFrom-Json
$allowed = @(
  "docs/CHANGELOG.md",
  "docs/perf/ejecucion/ESTADO.md"
)
$unchanged = [Collections.Generic.List[string]]::new()
$allowedChanged = [Collections.Generic.List[string]]::new()
$missing = [Collections.Generic.List[string]]::new()
$drift = [Collections.Generic.List[object]]::new()
foreach ($record in $inventory.files) {
  $path = [string]$record.path
  $absolute = Join-Path $repo $path
  if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) {
    $missing.Add($path)
    continue
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $absolute).Hash.ToLowerInvariant()
  if ($actual -eq [string]$record.sha256) {
    $unchanged.Add($path)
  } elseif ($allowed -contains $path) {
    $allowedChanged.Add($path)
  } else {
    $drift.Add([ordered]@{ path = $path; expected = $record.sha256; actual = $actual })
  }
}
$document = [ordered]@{
  generated_at = [DateTime]::UtcNow.ToString("o")
  received_protected = $inventory.files.Count
  unchanged = $unchanged.Count
  allowed_changed = @($allowedChanged | Sort-Object)
  missing = @($missing | Sort-Object)
  unexpected_drift = @($drift | Sort-Object path)
  ok = $missing.Count -eq 0 -and $drift.Count -eq 0 -and $allowedChanged.Count -eq $allowed.Count
  exclusions_in_received_inventory = $inventory.excludes
}
[IO.File]::WriteAllText(
  (Join-Path $PSScriptRoot "preservacion.json"),
  (($document | ConvertTo-Json -Depth 6) + "`n"),
  [Text.UTF8Encoding]::new($false)
)
if (-not $document.ok) { throw "G11 preservation check failed" }
Write-Output "preserved=$($unchanged.Count) allowed_changed=$($allowedChanged.Count)"

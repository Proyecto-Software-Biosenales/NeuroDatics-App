$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
$evidence = $PSScriptRoot
$snapshotRoot = Join-Path $repo "output/perf-g10/base"

function Get-RelativePath([string] $path) {
    return [IO.Path]::GetRelativePath($repo, $path).Replace("\", "/")
}

function Get-FileRecord([string] $relative, [string] $kind) {
    $absolute = Join-Path $repo $relative
    $item = Get-Item -LiteralPath $absolute
    return [ordered]@{
        path = $relative.Replace("\", "/")
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $absolute).Hash.ToLowerInvariant()
        bytes = $item.Length
        kind = $kind
        hash_source = "working-tree-received"
    }
}

Push-Location $repo
try {
    $tracked = @(git ls-files)
    $untracked = @(git ls-files --others --exclude-standard)
    $excludedPatterns = @(
        '^docs/perf/ejecucion/ORQUESTACION\.md$',
        '^docs/perf/ejecucion/ASIGNACION-G10\.md$',
        '^docs/perf/ejecucion/REVISION-G10\.md$',
        '^docs/perf/ejecucion/evidencia/g10/(agente-|implementador-|respuesta-|capture_received_state\.ps1)'
    )
    $isExcluded = {
        param([string] $path)
        foreach ($pattern in $excludedPatterns) {
            if ($path -match $pattern) { return $true }
        }
        return $false
    }

    $records = [Collections.Generic.List[object]]::new()
    $excluded = [Collections.Generic.List[string]]::new()
    foreach ($path in $tracked) {
        $normalized = $path.Replace("\", "/")
        if (& $isExcluded $normalized) { $excluded.Add($normalized); continue }
        $records.Add((Get-FileRecord $normalized "tracked"))
    }
    foreach ($path in $untracked) {
        $normalized = $path.Replace("\", "/")
        if (& $isExcluded $normalized) { $excluded.Add($normalized); continue }
        $records.Add((Get-FileRecord $normalized "untracked-nonignored"))
    }

    $inventory = [ordered]@{
        head = (git rev-parse HEAD)
        generated_at = [DateTime]::UtcNow.ToString("o")
        coverage = "all tracked plus all untracked non-ignored files received by G10; root controls and live CLI artifacts excluded from protected set"
        raw_counts = [ordered]@{
            tracked = $tracked.Count
            untracked_nonignored = $untracked.Count
            total = $tracked.Count + $untracked.Count
        }
        protected_counts = [ordered]@{
            files = $records.Count
            excluded_root_control_or_live = $excluded.Count
        }
        excludes = @($excluded | Sort-Object)
        files = @($records | Sort-Object path)
    }
    $inventory | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8NoBOM (Join-Path $evidence "inventario-inicial.json")

    $scopeRoots = @(
        "frontend/features/analytics",
        "frontend/tests/e2e/comparison-dashboard.spec.ts",
        "frontend/tests/hooks",
        "backend/src/neurodatics/modules/analytics",
        "backend/tests/characterization",
        "backend/tests/unit/test_eeg_scientific_contract.py",
        "docs/perf/ejecucion/ESTADO.md"
    )
    New-Item -ItemType Directory -Force -Path $snapshotRoot | Out-Null
    $snapshotRecords = [Collections.Generic.List[object]]::new()
    foreach ($root in $scopeRoots) {
        $absoluteRoot = Join-Path $repo $root
        if (-not (Test-Path -LiteralPath $absoluteRoot)) { continue }
        $items = if ((Get-Item -LiteralPath $absoluteRoot).PSIsContainer) {
            Get-ChildItem -LiteralPath $absoluteRoot -File -Recurse | Where-Object {
                $_.FullName -notmatch '[\\/](__pycache__|\.next)[\\/]'
            }
        } else { @(Get-Item -LiteralPath $absoluteRoot) }
        foreach ($item in $items) {
            $relative = Get-RelativePath $item.FullName
            $destination = Join-Path $snapshotRoot $relative
            New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
            Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
            $snapshotRecords.Add([ordered]@{
                path = $relative
                sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()
                bytes = $item.Length
            })
        }
    }
    $scope = [ordered]@{
        generated_at = [DateTime]::UtcNow.ToString("o")
        snapshot_root = "output/perf-g10/base"
        roots = $scopeRoots
        count = $snapshotRecords.Count
        files = @($snapshotRecords | Sort-Object path)
    }
    $scope | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8NoBOM (Join-Path $evidence "snapshot-scope.json")
} finally {
    Pop-Location
}

# Comandos G11

Ejecutados desde la raíz salvo indicación:

```powershell
$env:G11_VARIANT='base'
$env:G11_OUTPUT="$PWD/docs/perf/ejecucion/evidencia/g11/profile-base-fresh.json"
node docs/perf/ejecucion/evidencia/g11/benchmark_topography.mjs

$env:G11_VARIANT='candidate'
$env:G11_OUTPUT="$PWD/docs/perf/ejecucion/evidencia/g11/profile-candidate.json"
node docs/perf/ejecucion/evidencia/g11/benchmark_topography.mjs

node docs/perf/ejecucion/evidencia/g11/summarize_topography.mjs
node --check docs/perf/ejecucion/evidencia/g11/benchmark_topography.mjs
node --check docs/perf/ejecucion/evidencia/g11/summarize_topography.mjs

cd frontend
node --test features/analytics/eegPresentation.test.mjs
```

La prueba dirigida se ejecutó con los helpers reales del candidato antes de retirarlo; el log conserva los 20 casos verdes. Al final se comparan SHA-256 contra `output/perf-g11/base`, se verifica preservación, se genera `own.patch` y se ejecuta `git apply --reverse --check` sin modificar el checkout.

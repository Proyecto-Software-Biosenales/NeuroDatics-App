# Comandos G04

Desde raíz, fixtures sintéticas y servicios externos sustituidos. Sin frontend/gate global/deploy/migraciones. Todos los resultados finales tienen exit0. Salidas diagnósticas fallidas se conservan y se distinguen por nombre.

```powershell
Push-Location backend
../.venv/Scripts/python.exe -m pytest tests/unit/test_analytics_singleflight.py tests/unit/test_parquet_projection.py tests/unit/test_parquet_participant_identity.py tests/unit/test_cache_generation_identity.py tests/unit/test_analytics_cache_invalidation.py tests/characterization/test_backend_singleflight.py tests/characterization/test_cached_frame_endpoints.py tests/characterization/test_projected_frame_endpoints.py tests/characterization/test_transform_cache_short_circuit.py tests/characterization/test_analytics_http_contracts.py tests/unit/test_eeg_scientific_contract.py -q
# Repetido con ../output/perf-g03/supported-env/Scripts/python.exe (sin instalar ni alterar entorno)
# Tras cambio final sólo subset afectado, ambos runtimes:
../.venv/Scripts/python.exe -m pytest tests/characterization/test_backend_singleflight.py tests/characterization/test_cached_frame_endpoints.py tests/characterization/test_projected_frame_endpoints.py tests/characterization/test_analytics_http_contracts.py tests/characterization/test_transform_cache_short_circuit.py -q
$env:PYTHONPATH='src'
../.venv/Scripts/lint-imports.exe --no-cache
Remove-Item Env:PYTHONPATH
Pop-Location
.venv/Scripts/python.exe -m ruff check backend/src/neurodatics/modules/analytics/infrastructure/singleflight.py backend/src/neurodatics/modules/analytics/application/services/parquet_reader_service.py backend/src/neurodatics/modules/analytics/api/routes.py backend/tests/unit/test_analytics_singleflight.py backend/tests/characterization/test_backend_singleflight.py backend/tests/unit/test_parquet_participant_identity.py
.venv/Scripts/python.exe -m ruff check docs/perf/bench/g04_singleflight.py
.venv/Scripts/python.exe docs/perf/bench/g04_singleflight.py
git apply --reverse --check --ignore-space-change docs/perf/ejecucion/evidencia/g04/own.patch
```

Logs: tests-runtime/tests-supported inicialmente313/24snapshots, tests-final-runtime/tests-final-supported163/24snapshots tras TypeAdapter y tests nuevos. Unidad/file/identidad/límites iniciales sin cambios después; subset final revalidó todo comportamiento HTTP/esquemas/enriquecimiento/equivalencia/NaN. El conjunto completo actualizado contendría316 casos únicos; no se anuncia una repetición integral316 que no se hizo. Tests ASGI get_db real, AsyncSession subclass con transporte sintético; no PostgreSQL/Drive/Redis reales. Runtime recibido3.14/PyArrow25 y entorno aislado G03 Python3.12/PyArrow16.1; se reusó sin modificar deps/.venv. Detalles/versiones heredados en evidencia/g03/versions-supported.json.

Ruff final ambos y import-boundaries3 contratos aprobados. Benchmark final se ejecutó sin tests/instalación simultáneos. Diagnostics tests-first (fake cache aún sin get), tests-http-first (UUIDfixture mal), tests-http-repair (deadline demasiado corto antes de compute), tests-singleflight-first (expectativa queue timeout equivocada) reparados; no representan fallos finales. Benchmark preliminary/baseWindowsrace y variantes retiradas permanecen con esa etiqueta. Fuentes finales y evidencia preservadas por manifiesto/own.patch.

# Comandos G05

Fixtures sintéticas G00; sin golden updates ni backend/frontend gate global. Runtime recibido .venv intacto; supported-env de G03 reutilizado sin instalar.

Desde backend:

```powershell
../.venv/Scripts/python.exe -m pytest tests/unit/test_shared_fixation_result.py tests/unit/test_fixation_event_analytics.py tests/unit/test_fixation_duration_variants.py tests/unit/test_stimulus_coordinate_analytics.py tests/unit/test_scanpath_radius_scale.py tests/unit/test_heatmap_orientation.py tests/unit/test_executive_report_heatmap_geometry.py tests/unit/test_executive_report_service.py tests/characterization/test_shared_fixation_report.py tests/characterization/test_numeric_characterization.py tests/characterization/test_sensor_reports.py -q
../.venv/Scripts/python.exe -m pytest tests/characterization/test_analytics_http_contracts.py -q
# Supported: mismo conjunto combinado, sustituyendo Python por:
../output/perf-g03/supported-env/Scripts/python.exe -m pytest tests/unit/test_shared_fixation_result.py tests/unit/test_fixation_event_analytics.py tests/unit/test_fixation_duration_variants.py tests/unit/test_stimulus_coordinate_analytics.py tests/unit/test_scanpath_radius_scale.py tests/unit/test_heatmap_orientation.py tests/unit/test_executive_report_heatmap_geometry.py tests/unit/test_executive_report_service.py tests/characterization/test_shared_fixation_report.py tests/characterization/test_numeric_characterization.py tests/characterization/test_sensor_reports.py tests/characterization/test_analytics_http_contracts.py -q
$env:PYTHONPATH='src'
../.venv/Scripts/lint-imports.exe --no-cache
Remove-Item Env:PYTHONPATH
```

Desde raíz, antes de modificar producto y al finalizar, n5+warmup mismos parámetros/corpus/runtime, sin tests/probes simultáneos:

```powershell
.venv/Scripts/python.exe docs/perf/bench/g05_fixations.py --phase before
.venv/Scripts/python.exe docs/perf/bench/g05_fixations.py --phase after
.venv/Scripts/python.exe -m ruff check backend/src/neurodatics/modules/analytics/application/services/fixation_analytics_service.py backend/src/neurodatics/modules/analytics/application/services/fixation_summaries.py backend/src/neurodatics/modules/analytics/application/services/scanpath_analytics_service.py backend/src/neurodatics/modules/analytics/application/services/heatmap_analytics_service.py backend/src/neurodatics/modules/analytics/application/services/aoi_analytics_service.py backend/src/neurodatics/modules/analytics/application/services/analytics_service.py backend/src/neurodatics/modules/reports/application/sensor_reports/eye_tracking.py backend/tests/unit/test_shared_fixation_result.py backend/tests/characterization/test_shared_fixation_report.py backend/tests/unit/test_scanpath_radius_scale.py backend/tests/unit/test_stimulus_coordinate_analytics.py docs/perf/bench/g05_fixations.py
git apply --reverse --check --ignore-space-change docs/perf/ejecucion/evidencia/g05/own.patch
```

El probe compara recordings (todos los números/arrays/metadata), documento JSON de render y SHA256 de assets, no bytes PDF con timestamps. El collect medido incluye captura/normalización de evidencia idéntica antes/después; PDF incluye capture/hashes además de figuras/Typst. Datos e imágenes ya en RAM; no I/O del informe. RSS snapshot y peak acumulado del proceso no son peak por operación. Misma semilla/ZIP small2×1600 y large4×102400 filas G00.

Logs iniciales diagnósticos: tests-runtime.log=144 passed/2 failed, sólo fakes ownership sin owner_id desde key G04 (no fallo G00). Esa suite G04 dirigida no los cubrió. Se agregó owner_id a ambos fakes y caché sintética al caso AOI; primer intento de ese test usó default Redis y falló DNS antes de resolver conexión, sin Redis real. Routes/auth/lifecycle no se alteraron. tests-runtime-final.log=146/1snapshot; tests-http-runtime.log=47/24snapshots; tests-supported.log=193/25snapshots; import-boundaries=3 kept. Primera corrida probe diagnosticó as_json ya era dict y se corrigió antes de medir; n5 before/after finales contienen corrida completa válida.

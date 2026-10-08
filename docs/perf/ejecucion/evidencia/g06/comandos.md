# Comandos G06

Desde raíz, base fresca/final, warmup1+n5:

```powershell
.venv/Scripts/python.exe docs/perf/bench/g06_algorithms.py --phase before
.venv/Scripts/python.exe docs/perf/bench/g06_algorithms.py --phase after
.venv/Scripts/python.exe docs/perf/bench/bench_runtime_algorithms.py
output/perf-g03/supported-env/Scripts/python.exe docs/perf/bench/bench_runtime_algorithms.py
```

Desde `backend`, con Python recibido y luego sustituyendo por `../output/perf-g03/supported-env/Scripts/python.exe`:

```powershell
../.venv/Scripts/python.exe -m pytest tests/unit/test_g06_aoi_cadence_algorithms.py tests/unit/test_shared_fixation_result.py tests/unit/test_fixation_event_analytics.py tests/unit/test_fixation_duration_variants.py tests/unit/test_stimulus_coordinate_analytics.py tests/unit/test_scanpath_radius_scale.py tests/unit/test_heatmap_orientation.py tests/unit/test_executive_report_heatmap_geometry.py tests/unit/test_executive_report_service.py tests/characterization/test_shared_fixation_report.py tests/characterization/test_numeric_characterization.py tests/characterization/test_sensor_reports.py tests/characterization/test_analytics_http_contracts.py -q
```

Checks estáticos desde raíz:

```powershell
.venv/Scripts/python.exe -m ruff check backend/src/neurodatics/modules/analytics/application/services/aoi_analytics_service.py backend/src/neurodatics/modules/analytics/application/services/fixation_analytics_service.py backend/tests/unit/test_g06_aoi_cadence_algorithms.py docs/perf/bench/g06_algorithms.py
$env:PYTHONPATH='src'; Push-Location backend; ../.venv/Scripts/lint-imports.exe --no-cache; Pop-Location; Remove-Item Env:PYTHONPATH
git apply --reverse --check --ignore-space-change docs/perf/ejecucion/evidencia/g06/own.patch
```

No gate frontend/global, DB/Redis/Drive real, install, build de distribución ni golden update.

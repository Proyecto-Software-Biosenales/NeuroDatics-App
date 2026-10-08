# Comandos G07

Desde raíz, cuatro procesos separados, secuenciales:

```powershell
.venv/Scripts/python.exe docs/perf/bench/g07_reports.py --phase before --state cold
.venv/Scripts/python.exe docs/perf/bench/g07_reports.py --phase before --state warm
.venv/Scripts/python.exe docs/perf/bench/g07_reports.py --phase after --state cold
.venv/Scripts/python.exe docs/perf/bench/g07_reports.py --phase after --state warm
```

Desde `backend`, misma selección con `../.venv/Scripts/python.exe` y `../output/perf-g03/supported-env/Scripts/python.exe`:

```powershell
python -m pytest tests/unit/test_g07_report_loading.py tests/unit/test_parquet_participant_identity.py tests/unit/test_parquet_projection.py tests/unit/test_analytics_singleflight.py tests/unit/test_cache_generation_identity.py tests/unit/test_analytics_cache_invalidation.py tests/unit/test_image_conditional_get.py tests/unit/test_g06_aoi_cadence_algorithms.py tests/unit/test_shared_fixation_result.py tests/unit/test_fixation_event_analytics.py tests/unit/test_fixation_duration_variants.py tests/unit/test_stimulus_coordinate_analytics.py tests/unit/test_scanpath_radius_scale.py tests/unit/test_heatmap_orientation.py tests/unit/test_executive_report_heatmap_geometry.py tests/unit/test_executive_report_service.py tests/characterization/test_cached_frame_endpoints.py tests/characterization/test_shared_fixation_report.py tests/characterization/test_numeric_characterization.py tests/characterization/test_sensor_reports.py tests/characterization/test_analytics_http_contracts.py -q
python -m pytest tests/unit/test_gdrive_client.py tests/unit/test_local_storage_client.py -q
```

Desde raíz: Ruff de archivos propios/probe. Desde backend: `PYTHONPATH=src` + `lint-imports --no-cache`. Cierre: patch reverse-check read-only contra snapshot G07. No gate frontend/global, DB/Drive/Redis real, instalación, build, deploy ni distribución.

Tras `REVISION-G07.md` se repitieron sólo los afectados en ambos runtimes (**170 passed**): G07/identidad/imagen, singleflight, cache-generation/proyección, executive/sensor reports y cached endpoints. Logs `tests-revision-runtime.log` y `tests-revision-supported.log`. Se regeneraron únicamente los dos casos `after` del probe; los `before` permanecen el snapshot recibido.

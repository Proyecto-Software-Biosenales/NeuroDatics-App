# Comandos G03

Desde raíz; salidas bajo `evidencia/g03`, sin sobrescribir G00–G02. Las pruebas usan fixtures sintéticas y sustituyen servicios externos. No ejecutar frontend ni gate global en G03.

```powershell
Push-Location backend
../.venv/Scripts/python.exe -m pytest tests/unit/test_parquet_projection.py tests/unit/test_parquet_participant_identity.py tests/unit/test_cache_generation_identity.py tests/characterization/test_projected_frame_endpoints.py tests/characterization/test_cached_frame_endpoints.py tests/characterization/test_transform_cache_short_circuit.py tests/characterization/test_analytics_http_contracts.py tests/unit/test_eeg_scientific_contract.py -q
# Repetir el conjunto en entorno aislado, reemplazando Python por:
# ../output/perf-g03/supported-env/Scripts/python.exe
# Checks finales de casos cambiados:
../.venv/Scripts/python.exe -m pytest tests/unit/test_parquet_projection.py -q
../.venv/Scripts/python.exe -m pytest tests/characterization/test_projected_frame_endpoints.py -q -k 'True and eeg'
../.venv/Scripts/python.exe -m ruff check src/neurodatics/modules/analytics/domain/parquet_projection.py src/neurodatics/modules/analytics/infrastructure/parquet_cache.py src/neurodatics/modules/analytics/application/services/parquet_reader_service.py src/neurodatics/modules/analytics/api/routes.py tests/unit/test_parquet_projection.py tests/characterization/test_projected_frame_endpoints.py tests/unit/test_parquet_participant_identity.py tests/characterization/conftest.py
$env:PYTHONPATH = 'src'
../.venv/Scripts/lint-imports.exe --no-cache
Remove-Item Env:PYTHONPATH
Pop-Location
.venv/Scripts/python.exe -m ruff check docs/perf/bench/g03_projection.py
.venv/Scripts/python.exe docs/perf/bench/g03_projection.py
git apply --reverse --check --ignore-space-change docs/perf/ejecucion/evidencia/g03/own.patch
```

Entorno soportado aislado creado con `uv venv --python 3.12 output/perf-g03/supported-env`; instalación dirigida con `uv pip install --python output/perf-g03/supported-env/Scripts/python.exe ./backend pytest==7.4.4 pytest-asyncio==0.21.2 pytest-regressions==2.8.3 syrupy==4.6.1`, seguida de `uv pip install --python output/perf-g03/supported-env/Scripts/python.exe sqlalchemy==2.0.48`. La resolución inicial eligió SQLAlchemy 2.1.2 y falló importando asyncio por greenlet ausente; el pin aislado conserva la versión recibida y declaró/instaló su dependencia transitiva. Ni pyproject ni .venv se modificaron. Versiones completas en versions-supported.json; validación sólo dirigida G03, no despliegue ni prueba de toda combinación admitida por rangos.

Logs de diagnóstico conservan: path de Python inicialmente incorrecto, import-linter sin PYTHONPATH, instalación aislada inicial y casos de tests reparados. Todos los checks finales indicados en G03.md aprobaron. `medidas-preliminares.json` pertenece a una corrida interrumpida para evitar simultaneidad con instalación; sólo `medidas.json` es evidencia final.

El check inverso del patch usa --ignore-space-change por finales CRLF presentes en fuentes Windows; el snapshot conserva los bytes exactos de la base recibida. El check no aplica ni retira cambios.

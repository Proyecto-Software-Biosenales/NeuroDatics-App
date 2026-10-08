# Comandos G09

- Baseline/final SQL real desde la raíz: `$env:PYTHONPATH='backend/src'; .venv/Scripts/python.exe docs/perf/ejecucion/evidencia/g09/benchmark_sql_reads.py --implementation before|after`; base SQLite in-memory fresca por caso, resultados `sql-before.json` y `sql-after.json`.
- Probe determinista: mismo runtime y ruta, `benchmark_batch_reads.py --label before|after`; resultados `medidas-before.json` y `medidas-after.json`.
- Pruebas dirigidas: `python -m pytest -q backend/tests/unit/test_batch_repository_persistence.py backend/tests/unit/test_stimulus_placement_persistence.py backend/tests/unit/test_project_routes.py` en `.venv` y `output/perf-g03/supported-env`.
- Estáticos: Ruff sobre dos repositorios, test y dos benchmarks; desde `backend`, `PYTHONPATH=src lint-imports --no-cache`.
- PostgreSQL disponible: `docker` CLI sí, daemon no; `psql/initdb/pg_ctl` ausentes. No se inició ni tocó servicio o base habitual.
- Patch propio construido contra `output/perf-g09/base`, nunca contra HEAD. Check final: `git apply --reverse --check --ignore-space-change own.patch`.

## Corrección de revisión

- Rojo dirigido antes del fix: regresión SQLite de dos escenarios y último input inválido; `correccion-red.log` conserva el `IntegrityError` por FK `NULL` y `exit_code=1`.
- Verde final en ambos entornos: los tres archivos de pruebas dirigidas anteriores, ahora 26 tests; `correccion-tests-runtime.log` y `correccion-tests-supported.log`, ambos `exit_code=0`.
- Ruff sobre los cinco Python propios G09: `correccion-ruff.log`, `exit_code=0`. No se repitieron contratos de imports porque no hubo cambios de imports.
- No se repitieron benchmarks: la corrección sólo cambia la FK asignada a cada objeto nuevo y no modifica SELECTs, control de flujo ni corpus.

Entornos: normal Python 3.14.3/PyArrow 25.0.0; soportado Python 3.12.13/PyArrow 16.1.0. No se instalaron dependencias ni se ejecutaron suites globales/frontend; G12 conserva el gate integral.

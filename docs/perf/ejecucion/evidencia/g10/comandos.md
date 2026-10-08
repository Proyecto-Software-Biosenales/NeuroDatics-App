# Comandos y evidencia G10

- Backend normal: `cd backend; ../.venv/Scripts/python.exe -m pytest tests/characterization/test_comparison_statistics_contract.py tests/characterization/test_analytics_http_contracts.py tests/characterization/test_transform_cache_short_circuit.py tests/characterization/test_cached_frame_endpoints.py tests/unit/test_eeg_scientific_contract.py tests/unit/test_executive_report_service.py -q` → `backend-runtime.log`.
- Backend soportado: mismo bloque relevante con `output/perf-g03/supported-env/Scripts/python.exe` (Python 3.12.13/PyArrow 16.1.0) → `backend-supported.log`.
- Ruff dirigido → `ruff.log`; typecheck, ESLint propio y suites frontend/hooks → `frontend-checks.log`.
- Build producción aislado en `output/perf-g10/build/frontend` → `build-production.log`.
- E2E contra ese build, servidor temporal 3110 detenido al terminar: `PLAYWRIGHT_PORT=3110 npx playwright test tests/e2e/comparison-dashboard.spec.ts --workers=1 --reporter=line` → `e2e-production.log`.
- Medición reproducible: `.venv/Scripts/python.exe docs/perf/ejecucion/evidencia/g10/benchmark_g10.py` → `benchmark-result.json`.
- Cierre afectado, sin repetir suites: sobre el mismo build aislado, servidor propio 3111, `PLAYWRIGHT_PORT=3111 npx playwright test tests/e2e/comparison-dashboard.spec.ts --grep 'uses the versioned chart response|keeps valid statistics visible' --workers=1 --reporter=line --output=../output/perf-g10/cierre-playwright-results`; luego `npx eslint tests/e2e/comparison-dashboard.spec.ts` → `cierre-e2e-production.log` y `cierre-eslint.log`. El servidor se detuvo y el puerto quedó cerrado.
- El benchmark ampliado no se repitió: se comprobaron hashes, JSON, warmup/n5, runtime, corpus small/large y coincidencia literal de la construcción large con G00 → `cierre-benchmark-verificacion.json`.
- El patch propio se construye contra `output/perf-g10/base` y `output/perf-g10/changelog-received.md`, no contra HEAD; la reversión final se comprueba en lectura con `git apply --reverse --check --ignore-space-change` → `cierre-patch-reverse-check.log`.

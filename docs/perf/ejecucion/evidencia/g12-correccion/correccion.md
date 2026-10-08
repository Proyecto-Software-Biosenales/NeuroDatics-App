# Corrección mecánica G04/G07 — G12

Estado: corrección implementada; revisión root pendiente. G12 permanece incompleto porque la única pasada global posterior terminó en fallo TypeScript fuera de este scope.

## Cambio

- Añadido `owner_id=CURRENT_USER` a los fakes que sustituyen `_verify_ownership` en los cuatro tests afectados, preservando `id`, `ingestion_generation` y los demás campos.
- Añadidos exactamente `REPORT_IO_MAX_CONCURRENCY=2` y `REPORT_IO_MAX_WAITING=16` a `backend/.env.example`.
- No se modificaron producción, `settings.py`, assertions, goldens, `.env`, despliegues ni caches.

## Checks

- Directed normal `.venv` (Python 3.14.3, PyArrow 25.0.0): **33 passed**, exit 0.
- Directed runtime aislado disponible `output/perf-g03/supported-env` (Python 3.12.13, PyArrow 16.1.0): **33 passed**, exit 0.
- Ruff dirigido sobre los cuatro tests: **All checks passed**, exit 0.
- Reverse-check readonly de `own.patch`: exit 0 con `--ignore-whitespace`.
- Gate global único desde root con log absoluto: backend **1183 passed**, 25 snapshots passed, dependencias e import-linter verdes; luego falló TypeScript en `frontend/tests/e2e/comparison-dashboard.spec.ts:627` (`string` no asignable a `null`). No se corrigió ni amplió ese fallo.

## Evidencia

- `inventario-inicial.json` y snapshot propio: `output/perf-g12-correccion/base`.
- Logs: `directed-normal.log`, `directed-supported-env.log`, `ruff-directed.log`, `verify-postfix.log`, `reverse-check.log`.
- `own.patch` compara contra el snapshot recibido, no contra HEAD.

No se actualizan `G12.md`, `RESULTADOS.md`, `ESTADO.md` ni `docs/CHANGELOG.md`: el gate global no quedó verde y la revisión root sigue pendiente.

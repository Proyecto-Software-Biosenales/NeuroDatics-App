# Diagnóstico del gate global G12

`verify.ps1` se ejecutó completo una vez desde la raíz con log absoluto. El backend terminó con **1.163 passed, 20 failed, 25 snapshots passed** y el script detuvo el resto del gate, como corresponde. No se ejecutaron Ruff/Vulture/deptry/boot/imports ni frontend dentro de esta pasada porque pytest fue el primer gate fallido.

## Grupo 1 — fakes de ownership incompletos (19)

Todos llegan a una clave G04 que usa `project.owner_id`; los fakes de estos archivos devuelven `SimpleNamespace` con `id` y, a veces, `ingestion_generation`, pero sin `owner_id`:

| Archivo | Fallos | Evidencia del fake |
|---|---:|---|
| `backend/tests/unit/test_correlation_analytics_routes.py` | 4 | `_allow_ownership` devuelve sólo `id` |
| `backend/tests/unit/test_gaze_at_scenario.py` | 3 | closures de ownership devuelven sólo `id` |
| `backend/tests/unit/test_heatmap_cache_headers.py` | 5 | fake devuelve `id` + `ingestion_generation` |
| `backend/tests/unit/test_heatmap_route_dimensions.py` | 7 | fake devuelve sólo `id` |

Error común: `AttributeError: 'types.SimpleNamespace' object has no attribute 'owner_id'` en `cached_frame_endpoint`, `gaze_at` o `heatmap_overlay`. La integración G12 y los contratos G04 confirman que la clave con owner es intencional y que autorización ocurre antes de compartir. Diagnóstico: regresión de fixtures/test coverage no incluida en las 235 pruebas dirigidas, no autorización para retirar `owner_id` de producción.

Corrector secuencial sugerido: completar esos fakes con el owner esperado y ejecutar primero los cuatro archivos afectados; si pasan, el cambio toca garantías del gate y root decide la siguiente pasada global según protocolo.

## Grupo 2 — plantilla de settings incompleta (1)

`backend/tests/unit/test_settings_example.py::test_environment_example_defines_every_setting_exactly_once` detecta que `backend/.env.example` no declara:

- `REPORT_IO_MAX_CONCURRENCY` (default 2, rango 1..2)
- `REPORT_IO_MAX_WAITING` (default 16, rango 0..16)

Los campos existen en `backend/src/neurodatics/config/settings.py` y corresponden al presupuesto G07 documentado. Corrector secuencial sugerido: añadir exactamente una entrada para cada setting a la plantilla backend y ejecutar `test_settings_example.py`.

## Límites del diagnóstico

G12 no modificó producto, tests recibidos ni plantillas de configuración para corregir estos fallos. El raw completo es `verify.log`; `verify-attempt1.log` conserva el aborto previo del wrapper de captura.

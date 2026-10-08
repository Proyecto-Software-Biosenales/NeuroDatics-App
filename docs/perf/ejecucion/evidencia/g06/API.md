# API y algoritmos G06 → G07

No cambia ningún endpoint ni contrato público. `AoiAnalyticsService.compute_metrics(...)`, `compute_metrics_from_events(...)`, `FixationEventService.build_result(...)` y `FixationEventResult` mantienen firma/ownership G05. Source y attrs deben permanecer estables durante la operación; escenario, variante, proximidad, transformación, calidad, gaps, orden y float64 no cambian.

## Pertenencia y reutilización

`AoiAnalyticsService._mask_for_shape(shape, x_norm, y_norm)` es helper interno:

- rectángulo: bounds inclusivos vectorizados; ancho/alto cero conservan punto o línea;
- `circle`: semántica de elipse inscrita en el rectángulo, inclusiva; radio cero devuelve todo falso;
- polígono: prefiltro vectorizado finito/bounds y ray-casting escalar `_contains` sin alterar bordes;
- arrays float64, forma igual; NaN/±inf falsos.

En una métrica con `A` AOIs, `F` fijaciones y `S` muestras se conserva una máscara bool de `F` y otra de `S` por AOI sólo mientras se procesa esa AOI. Actualizan unión, primera asignación, métricas y key events; luego se reemplazan. No se retiene `A×F` ni `A×S`. El presupuesto algorítmico es O(F+S): buffers principales de coordenadas float64, asignación intp, unión y máscaras; también hay temporales lineales de primera asignación, índices/lista `inside`, filtrados y aritmética de elipse. No se declara una cota de bytes/RSS no medida. El presupuesto crece con filas, nunca multiplicado por AOIs.

La prioridad en solapamientos sigue siendo la primera AOI tras el sort case-insensitive por nombre. El dwell observado cuenta cada fijación una sola vez. Transiciones se reinician por `segment_id`. Complejidad temporal sigue O(A·(F+S)); se elimina el segundo recorrido de pertenencia de fijaciones y las reasignaciones de eventos. Memoria adicional O(F+S), independiente de A. Polígonos siguen O(P) por punto dentro de bounds, con P vértices.

## Cadencia

`_cadence_by_segment(times, segments, effective_rate)` conserva su dict y orden de primera aparición. Un segmento: arrays finitos + `np.diff` en orden original, O(N) tiempo/O(N) temporal. Varios: un agrupado O(N), luego diferencias totales O(N), memoria O(N+K). Antes era O(N·K) por refiltrar todas las filas para cada segmento. No se ordenan tiempos; repetidos/decrecientes no contribuyen, NaN/inf se omiten, y un segmento sin diferencia positiva usa `1/effective_rate` si es positivo o `0.0`.

## Handoff

G07 debe continuar llamando `eye_tracking.collect()` secuencialmente por recording hasta introducir su propia carga I/O acotada. Puede reutilizar estas métricas sin copiar máscaras ni retener resultados globalmente. No compartir `AsyncSession`, no paralelizar Matplotlib y conservar G04 SingleFlight/auth/lifecycle. Rutas AOI/informe siguen lectura full intencional de G03; G06 no proyecta columnas ni cambia cachés.

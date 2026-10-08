# API G05 — eventos de fijación por operación

`FixationEventService.build_result(df, scenario=None, proximity_threshold=0.03, min_fixation_duration_ms=None)` devuelve `FixationEventResult`, exportado también por `analytics_service`. `build_events` conserva su firma y tuple `(DataFrame, dict)`; todos los wrappers DataFrame anteriores siguen disponibles. No caché global, I/O, proyección ni coordinación nuevos.

El resultado es dueño privado de una copia de eventos y de metadatos anidados. `.events` entrega un DataFrame mutable propio por acceso; `.metadata` un deepcopy propio. Cada consumidor toma una vez sus snapshots. La dataclass frozen impide sustituir parámetros; sus campos privados no son API para mutación. Las salidas derivadas y `EyeRecording.events` pertenecen a sus consumidores, sin aliases de warnings/coordinate_transform/buffers entre consumidores. La reconstrucción mantiene float64, NaN, orden, gaps, segmentos y el detector original.

**Vida y condiciones:** sólo compartir dentro de una operación con **el mismo objeto fuente y attrs sin cambios**, escenario exacto, proximidad exacta y variante exacta. `min_fixation_duration_ms=None` significa columnas canónicas guardadas; no se equipara por clave a petición explícita 200. Los eventos incorporan transformación/provenance/quality; `display_size` captura la geometría del escenario del mismo source como hacía scanpath. El resultado conserva referencia al source para comprobar AOIs: termina su vida con la operación, no se retiene en caché. No copia ni valida por hash toda la grabación; el productor garantiza fuente estable. Cambiar transformación, identidad/generación, segmento, parámetros del detector o cualquier columna/attr relevante requiere construir un nuevo resultado.

```python
result = FixationEventService.build_result(frame, scenario="A")
histogram = FixationHistogramService.compute_histogram_from_events(result)
scanpath = ScanpathAnalyticsService.compute_scanpath_from_events(result)
fixation_data = FixationDataService.compute_fixation_data_from_events(result)
aoi = AoiAnalyticsService.compute_metrics_from_events(frame, "A", aois, result)
png, metadata = HeatmapAnalyticsService.compute_heatmap_overlay_from_events(
    result, width=1280, height=720,
)
```

AOIs necesita las muestras originales para pupila/distancia/teclas; `require_source` rechaza otro objeto fuente u otro escenario antes de mezclarlos con los eventos. AOI usa la variante/proximidad del resultado suministrado; el método derivado no admite overrides que aparenten cambiar sus eventos. Las formas/lista AOI son entradas del derivado, no de reconstrucción de eventos; las métricas se recalculan para la lista recibida. Sin optimizar pertenencia/cadencia (G06).

`collect()` construye exactamente una vez con `(source identity, scenario.name, .03, None)` por participante/escenario, y suministra ese resultado al histograma, scanpath y AOIs. Con fallo de construcción mantiene eventos vacíos/defaults parciales y sigue con pupila/mirada/distancia sin reintentar la misma combinación. Sin AOIs también construye una vez. El heatmap de grupo ya concatena `EyeRecording.events`; no reconstruye eventos. Sensibilidad conserva una construcción por cada variante persistida diferente; no cruza variantes ni agrega caché.

G06 puede optimizar reconstrucción/algoritmos AOI sin cambiar eventos/resultados, ownership ni este contrato. G07 puede continuar consumiendo collect secuencial, respetando la fuente/generación consistente, G04 y Matplotlib sin paralelismo. Wrappers y rutas siguen full de G03; response/file SingleFlight y sus presupuestos/auth/lifecycle permanecen intactos.

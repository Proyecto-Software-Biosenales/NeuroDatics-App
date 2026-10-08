# API G03 — handoff backend

`ParquetProjection(name, required=(), optional=())`, dataclass frozen en `analytics/domain/parquet_projection.py`. Columnas en orden original del esquema; las opcionales ausentes se omiten, las requeridas ausentes producen `ValueError`. No se fabrican sensores, ordenan filas ni convierten tipos. Los perfiles de sensores usan **opcionales intencionalmente**, porque los servicios anteriores devuelven salidas vacías si falta tiempo/sensor y conservan el comportamiento legacy si falta scenario. Los servicios siguen validando sus datos; no hay fallback general ante esquema/corrupción.

```python
await reader.read(project_id, participant_code, generation, projection=GSR_PROJECTION)
await reader.read_from_cache_only(project_id, participant_code, generation, projection=GSR_PROJECTION)
cache.read_dataframe(project_id, participant_code, generation, projection=GSR_PROJECTION)
```

`projection=None` conserva full y las llamadas posicionales anteriores. `read_parquet_frame(path, projection)` en `infrastructure/parquet_cache.py` es el único decodificador de frío/disk-hit; lee footer para resolver opcionales y pandas/PyArrow para valores, attrs e índice. El caso sin ninguna columna conserva cardinalidad/RangeIndex mediante footer; un índice físico ya recuperado se conserva. No se obtiene un DataFrame mutable de otra petición ni se añade caché de frames. La caché de disco contiene el **archivo completo**, separado por proyecto, participante sanitizado con hash y generación; el frío sigue descargándolo completo y publicándolo atómicamente. La resolución de identidad previa no cambia.

`AnalyticsFrameReader.read(..., projection=None)` propaga el contrato. `cached_frame_endpoint(..., projection=None)` tiene perfiles explícitos en once rutas, detalladas en [matriz-endpoints.md](matriz-endpoints.md). Auth/propietario y generación se resuelven antes de consultar respuestas. Hits simples siguen sin construir un lector/abrir Parquet. Las claves de respuesta no cambian porque el contrato HTTP es idéntico, ver equivalencia full/proyectado. Rutas con token de transformación siguen full: en legacy el frame que resuelve token puede reutilizarse al calcular, como antes.

- **G04:** puede coordinar obtención de un mismo archivo completo por identidad/generación; cualquier coordinación/caché de DataFrames debe distinguir proyecciones (`name`, `required`, `optional`) y mutabilidad. No interpretar dos perfiles como el mismo frame. Mantener hit de respuesta sin I/O y autorizar cada consumidor.
- **G05:** fijaciones/scanpath/histograma/sensibilidad/AOIs/heatmap siguen full. Antes de proyectar, verificar unión de variantes dinámicas, segment_id/fixation_segment_id, reloj/cadencia, coords raw/local, máscara, motivo inválido, dimensiones estímulo y metadatos de calidad/transformación. Este bloque no altera ciencia ni eventos.
- **G07:** informe multisensor sigue full; puede consumir lectura por lote/archivo sin modificar perfiles de endpoints. Resolver DB/generación antes de concurrencia, conservar attrs y orden.
- **G08:** timing analytics usa time/scenario + gsr para origen exacto. El helper de video de projects sigue full: su referencia debe verificarse antes de usar un perfil temporal. No se ha añadido caché de onset/duración.

GSR/timing necesitan gsr pero no filtran filas del archivo: timing usa onset/end de todas las filas del escenario y origen desde GSR válido. EEG conserva los siete canales, incluso con selección parcial, para `available_channels`, referencias y metadatos; adquisición/unidades/exclusiones se conservan íntegramente en attrs. La calidad se calcula sobre las mismas muestras antes de filtros. Las rutas espaciales full conservan todas las columnas de transformación; ninguna proyección descarta una columna que consuma su servicio actual.

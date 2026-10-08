# Oportunidades de rendimiento en el funcionamiento de NeuroDatics

Revisión del 1 de octubre de 2026. Base: checkout `f310003` **más los cambios locales existentes**, incluidos los archivos nuevos de comparación de participantes y timing. No es una auditoría del despliegue publicado. No se modificó código de aplicación ni datos; se añadieron este informe y probes sintéticos.

## Conclusión

Sí hay margen útil, tanto en local como en nube. Las mejores primeras inversiones son evitar solicitudes innecesarias, compartir cálculos y leer menos datos. La concurrencia acotada ayuda sobre todo a los informes y a las lecturas remotas. No hay evidencia para prometer un porcentaje global de aceleración ni para justificar una migración de framework o motor de datos.

La aplicación **ya** tiene caché de respuestas, Parquet en disco, lecturas/cálculos fuera del event loop, límites de puntos, búsqueda de mirada sin ordenamiento y filtrado de escenarios mejorado. La comparación de participantes ya incorpora caché, cola y visibilidad; los canvas EEG ya usan arrays tipados y optimizaciones de dibujo. Véase [CHANGELOG](../CHANGELOG.md#2026-09-12--09-15--performance-campaign). Estas mejoras no se cuentan como oportunidades nuevas.

## Orden propuesto

Prioridad de implementación, no severidad de defectos. El impacto es potencial salvo donde se indique una medición.

| Orden | Mejora | Dónde se percibiría | Esfuerzo / riesgo |
|---|---|---|---|
| 1 | Pedir solo la vista EEG activa | Seleccionar participante/escenario y abrir EEG | Bajo / bajo-medio |
| 2 | Caché y deduplicación de peticiones normales | Volver a pestañas y selecciones anteriores | Medio / invalidación y cancelación |
| 3 | Compartir eventos de fijación | Eye tracking, AOIs e informes | Medio / equivalencia científica |
| 4 | Leer columnas necesarias de Parquet | Consultas con caché de respuesta vacía; memoria | Medio / dependencias de cada cálculo |
| 5 | Vectorizar AOIs; agrupar segmentos una vez | Grabaciones grandes, muchas AOIs o segmentos | Bajo-medio / bordes y semántica |
| 6 | Resolver por lotes y paralelizar I/O de informes | Informes de grupos, especialmente en nube | Medio / sesiones, RAM y concurrencia |
| 7 | Reutilizar metadatos al buscar frames de video | Clics y navegación temporal | Medio / referencias temporales |
| 8 | Consultas por lotes al guardar participantes/AOIs | Edición de proyectos grandes | Bajo-medio / atomicidad y duplicados |

## Evidencia y cambios concretos

### 1. EEG solicita datos que la vista no muestra

`frontend/features/analytics/components/EegTab.tsx:46–99` activa siempre series temporales y PSD. Espectrograma y topografía sí están condicionados a `view`. Al abrir una de estas últimas con una selección nueva, se solicitan tres endpoints; en temporal se solicita también PSD. Los modelos de gráfica temporal/PSD se construyen en `:120–148` aunque no sean visibles.

Aplicar el condicionamiento existente a las cuatro vistas y precargar solo si una medición lo justifica. El selector de canales usa respuestas en `:420–424`: obtener sus opciones de la respuesta activa para conservar su funcionamiento. Verificar solicitudes por vista, cambio de canales y navegación entre subpestañas. No se afirma que cambiar de subpestaña repita siempre todas las peticiones: el componente EEG conserva estado.

### 2. La navegación normal pierde resultados y puede repetir trabajo simultáneo

`frontend/features/analytics/hooks/useAnalyticsData.ts:43–69` crea una nueva petición al montar/cambiar selección; `frontend/lib/api/apiFetch.ts:131` usa `no-store`. El dashboard desmonta vistas en `frontend/app/dashboard/page.tsx:275–354`. Volver a A después de visitar B repite transporte, parseo y construcción de modelos, aunque el servidor tenga la respuesta cacheada.

Reutilizar el patrón de `frontend/features/analytics/participantComparison/comparisonLoader.ts:98–101`: almacén acotado por bytes/entradas, TTL y operaciones en curso compartidas. La clave debe contemplar sesión, proyecto, generación y todos los filtros; las ediciones de AOIs requieren su propia invalidación. Una cancelación de consumidor no debe cancelar a los demás.

También hay repetición en servidor ante misses concurrentes: `backend/src/neurodatics/modules/analytics/api/routes.py:287–300` hace get→read→compute→set sin coordinación por clave; `application/services/parquet_reader_service.py:144–168` puede descargar el mismo archivo varias veces. La escritura atómica actual garantiza integridad, no deduplicación. Coordinar por clave con timeout y limpieza, comenzando por proceso. Verificar A→B→A, logout/reingesta, diez solicitudes idénticas y fallos/cancelaciones; claves distintas deben avanzar independientemente.

### 3. Los eventos de fijación se reconstruyen repetidamente

En `backend/src/neurodatics/modules/reports/application/sensor_reports/eye_tracking.py:101,113,114,117`, `collect()` reconstruye eventos directamente y vuelve a hacerlo mediante histograma y scanpath; con AOIs se añade otra reconstrucción. Los consumidores están en `analytics/application/services/scanpath_analytics_service.py:191`, `heatmap_analytics_service.py:76`, `fixation_summaries.py:29,69` y `aoi_analytics_service.py:363`.

Crear un resultado compartido de eventos + metadatos por participante/escenario dentro del informe y permitir que los derivados lo reciban. Es un primer cambio más sencillo que una caché global. Después evaluar una caché intermedia acotada para endpoints independientes, incluyendo generación, escenario, variante de duración, proximidad y transformación. Evitar compartir estructuras mutables. Validar métricas, orden, metadatos y resultados científicos con las caracterizaciones existentes.

### 4. Se materializan todas las columnas del participante

`backend/src/neurodatics/modules/analytics/infrastructure/parquet_cache.py:109–116` y `application/services/parquet_reader_service.py:168` llaman a `pd.read_parquet(path)` sin proyección. La caché conserva el archivo, pero cada fallo de caché de respuesta vuelve a decodificar un DataFrame completo, incluso para una señal.

Añadir perfiles de columnas por familia de consultas, compartidos por las rutas de caché y descarga. Incluir tiempo, escenario, segmentos y columnas/metadatos necesarios para calidad, calibración y reconstrucción; no basta asumir tres columnas para todos los endpoints. Resolver columnas opcionales contra el esquema y conservar attrs/contratos legacy. Las particiones por escenario existentes podrían ser una segunda fase, después de comprobar identidad, metadatos y coordenadas temporales.

Pandas soporta esta proyección con `columns`; se verificó además con el runtime instalado. [Documentación oficial](https://pandas.pydata.org/docs/reference/api/pandas.read_parquet.html).

**Probe ejecutado:** `bench/bench_runtime_projection.py`, 300.000 filas, 35 columnas, doce escenarios, datos sintéticos. Mediana de seis lecturas después de una de calentamiento por modalidad:

| Modalidad | Tiempo | Memoria profunda del DataFrame |
|---|---:|---:|
| 35 columnas | 45,30 ms | 99.600.132 bytes |
| tiempo, escenario y GSR | 13,10 ms | 22.800.132 bytes |

La lectura selectiva fue 3,46 veces más rápida en este probe y usó un 77,1 % menos de memoria de DataFrame. Se comprobó igualdad exacta de las columnas. Son lecturas locales con caché del sistema caliente: no incluyen red, API, renderizado ni pico RSS. El cliente actual descarga el Parquet completo en frío; `columns` por sí solo no reduce esos bytes de Drive.

**Tipos de datos:** la columna de escenario del mismo probe pasó de 18.000.132 bytes como objetos a 301.152 bytes como categoría, con valores idénticos. Es una oportunidad para etiquetas repetidas en memoria; no una medición de ahorro global ni del archivo. Verificar `groupby`, categorías no observadas, valores nulos, orden, attrs y conversiones antes de adoptarla. [Pandas describe el almacenamiento de categorías mediante códigos enteros](https://pandas.pydata.org/docs/user_guide/categorical.html).

Runtime del probe: Python 3.14.3, pandas 2.3.3, NumPy 2.4.4, PyArrow 25.0.0. No se asume que coincida con las versiones instaladas en nube o en la entrega congelada.

### 5. Algoritmos locales con margen medible

`backend/src/neurodatics/modules/analytics/application/services/aoi_analytics_service.py:226–236` evalúa `_contains()` en Python por muestra y AOI. Vectorizar rectángulos/elipses y, posteriormente, polígonos; reutilizar máscaras donde la semántica sea idéntica. Procesar por AOI o por bloques evita almacenar una matriz gigante de muestras × AOIs. Verificar límites inclusivos, formas degeneradas, NaN, solapamientos y prioridad de asignación.

`fixation_analytics_service.py:509–524` recorre todas las muestras una vez por segmento para calcular cadencia: O(N×S) antes de las medianas. Agrupar una sola vez preservando orden elimina esos recorridos; no ordenar tiempos, pues cambiaría el significado de repeticiones y retrocesos. Beneficia múltiples segmentos, y puede no beneficiar un único segmento.

El probe reproducible `bench/bench_runtime_algorithms.py` compara estos componentes con alternativas y comprueba equivalencia sobre datos sintéticos. No sustituye pruebas del contrato científico completo ni representa la latencia de un endpoint.

Resultados ejecutados, mediana de cinco repeticiones después de calentamiento:

| Componente | Actual | Alternativa |
|---|---:|---:|
| Máscara rectangular, 300.000 muestras | 109,875 ms | 0,702 ms |
| Cadencia, 100.000 muestras, 1 segmento | 53,382 ms | 56,729 ms |
| Cadencia, 100.000 muestras, 20 segmentos | 110,078 ms | 56,234 ms |
| Cadencia, 100.000 muestras, 100 segmentos | 341,886 ms | 57,913 ms |

La máscara incluye validación de finitos y conversión de porcentajes en ambas modalidades. Pasaron las comprobaciones de igualdad sobre bordes, rectángulo degenerado, NaN/infinito, grupos intercalados, tiempos repetidos/decrecientes, grupos sin tiempos válidos y fallback. El probe de geometría mide rectángulos: no demuestra todavía equivalencia para círculos/polígonos ni para el cálculo completo de métricas AOI. Con un segmento, la agrupación alternativa fue algo más lenta; no se debe anunciar como mejora universal.

### 6. Los informes acumulan I/O secuencial y consultas repetidas

`backend/src/neurodatics/modules/reports/application/services/executive_report_service.py:304–343` carga participantes y luego imágenes uno por uno. `_load_project` ya precarga `Scenaries.file` (`:284`), pero `_load_scenario_images` vuelve a consultar cada archivo (`:328`). Además, cada participante sin caché vuelve a cargar la lista completa de candidatos Parquet (`analytics/application/services/parquet_reader_service.py:325–349`), incluidas particiones descartadas después en Python.

Resolver los archivos una vez por informe y crear mapas por identidad reduce consultas y recorridos. Si se usa la relación precargada, mantener los filtros actuales de proyecto, archivo eliminado y tipo MIME. Compartir la caché de imágenes con el lector de medios evita volver a descargarlas en cada informe.

Después ejecutar descargas independientes con concurrencia pequeña y presupuesto de memoria. Resolver consultas primero: no envolver sin más `reader.read()` en `gather`, porque comparte `AsyncSession`. SQLAlchemy exige sesiones separadas por tarea concurrente. [Guía oficial](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#using-asyncsession-with-concurrent-tasks). El cliente Drive actual ya tiene transporte por hilo; no se presenta ese aspecto como defecto pendiente.

Verificar conteo de consultas/descargas, identidad de participantes, generación, orden, avisos ante fallos parciales y RAM. No comenzar paralelizando todo el render de figuras: se conservarían todos los frames y se añadirían costes de procesos y bibliotecas gráficas.

### 7. El video recalcula referencias antes de consultar el frame cacheado

`backend/src/neurodatics/modules/projects/api/routes.py:716–732` calcula tiempo relativo antes de buscar el JPEG; `_compute_video_frame_time_s` (`:516–536`) abre el Parquet completo cuando hay participante y escenario. Cada nuevo frame invoca además `ffprobe` mediante `_extract_video_frame` (`:670–671`). El cache hit evita FFmpeg, pero no necesariamente la lectura/reducción del Parquet; incluso un 304 ocurre después de leer el JPEG.

Cachear onset por generación/participante/escenario y duración por identidad del video; aprovechar metadatos existentes donde sean equivalentes. `ScenarioTimingService` es un punto de integración candidato, verificando igualdad de la referencia temporal usada por el endpoint. Comprobar ETag antes del cuerpo cuando la existencia e identidad estén resueltas. Mantener el redondeo actual de 0,1 s y las garantías del lock; no subir paralelismo de FFmpeg indiscriminadamente.

Validar tiempos absolutos/relativos, reingesta, límites/fallback y número de lecturas/procesos al repetir o mover el cursor. Impacto pendiente de medición con videos reales.

### 8. Guardado por lotes todavía realiza consultas por elemento

`backend/src/neurodatics/modules/participants/infrastructure/repository_impl.py:24–58` hace un SELECT por participante y un refresh por participante después del commit. `modules/scenaries/infrastructure/repository_impl.py:213–256` hace lo mismo con AOIs, además de consultar el conjunto existente para eliminar ausentes.

Precargar existentes en un mapa, aplicar cambios y releer por lote; conservar orden, reemplazo completo de AOIs, validaciones, duplicados y transacción. `upsert_scenaries` ya emplea consultas por lote: no es necesario rehacerlo. Medir consultas para 10/100/1.000 registros y probar rollback y altas/actualizaciones/eliminaciones. Beneficio menor con proyectos pequeños y PostgreSQL local de baja latencia.

## Otras oportunidades, después de las anteriores

- **Comparativas:** `frontend/features/analytics/comparison/useComparisonData.ts:204–240` pide `/comparison/charts` y series adicionales para estadísticas. Con cinco señales son seis peticiones temporales. Añadir resúmenes al contrato evitaría transportar series solo para resumirlas, pero hay que conservar mediana, baseline, desviación y resolución; las series tienen consumidores legítimos y no deben suprimirse sin reemplazo.
- **Carga inicial:** `frontend/app/dashboard/page.tsx:15–25` importa estáticamente las pestañas pesadas. Evaluar carga dinámica con medición del bundle y del primer clic. El diálogo de comparación de participantes ya es lazy.
- **Topografía:** `EegCanvasPanels.tsx:371–378` y `eegPresentation.ts:215–223` recalculan pesos por píxel/canal. Reutilizar geometría podría ayudar, pero requiere perfilar frames y limitar memoria; no almacenar todos los pesos a máxima resolución sin presupuesto.
- **Precisión:** mantener float64 para tiempos y cálculos científicos hasta demostrar equivalencia con tolerancias adecuadas. Reducir etiquetas, lecturas y trabajo repetido tiene mejor justificación que convertir todas las señales a float32. No se propone GPU ni sustituir pandas sin perfilado.

## Verificación siguiente y estado de entrega

Antes de implementar, registrar una línea base pequeña con un experimento real autorizado: selección EEG, navegación A→B→A, AOIs, frame de video e informe de grupo. Separar caché fría/caliente, local/nube; medir solicitudes, bytes, consultas SQL, p50/p95, CPU/RAM y bloqueo de interfaz. Repetir los mismos flujos tras cada cambio, junto con sus contratos numéricos y pruebas de invalidación.

Comandos de reproducción desde la raíz: `.venv/Scripts/python.exe docs/perf/bench/bench_runtime_projection.py` y `.venv/Scripts/python.exe docs/perf/bench/bench_runtime_algorithms.py`. Los probes utilizan datos sintéticos y no contactan servicios de la aplicación. La inspección y los microbenchmarks no constituyen una prueba E2E; no se ejecutó una batería completa porque no hubo cambios de producto.

Estado: búsqueda terminada; oportunidades documentadas, implementación pendiente. Siguiente trabajo recomendado: comenzar por 1 y por reutilización de eventos dentro del informe, con métricas antes/después. Para implementación y revisión científica: mantener Codex en esfuerzo alto y, si se usa Claude, esfuerzo alto; para la modificación mecánica de carga EEG basta esfuerzo medio. Son recomendaciones, no cambios de la sesión.

# Base de rendimiento G00

Referencia del 2026-10-02: `f310003bd734203a41268f40a4627bd99d5a3233` **más 111 archivos locales previos** inventariados en [inventario-inicial.json](evidencia/g00/inventario-inicial.json). Incluyen cambios de EEG, fijaciones, ingesta, presentación, comparación de participantes y el plan. No atribuirlos a G00. El coordinador es el único propietario de ORQUESTACION.md; un solo bloque edita el checkout. Las huellas identifican contenido, no son una copia recuperable. No se inspecciona ni vuelca contenido secreto, ni se incluyen datos reales. Los imports backend conservan la carga de Settings existente (puede leer backend/.env); los probes sustituyen DB/JWT, almacenamiento y cachés, sin contactar esos servicios ni registrar credenciales.

Equipo: Windows, Ryzen 7 9700X, 8 núcleos/16 hilos, 33.994.928.704 bytes RAM (~31,66 GiB). Python 3.14.3, pandas 2.3.3, NumPy 2.4.4, PyArrow 25.0.0, FastAPI 0.104.1, SQLAlchemy 2.0.48, pytest 7.4.4, Typst 0.15.0; Node 24.13.1, npm 11.8.0, Next 16.1.6. PyArrow instalado **no coincide** con `^16.0.0` declarado; no se modificaron dependencias. No extrapolar a Python 3.9, contenedor, nube ni entrega congelada. [Entorno](evidencia/g00/entorno-inicial.json), [versiones](evidencia/g00/backend-baseline.json).

## Fixtures y reproducción

Todas son sintéticas. Los scripts usan servicios reales y las fixtures existentes, sin actualizar goldens, ni contactar PostgreSQL, Redis o Drive. Los archivos Parquet/video temporales se generan dentro de `output/perf-g00/backend` y se eliminan al terminar; no se guardan datos de participantes reales.

| Fixture | Procedencia y tamaño |
|---|---|
| small | ZIP golden existente, SHA-256 `2dac7ab109e8a3578c40670be84706b750389f0e4bdd1b947f4dfe5d2821c168`; ingesta real. 2 participantes × 1.600 filas, 2 escenarios/segmentos, 7 EEG + GSR + mirada/pupila/distancia, NaN/gaps y variantes de fijación. 2.152.342 bytes profundos/frame; 98.844 bytes/Parquet. |
| large | 64 bloques de small SYN-01, relojes desplazados 16 s, identidades de ambos segmentos y todas las variantes de fijación separadas por bloque; attrs conservados. 4 participantes × 102.400 filas, 128 segmentos, 2 escenarios, 16 señales adicionales. Asserts: 64× eventos originales por escenario y duración positiva. 161.056.772 bytes profundos/frame; 17.366.952 bytes/Parquet. No constituye validación de exports reales grandes. |
| G00-UI | 2 proyectos EEG, 2 participantes, 7 canales, 128 tiempos y 16 frecuencias, respuestas fabricadas. Chromium, 1440×1000, DPR 1; API interceptada con 20 ms de demora. |
| G00-video | `testsrc2` FFmpeg 8.0.1, 2 s, 320×240, 10 fps, 43.972 bytes; fuente local. Onset stimulus-b de small = 8 s. |
| save | Entradas sintéticas 10/100/1.000 participantes o AOIs rectangulares; sesión registradora de llamadas, no motor SQL. |

Desde la raíz, ejecutar **secuencialmente**:

```powershell
# Backend: una muestra de calentamiento + cinco conservadas por caso (~3 minutos).
.venv/Scripts/python.exe docs/perf/bench/g00_backend.py
.venv/Scripts/python.exe docs/perf/bench/g00_media_report.py
# Build aislado; no copia .env, no toca frontend/.next ni produce distribución.
docs/perf/bench/g00_frontend.ps1
# En otro terminal, únicamente mientras se ejecuta el probe de navegador:
docs/perf/bench/g00_frontend.ps1 -Serve -Port 3317
node docs/perf/bench/g00_browser.mjs
```

Cerrar exclusivamente ese servidor tras el probe. No ejecutar el build sobre un servidor de prueba activo. Los scripts requieren dependencias instaladas y Chromium existente. Build server con `next build --webpack`; baseline no mide el build Turbopack ni export local. Los logs advierten que `next start` con `output: standalone` recomienda el servidor standalone: aquí se usa exclusivamente como servidor temporal del build, no como despliegue.

Para comparar después, conservar los JSON G00 y escribir resultados nuevos: backend admite `--output output/perf-g01/backend.json`; media admite `$env:G00_MEDIA_OUTPUT`; navegador `$env:G00_BROWSER_OUTPUT`, `$env:G00_BASE_URL` y `$env:G00_FRONTEND_DIR`. Crear antes el directorio de salida. `g00_frontend.ps1 -Run g01` usa otra copia y `evidencia/g01/frontend-build.log`; servirla con `-Run g01 -Serve -Port 3318`. Cada Run debe ser nuevo, pues la copia superpone archivos y no elimina archivos antiguos. Restablecer variables de entorno del terminal tras la comparación.

## Matriz de medición

| Flujo | Fixture → comando | Métrica/caso reproducible |
|---|---|---|
| EEG, primeras cuatro vistas; A→B→A | G00-UI → `node docs/perf/bench/g00_browser.mjs` | Peticiones/bytes por paso, tiempo a contenido visible + respuesta interceptada completada + dos frames; recursos iniciales del build; heap snapshot y long tasks. Proyecto B/A conserva topografía activa. |
| AOIs | small/large → `g00_backend.py` | `aoi_metrics`, `/http_no_response_cache/aois`, `/http_response_cache_hit/aois`: tiempo, CPU, memoria y reconstrucciones; hit AOI aún lee Parquet para transformación. |
| Parquet | small/large → `g00_backend.py` | `parquet_cold_simulated`: descarga completa simulada con 20 ms + escritura atómica + lectura; `parquet_disk_hit`: disco ya cacheado. HTTP miss/hit separado. No se limpia caché del SO. |
| Informe de grupo | small/large → `g00_backend.py`; small → `g00_media_report.py` | Carga real secuencial del lector con I/O simulado, collect EyeTracker, event_builds y working set. Build + figuras + PDF real de small separado, sin I/O. No sumar medianas como si fueran E2E. |
| Video repetido/avance/304 | small/large → `g00_backend.py`; G00-video → `g00_media_report.py` | Onset real con Parquet; ruta directa preview con fuente local y owner lookup simulado; procesos ffprobe/FFmpeg, lecturas JPEG/Parquet, bytes y latencia. |
| Guardado | save → `g00_backend.py` | `execute_select`, `refresh`, `flush`, `commit` para 10/100/1.000. Son llamadas reales del repositorio a sesión falsa; SQL de PostgreSQL, escrituras/rollback y constraints pendientes en G09. |

Los nombres exactos, todas las muestras, contadores y CPU están en [backend-baseline.json](evidencia/g00/backend-baseline.json), [browser-baseline.json](evidencia/g00/browser-baseline.json) y [media-report-baseline.json](evidencia/g00/media-report-baseline.json). El cache HTTP del harness es MemoryCache de caracterización; no mide serialización/latencia/evicción de Redis ni el límite real de 8 MiB.

## Resultados iniciales

Mediana [mín–máx] en ms, **n=5**, después de un calentamiento por caso; no se informa p95. Hubo tareas auxiliares G00 en paralelo durante partes de la preparación/medición (browser/media); los tiempos son descriptivos y sus rangos muestran ruido, no evidencia de aceleración. Comparaciones posteriores deben ejecutar probes uno por uno, conservar los contadores y repetir solo casos cuyo ruido impida decidir.

| Backend / componente | small | large |
|---|---:|---:|
| Parquet disk hit | 4,76 [4,45–5,47] | 58,91 [53,37–67,46] |
| Parquet frío simulado (20 ms I/O) | 32,54 [31,81–34,10] | 95,01 [89,83–100,17] |
| Métricas AOI | 19,84 [19,62–24,76] | 601,64 [589,14–619,98] |
| Informe group collect, sin figuras/PDF | 372,10 [359,14–446,79] | 21.658,69 [21.533,54–22.345,90] |
| Carga grupo, Parquet frío simulado | 60,83 [60,16–61,29] | 393,92 [378,95–509,29] |
| Onset video, 4 consultas (repetida + avance) | 29,61 [23,67–34,54] | 312,77 [311,73–323,46] |

Cada collect hace **4 event_builds/participante/escenario**: 16 en small y 32 en large. Cada consulta de onset lee una vez Parquet y resuelve generación. Carga fría de grupo: 2/4 descargas completas y 2/4 resoluciones; bytes 197.588/69.467.808.

| HTTP large, sin caché de respuesta → hit | Mediana ms antes de optimizar | Bytes de respuesta |
|---|---:|---:|
| temporal EEG | 249,27 → 32,75 | 887.158 |
| PSD EEG | 324,85 → 3,41 | 35.155 |
| espectrograma EEG | 825,28 → 55,08 | 2.844.387 |
| topografía EEG | 236,81 → 5,78 | 63.184 |
| temporal GSR | 172,79 → 6,86 | 102.704 |
| AOIs | 1.162,07 → 248,37 | consultar JSON |

Todos los misses hacen 1 lectura Parquet. Los hits simples hacen 0; AOIs hace 1 aun en hit (resolución de transformación). Estos son **estados de caché distintos de la misma aplicación original**, no un antes/después de implementación.

Video real sintético: frame frío 181,79 [157,59–211,19] ms y 1 ffprobe+1 FFmpeg; hit 9,40 [8,87–10,82] ms; 304 7,33 [6,80–7,95] ms. Hit y 304 hacen 1 lectura Parquet + 1 lectura del JPEG (10.547 bytes); 304 envía 0 bytes. Tres tiempos nuevos generan 3 ffprobe+3 FFmpeg, 489,21 [472,78–510,72] ms. El informe EyeTracker small completo (figuras/PDF; datos/imágenes ya en RAM) tarda 2.063,45 [1.797,19–2.092,67] ms, 16 event_builds y 17 assets. Los bytes del PDF pueden variar: no son golden.

Guardado de participantes: N `execute_select` + N `refresh` + N `flush` + 1 commit. AOIs: N+2 `execute_select` + N `refresh` + 1 commit. No confundir `refresh` con escritura ni estos conteos con SQL real. Medianas del control flow sin DB: participantes 0,82/4,05/31,86 ms y AOIs 0,84/3,33/24,85 ms para 10/100/1.000 (la fuente exacta es el JSON).

| UI producción | Peticiones EEG (+ auxiliares) | Bytes totales fixture / mediana ms [rango] |
|---|---|---|
| inicial A temporal | temporal + PSD (+ proyectos/participantes/escenarios) | 53.129 / 745,89 [736,32–786,47] |
| PSD | ninguna nueva | 0 / 98,32 [80,80–99,19] |
| espectrograma | espectrograma | 268.117 / 166,16 [165,86–167,23] |
| topografía | topografía (+ mirada) | 17.835 / 167,33 [167,09–231,94] |
| B topografía | temporal + PSD + topografía (+ participantes/escenarios/mirada) | 70.743 / 149,91 [149,18–284,59] |
| regreso A topografía | repite las anteriores | 70.743 / 166,21 [149,67–168,05] |

Navegación inicial incluye `networkidle` de 500 ms: no equivale al tiempo puro de render ni es comparable directamente con clics posteriores. Producción: **43 chunks JS**, 2.318.001 bytes totales, gzip independiente 695.433 bytes; dashboard inicial descargó 27 recursos `_next` con 1.846.433 bytes decodificados y 523.747 codificados (incluye JS/CSS/fuentes). No sumar chunks completos como coste inicial. Heap JS al final: 11,64–17,99 MiB; 0 long tasks >50 ms observadas en esta fixture. No demuestra ausencia de bloqueo con datos/canvas mayores.

## Presupuestos y protocolo de comparación

- Memoria observada: 2,05 MiB/frame small y 153,60 MiB/frame large; cuatro frames large ≈614,4 MiB profundos. Pico working set **acumulado del proceso/harness** 3.825,5 MiB; conserva corpus/copies y no es pico por operación ni de la app desplegada. Presupuesto experimental inicial en este equipo: ≤5 GiB RSS por proceso de probe; cualquier aumento >20% exige explicar qué se retiene. No certificar ese presupuesto en laptops o contenedores pequeños.
- HTTP: respuesta mayor observada 2.844.387 bytes; preservar límite existente 8 MiB/JSON, TTL 900 s y fallback local total 128 MiB. Caché Parquet actual: TTL 4 h y sin límite global de bytes; no presentarla como acotada. Medios: 2 GiB/72 h. G04/G08 deben definir sus propios límites de entradas/tareas además de los archivos.
- Loader anterior de comparación: 4 activas, 48 entradas, 5 min, peso 3.000.000 **números aproximados o bytes/8**, ≈24 MB de contenido numérico y no 3 MB/RSS. Cola actual no está acotada por número. Punto de partida de G02: conservar ese presupuesto y explicitar unidades/overhead; añadir un límite de cola medido. Heap de esta fixture no dimensiona toda la caché. Para G04 usar inicialmente 1 operación líder por clave y un tope configurable; >1 clave activa requiere prueba de memoria.
- Informe: concurrencia medida = 1. Para G07 probar primero 2 lecturas y un presupuesto transitorio inicial de 512 MiB de frames decodificados (2×153,6≈307,2 MiB), separado de los frames retenidos por el informe. Solo adoptarlo tras medir RSS y cancelación; no es autorización para incrementar FFmpeg.
- Misma versión/runtime/fixture, viewport/DPR, filtros, generación, estado de caché y demora I/O; separar caché respuesta/Parquet/medio. Registrar CPU y RAM, y ejecutar sin otros builds/probes. Una muestra de calentamiento + 5 repeticiones, mediana/rango y cada muestra. Preferir conteos estables; mejora temporal solo si excede dispersión y se reproduce, no por una diferencia dentro del rango. Usar ≥30 muestras si se decide informar p50/p95, siempre con N y método explícitos.

## Contratos protegidos y pruebas posteriores

1. Tiempos y señales float64, unidades, orden original, NaN/inf/gaps; no ordenar relojes para acelerar ni unir eventos a través de discontinuidades.
2. Todos los escenarios, identidades de participante/usuario/proyecto y generación; autorización antes de compartir. Parquet nuevo/legacy y ambigüedades conservan errores, no fallback amplio.
3. Eventos detector-v2/legacy, segmentación, fuentes/calidad/warnings, variantes 100/150/200/250/300 ms, duración y proximidad. Un resultado compartido requiere mismos parámetros y mutabilidad explícita.
4. Coordenadas pantalla/estímulo/legacy, placement/fingerprint, bordes/solapamientos de AOIs y prioridad; edición AOI invalida independientemente de reingesta.
5. EEG: raw/smooth, canales disponibles/seleccionados, spectral units/ventanas/gaps/máscaras/artifacts, estadísticas de resolución completa y límites de visualización. Goldens numéricos existentes `atol=1e-8, rtol=1e-6`; oráculos EEG específicos prevalecen sobre una tolerancia genérica.
6. Informes: orden/advertencias parciales, TTFF recording clock vs onset relativo, generación consistente, filtros owner/deleted/MIME; no compartir AsyncSession entre tareas ni paralelizar Matplotlib.
7. Video: tiempo absoluto→relativo por participante/escenario, `all`, fallback, redondeo 0,1 s, duración/clamp y locks por video; 304 conserva ETag y autorización.
8. Guardado: orden de respuesta, reemplazo AOIs/eliminación de ausentes, duplicados, constraints, atomicidad y aislamiento de proyecto; escenario upsert existente ya usa lotes.
9. Comparativas: mediana, desviación muestral, baseline/peak/no finitos y resolución origen; cambios aditivos/versionados. Local sin Redis y servidor con Redis siguen admitidos.

Gate inicial diagnóstico **ejecutado una vez**, exit 1: backend **989 passed, 25 snapshots**, 34.057 warnings; Ruff/Vulture/Deptry/boot(48 operaciones)/import boundaries y typecheck aprobados; frontend **88 tests**, hooks/componentes **44 tests** aprobados. ESLint **1 error/6 warnings**, fallo heredado en `frontend/tests/hooks/participant-comparison-entry.test.mjs:52`, `react-hooks/immutability`: asigna `stateRef.current` desde Probe durante render. No corregido en G00. Afecta el gate de G02 por el hook de comparación; G01 debe informar el ratchet heredado si usa lint global, sin proclamar ALL GREEN. [Gate](evidencia/g00/gate-inicial.log), [diagnóstico ESLint](evidencia/g00/eslint-inicial.json).

Comandos dirigidos, no ejecutarlos todos en cada bloque:

```powershell
# Desde backend; elegir solo contratos afectados.
../.venv/Scripts/python.exe -m pytest tests/characterization -q
../.venv/Scripts/python.exe -m pytest tests/unit/test_eeg_scientific_contract.py tests/unit/test_stimulus_coordinate_analytics.py -q
../.venv/Scripts/python.exe -m pytest tests/unit/test_parquet_participant_identity.py tests/unit/test_cache_generation_identity.py tests/unit/test_analytics_cache_invalidation.py tests/characterization/test_cached_frame_endpoints.py -q
../.venv/Scripts/python.exe -m pytest tests/unit/test_fixation_event_analytics.py tests/unit/test_fixation_duration_variants.py tests/characterization/test_sensor_reports.py tests/unit/test_executive_report_service.py -q
../.venv/Scripts/python.exe -m pytest tests/unit/test_local_mode.py tests/unit/test_media_cache_janitor.py -q
# Desde la copia frontend del Run correspondiente (servidor de prueba ya iniciado):
npx.cmd --no-install tsc --noEmit
node --test tests/hooks/analytics-request.test.mjs tests/hooks/analytics-cancellation.test.mjs
# E2E existentes usan PLAYWRIGHT_PORT; reuseExistingServer permite el build servido.
$env:PLAYWRIGHT_PORT='3318'
npx.cmd --no-install playwright test tests/e2e/eeg-dashboard.spec.ts tests/e2e/dashboard-navigation.spec.ts --workers=1
```

El gate no ejecuta estos E2E ni build. G00 ejecutó su probe con aserciones de UI en producción; E2E completos existentes seleccionados corresponden a G01/G12. PostgreSQL real (especialmente G09), Drive/nube/Redis real y paquete local congelado siguen pendientes; mocks y unit tests no certifican esos despliegues. No se modifica ni distribuye la entrega local.

# Plan de implementación por agentes: rendimiento de la aplicación

Fecha: 2026-10-01. Estado: **plan preparado; ejecución no iniciada**.

Fuente: [revisión de rendimiento](REVISION-RENDIMIENTO-APLICACION-2026-10-01.md). La revisión examinó `f310003` más modificaciones locales; G00 debe identificar la base real al comenzar. Los microbenchmarks demuestran oportunidades, no una aceleración garantizada de la aplicación completa.

## Objetivo y organización

Acelerar navegación, consultas analíticas, informes, video y edición, conservando resultados científicos y comportamiento de las versiones local y servidor. Reducir primero trabajo innecesario, luego volumen de datos y finalmente esperas mediante concurrencia limitada.

**Trece tareas secuenciales, cada una a cargo de un agente con contexto nuevo.** G00 prepara; G01–G10 implementan bloques completos; G11 evalúa topografía y solo implementa si se justifica; G12 integra y valida. El agente termina implementación, pruebas, medición y entrega antes de iniciar el siguiente. No se asigna un agente por archivo ni se hereda toda la conversación.

Un coordinador conserva únicamente el orden, el estado, los contratos acordados y los enlaces a evidencia. No vuelve a hacer la auditoría ni implementa en paralelo. La planificación actual no autoriza iniciar estos bloques ni crear chats nuevos.

| Orden | Tarea de un agente | Resultado principal | Dependencias técnicas |
|---|---|---|---|
| G00 | Base reproducible y contratos | Fixtures, medidas y estado inicial | Ninguna |
| G01 | Carga de interfaz bajo demanda | Solo la vista EEG activa y carga inicial medida | G00 |
| G02 | Caché y peticiones compartidas en frontend | Navegación repetida sin recargas innecesarias | G01 |
| G03 | Lectura selectiva y tipos de etiquetas | Menos decodificación y memoria de Parquet | G00 |
| G04 | Deduplicación en backend | Una operación por clave concurrente | G03 |
| G05 | Reutilización de fijaciones | Un resultado de eventos compartido por análisis | G03 |
| G06 | Algoritmos de AOIs y cadencia | Menos bucles y recorridos repetidos | G05 |
| G07 | Carga eficiente de informes | Resolución por lote e I/O concurrente acotado | G03–G06 |
| G08 | Navegación temporal de video | Metadatos reutilizados y cache hits más baratos | G03–G04 |
| G09 | Guardado por lotes | Menos consultas al editar participantes/AOIs | G00 |
| G10 | Datos y estadísticas de Comparativas | Eliminar series transportadas solo para resumir | G02–G06 |
| G11 | Topografía, condicionada a perfilado | Reducir tiempo por frame si compensa en memoria | G01–G02, G10 |
| G12 | Integración y cierre | Evidencia global, compatibilidad y limitaciones | Todos los anteriores cerrados |

Aunque algunas dependencias permiten paralelismo, **se ejecutará el orden completo de la tabla**, como pidió el usuario. G03 y G09 no se adelantan mientras otro agente edita.

## Reglas para aprovechar el contexto

1. Al arrancar, leer este protocolo, la ficha de la tarea y su entrega predecesora. Leer entregas anteriores solo si son dependencias. Abrir después los archivos indicados y ampliar la búsqueda cuando haya una dependencia concreta.
2. Mantener una sola tarea activa. No crear subagentes recursivos ni repartir pruebas entre varios agentes por defecto. Un contexto nuevo corresponde al siguiente bloque, no a cada paso mecánico.
3. Cada bloque comprende análisis local, implementación, pruebas significativas y medición. No entregar una propuesta pendiente de implementar como si fuera el bloque terminado.
4. Antes de acercarse al límite de contexto, escribir el estado en disco. Si es inevitable continuar, otro agente retoma **el mismo bloque** y su evidencia; no se inicia el siguiente ni se considera terminada una mitad.
5. Evitar relecturas completas del repositorio, informes enormes en mensajes y repeticiones de suites sin cambios. Conservar resultados extensos en archivos y resumirlos.
6. Reutilizar el checkout adecuado de forma secuencial. Hay trabajo previo sin commit: no hacer reset, stash global, limpiezas ni commits que lo absorban accidentalmente. Una worktree nueva no contiene automáticamente esos cambios; solo usar aislamiento después de preservar y seleccionar la base completa. No se necesitan trece worktrees.
7. No desplegar, publicar, reconstruir entregas para distribución ni migrar datos de usuarios como parte de este plan. Los builds y entornos de prueba deben estar separados del servicio habitual.

## Contratos comunes

- Conservar unidades, precisión, orden temporal, gaps, NaN, coordenadas, variantes de fijación, metadatos de calidad y transformaciones. No convertir globalmente señales o tiempos a float32.
- Mantener identidad de usuario/proyecto/participante, generación de ingesta y autorización **antes** de reutilizar respuestas. Los cambios de AOIs necesitan invalidación independiente de la ingesta.
- Las claves deben incluir todos los parámetros que afectan la salida. La generación se obtiene de una fuente vigente: añadirla a una clave no sirve si el cliente conserva indefinidamente una generación vieja.
- Acotar cachés, tareas activas y cola de espera; documentar unidades de sus presupuestos. No guardar DataFrames mutables compartidos sin un contrato explícito.
- Conservar compatibilidad de local sin Redis y servidor con Redis, y ejecutar las pruebas pertinentes en las versiones efectivamente soportadas. No asumir que el Python del microbenchmark coincide con el de la entrega.
- No incorporar nuevos motores de datos, GPU, workers de render ni infraestructura distribuida sin una necesidad medida que justifique un plan separado.
- Cambios de contrato de G10 son aditivos/versionados cuando proceda. Las optimizaciones no justifican cambiar silenciosamente las definiciones estadísticas.

## Evidencia, aceptación y entrega

G00 creará `docs/perf/ejecucion/ESTADO.md`, `BASELINE.md` y una carpeta `evidencia/`. Cada agente escribirá `docs/perf/ejecucion/Gxx.md`. Estos son **archivos a crear durante la ejecución**, no resultados ya disponibles.

Cada entrega debe contener, preferiblemente en 1–2 páginas:

```text
Tarea / estado: pendiente, en curso, completa, detenida por impedimento,
               o descartada con evidencia (solo partes condicionales).
Base recibida: revisión/checkpoint y cambios locales relevantes.
Resultado: comportamiento antes/después y alcance realmente implementado.
Archivos: cambios propios, archivos nuevos y trabajo previo preservado.
Contratos: APIs/helpers/claves/presupuestos que utilizará el siguiente agente.
Verificación: comandos, resultado, entorno y enlaces a logs.
Medición: corpus, caché, muestras, antes/después, dispersión, CPU/RAM si aplica.
Límites: pruebas no ejecutadas, fallos heredados, riesgos o decisiones condicionales.
Continuación: siguiente tarea y lecturas imprescindibles; nada por inferir del chat.
Reversión: cambios propios que retirar, sin borrar trabajo previo.
```

**Cierre de un bloque:** comportamiento correcto, pruebas dirigidas aprobadas, mejora observable bajo condiciones comparables y entrega escrita. Un fallo científico, de autorización o invalidación impide cerrar como completo. Una mejora experimental sin beneficio se retira y se documenta; las partes obligatorias deben completarse o quedar explícitamente impedidas.

Los contadores deterministas son preferibles a tiempos frágiles en CI: número de solicitudes, reconstrucciones, descargas o SELECTs. Para rendimiento, medir antes/después en el mismo runtime, corpus y estado de caché. G00 fijará repeticiones y variabilidad; una diferencia dentro del ruido no prueba mejora. No se trasladan los factores de los microbenchmarks al tiempo total.

## G00 — Preparar base y mediciones

**Objetivo:** que todos los agentes trabajen sobre una referencia identificable, con contratos y mediciones suficientes, sin crear una plataforma general de benchmarking.

**Lecturas:** revisión, `verify.ps1`, `frontend/package.json`, `backend/pyproject.toml`, `docs/perf/bench/`, fixtures y caracterizaciones existentes.

**Trabajo:**

1. Inventariar cambios previos y versiones. Registrar revisión, archivos relevantes y huellas/checkpoint sin copiar secretos ni datos privados al informe. Confirmar que no haya otro proceso de edición sobre el mismo alcance.
2. Elegir fixtures sintéticas pequeñas y grandes, con varias señales, segmentos, participantes y escenarios. Agregar casos necesarios a las fixtures existentes; usar datos reales solo si están disponibles y autorizados, sin versionarlos.
3. Registrar navegación EEG y A→B→A, AOIs, lectura Parquet, informe de grupo, video y guardado. Separar backend sin caché de respuesta, Parquet ya cacheado y descarga fría. Medir bundle de producción, no solo modo desarrollo.
4. Ejecutar una vez el gate existente para conocer fallos previos. Registrar resultados y fallos; no arreglar problemas ajenos por conveniencia. Definir comandos dirigidos para las tareas posteriores.
5. Fijar presupuestos iniciales medidos de RAM/caché/concurrencia y protocolo de comparación. p50/p95 solo con muestra suficiente y tamaño de muestra visible; con pocas repeticiones, mediana y rango.

**Aceptación:** otro agente reproduce los flujos con los comandos y fixtures documentados; están claras las limitaciones de nube, hardware y builds locales. Si nube no está disponible, usar I/O simulado para contratos y marcar la medida real pendiente sin bloquear el trabajo local.

En G00, el gate inicial es diagnóstico: un fallo heredado no impide entregar una baseline fiel. Debe quedar identificado y separado de los contratos necesarios para cada bloque. Un bloque posterior no puede reclamar verificación de una garantía que ese fallo impida comprobar; debe resolver el impedimento dentro de su alcance o declarar esa validación pendiente. G12 distingue expresamente fallos heredados de regresiones nuevas y no anuncia un gate verde si no lo obtuvo.

**Entrega especial:** matriz flujo→fixture→comando→métrica y listado de contratos científicos que no pueden cambiar.

## G01 — Cargar únicamente lo necesario en la interfaz

**Lecturas:** `frontend/features/analytics/components/EegTab.tsx`, `hooks/useAnalyticsData.ts`, `frontend/app/dashboard/page.tsx`; E2E EEG/dashboard y pruebas de presentación.

**Trabajo:** condicionar series, PSD, espectrograma y topografía a la vista activa; derivar canales de la respuesta apropiada; evitar construir modelos de gráficas ocultas. Mantener canales seleccionados, zoom, estados vacíos y cambio de escenario coherentes. El diálogo de comparación ya tiene carga diferida: conservarlo.

Medir chunks y evaluar carga dinámica de pestañas pesadas del dashboard. Esta parte se conserva solo si reduce carga inicial sin trasladar una espera desproporcionada al primer clic ni romper el frontend estático local. No incorporar todavía la caché general de G02.

**Pruebas/aceptación:** una selección nueva solicita solo el endpoint de la vista EEG activa, además de metadatos necesarios; canales y filtros funcionan en las cuatro vistas. Comparar bytes iniciales y primer acceso en build de producción. Ejecutar typecheck, pruebas de hooks afectadas y `eeg-dashboard.spec.ts`/navegación pertinente.

**Entrega:** tabla vista→peticiones, decisión sobre lazy loading y cambios de habilitación que G02 debe preservar.

## G02 — Reutilizar respuestas en la navegación normal

**Lecturas:** `hooks/useAnalyticsData.ts`, `participantComparison/comparisonLoader.ts`, tipos de proyecto, sesión y puntos de actualización de proyecto/AOIs. Pruebas `analytics-request.test.mjs`, `analytics-cancellation.test.mjs` y las del loader existente.

**Trabajo:** reutilizar o extraer la infraestructura común del loader sin duplicar sus mecanismos. Cerrar el inventario de hooks de datos de dashboard/comparación a migrar; no convertir todos los fetches de la aplicación. Añadir caché LRU con TTL, límite de entradas y peso, y suscripciones a una petición compartida.

Definir identidad de sesión, generación y filtros; invalidar tras logout, reingesta y edición de AOIs. Aprovechar `ingestion_generation` ya expuesto; revalidar contexto al reabrir proyecto o recuperar foco según el contrato acordado. No considerar segura una generación desconocida para reutilización persistente. Mantener `no-store` HTTP si corresponde: la reutilización ocurre en el almacén de aplicación. Decidir vida y liberación de URLs de blobs si se incluyen imágenes.

**Pruebas/aceptación:** A→B→A reutiliza A vigente; dos consumidores generan una petición; cancelar uno no perjudica al otro; al irse todos se cumple la política definida. Respuestas tardías no reaparecen tras invalidación. Demostrar límites de memoria/cola y aislamiento entre usuarios/proyectos, además de conservar G01.

**Entrega:** API del loader, lista de hooks migrados, claves, fuente de generación, invalidadores y presupuestos. G10 debe consumir este contrato.

## G03 — Lecturas selectivas de Parquet y etiquetas compactas

**Lecturas:** `backend/src/neurodatics/modules/analytics/application/services/parquet_reader_service.py`, `infrastructure/parquet_cache.py`, `api/routes.py`, helpers de columnas/metadatos, tests de identidad Parquet y short-circuit de caché.

**Trabajo:** inventariar columnas requeridas por familia. Implementar un contrato de proyección en el lector, idéntico para archivo recién descargado y cacheado. Empezar por GSR, pupila/distancia y timing; extender a EEG y fijaciones únicamente con sus dependencias verificadas. Para cada endpoint dejar explícito si usa proyección o lectura completa y por qué.

Preservar attrs, identidad, segmentos, calidad y columnas de transformación; resolver opcionales contra esquema, sin ocultar errores de datos con un fallback general. Mantener lectura completa compatible para consumidores que la necesiten. No cambiar rutas a particiones de escenario en este bloque.

Evaluar `category` solo para etiquetas repetidas y con equivalencia de nulos, orden, `groupby`, concatenación y serialización. Esta submejora es condicional: conservarla únicamente si aporta memoria/tiempo sin coste de reconversión significativo. No reducir precisión de señales ni migrar archivos de usuarios.

**Pruebas/aceptación:** resultados completos/proyectados equivalentes sobre esquemas nuevos y legacy; cache hit de respuesta sigue sin abrir Parquet. Medir tiempo y memoria de consultas migradas, no solo lectura aislada; documentar que la descarga fría sigue transfiriendo todo el archivo.

**Entrega:** matriz endpoint→perfil de columnas, API de lectura y decisión de tipos. Esta matriz debe poder extenderse sin reauditar cada señal.

## G04 — Compartir operaciones simultáneas en el servidor

**Lecturas:** API y lector resultantes de G03, `AnalyticsRedisCache`, caché local, tests `test_cached_frame_endpoints.py`, `test_cache_generation_identity.py`, `test_analytics_cache_invalidation.py`.

**Trabajo:** coordinar por clave completa tanto el cálculo de respuestas idénticas como la obtención del mismo Parquet. Son dos niveles distintos: la descarga comparte identidad de archivo/generación; el cálculo incluye endpoint y filtros. Reconsultar caché al adquirir coordinación. No compartir proyecciones diferentes como si fueran el mismo DataFrame.

Empezar por coordinación por proceso, sin locks distribuidos nuevos. Autorizar cada solicitante antes de unirse al trabajo. Definir qué sucede si el líder cancela, expira o falla, y cómo se liberan tareas/entradas. No dejar trabajo dependiente de una sesión DB de request ya cerrada. Preservar fallback sin Redis y publicación atómica de archivos. Si la respuesta supera el límite de caché, compartir al menos el resultado en curso cuando sea seguro, sin convertirlo en caché ilimitada.

**Pruebas/aceptación:** diez solicitudes idénticas simultáneas producen una operación del nivel correspondiente; claves distintas avanzan sin un lock global. Errores, timeout y cancelación permiten reintentar; no se filtran tareas, sesiones ni bloqueos. Medir ráfagas y caso secuencial para detectar overhead.

**Entrega:** ciclo de vida, claves, límites y alcance por proceso. La prueba no debe anunciar deduplicación entre procesos si no existe.

## G05 — Calcular fijaciones una vez y reutilizarlas

**Lecturas:** `fixation_analytics_service.py`, `fixation_summaries.py`, `scanpath_analytics_service.py`, `heatmap_analytics_service.py`, `aoi_analytics_service.py` y `reports/application/sensor_reports/eye_tracking.py`.

**Trabajo:** introducir un resultado explícito de eventos y metadatos; permitir que los cálculos derivados lo consuman. Mantener wrappers existentes para rutas que reciben DataFrame. Integrar el resultado compartido en un `collect()` de informe: histograma, scanpath y AOIs reciben los eventos apropiados sin reconstruirlos otra vez.

Compartir únicamente cuando escenario, variante de duración, proximidad, transformación y demás parámetros coincidan. Evitar mutaciones cruzadas. **No añadir una caché global de eventos en este bloque**: compartir dentro de la operación aporta una mejora acotada; una caché global posterior necesitaría evidencia propia.

**Pruebas/aceptación:** una construcción por combinación de parámetros dentro de la operación y salidas equivalentes en variantes y consumidores. Usar caracterización de fijaciones, coordenadas, histograma y sensor reports; comparar números/metadatos, no exigir bytes de PDF idénticos si incluyen timestamps. Medir el informe EyeTracker y conservar accesos directos existentes.

**Entrega:** contrato de resultado, propietarios de mutabilidad y rutas consumidoras. G06 optimiza internamente sin cambiar ese contrato.

## G06 — Vectorizar AOIs y eliminar recorridos por segmento

**Lecturas:** `aoi_analytics_service.py`, `fixation_analytics_service.py`, reconstrucción de eventos, contrato de G05 y `bench_runtime_algorithms.py`.

**Trabajo:** vectorizar pertenencia de rectángulos y elipses con la misma semántica; reutilizar máscaras dentro del cálculo. Para polígonos, conservar fallback actual salvo que una variante vectorizada demuestre equivalencia y beneficio. No construir una matriz ilimitada muestras×AOIs.

Agrupar tiempos por segmento una vez y calcular diferencias respetando el orden original. Conservar el camino eficiente de un solo segmento si el benchmark confirma la regresión de la alternativa general. No ordenar relojes ni cambiar el detector de fijaciones.

**Pruebas/aceptación:** bordes, formas degeneradas, NaN/inf, solapamientos, orden de asignación, segmentos intercalados, tiempos repetidos/decrecientes y frecuencia fallback. Añadir equivalencia de métricas completas, además de máscaras. Comparar tamaños pequeños/grandes y 1/20/100 segmentos; los probes son apoyo, no sustituyen la caracterización.

**Entrega:** algoritmos adoptados, fallback conservado, complejidades y medidas de consultas/informe afectadas.

## G07 — Cargar informes por lotes y con concurrencia limitada

**Lecturas:** `reports/application/services/executive_report_service.py`, lector de G03–G04, proveedor de almacenamiento, caché de imágenes, `test_executive_report_service.py` y `test_sensor_reports.py`.

**Trabajo:** primero resolver identidades/archivos por lote, aprovechando relaciones ya precargadas y construyendo mapas. Mantener filtros de propietario/proyecto, eliminación y MIME. Evitar releer la lista completa de candidatos por participante. Después reutilizar el acceso cacheado a imágenes mediante una capa compartida, sin hacer que el servicio de informes importe un controlador HTTP.

A continuación, descargar/leer archivos independientes con concurrencia pequeña, configurable y justificada por la memoria disponible. Resolver DB antes de las tareas o emplear sesiones separadas cuando sea imprescindible: no compartir `AsyncSession` entre tareas. Un informe conserva una generación consistente. Preservar orden y advertencias por fallos parciales. No paralelizar Matplotlib/figuras ni añadir un pool de procesos de render.

**Pruebas/aceptación:** menos consultas y descargas repetidas; concurrencia máxima respetada; I/O lento simulado, fallos parciales y cancelación; resultados numéricos equivalentes después de G05–G06. Comparar latencia y pico RAM en informe de grupo, tanto con caché caliente como fría. No aumentar concurrencia si ahorra espera a costa de exceder el presupuesto de memoria.

**Entrega:** interfaz de resolución por lote, acceso de medios compartido, presupuesto de I/O y medidas. Si el bloque requiere continuación, cerrar un checkpoint interno después de lotes y retomar G07, sin saltarse la concurrencia acordada.

## G08 — Evitar lecturas repetidas al navegar videos

**Lecturas:** helpers y ruta `preview` de `projects/api/routes.py`, `scenario_timing_service.py`, cálculo actual de tiempo relativo, caché/janitor de medios.

**Trabajo:** reutilizar onset por generación/participante/escenario y duración por identidad de video. Integrar helpers con semántica compartida solo después de verificar sus referencias temporales; no sustituir automáticamente un cálculo por otro de nombre parecido. Aprovechar G03 para la lectura inicial cuando aplique.

Con existencia e identidad verificadas, responder ETag/304 antes de leer el cuerpo JPEG. Mantener redondeo de 0,1 s, transformaciones absoluto/relativo, fallback y límites actuales de extracción. No aumentar indiscriminadamente concurrencia FFmpeg ni debilitar la coordinación por video.

**Pruebas/aceptación:** reiterar un frame y recorrer varios evita volver a cargar el Parquet/probar duración innecesariamente. Verificar onset distinto entre participantes, escenario `all`, falta de datos, fin de video, reingesta, eliminación y limpieza. Medir procesos y lecturas además del tiempo de respuesta.

**Entrega:** claves/TTL y condiciones de invalidación de metadatos; evidencia de video real en entorno de prueba si está disponible, diferenciada de mocks.

## G09 — Guardar participantes y AOIs con consultas por lote

**Lecturas:** repositorios de participantes y escenarios, entidades/constraints y rutas que los invocan. `upsert_scenaries` ya utiliza lotes: conservar ese comportamiento.

**Trabajo:** cargar existentes en mapas, aplicar altas/cambios y releer resultados por lote. Evitar SELECT y refresh por cada elemento. Mantener orden de respuesta, eliminación de AOIs ausentes, duplicados, constraints y atomicidad. No añadir un UPSERT específico de motor sin necesidad; usar la infraestructura actual.

**Pruebas/aceptación:** comparar lecturas SQL para 10/100/1.000 registros; deben dejar de crecer una a una salvo particionado explícito del lote. No afirmar que todas las escrituras SQL son O(1). Probar altas, actualizaciones, reemplazo, entrada vacía, duplicados, rollback y aislamiento de proyecto; comprobar constraints con PostgreSQL de prueba cuando sea necesario.

**Entrega:** semántica de lote, consultas antes/después y compatibilidad de respuestas. Conectar las mutaciones con la invalidación de G02 sin introducir otra política.

## G10 — Consolidar gráficas y estadísticas de Comparativas

**Lecturas:** `comparison/useComparisonData.ts`, `ComparisonStatistics.tsx`, API/tipos frontend, `comparison_chart_config.py`, schemas/ruta de comparación y contrato de caché G02/G04.

**Trabajo:** caracterizar primero qué muestras y parámetros alimentan cada resumen actual. Ampliar el contrato para incluir resúmenes que sustituyan las series descargadas únicamente para estadísticas. Portar la definición actual de mediana, desviación muestral, baseline, peak y tratamiento de no finitos. Si gráfica y resumen usan resoluciones distintas, expresarlo en el contrato y conservar ambos significados; no resumir sin más los puntos dibujados.

Actualizar backend y consumidor frontend en el mismo bloque; retirar únicamente peticiones con todos sus consumidores reemplazados. Versionar las claves de caché para que respuestas antiguas no se confundan con el nuevo esquema. Conservar fallos parciales, estado vacío, selección y pines. No migrar aquí todo el sistema de comparaciones.

**Pruebas/aceptación:** fixtures de referencia entre resúmenes anteriores y nuevos, con tolerancias numéricas justificadas; contratos HTTP y E2E de comparación. Con cinco señales temporales, eliminar las cinco peticiones adicionales destinadas solo a resumir si se confirma ese consumo, sin exigir que otros paneles dejen de pedir sus datos. Medir bytes, peticiones y CPU backend: menos red no debe esconder cómputo duplicado nuevo.

**Entrega:** esquema actualizado, origen/resolución de estadísticas, versión de caché y conteo de solicitudes.

## G11 — Evaluar y, si conviene, optimizar topografía

**Lecturas:** `components/eeg/EegCanvasPanels.tsx`, `eegPresentation.ts`, pruebas de presentación y medición EEG de G00/G01.

**Trabajo:** perfilar primero tiempo por frame y RAM con varios tamaños y DPR. Si el recálculo geométrico es relevante, reutilizar pesos o geometría con un presupuesto explícito y tamaño acotado. Invalidar al cambiar canvas, montaje, canales y cualquier máscara de validez que afecte normalización. Conservar representación visual y manejo de NaN.

**Pruebas/aceptación:** comprobar equivalencia visual/numérica, coincidencia con electrodo, resize y canales faltantes. Medir frame time y memoria; adoptar solo una mejora superior al ruido sin crecimiento descontrolado. El rasterizado en worker sería un plan adicional, no una expansión automática de esta tarea.

**Salida válida sin cambios:** perfil documentado que no justifica optimizar, o candidato descartado por memoria/beneficio. G11 debe evaluarse y cerrarse explícitamente, no omitirse sin evidencia.

## G12 — Validación integral y entrega final

**Lecturas:** `ESTADO.md`, entregas y contratos cambiados; abrir código según resultados. No rehacer la búsqueda original.

**Trabajo:** comprobar integración de claves/invalidación entre frontend, respuestas backend, Parquet y medios; verificar presupuestos combinados bajo consultas simultáneas e informe. Repetir la matriz de flujos original en el mismo entorno y comparar tanto contra G00 como contra límites acordados. Inspeccionar reingesta/logout/edición durante solicitudes en curso y el modo sin Redis.

Ejecutar una vez `verify.ps1`, build de frontend y E2E seleccionadas del dashboard, comparación, EEG y modo local. `verify.ps1` **no sustituye** build/E2E: su gate actual incluye backend, análisis estático, typecheck, pruebas frontend/hooks y lint. Si hubo cambios de recursos/compatibilidad, hacer el smoke apropiado del paquete local existente en un entorno de prueba; no generar una distribución ni publicar.

Si aparece una regresión, devolver una corrección acotada al bloque responsable, de forma secuencial. Repetir checks afectados; repetir la suite global cuando la corrección afecte sus garantías. No solucionar problemas ajenos ni sobrescribir goldens para silenciar diferencias científicas.

**Aceptación:** estados completos o descartados con evidencia donde se permitía; ningún pendiente obligatorio oculto; comparativa de latencia/solicitudes/bytes/memoria y límites de la evidencia. Si no hubo entorno de nube o entrega congelada disponible, declarar esa validación pendiente; no anunciar equivalencia de despliegues por inferencia.

**Entrega:** `docs/perf/ejecucion/RESULTADOS.md`, actualización de documentación funcional pertinente y resumen final con mejoras medidas, partes descartadas, riesgos y verificación pendiente. Separar cierre de implementación de autorización/despliegue.

## Modelos y esfuerzo recomendados

Mantener las selecciones existentes mientras sean adecuadas; esto no cambia ninguna sesión. Para **Codex**, usar el modelo de código actual; para **Claude**, el modelo de razonamiento/código actual. Esfuerzo alto es el punto de partida en ambos servicios.

| Tareas | Codex | Claude | Motivo y verificación |
|---|---|---|---|
| G00 | Alto | Alto | Diseñar una base útil y detectar contratos; verificar reproducibilidad. |
| G01, G09 | Alto; medio si el alcance resulta mecánico | Alto; medio si está disponible y basta | Cambios acotados, pero con estados UI/transacciones; pruebas dirigidas. |
| G02–G04 | Alto | Alto | Invalidación, esquema y concurrencia; pruebas de carreras, memoria e identidad. |
| G05–G06 | Alto | Alto | Equivalencia científica; caracterizaciones y medidas por componente/flujo. |
| G07–G08 | Alto | Alto | I/O, fallos parciales y tiempo; pruebas de contratos y recursos. |
| G10 | Alto; xhigh si quedan ambigüedades estadísticas | Alto; máximo disponible solo si hace falta | Migración del contrato estadístico entre capas; referencia cruzada de resultados. |
| G11–G12 | Alto | Alto | Perfilado y evaluación conjunta; regresiones y mediciones comparables. |

No aumentar esfuerzo o cambiar de modelo por rutina: hacerlo si existe una dificultad concreta. El cambio más útil para el contexto es iniciar el próximo agente con su ficha y entrega, no con el historial acumulado.

## Instrucción reutilizable para lanzar cada tarea

```text
Implementa únicamente Gxx del documento docs/perf/PLAN-IMPLEMENTACION-RENDIMIENTO.md.
Lee primero el protocolo común, su ficha y docs/perf/ejecucion/ESTADO.md;
después, las entregas de sus dependencias y los archivos iniciales indicados.
Respeta el trabajo previo y los contratos científicos/local-servidor.
Completa implementación, pruebas dirigidas y comparación antes/después.
Escribe docs/perf/ejecucion/Gxx.md y actualiza ESTADO.md antes de terminar.
No inicies el siguiente bloque, no crees otros agentes/chats ni despliegues.
Si necesitas continuar por contexto, deja un checkpoint preciso del mismo Gxx.
No declares completo un bloque con pruebas obligatorias fallidas o no ejecutadas;
identifica el impedimento y la acción exacta para retomarlo.
```

Para G00, los archivos de ejecución aún no existen: crearlos como parte de su entrega. Para G11, aplicar expresamente la salida sin cambios basada en evidencia. El coordinador inicia el siguiente agente solo después de revisar el cierre del anterior; no necesita pedir autorización repetida para cada paso de una ejecución que el usuario ya haya autorizado.

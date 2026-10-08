# Entrega: comparar participantes

Fecha: 28-09-2026. Implementa `docs/instruccion-comparar-participantes.md`.

## Qué hace

Cada gráfica analítica tiene un botón pequeño «Comparar participantes» arriba a la derecha de su encabezado. Abre un diálogo a pantalla completa con una tarjeta por participante y la misma gráfica en todas. Hay dos orígenes:

- Vistas individuales: pupila, gaze point, distancia, GSR, histograma de fijación, mapa de calor, mapa de recorridos, AOIs (distribución de permanencia) y las cuatro vistas EEG (por canal, PSD, espectrograma y topografía).
- Paneles de «Comparativas»: el botón queda fuera del disparador de colapso.

Contenido del diálogo:

- Título, escenario, vista y participante de origen, y contador.
- Selector con búsqueda (sin distinguir mayúsculas ni tildes), «Seleccionar todos», «Quitar selección» y contador. Con una búsqueda activa, las dos acciones afectan solo a los participantes que coinciden.
- Selector «Escala común / Escalas propias» y notas que explican el eje temporal, la reducción de puntos y las restricciones.

Al abrir, todos los participantes del proyecto están seleccionados, con sus códigos reales en orden natural y estable (P2 antes que P10). La tarjeta del participante de origen lleva la marca «Vista de origen».

Cada tarjeta muestra por separado su estado: en cola, cargando, sin datos, o error con «Reintentar». Una falla no bloquea las demás.

El diálogo se cierra con «Cerrar» o con Escape. Al cerrar, devuelve el foco al botón y restaura el desplazamiento de los contenedores. La vista de origen sigue montada, así que conserva su participante, escenario, filtros, zoom y ventana temporal. Dentro del diálogo no se puede abrir otra comparación (`NestedComparisonBoundary`).

### Interacción en las tarjetas

- Un clic en un punto de una tarjeta temporal (o en el espectrograma) fija ese instante. Abre un panel lateral (inferior en pantallas estrechas) con el punto sobre el estímulo visual de ese participante. El panel usa `useComparisonData` con cero paneles y `PointOnStimulusPanel`, igual que en Comparativas.
- La búsqueda de la mirada usa el tiempo original de esa grabación. Con un escenario concreto, la misma línea marca ese instante del estímulo en todas las tarjetas.
- Arrastrar con el clic presionado amplía solo esa tarjeta, con volver atrás y vista completa. Un arrastre no se interpreta como clic. El zoom de cada tarjeta se conserva aunque se desmonte al desplazarse.

## Parámetros que se conservan

Se leen en el momento del clic (`spec.ts`, `ParticipantComparisonSpec`).

| Vista | Parámetros |
|---|---|
| Pupila | ojo(s), ventana temporal |
| Gaze | eje(s), ventana |
| Distancia | ventana |
| GSR | modo suavizada/cruda/ambas, ventana (eje relativo a la primera muestra GSR, como en la pestaña) |
| Histograma, calor, recorridos, AOI | umbral mínimo de fijación; en calor y recorridos, además, AOIs visibles |
| EEG por canal | canales, modo, suavizado de 0,2 s, ventana |
| PSD | canales, frecuencia máxima, dB, puntos, exclusión de ventanas con artefactos, ventana, zoom de frecuencia |
| Espectrograma | canales, 25 Hz, dB, normalización, bins, escala de color por canal, interpolación, ventana, zoom temporal |
| Topografía | canales, ventana de 2 s, solapamiento, eliminación de DC, marcos, ventana, instante del marco |
| Paneles de Comparativas | los mismos parámetros que el panel pide hoy (p. ej. EEG crudo sin suavizado, PSD y espectrograma a 45 Hz, 360×160 bins) |

## Tiempo y escalas

Con un escenario concreto, cada tarjeta dibuja los segundos desde el inicio de ese escenario en su propia grabación. El inicio es el primer registro etiquetado con el escenario, la misma referencia que ya usa `gaze-at` para `scenario_time_s`. No se usa el primer dato válido de la señal, ni se sincronizan tiempos absolutos.

- La ventana temporal de origen se traduce a segundos desde el inicio del estímulo y se aplica a cada grabación. La tarjeta y la búsqueda de la mirada conservan el tiempo original (`sourceTime`).
- El tooltip muestra ambos tiempos.
- Con «Todos los escenarios» no hay equivalencia. Cada tarjeta conserva el eje de su vista individual, la ventana de origen no se traslada y la interfaz lo explica.
- La topografía y los mapas espaciales (calor, recorridos, AOIs) exigen un escenario concreto. Sin él, el diálogo lo explica y no hace consultas.

La escala común se calcula con los participantes cargados. Mientras no estén todos, el diálogo dice «Escala común parcial: calculada con n de N…». Las escalas propias se identifican como tales. Unidades, colores y normalizaciones son los de la vista de origen. En el mapa de calor la intensidad está normalizada por participante, y la nota lo dice. Los recorridos usan la escala absoluta existente.

## Rendimiento

- **Cierre y carga bajo demanda:** con el diálogo cerrado no hay consultas ni tarjetas montadas. El diálogo es un módulo `React.lazy` que se carga en el primer clic.
- **Qué se monta:** solo se montan las tarjetas visibles y un margen de 480 px. Dos `IntersectionObserver` compartidos tienen como raíz el contenedor del diálogo. Las tarjetas lejanas dejan un marcador de altura fija, de modo que la altura del desplazamiento no cambia.
- **Cola:** `ComparisonLoader` ejecuta un máximo de 4 trabajos a la vez, prioriza lo visible y luego el orden de la cuadrícula, y no duplica solicitudes.
  - Un trabajo en cola que ya no se necesita se descarta.
  - Si la tarjeta sale del margen mientras su consulta está en curso, la consulta termina y se guarda en caché ocupando su turno.
  - Deseleccionar aborta el trabajo de ese participante (`abortGroup`); cerrar o cambiar de contexto aborta todo (`cancelAll`).
  - Las respuestas tardías o de trabajos reemplazados se descartan.
- **Caché:** LRU de 48 entradas, peso acotado a unos 3 millones de números y TTL de 5 min. La clave incluye proyecto, generación de ingesta viva (se lee al abrir con `GET /api/projects/{id}`), participante, gráfica, escenario, parámetros de la petición, participante de referencia de la ventana y presupuesto de puntos. Si la generación cambia tras reprocesar, se vacía.
- **Puntos por tarjeta:** 2.000 para pupila, gaze, distancia y GSR; 1.600 para EEG (frente a 5.000 en las vistas individuales). La reducción es una envolvente que conserva, por tramo, el primero, el último, el mínimo, el máximo y el primer valor ausente de cada serie dibujada. Solo devuelve muestras reales y no modifica estadísticas ni procesamiento.
  - EEG usa la envolvente `minmax_envelope` que ya existía.
  - PSD, espectrograma y topografía mantienen los bins de origen: allí el muestreo uniforme descartaría ventanas.
- **Animación:** está desactivada en las gráficas de las tarjetas y en la apertura del diálogo.

## Cambios de backend (con pruebas)

- `decimation=linspace|minmax_envelope` en `/timeseries/{pupil,gaze,distance,gsr}`.
  - Por defecto sigue siendo `linspace`, con sus claves de caché intactas.
  - `numeric_helpers._envelope_display_indices` nunca supera `max_points`.
- `GET /analytics/scenario-timing` → `{scenario, time_basis, onset_s, end_s, gsr_origin_s}` (`ScenarioTimingService`, `GsrAnalyticsService.time_origin`). Se guarda en Redis por generación.
- `_time_window_key` ahora usa `repr`: con `:g`, 1234.567 y 1234.571 compartían clave de caché. Las claves con ventana cambian una vez (un fallo de caché por clave).

## Archivos

**Nuevos**
- `frontend/features/analytics/participantComparison/`: `spec.ts`, `timeAlignment.ts`, `comparisonLoader.ts`, `scales.ts`, `cardData.ts`, `cardHooks.ts`, `ParticipantComparisonProvider.tsx`, `CompareParticipantsButton.tsx`, `ParticipantComparisonDialog.tsx`, `ParticipantSelector.tsx`, `ParticipantCard.tsx`, `participantComparison.test.mjs`
- `frontend/tests/e2e/participant-comparison.spec.ts`, `frontend/tests/hooks/participant-comparison-entry.test.mjs`
- `backend/src/neurodatics/modules/analytics/application/services/scenario_timing_service.py`, `backend/tests/unit/test_display_envelope.py`

**Modificados**
- Frontend:
  - `app/dashboard/page.tsx` (proveedor), `api/analyticsApi.ts`, `types.ts`
  - `comparison/ComparisonCharts.tsx`: props opcionales `yDomain`, `animate`, `zoom`, `shellClassName`, estilo de serie y tiempo de grabación en el tooltip
  - `comparison/SpatialPanels.tsx` (modo `compact`), `comparison/ComparisonTab.tsx`
  - `components/{PupilDilation,GazePoint,DeviceDistance,Gsr,FixationHistogram,Heatmap,Scanpath,AoiComparison,Eeg,SingleSignal}Tab.tsx`
  - `components/eeg/{EegTimeseriesView,EegPsdView,EegSpectrogramView,EegTopographyView,EegCanvasPanels}.tsx`: ranura `compareAction`, `TopographyPanel` exportado, `SpectrogramPanel compact`
- Backend:
  - `api/routes.py`, `api/schemas.py`, `pupil_analytics_service.py`, `gsr_analytics_service.py`, `numeric_helpers.py`
  - `tests/fixtures/route_inventory.json`, `tests/characterization/test_analytics_http_contracts.py` y su snapshot (solo se añadió la ruta nueva)

Varios de esos archivos ya tenían cambios ajenos sin confirmar: EEG, pupila, scanpath, comparativa, AOI. Mis cambios son inserciones puntuales. No se revirtió, confirmó ni publicó nada. Durante la sesión aparecieron otros cambios ajenos (`aoiInsights.ts`, `components/aoi/`, `docs/REPORTS.md`), que no toqué.

## Verificación

- `npx tsc --noEmit`: sin errores.
- ESLint sobre `features/analytics`, `app/dashboard` y las pruebas nuevas: sin errores. Quedan los avisos `<img>` que ya existían.
- `node --test "features/**/*.test.mjs"`: 87/87.
  - Las 13 pruebas nuevas cubren la cola: límite de concurrencia, prioridad, duplicados, cancelación, respuestas fuera de orden, reintento, límites de caché, conservación al desplazarse y `abortGroup`.
  - También cubren las claves de caché, el orden y la búsqueda, la traslación de ventanas por el inicio del estímulo, los ejes y las restricciones.
- Pruebas de hooks y componentes: 44/44. Incluyen 2 nuevas en Chromium real: una respuesta tardía no sustituye a la tarjeta actual, y al remontar se reutiliza la petición en curso.
- Playwright completo: 37/37. Incluye las 7 pruebas nuevas y las existentes de comparativa y EEG.
  - Las nuevas cubren apertura y cierre (botón y Escape), foco y desplazamiento restaurados, ausencia de consultas con el diálogo cerrado y selección.
  - También cubren aislamiento con 40 participantes y respuestas fuera de orden, error con reintento, participante sin datos (404), máximo de 4 consultas simultáneas y tarjetas montadas acotadas al desplazarse.
  - Además: cancelación al deseleccionar y al cerrar, clic con punto sobre estímulo, zoom por arrastre, EEG, paneles de Comparativas, restricción espacial, y mapas y EEG de frecuencia sin errores de ejecución.
- Backend: `pytest` completo con 932 pruebas aprobadas, incluidas las nuevas de envolvente y temporización. `ruff check`: sin errores.
- Inspección visual con capturas en 1440×900 y 390×844 (sin desbordamiento horizontal). Se revisaron pupila, recorridos, espectrograma y topografía. En pantallas estrechas, las notas se pliegan en «Ver notas».

### Mediciones (simuladas)

Condiciones: API simulada con `page.route` y latencia de 120–240 ms por consulta, servidor `next dev` (Turbopack), Chromium de escritorio a 1280×720, 40 participantes, dilatación pupilar, escenario concreto. Tres ejecuciones:

| Medida | Resultado |
|---|---|
| Primera tarjeta, caché fría | 1,29–1,30 s (incluye cargar el módulo diferido en desarrollo) |
| Desplazamiento hasta P40 | 1,6–2,5 s |
| Reapertura, caché caliente | 0,30–0,35 s, sin consultas nuevas de series |
| Consultas simultáneas | máximo 4 |
| Tarjetas montadas | 6 de 40, tanto al abrir como al final |

No hubo backend disponible, así que **no se midió con datos reales** y estas cifras no predicen tiempos de producción.

## Limitaciones

- El inicio del estímulo es el primer registro del escenario en la grabación: no hay marcadores de evento.
- Una consulta abortada en el navegador puede seguir calculándose en el servidor, porque FastAPI no cancela el cálculo en curso.
- No se trasladan:
  - el tinte morado del mapa de calor ni el reproductor del recorrido;
  - el diseño apilado del EEG (en las tarjetas los canales se superponen, y la nota lo dice);
  - el zoom interno de los paneles de Comparativas.
- La caché del navegador está en memoria de la pestaña. Se invalida por generación de ingesta y por TTL.
- Solo después de reprocesar, la primera consulta de cada clave con ventana falla en caché por el cambio de `_time_window_key`.
- React muestra el aviso «Cannot use a ref … createPortal» en la vista de pupila antes de abrir el diálogo. Existía antes de esta funcionalidad.
- No se ejecutó `next build`, para no interferir con el servidor de desarrollo ajeno que usa `.next` (puerto 3000). La verificación usó `tsc` y la compilación de desarrollo.

## Siguientes acciones

1. Medir con el backend y datos reales (caché de Redis y Parquet fría y caliente) y ajustar concurrencia, margen y presupuesto de puntos.
2. Ejecutar `next build` en un entorno limpio.
3. Valorar marcadores reales de inicio de estímulo si el importador llega a exponerlos.
4. Registrar el cambio en `docs/CHANGELOG.md` cuando se integre; ese archivo tiene trabajo ajeno en curso.

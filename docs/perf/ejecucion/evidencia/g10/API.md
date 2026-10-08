# Contrato G10: gráficas y estadísticas de Comparativas

`GET /api/projects/{project_id}/analytics/comparison/charts` conserva `charts` y añade:

- `contract_version: "comparison-charts-v3"`;
- `statistics_schema_version: "comparison-statistics-v1"`;
- `statistics[]`, ordenado como `visualizations`, con `visualization_id`, `status` (`ok`, `empty`, `error`), `source`, `series[]` y error genérico opcional;
- cada serie publica `key`, el rótulo/unidad actuales de la tabla y `summary` (`count`, `mean`, `median`, `std`, `min`, `max`, `baseline`, `peak`).

La fuente declara `resolution=legacy_timeseries_display_samples`, endpoint sustituido, muestras fuente/seleccionadas, parámetros, resolución de gráfica y relación entre ambas. Los conteos proceden de las longitudes/metadata efectivas devueltas por cada procesamiento y de la selección real; no se infieren del nombre de la vista. No se calculan estadísticas desde `chart.data`.

## Caracterización preservada

| Vista | Serie histórica de la tabla | Resolución estadística | Diferencia respecto de la gráfica |
|---|---|---|---|
| pupil | `smooth_left`, `smooth_right`; media móvil 0,25 s; faltantes resultantes a 0 | selección `linspace` truncada, máximo solicitado (5.000 en UI), float64 sin redondeo adicional | la gráfica selecciona desde la señal completa con índices redondeados y redondea a 6 decimales |
| distance | `distance_cm`, filas válidas ordenadas, redondeo de endpoint a 4 decimales | `linspace` truncada, máximo solicitado | gráfica: índices redondeados y salida a 6 decimales |
| gaze | `gx_clean`, `gy_clean`, transformación espacial vigente, no finitos a 0 y 4 decimales | `linspace` truncada, máximo solicitado | gráfica: índices redondeados y salida a 6 decimales; conserva dependencia del digest AOI |
| gsr | `gsr_smooth`, media móvil 1 s, 4 decimales | endpoint histórico con eje relativo, `linspace` truncada | gráfica usa tiempo absoluto; valores y orden estadísticos se conservan, sin resumir filas gráficas |
| eeg_timeseries | `smooth[channel]`, ventana 0 s, todos los canales canónicos, referencia `as_exported`, sin filtros | endpoint EEG ya reducido a máximo 5.000; nulls de gaps se filtran | gráfica usa `raw[channel]`; con ventana 0 ambos valores finitos coinciden, pero el contrato conserva ambos significados y la tabla mantiene µV |

La definición numérica es la reducción JavaScript previa en orden original: sólo números finitos; mediana ordenada par/impar; desviación muestral `n-1` y 0 para `n=1`; baseline como media del slice ordenado `[floor(5%n), max(floor(5%n)+1, ceil(20%n)))`; `peak=null` cuando baseline es 0 y, en otro caso, `100*(max-baseline)/abs(baseline)`. Resultados derivados no finitos se transportan como `null`; la UI conserva `—`.

## Caché, invalidación y fallos

- Redis/respuesta backend: `comparison_charts:v3:statistics-v1:stimulus-v1:{transform}:{max_points}:{views}`.
- Loader G02: operación `getComparisonCharts:v3`; conserva sesión/usuario/proyecto/generación/revisión/digest espacial, límites, cancelación y revalidación. El cliente rechaza payloads sin ambas versiones.
- Autorización sigue ejecutándose antes de caché; G04 singleflight y lifecycle no cambian.
- Cada visualización se prepara una vez. Una excepción queda como bloque `error` y no elimina gráficas/resúmenes legítimos de otras señales.
- Un bloque sin series queda `empty`; la UI presenta `error` y `empty` en filas independientes sin ocultar las series `ok` vecinas.
- Se retiraron únicamente los cinco hooks temporales que `ComparisonStatistics` usaba para resumir. PSD, espectrograma, fijaciones, AOI, scanpath, heatmap y `gaze-at` conservan sus solicitudes.

G11/G12 deben consumir estas versiones y no inferir que estadísticas y puntos dibujados tienen igual resolución. Cambiar máximo, decimación, canales o procesamiento EEG exige una nueva versión/clave y referencias científicas equivalentes.

Las medidas G10 distinguen capas: los tamaños del probe son estimaciones por serialización JSON directa; los 23.468 bytes E2E corresponden al cuerpo HTTP decodificado de una respuesta interceptada; y los conteos 6→1 de lectura Parquet y 2→1 de token se instrumentaron en el contrato HTTP en proceso. Ninguno demuestra bytes de red o comportamiento PostgreSQL/Redis de un despliegue real.

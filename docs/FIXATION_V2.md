# Fixation V2

Fixation V2 recalcula las fijaciones a partir de la mirada cruda. Su objetivo es
que una transición, una pérdida de señal o una rejilla de exportación más rápida
que el eye tracker no produzcan coordenadas inventadas ni aumenten artificialmente
la duración de una fijación.

El flujo es determinista: la misma tabla, metadatos y configuración producen la
misma máscara, los mismos eventos y los mismos identificadores.

## Flujo general

```text
CSV multibloque
  -> separar por Grabación
  -> normalizar nombres y leer metadatos de cada bloque
  -> conservar sensores y columnas adicionales
  -> construir la máscara de mirada válida desde time/gx/gy
  -> llevar solo la mirada a la frecuencia efectiva del eye tracker
  -> detectar fijaciones con mínimos de 100, 150, 200, 250 y 300 ms
  -> proyectar cada resultado sobre las mismas filas originales
  -> guardar muestras etiquetadas y construir eventos canónicos para analítica
```

Las columnas de EEG, GSR, pupila, distancia y sensores desconocidos no se usan
para rellenar la mirada ni se eliminan por una pérdida del eye tracker. La
clasificación trabaja sobre una vista temporal de `time`, `gx` y `gy`; la salida
por muestra conserva la alineación y el número de filas del bloque original.

## Importación por `Grabación`

Un CSV puede contener varias grabaciones. Cada línea que comienza con
`Grabación` o `Grabacion` abre un bloque independiente y debe tener exactamente
un encabezado que contenga `Time` antes de la siguiente grabación. Por bloque se
extraen, entre otros datos:

- código de participante y etiqueta de grabación;
- línea inicial, encabezado, línea final y delimitador;
- nombres originales, nombres normalizados y columnas adicionales;
- sensores detectados y metadatos por canal;
- frecuencia declarada del archivo, frecuencia observada de su rejilla y
  frecuencia declarada de la mirada;
- advertencias de calidad y disponibilidad de fijaciones.

El orden de las columnas no es significativo. Las columnas conocidas se
normalizan por nombre y las desconocidas se conservan como evidencia del sensor.
Los nombres duplicados se fusionan si sus valores son idénticos o no se solapan;
si dos columnas equivalentes contienen valores incompatibles, el bloque se
rechaza con la línea del conflicto. Si no existe marcador de grabación, los
encabezados `Time` siguen delimitando bloques por compatibilidad.

La salida se escribe por participante y, cuando existe `scenario`, también por
escenario. Un evento nunca puede cruzar un cambio de escenario, un reinicio o
retroceso del reloj, ni una discontinuidad temporal larga.

## Tasas multirrate

No se supone una frecuencia fija. Valores positivos como 30 Hz, 60 Hz o
300.313802515981 Hz son válidos y se conservan como `float`, sin redondearlos a
una lista de frecuencias conocidas.

Para cada grabación se distinguen tres tasas:

1. `declared_file_rate_hz`: valor de `Frecuencia del archivo`; describe la
   rejilla maestra exportada.
2. `observed_grid_rate_hz`: inverso de la mediana de los incrementos positivos de
   `time`; permite detectar metadatos inconsistentes o una rejilla irregular.
3. `declared_gaze_rate_hz`: frecuencia de los canales X/Y de mirada. Si ambas
   difieren hasta 2 %, se usa su media; si difieren más, se usa la menor y se
   emite una advertencia. Si solo una está disponible, se usa esa tasa y también
   se advierte.

La tasa efectiva de detección es la menor entre la tasa ocular y la rejilla
observada cuando ambas existen; nunca se atribuyen más observaciones de las que
puede aportar cualquiera de los dos relojes. Si solo hay una tasa, se usa esa.
Si la rejilla es más rápida que la mirada por más de la tolerancia configurada
(5 % por defecto), la mirada se remuestrea temporalmente para clasificarla a la
tasa del eye tracker.
Esto evita interpretar cinco copias de una muestra de mirada como cinco muestras
independientes en una exportación de aproximadamente 300 Hz con mirada de 60 Hz.

El remuestreo crea casillas regulares por tiempo y usa la mediana de las muestras
válidas que caen en cada casilla. Mantiene el mapa hacia las filas fuente. No
remuestrea ni sobrescribe EEG, GSR u otros sensores, y tampoco expande una
interpolación sobre las columnas persistidas. Por eso se reportan por separado:

- `fixation_detector_sample_count`: soporte válido en la rejilla de detección;
- `fixation_source_row_count`: filas originales válidas asignadas al evento;
- `fixation_effective_rate_hz`: tasa empleada para duración y clasificación.

La duración suma el soporte de los timestamps válidos. Cada intervalo se limita
a un período de la frecuencia efectiva para que una muestra ausente no se
convierta en dwell; en una rejilla regular esto equivale a
`fixation_detector_sample_count / fixation_effective_rate_hz`. Nunca se calcula
usando simplemente el número total de filas exportadas.

## Precedencia de la mirada cruda

Para una importación V2, la única fuente de clasificación es la pareja cruda
`gx`/`gy`. Las columnas `Fixations / X` y `Fixations / Y` suministradas por el
fabricante se renombran a `vendor_fix_x` y `vendor_fix_y`, se conservan sin
reescribir y sirven únicamente para auditoría o comparación.

La salida recalculada ocupa `fix_x` y `fix_y`. Los valores del proveedor nunca
tienen precedencia sobre ella y no se usan como respaldo cuando la mirada cruda
es insuficiente. Una sola columna de fijación del proveedor se considera un par
incompleto y genera una advertencia.

Esta separación evita que un valor interpolado, suavizado o mal codificado por el
software de adquisición se presente como resultado de Fixation V2.

## Variantes de duración mínima

Las duraciones mínimas soportadas son exactamente `100`, `150`, `200`, `250` y
`300` ms. La variante predeterminada y canónica es `200 ms`: sus campos conservan
los nombres históricos sin sufijo (`fix_x`, `fix_y`, `fixation_id`,
`fixation_detector_sample_count` y `fixation_source_row_count`) y cada fila lleva
`fixation_min_duration_ms = 200`.

La importación calcula las cinco variantes desde la misma mirada cruda. En I-DT
normalizado comparte validación, normalización de coordenadas, remuestreo y
segmentación, pero vuelve a ejecutar la clasificación I-DT para cada duración; no
filtra la salida de 100 ms, porque cambiar la ventana inicial puede cambiar
fronteras, centroides e identificadores. En I-VT angular la clasificación y la
histéresis no dependen de ese mínimo: se clasifican una vez a 100 ms y las
variantes mayores se obtienen aplicando el mismo filtro de soporte y compactando
sus identificadores.
El Parquet no duplica la tabla completa. Por cada duración no canónica persiste
solamente los cinco campos que permiten reconstruir sus eventos, con el sufijo
determinista `__{duración}ms`. Por ejemplo:

- `fix_x__100ms`, `fix_y__100ms`, `fixation_id__100ms`;
- `fixation_detector_sample_count__100ms`;
- `fixation_source_row_count__100ms`.

El mismo esquema se repite para 150, 250 y 300 ms. Las columnas compartidas
(`time`, escenario, segmento, tasa efectiva, método, procedencia y coordenadas de
mirada) se almacenan una sola vez. Todas las variantes conservan el mismo índice,
orden y número de filas que la grabación fuente.

## Máscara de validez y pérdidas de señal

Una muestra de mirada es válida solamente cuando:

- `time`, X e Y son números finitos;
- el timestamp es estrictamente mayor que el de la fila anterior; durante la
  importación, una secuencia no creciente se rechaza con su número de línea;
- las coordenadas, una vez normalizadas, están dentro de `[0, 1]` en ambos ejes;
- la pareja no es `(0, 0)` cuando `zero_pair_is_invalid` está activo, que es el
  valor predeterminado.

Pares negativos, el sentinela del proveedor, valores fuera de pantalla, `NaN` y
tiempos inválidos no pueden formar parte del soporte válido de un evento. La
columna `is_valid_gaze` hace explícita esta máscara.

Una pérdida interna de hasta 75 ms puede puentearse solo para decidir continuidad
si los extremos son espacialmente compatibles. La interpolación existe únicamente
en la vista de clasificación. Las filas perdidas siguen siendo inválidas, no
reciben `fixation_id` y conservan exactamente `(-100, -100)` en la salida. El
hueco tampoco suma duración o dwell.

Un hueco mayor de 75 ms crea un segmento nuevo. También lo hacen un cambio de
escenario o un tiempo no creciente. En la capa de analítica hay una defensa
adicional: si un mismo identificador reaparece tras una discontinuidad larga, se
divide en spans distintos en vez de unirlos artificialmente.

## Clasificación sin geometría: I-DT normalizado

Sin geometría completa de pantalla, el modo automático utiliza
`i-dt-normalized`:

- convierte porcentaje a `[0, 1]` cuando corresponde;
- abre una ventana con al menos la duración mínima seleccionada (200 ms en la
  variante canónica);
- calcula la dispersión como
  `(max(X) - min(X)) + (max(Y) - min(Y))`;
- acepta y extiende la ventana mientras la dispersión no exceda 0.03, el umbral
  predeterminado en coordenadas normalizadas;
- empieza una nueva búsqueda cuando la ventana deja de cumplir el umbral.

El mínimo seleccionado siempre representa soporte válido del detector. Un hueco
puenteado puede aumentar el tiempo de pared (`wall_duration_ms`), pero no
convierte muestras perdidas en soporte ni permite que una fijación corta supere
artificialmente el mínimo.

Este modo es independiente de resolución, distancia física y tamaño del monitor,
pero su umbral representa una fracción de pantalla, no grados visuales.

## Clasificación con geometría: velocidad angular adaptativa

Cuando se proporciona geometría completa, el modo automático selecciona
`adaptive-ivt-angular`. Se requieren ancho y alto en píxeles, ancho y alto físicos
en milímetros y distancia de observación en milímetros, todos finitos y positivos.
Si existe una columna `distance`, puede emplearse por muestra después de convertir
su unidad; los valores inválidos usan como respaldo la distancia de la geometría.

Las coordenadas se transforman a ángulos visuales y la velocidad central se
calcula con los timestamps reales, en grados por segundo. Para cada segmento, el
detector estima un umbral a partir de los máximos locales de velocidad: compara
su distribución empírica con una distribución uniforme y busca la separación
entre el grupo denso de baja velocidad y el grupo rápido. Si el segmento no tiene
suficientes máximos o no presenta una separación fiable, usa 30 grados/s como
respaldo configurable y lo registra en `warnings` y `segment_thresholds`.

La clasificación aplica histéresis: entra en movimiento rápido por encima de
`umbral * 1.25` y vuelve al estado de fijación al caer hasta el umbral bajo. Los
eventos resultantes todavía deben aportar al menos la duración seleccionada de
muestras válidas (200 ms en la variante canónica).
El puente máximo sigue siendo 75 ms y, además del tiempo, exige compatibilidad de
velocidad angular entre sus extremos.

Solicitar explícitamente el modo angular sin geometría completa es un error de
contrato; no se degrada silenciosamente al modo normalizado.

## Salida por muestra, sentinela y tabla de eventos

El resultado por muestra conserva el índice y las columnas de entrada y añade,
como mínimo:

- `fix_x`, `fix_y`: centroide mediano del evento en porcentaje `[0, 100]`;
- `fixation_id`: identificador del evento, nulo fuera de fijación;
- `fixation_min_duration_ms`: `200` para la variante canónica persistida;
- `fixation_segment_id`/`segment_id`: frontera temporal y de escenario;
- `fixation_method`/`method` y `fixation_detector_version`/`version`;
- conteos de detector y fuente, tasa efectiva, unidad, fuente y advertencias;
- `is_valid_gaze`.

Toda fila que no pertenece a una fijación lleva el par exacto
`fix_x = -100.0`, `fix_y = -100.0`. No se permiten sentinelas parciales ni
coordenadas aleatorias en filas de transición. Una fila inválida puenteada para
clasificación también conserva ese par y un `fixation_id` nulo.

La tabla de eventos contiene una fila por fijación y no una fila por muestra. Sus
campos de detección incluyen inicio, fin, `duration_ms`, `wall_duration_ms`,
centroide, huecos puenteados, umbral y unidades de clasificación, método, versión,
segmento y conteos. Los identificadores son únicos dentro del resultado de una
grabación.

Para la API, esa tabla se adapta al contrato canónico:

| Campo | Significado |
| --- | --- |
| `id` | Identificador estable compuesto por segmento y fijación; spans defensivos usan `#spanN`. |
| `x_norm`, `y_norm` | Centroide normalizado en `[0, 1]`. |
| `time_s`, `t_end_s` | Inicio y fin temporal del evento. |
| `duration_s` | Soporte válido acumulado; no incluye huecos. |
| `detector_sample_count` | Muestras válidas usadas por el detector. |
| `source_row_count` | Filas originales asignadas al evento. |
| `segment_id` | Segmento que impide unir escenarios o discontinuidades. |

### Cómo se reconstruye `duration_s`

La capa canónica no vuelve a medir la fijación: reconstruye el mismo soporte
válido que el detector ya calculó. Hay dos caminos y el primero manda.

1. **Soporte del detector.** Si la exportación trae
   `fixation_detector_sample_count` y una tasa efectiva declarada,
   `duration_s = fixation_detector_sample_count / fixation_effective_rate_hz`.
   Es la misma igualdad que documenta la sección de tasas multirrate, así que
   un evento de 300 ms sigue midiendo 300 ms en fijaciones, AOI, histograma,
   scanpath y en el peso del heatmap, sin importar a qué velocidad se exportaron
   sus filas.
2. **Soporte de las filas.** Sin esos metadatos, cada intervalo entre dos filas
   consecutivas aporta como máximo un período de cadencia y cada tramo cierra
   con un período por su última fila. Un tramo corto de filas ausentes no puede
   devolverse como dwell aunque el reloj de pared sí lo recorra.

El conteo del detector solo se usa cuando resiste tres comprobaciones; si
alguna falla se mide con las filas y se emite una advertencia:

- la tasa declarada no supera la rejilla observada del archivo (una exportación
  V2 nunca detecta más rápido que su propia rejilla);
- el conteo almacenado no excede las filas que el evento conserva, porque toda
  muestra del detector nace de al menos una fila;
- el soporte resultante cabe dentro del tiempo que el evento realmente abarca.

Un identificador que se partió en spans defensivos no usa este camino: el conteo
describe el identificador completo y no puede repartirse entre sus spans.

Las filas inválidas explícitas, con el par sentinela o `fixation_id` nulo,
siguen sin aportar nada: cortan el tramo y su hueco no entra en `duration_s` por
ninguno de los dos caminos. En cambio, un timestamp repetido —artefacto de una
rejilla dictada por otro sensor— no abre un evento nuevo ni cobra una cadencia
extra; solo aporta cero. Por eso una exportación de 300 Hz produce el número de
eventos que detectó el eye tracker y no un evento por fila.

Las coordenadas fuera de `[0, 1]` se rechazan en lugar de recortarse al borde,
tanto aquí como en el adaptador legacy: acercar una coordenada imposible al
margen inventaría atención en un borde que nunca se miró y ese borde ganaría
aciertos de AOI y peso de heatmap.

## Metadatos y API de analítica

Los metadatos del detector registran método, versión, modo y unidad de
coordenadas, umbral configurado o adaptativo, umbrales por segmento, tasas
declaradas/observadas/efectivas, si hubo remuestreo, conteos, fuente y advertencias.
`fixation_warnings` se persiste como una lista JSON serializada para que Parquet y
la API puedan transportarla sin perder elementos.

Las respuestas JSON de fijaciones, scanpath, histograma y AOI conservan sus campos
anteriores y añaden la procedencia común:

```json
{
  "algorithm_version": "fixation-v2",
  "method": "i-dt-normalized",
  "source": "raw_gaze",
  "estimated": false,
  "effective_sampling_rate_hz": 60.1125,
  "warnings": []
}
```

`estimated` es `false` únicamente cuando los eventos provienen de una
exportación del detector V2. Cualquier respuesta del adaptador legacy lo declara
`true`, porque sus eventos y duraciones se reconstruyen a partir de muestras
almacenadas y no son salida del detector.

Los endpoints relevantes, bajo
`/projects/{project_id}/analytics`, son:

- `GET /fixations`: eventos canónicos y estadísticas;
- `GET /scanpath`: un objetivo por evento;
- `GET /fixations/histogram`: histograma de `duration_s` por evento;
- `GET /heatmap`: imagen ponderada por duración del evento;
- `GET /aois`: conteos, dwell y transiciones por eventos canónicos.

`participant_code` y `scenario` seleccionan los datos; fijaciones y heatmap
requieren un escenario concreto. Heatmap devuelve la procedencia en los headers
`X-Fixation-Algorithm-Version`, `X-Fixation-Method`, `X-Fixation-Source`,
`X-Fixation-Estimated`, `X-Fixation-Effective-Rate-Hz` y, si aplica,
`X-Fixation-Warnings`.

Todas estas analíticas consumen la misma tabla de eventos. `n_fixations` cuenta
eventos únicos, el dwell no suma huecos y las transiciones AOI se reinician entre
segmentos.

## Compatibilidad legacy

El adaptador legacy existe solo para Parquets históricos que ya estaban
procesados y no contienen el contrato completo V2. Si hay `fix_x`/`fix_y`, forma
eventos por proximidad y continuidad; para archivos históricos sin esas columnas
puede usar mirada limpia como último recurso. La respuesta lo declara mediante
`algorithm_version = legacy-adapter-v1` y una fuente como
`legacy_fixation_columns` o `legacy_gaze_fallback`.

Este comportamiento no cambia la precedencia de las importaciones nuevas:

- un Parquet con columnas V2 y cero eventos devuelve cero eventos; no cae al
  algoritmo legacy ni convierte toda la mirada continua en fijaciones;
- `vendor_fix_x`/`vendor_fix_y` no alimentan Fixation V2;
- no se reescriben automáticamente los Parquets históricos.

Los Parquets históricos tampoco pueden simular las cinco variantes: el selector
queda deshabilitado y solicita reprocesar el proyecto. La vista canónica sigue
siendo legible con su procedencia legacy, pero su duración mínima se declara
desconocida; pedir explícitamente una variante no canónica devuelve un error en
lugar de etiquetar los mismos eventos con un umbral que nunca se calculó.

### Reglas de contención del adaptador legacy

Un Parquet histórico no trae etiquetas del detector, así que el adaptador no
puede distinguir una fijación real de un resto de transición. Estas reglas son
explícitas y deliberadamente conservadoras:

1. **Marca de estimación.** Toda respuesta legacy declara `estimated: true`,
   `algorithm_version = legacy-adapter-v1` y una advertencia que dice que sus
   eventos y duraciones son estimaciones reconstruidas desde muestras
   almacenadas, no salida del detector. No deben leerse como ground truth ni
   compararse directamente con resultados V2.
2. **Rechazo de valores atípicos.** Una coordenada fuera de `[0, 1]` una vez
   normalizada invalida su fila y corta el evento. Antes se recortaba al borde,
   lo que convertía un valor imposible en atención de borde y le daba aciertos
   de AOI y peso de heatmap que nunca ocurrieron. El número de filas rechazadas
   aparece en `warnings`.
3. **Mínimo de dos filas consecutivas.** Un evento legacy necesita al menos dos
   filas contiguas. Una sola fila válida entre filas inválidas es una muestra de
   transición o el único superviviente de un tramo rechazado, y no basta para
   afirmar una fijación: nunca se convierte en evento, en nodo de scanpath ni en
   acierto de AOI. Las filas descartadas por esta regla se cuentan en
   `warnings`.

Las duraciones legacy se miden con el segundo camino de la sección
`Cómo se reconstruye duration_s`, con la cadencia mediana del archivo, porque
estos Parquets no tienen conteos del detector que reutilizar.

## Limitaciones y validación pendiente

- Las coordenadas se interpretan sobre estímulos estáticos. Scroll, zoom, vídeo,
  movimiento del estímulo o cambios de viewport requieren transformar la mirada
  al sistema de coordenadas del contenido antes de comparar AOI o scanpaths.
- El modo angular depende de una geometría y distancia calibradas. Metadatos
  incorrectos producen velocidades angulares incorrectas aunque el cálculo sea
  determinista.
- La inferencia automática de unidades y tasas emite advertencias, pero no puede
  resolver de forma infalible archivos ambiguos.
- Los umbrales predeterminados de 200 ms, 75 ms, 0.03 y 30 grados/s son decisiones
  operativas, no constantes fisiológicas universales. Poblaciones, tareas,
  dispositivos y niveles de ruido distintos pueden necesitar configuración y
  evaluación específicas.
- El detector evita interpolación visible y conteos inflados, pero todavía debe
  validarse contra anotaciones humanas y/o un conjunto de referencia etiquetado.
  Esa validación humana, incluida la revisión de transiciones y pérdidas reales,
  permanece pendiente antes de interpretar los resultados como ground truth.

## Ejecutar las pruebas

Desde la raíz del repositorio:

```powershell
Set-Location backend
poetry install
poetry run pytest -q tests/unit/test_csv_processing_service.py tests/unit/test_fixation_detection_service.py tests/unit/test_fixation_v2_pipeline.py tests/unit/test_fixation_event_analytics.py
```

Si el entorno virtual ya está activo y contiene las dependencias del proyecto:

```powershell
Set-Location backend
python -m pytest -q tests/unit/test_csv_processing_service.py tests/unit/test_fixation_detection_service.py tests/unit/test_fixation_v2_pipeline.py tests/unit/test_fixation_event_analytics.py
```

Para ejecutar todo el backend:

```powershell
Set-Location backend
poetry run pytest -q
```

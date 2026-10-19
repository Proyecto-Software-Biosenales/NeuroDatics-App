# Contrato de coordenadas pantalla → estímulo

Versión del contrato: `screen-stimulus-v1`.

El eye tracker entrega la mirada en coordenadas de **pantalla**; las AOIs, los mapas de calor y los recorridos se
dibujan sobre el **estímulo**, que no siempre ocupa toda la pantalla (puede ir centrado con bandas, recortado o
desplazado). Este documento fija cómo se pasa de un espacio al otro y qué hace la aplicación cuando no tiene los
datos para hacerlo.

## Dónde vive la implementación

| Pieza | Ubicación |
| --- | --- |
| Interpretación del contrato, sin dependencias de framework | `backend/src/neurodatics/modules/scenaries/domain/stimulus_placement.py` |
| Persistencia (tabla `stimulus_placements`, uno a uno con el escenario) | migración `backend/migrations/versions/020_create_stimulus_placements.py`, modelo `modules/scenaries/domain/entities.py` |
| Entrada por la subida (`stimulus_placements_json` del multipart) | `modules/projects/api/routes.py`, `modules/projects/application/use_cases/upload_experiment_zip.py` |
| Columnas derivadas en el Parquet y su procedencia | `modules/projects/application/services/csv_processing_service.py` |
| Lectura en analítica (estado, huella, máscaras, `coordinate_transform`) | `modules/analytics/domain/coordinate_transform.py` |
| Consumidores (fijaciones, AOI, pupila, recorrido, mapa de calor) | `modules/analytics/application/services/`, `modules/analytics/api/` |
| Captura en el navegador | `frontend/features/projects/create-project/stimulusPlacement.ts` y `components/StimulusPlacementEditor.tsx` |
| Pruebas | `backend/tests/unit/test_stimulus_placement_persistence.py`, `test_stimulus_coordinate_analytics.py`, `test_upload_stimulus_placement.py`, `test_stimulus_probe_service.py`, `frontend/.../stimulusPlacement.test.mjs` |

Queda fuera del contrato, y el código lo rechaza en lugar de aproximarlo: la geometría que cambia en el tiempo
(`geometry_stability = time_varying`), el scroll o el zoom que cambian durante la grabación, el estímulo en
movimiento y las ubicaciones distintas por participante.

## Resumen de decisiones

1. La **ubicación del estímulo** es distinta de la `ScreenGeometry` física que usa la detección angular de
   fijaciones.
2. Una ubicación v1 es estática para un escenario dentro de un proyecto y la comparten todas sus grabaciones. Se
   admiten un viewport y un scroll constantes.
3. Todos los operandos usan un único espacio de píxeles de pantalla con origen arriba a la izquierda: X positiva
   hacia la derecha, Y positiva hacia abajo.
4. Manda el **rectángulo mostrado** ya resuelto. `display_mode` registra y valida cómo se obtuvo ese rectángulo;
   nunca elige otra ecuación.
5. La transformación es:

   ```text
   x_estimulo = (x_pantalla - stimulus_left) / stimulus_width
   y_estimulo = (y_pantalla - stimulus_top)  / stimulus_height
   ```

6. La transformación y la máscara de validez se resuelven **antes** de detectar fijaciones. La detección trabaja
   en dos espacios: la clasificación fisiológica usa coordenadas de pantalla, y los centroides de las fijaciones
   y toda la analítica espacial usan coordenadas locales del estímulo.
7. Una coordenada fuera de `[0,1]`, o fuera del viewport visible, no es válida para la analítica del estímulo.
   **Nunca se recorta al borde.** Los intervalos fuera del estímulo son cortes que no se puentean.
8. Sin metadatos de ubicación, el estímulo se trata como la pantalla y nada más cambia: la transformación es la
   identidad y la procedencia lo marca como paso heredado con aviso. La validez de la mirada (pérdidas, su rampa,
   rango) se aplica siempre, con o sin ubicación. La ausencia de metadatos nunca se interpreta ni se guarda como
   pantalla completa.
9. Los valores crudos `gx` y `gy` se conservan intactos en el Parquet para poder auditarlos; las columnas
   derivadas se añaden al lado.

## 1. Datos de la adquisición

### 1.1 Forma

Cada estímulo seleccionado se identifica por su ruta única dentro del archivo (`source_entry_path`), no por su
nombre visible.

```json
{
  "source_entry_path": "Images/centered-square.png",
  "placement": {
    "geometry_stability": "static",
    "contract_version": "screen-stimulus-v1",
    "screen_width_px": 1920,
    "screen_height_px": 1080,
    "stimulus_left_px": 420.0,
    "stimulus_top_px": 0.0,
    "stimulus_width_px": 1080.0,
    "stimulus_height_px": 1080.0,
    "display_mode": "contain",
    "viewport": {
      "left_px": 0.0, "top_px": 0.0, "width_px": 1920.0, "height_px": 1080.0,
      "scroll_x_px": 0.0, "scroll_y_px": 0.0
    }
  }
}
```

### 1.2 Campos

| Campo | Tipo | Obligatorio | Significado |
| --- | --- | --- | --- |
| `geometry_stability` | enum | sí | `static` se acepta; `time_varying` se rechaza antes de procesar con `dynamic_stimulus_geometry_not_supported`. |
| `contract_version` | literal | sí | Debe ser `screen-stimulus-v1`. |
| `screen_width_px`, `screen_height_px` | entero positivo | sí | Tamaño del espacio de coordenadas de la mirada del eye tracker. |
| `stimulus_left_px`, `stimulus_top_px` | número finito | sí | Esquina superior izquierda efectiva del estímulo completo en pantalla. Puede ser negativa. |
| `stimulus_width_px`, `stimulus_height_px` | número finito positivo | sí | Tamaño mostrado completo, antes de recortar por el viewport. |
| `display_mode` | enum | sí | `contain`, `cover`, `crop` o `fullscreen`. |
| `viewport` | objeto o nulo | condicional | Rectángulo visible en pantalla y scroll constante. Si falta, la pantalla entera es el recorte. |
| `viewport.left_px`, `top_px`, `width_px`, `height_px` | número finito (tamaño positivo) | con viewport | Rectángulo visible. Los cuatro van juntos. |
| `viewport.scroll_x_px`, `scroll_y_px` | número finito no negativo | par opcional | Scroll constante. Se omiten juntos (valen cero) o se dan los dos. |
| `source` | enum | solo al guardar | `user_config` o `acquisition_metadata`. Lo asigna el backend; un cliente no puede declararse fuente de adquisición. |

`stimulus_left_px` y `stimulus_top_px` ya son el origen efectivo **después** del scroll; el scroll se guarda para
la procedencia y no se resta otra vez:

```text
stimulus_left_px = origen_sin_scroll_x - scroll_x_px
stimulus_top_px  = origen_sin_scroll_y - scroll_y_px
```

La unidad cruda del eye tracker es un metadato del bloque, no de la ubicación: antes de aplicar el contrato, la
ingesta la resuelve como `pixels`, `percent` o `normalized` y guarda esa decisión. La unidad declarada prevalece
sobre la inferida.

### 1.3 Modos y validación

El rectángulo guardado es siempre el que usa la ecuación.

| Modo | Significado | Validación |
| --- | --- | --- |
| `contain` | El estímulo entero se ve dentro del viewport o la pantalla; puede quedar con bandas. | El rectángulo cabe en el recorte. Necesita las dimensiones intrínsecas y conserva su proporción dentro de la tolerancia. |
| `cover` | El estímulo, con su proporción, cubre el viewport y lo que sobra se recorta. | Necesita viewport y dimensiones intrínsecas; el rectángulo cubre el viewport y conserva la proporción. Se admite origen negativo. |
| `crop` | Se ve una parte explícita del estímulo a través de un viewport. | Necesita viewport con intersección positiva. Se guarda el rectángulo completo, no solo la parte visible. |
| `fullscreen` | El contenido del estímulo ocupa la pantalla entera (no basta con que la aplicación de presentación estuviera a pantalla completa). | Se elige explícitamente y resuelve a `(0, 0, ancho_pantalla, alto_pantalla)` sin scroll. Nunca se infiere. |

Reglas comunes:

- Los campos obligatorios son atómicos: una ubicación parcial es un error de la solicitud, no un paso heredado.
- Todo número es finito; los tamaños de pantalla y del estímulo, positivos.
- El viewport está dentro de la pantalla y el rectángulo mostrado la intersecta (y al viewport, si lo hay).
- En `contain` y `cover` se necesitan las dimensiones intrínsecas sondeadas; sin ellas la entrada se rechaza con
  `422 intrinsic_dimensions_required_for_display_mode`. La proporción se conserva cuando
  `abs((ancho_mostrado / alto_mostrado) / (ancho_intrínseco / alto_intrínseco) - 1) <= 1e-4`.
- Si además llega la `ScreenGeometry` física, sus píxeles deben coincidir exactamente con los de la ubicación.
  La ubicación sola no activa la detección angular: para eso siguen haciendo falta los milímetros y la distancia.
- Se rechazan antes de procesar las rutas duplicadas, las que no están entre los medios seleccionados, las
  versiones desconocidas y las coincidencias ambiguas entre escenario y medio.

### 1.4 Huella

`contract_fingerprint` es reproducible: se valida la ubicación y se materializan los valores por defecto
(viewport ausente = pantalla completa; scroll ausente = `(0,0)`), se serializa con JSON Canonicalization Scheme
(RFC 8785) sin `source_entry_path`, y se calcula el SHA-256 en hexadecimal. El orden de las claves, los valores
por defecto equivalentes o `420` frente a `420.0` no cambian la huella; cualquier operando, modo, versión o fuente
distinta sí. Solo el backend calcula la huella.

### 1.5 Límite estático

Una ubicación v1 vale para todo el escenario: imágenes estáticas, vídeos cuya caja no se mueve y páginas
capturadas con un scroll constante. Si la ubicación, el viewport, el scroll, el zoom o la posición cambian durante
una grabación, v1 no basta: la solicitud se rechaza antes de procesar el CSV con
`422 dynamic_stimulus_geometry_not_supported`, sin caer al paso heredado ni promediar la geometría. Admitirlo
exigiría una versión nueva del contrato.

## 2. Ecuaciones y validez

### 2.1 Mirada cruda a píxeles de pantalla

```text
pixels:     x_pantalla = gx                         y_pantalla = gy
percent:    x_pantalla = (gx / 100) * screen_width  y_pantalla = (gy / 100) * screen_height
normalized: x_pantalla = gx * screen_width          y_pantalla = gy * screen_height
```

La heurística de pérdida de seguimiento `(0,0)` se evalúa sobre el par crudo, antes de la transformación: un
punto legítimo en la esquina del estímulo se transforma en `(0,0)` local y no por eso se descarta.

### 2.2 Pantalla a estímulo

```text
x_estimulo = (x_pantalla - stimulus_left_px) / stimulus_width_px
y_estimulo = (y_pantalla - stimulus_top_px)  / stimulus_height_px
```

El resultado es una fracción del estímulo completo con origen arriba a la izquierda; `0` y `1` son bordes válidos.

### 2.3 Validez

```text
en_viewport   = punto dentro del viewport (o de la pantalla, si no hay viewport)
en_estimulo   = 0 <= x_estimulo <= 1  y  0 <= y_estimulo <= 1
valido        = par crudo válido y tiempo válido y dentro de la pantalla y en_viewport y en_estimulo
```

- Los valores fuera de `[0,1]` pueden guardarse en las columnas de auditoría, pero no valen para ninguna
  analítica. Ninguna transformación, limpieza, fijación, AOI, recorrido, mapa de calor, informe ni gráfica del
  navegador recorta una coordenada inválida al borde.
- Un punto dentro de `[0,1]` pero fuera del viewport tampoco vale: ese contenido no se veía.
- Se guarda un único motivo principal, con esta precedencia: `signal_missing`, `time_invalid`, `outside_screen`,
  `outside_viewport`, `outside_stimulus`. Después de detectar fijaciones, una fila que seguía válida a menos de dos
  periodos nativos de una `signal_missing` pasa a `signal_transition` (la rampa del exportador hacia `(0,0)`).

`rejected_outside_count` cuenta las filas únicas cuyo par y tiempo eran válidos pero cuyo motivo es uno de los
tres «fuera de»; `rejected_outside_by_reason` los desglosa y suma lo mismo. Ambos son `null` si no hay ubicación,
porque entonces el rechazo no es medible.

## 3. Relación con la detección de fijaciones

```text
gx/gy crudos (intactos)
  → unidad resuelta → píxeles de pantalla
  → transformación al estímulo + validez de viewport y estímulo
  → elegibilidad y segmentación de fijaciones
  → clasificación en espacio de pantalla
  → centroide del evento en espacio del estímulo
  → AOI / recorrido / mapa de calor / informe
```

1. Cada muestra se transforma y obtiene su validez antes del remuestreo y la clasificación, para que la mirada
   sobre las bandas o la parte recortada no sostenga ninguna fijación.
2. `outside_screen`, `outside_viewport` y `outside_stimulus` son cortes duros; solo los huecos de pérdida de
   seguimiento elegibles pueden usar el puente acotado del detector.
3. La clasificación I-DT normalizada usa coordenadas de pantalla y la I-VT angular usa la geometría física: escalar
   un estímulo de 1080 px a `[0,1]` no cambia el umbral fisiológico frente al mismo movimiento en una pantalla de
   1920 px.
4. El centroide mediano de cada evento se calcula con sus muestras locales válidas, así que `fix_x`, `fix_y`,
   `x_norm` y `y_norm` están en el espacio del estímulo.
5. Un evento no cruza un intervalo fuera del estímulo ni un cambio de escenario. Las filas fuera del estímulo no
   reciben `fixation_id`, impacto en AOI, nodo de recorrido, tiempo de permanencia ni peso en el mapa de calor.

El detector recibe por separado `ScreenPixelSize` (del contrato, basta para canonizar la mirada) y la calibración
física opcional `PhysicalScreenGeometry` (solo para la clasificación angular); si llegan ambas, sus píxeles deben
coincidir.

## 4. Persistencia

### 4.1 SQL

Tabla `stimulus_placements`, uno a uno con `scenaries` (`ON DELETE CASCADE`); la ausencia de fila significa que
no hay ubicación. Guarda la versión, `geometry_stability`, la pantalla, el rectángulo del estímulo, el modo, el
viewport y el scroll (todos o ninguno), la fuente y la huella. Las restricciones de la base de datos aseguran
enumerados, tamaños positivos y la integridad del viewport; las invariantes geométricas de cada modo las valida
la aplicación.

`Scenaries.width` y `height` siguen siendo las dimensiones intrínsecas del medio. Una vez generados los Parquet
no se admite corregir solo la geometría: la corrección exige reprocesar desde la mirada cruda, lo que solo es
posible si se conserva o se vuelve a subir el ZIP original.

### 4.2 Parquet

Los archivos procesados son el registro autoritativo de la transformación. Se añaden columnas sin cambiar el
número ni el orden de las filas:

| Columna | Significado |
| --- | --- |
| `gx`, `gy` | Valores crudos, intactos. |
| `gaze_input_unit_resolved` | `pixels`, `percent` o `normalized`. |
| `gaze_x_screen_px`, `gaze_y_screen_px` | Píxeles de pantalla canónicos. |
| `gaze_x_stimulus_norm`, `gaze_y_stimulus_norm` | Resultado sin recortar de la ecuación; puede salir de `[0,1]`. |
| `is_in_viewport`, `is_in_stimulus` | Máscaras espaciales. |
| `gaze_invalid_reason` | Nulo si la fila es válida; si no, el motivo. |
| `is_valid_gaze` | Elegibilidad combinada para la analítica; el detector usa la misma sin `signal_transition`. |
| `gaze_x_clean`, `gaze_y_clean` | Mirada limpia en porcentaje del estímulo (de la pantalla sin ubicación); `NaN` en los huecos. |
| `stimulus_transform_status` | `applied` o `legacy_passthrough_missing`. |
| `stimulus_transform_version`, `stimulus_transform_fingerprint` | Versión y huella cuando se aplicó. |
| `screen_width_px`, `screen_height_px` | Tamaño de pantalla usado para normalizar. |
| `stimulus_display_width_px`, `stimulus_display_height_px` | Tamaño mostrado, para las distancias en píxeles; nulo en el paso heredado. |
| `fix_x`, `fix_y` | Fijación en porcentaje, local al estímulo si se aplicó; las filas inválidas llevan el centinela `(-100,-100)`. |
| `fixation_coordinate_space` | `stimulus_percent` o `legacy_screen_percent`. |

El contrato completo se guarda una vez, no por fila: el Parquet de usuario y su `ProjectFile.file_metadata`
llevan `stimulus_placements_by_scenario`; cada Parquet de escenario, un `stimulus_placement`; y lo mismo va en los
metadatos clave-valor del Parquet. Así, un cambio posterior en SQL no altera la interpretación de un archivo ya
procesado.

## 5. API

### 5.1 Subida y configuración

`POST /projects/{project_id}/files/experiment-zip` acepta el campo multipart
`stimulus_placements_json` (lista de `{source_entry_path, placement}`), independiente de los campos de la
calibración física. Debe llegar antes de procesar el CSV; las entradas mal formadas o parciales son `422`.

Las respuestas de escenario y de detalle del proyecto incluyen `stimulus_placement`. En `ScenariosRequest`, el
campo distingue omisión de `null`: en un proyecto sin procesar, un objeto crea o reemplaza, `null` borra y la
omisión conserva la ubicación solo si el medio es el mismo. Con Parquet ya generados, cambiar el medio o la
ubicación responde `409 stimulus_placement_requires_reprocessing`.

### 5.2 Procedencia en la analítica

Las respuestas de fijaciones, recorrido, histograma, AOI y mirada llevan:

```json
{
  "coordinate_transform": {
    "status": "applied",
    "applied": true,
    "contract_version": "screen-stimulus-v1",
    "source_space": "screen_px",
    "output_space": "stimulus_normalized",
    "contract_fingerprint": "<sha256>",
    "rejected_outside_count": 3,
    "rejected_outside_by_reason": {"outside_screen": 0, "outside_viewport": 1, "outside_stimulus": 2},
    "warning_codes": []
  }
}
```

Con `scenario=all` y escenarios con transformaciones distintas, `status` es `mixed`, los agregados son `null` y
`scenario_transforms` da la procedencia de cada escenario. El PNG del mapa de calor la lleva en las cabeceras
`X-Stimulus-Transform-Status`, `-Coordinate-Space`, `-Version`, `-Fingerprint` y `-Warnings`, idénticas con y sin
caché.

### 5.3 Regla para los consumidores

Con `status=applied`, todo lo que mira al estímulo usa `gaze_*_stimulus_norm` o los eventos locales; `gx`/`gy`
quedan solo para auditoría. La mirada por muestra (serie, punto, AOI, correlaciones, informe) lee `gaze_*_clean`
y nunca vuelve a limpiar; un hueco llega al navegador como `null`. La distancia del recorrido (`total_distance_px`) se mide en píxeles de la adquisición
y dentro de cada segmento del detector:

```text
distancia_px = Σ sqrt( ((cx[i] - cx[i-1]) * stimulus_width_px)^2 + ((cy[i] - cy[i-1]) * stimulus_height_px)^2 )
```

El paso heredado conserva el cálculo de referencia de `1920 × 1080` y lo declara en la procedencia.

## 6. Compatibilidad

Un Parquet antiguo, o un escenario subido sin ubicación, usa el paso heredado:

```json
{
  "coordinate_transform": {
    "status": "legacy_passthrough_missing", "applied": false, "contract_version": null,
    "source_space": "legacy_screen", "output_space": "legacy_screen_normalized",
    "contract_fingerprint": null, "rejected_outside_count": null, "rejected_outside_by_reason": null,
    "warning_codes": ["stimulus_placement_missing"]
  }
}
```

No se marca como pantalla completa, no se reescriben Parquet históricos y no se retransforman al leerlos con una
geometría configurada después. Un Parquet anterior a `gaze_x_clean`/`gaze_y_clean` no tiene mirada por muestra:
no hay cálculo de respaldo y la tarjeta del proyecto pide «Actualizar proyecto» (archivos sin
`block_metadata.gaze_clean_version` vigente). Solo reprocesar desde el origen crudo convierte
datos antiguos al espacio del estímulo. Una ubicación parcial, inválida o contradictoria es un error, nunca un
paso heredado silencioso.

## 7. Ejemplos numéricos

**Cuadrado centrado con bandas laterales** (pantalla 1920 × 1080; estímulo en 420, 0, 1080 × 1080; `contain`):
el punto `(480, 540)` da `((480 − 420) / 1080, 540 / 1080) = (0,0556; 0,5)`. El punto `(300, 540)`, sobre la
banda, da `x = −0,1111`: es inválido y se guarda así, sin recortarlo a cero.

**Recorte a través de un viewport desplazado** (estímulo completo 0, 0, 1920 × 1080; viewport 420, 0,
1080 × 1080; `crop`): `(420, 540)` → `(0,21875; 0,5)` y `(960, 540)` → `(0,5; 0,5)`. `(200, 540)` → `(0,104; 0,5)`
está dentro del estímulo pero fuera del viewport, así que es inválido.

**Cubrir con origen negativo** (estímulo 1600 × 1200 escalado 1,2 sobre 1920 × 1080; rectángulo 0, −180,
1920 × 1440; `cover`): `(960, 0)` → `(0,5; 0,125)`, `(960, 540)` → `(0,5; 0,5)`, `(960, 1080)` → `(0,5; 0,875)`.

**Estímulo desplazado** (rectángulo 160, 90, 1280 × 720): `(800, 450)` → `(0,5; 0,5)`; `(100, 450)` →
`(−0,047; 0,5)`, inválido.

**Scroll constante** (viewport 200, 100, 1000 × 700; origen sin scroll 250, 100; scroll 0, 300; origen efectivo
guardado 250, −200; tamaño mostrado 1000 × 2000): `(750, 150)` → `(0,5; 0,175)`. Restar el scroll otra vez daría
`0,325`, y está prohibido.

## Límites del contrato

Reglas que cualquier cambio posterior debe seguir cumpliendo: una ubicación ausente no se reinterpreta como
pantalla completa, los valores crudos `gx`/`gy` no se sobrescriben, una mirada fuera de rango no se recorta al
borde, la cinemática angular no se calcula en coordenadas estiradas al estímulo, y el modelo estático v1 no
declara soporte para scroll variable en el tiempo.

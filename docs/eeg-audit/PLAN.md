# EEG: plan de mejoras verificado

Estado: **implementado el 2026-09-21**, excepto lo que se indica abajo. Fecha de
verificación de las cifras: 2026-09-21. El registro del trabajo está en
[docs/CHANGELOG.md](../CHANGELOG.md).

## Estado por tarea

| Tarea | Estado |
|---|---|
| T1, T2, T3, T5, T6, T7, T8, T9, T11, T12, T13, T14 | hecho |
| T0 | hecho y **revertido por el dueño el 2026-09-24**: los avisos cierran la pestaña (ver T0) |
| T4 | hecho con la variante que pidió el dueño: los canales cortos se informan **incompletos** |
| T10 | **medido**, sin código: el cambio que justifica toca el snapshot protegido de `/correlations` |

Dos cifras del plan cambiaron al implementarlo, y el plan no puede haberlas previsto:

1. **T3 marca 4 ventanas en el bloque 5 F3, no 3.** Las 3 (y los 3.264,4 µV²) reproducen
   exactamente si sólo se considera el detector de amplitud; la cuarta viene del test de
   pico a pico que T1 añade, y que también es un `artifact_span`. Con exclusión: 51
   ventanas, 3.252,2 µV², delta 1.626,3. La conclusión (inflación de 63×) no cambia.
2. **El tramo de T2 va de 120,38 a 125,25 s**, no 120,4–121,4. El valor del plan se midió
   con un corte de 2.000 µV; el detector especificado es z > 10. El inicio (120,38 s) y el
   pico (9.640,0 µV) coinciden.

Además, `quantization_step_uV` **no existía** en `metadata.channels` como T8 daba por
supuesto; se añadió (bloque 5 F3 = 10,00 µV; bloque 4 P4 = 0,04 µV).

**T10 — resultado.** Bloque 5 de SAIO, escenario «Video instagram», 341 bins de 250 ms: el
artefacto de 4,87 s ocupa 21 bins (5,7 %), que llegan a **+37,3 dB** sobre el bin mediano, y
mueve los coeficientes de Pearson hasta **0,19**: `distance_cm` pasa de −0,164 a +0,028
(cambia de signo) y `gsr_smoothed_us` de +0,043 a +0,220 (una correlación moderada queda
oculta). El dB **no** lo absorbe: un bin de 0,25 s está contaminado o no lo está, no hay nada
que lo promedie. El cambio (contar y poder excluir esos bins) altera la respuesta de
`/correlations`, que es un snapshot protegido, así que espera al dueño igual que T4.

Este plan parte de una propuesta de 14 puntos que fue **auditada contra el código y
reproducida contra los datos de referencia**. Las cifras de abajo están medidas, no
estimadas: úsalas directamente como valores esperados en los tests. No vuelvas a
derivarlas.

Contexto previo obligatorio: [FINDINGS.md](FINDINGS.md) (auditoría científica) y
[METHODS.md](METHODS.md) (contrato de muestreo y validez).

---

## Reglas que no se negocian

Del `CLAUDE.md` del proyecto y de `docs/CHANGELOG.md` §"Rules that outlived the campaigns":

- Ejecuta `./verify.ps1` desde la raíz después de cada tanda de cambios.
- Usa el `.venv/Scripts/python.exe` de la **raíz**. `backend/.venv` está incompleto.
- Pytest del backend: `cd backend; ../.venv/Scripts/python.exe -m pytest`.
- **Nunca regeneres un golden para poner un test en verde.** Si un snapshot se pone
  rojo, es una señal de diseño, no un obstáculo. Para el trabajo de abajo, ningún
  cambio debería tocar un snapshot existente; si lo hace, para y reporta.
- Syrupy 4.6.1 no tiene `--snapshot-update-new-only`. Nada de flags de update.
- Diffs históricos con `--ignore-cr-at-eol`; commit de normalización `d35ca73`.
- Varios agentes comparten el checkout: **stagea solo tus archivos asignados**, nunca
  hagas reset de lo de otro.
- Añade el trabajo terminado a `docs/CHANGELOG.md`.

**Política científica heredada, no la rompas:** nada de limpiar en silencio. Todo
filtro, rechazo o re-referenciado va explícito, apagado por defecto y registrado en
`metadata`. `artifact_correction: "none"` y `reference: "as_exported"` siguen siendo
la verdad por defecto ([eeg_signal.py:174-175](../../backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py#L174-L175)).

---

## Cómo reproducir la evidencia

Los datos están en `docs/RefererenceExperiments/`. El fichero SAIO es UTF-16 con
6 bloques. Patrón de carga (el mismo que usa `backend/scripts/audit_eeg_references.py`):

```python
import runpy, sys
from pathlib import Path
BACKEND = Path("backend"); sys.path.insert(0, str((BACKEND / "src").resolve()))
runpy.run_path(str(BACKEND / "tests/conftest.py"))
from neurodatics.modules.projects.application.services.csv_processing_service import (
    CsvProcessingService as CSV)

path = Path("docs/RefererenceExperiments/SAIO 3 - GSR - EEG - EYE TRACKER - Copy/"
            "SAIO 3 EYT-EEG-GSR alta.csv")
text, _ = CSV._decode_bytes(path.read_bytes())
lines = text.splitlines()
spec = CSV._find_block_specs(lines)[4]          # índice 4 == bloque 5
delimiter, _ = CSV._header_cells(lines[spec.header_index])
raw = CSV._build_dataframe_with_info(lines[spec.header_index:spec.block_end], delimiter).dataframe
channels, _, _ = CSV._parse_metadata(spec.metadata_lines, rename_vendor_fixations=True)
frame, units, _ = CSV._normalize_declared_units(raw, channels)
```

**Trampa medida:** los bloques SAIO tienen entre 1.204 y 1.376 filas EEG ausentes en
los **bordes**. El bloque 5 tiene 1.022 filas iniciales sin EEG. Si inyectas un hueco
de prueba en índices bajos caerás dentro de esa zona y el canal saldrá excluido en vez
de degradado. Localiza primero el rango válido:
`fin = np.flatnonzero(np.isfinite(frame["p4"].to_numpy(float)))` → válido en 1022..38347.

**No subas, reescribas ni commitees grabaciones.** Solo agregados anónimos.

---

## Evidencia medida

Bloque 5 de SAIO, fs = 300,332068 Hz, 38.542 filas, 128,33 s.

### Detector de artefactos actual ([eeg_signal.py:124-128](../../backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py#L124-L128))

| Bloque | Canal | Umbral (µV) | Paso máx | Detectados | z robusto máx | Rango (µV) |
|---|---|---:|---:|---:|---:|---|
| 5 | f3 | 593,0 | 450,0 | **0** | **94,9** | −970 … 9.640 |
| 5 | le | 775,7 | 70,0 | 0 | 2,1 | 639,8 … 1.304,5 |
| 5 | c4 | 280,8 | 104,0 | 0 | 3,1 | −1.576,9 … −652,1 |
| 3 | f4 | 2.524,4 | 309,9 | 0 | **12,2** | −773,8 … 1.623,1 |
| 3 | c3 | 397,9 | 713,2 | **13** | 3,7 | −557,9 … 916,5 |
| 3 | c4 | 2.025,8 | 750,5 | 0 | 6,0 | −643,3 … 1.010,7 |
| 4 | p4 | **6.825,0** | 556,9 | 0 | 3,8 | −929,1 … 1.853,3 |
| 6 | f4 | 393,2 | 59,0 | 0 | 7,8 | −760,7 … 118,0 |

Sobre los 42 pares canal/bloque de SAIO, los umbrales van de **100,0** (el piso, 5
canales del bloque 2) a **6.825,0**. El máximo z en canales limpios es **7,8**.

### Potencia contaminada (bloque 5, F3, excluyendo 119–126 s)

| Métrica | Con artefacto | Sin | Inflación |
|---|---:|---:|---:|
| Potencia total (µV²) | 207.384,4 | 3.264,4 | **63,5×** |
| Delta (µV²) | 138.625,7 | 1.616,3 | **85,8×** |
| Ventanas Welch válidas | 55 | 52 | — |

**Solo 3 de 55 ventanas contaminadas producen 64× de inflación.** Es el argumento más
fuerte del plan.

### Acoplamiento de nperseg ([eeg_analytics_service.py:209-212](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L209-L212))

Un canal (p4) limitado a un tramo válido de 400 muestras dentro de la zona válida:

| | Base | Degradado |
|---|---:|---:|
| nperseg | 1024 | 400 |
| Resolución | 0,2933 Hz | 0,7508 Hz |
| Bins de frecuencia | 513 | 201 |

Efecto sobre la potencia total **de los demás canales**: le −11,8 %, f4 −15,5 %,
c4 −14,6 %, p3 −23,5 %, c3 −9,6 %, **f3 −47,4 %**. El alfa de p4 se mueve −29,7 %
solo por resolución, con datos idénticos.

### Diezmado ([numeric_helpers.py:52-56](../../backend/src/neurodatics/modules/analytics/application/services/numeric_helpers.py#L52-L56))

38.542 filas → 5.000 puntos = 1 de cada 7,71.

| Caso | Pico real | Mostrado | Con envolvente min/max |
|---|---:|---:|---:|
| b5 f3 (artefacto de 1,01 s, 247 muestras) | 9.640,0 | 9.540,0 (−1 %) | 9.640,0 |
| b3 c3 (pico de **1 muestra**, idx 11132) | 916,5 | **806,3** | 916,5 |
| b3 c4 (pico de 1 muestra, idx 10779) | 1.010,7 | **966,0** | 1.010,7 |

### Cuantización (bloque 5)

f3 = **10,00 µV** exactos, **12,41 %** de muestras repetidas. Los otros seis canales:
0,01 µV. Bloque 4 p4: 0,04 µV (sin corrección kilo).

---

## Decisiones ya tomadas — no las revisites

Tres recomendaciones de la propuesta original fueron **medidas y descartadas**. No las
reintroduzcas «de paso»:

1. **«Calcular el MAD sobre pasos no nulos».** Es un no-op medido: f3 593,0 → 593,0;
   le 775,7 → 776,0. Solo el 12,41 % de los pasos son cero, insuficiente para mover la
   mediana. Y el razonamiento estaba invertido: excluir ceros **sube** el umbral. Lo que
   lo relaja es que la cuantización gruesa redondea pasos pequeños a ±10 e **infla** el
   MAD.
2. **k = 8 para el z de amplitud.** Demasiado justo: el máximo en canales limpios es 7,8.
   **Usa k = 10.** Con k=10 disparan exactamente los dos eventos reales (b5 f3 z=94,9;
   b3 f4 z=12,2) y ningún canal limpio.
3. **«El reescalado ×1000 infló el umbral» como causa raíz.** Es demasiado estrecho. El
   bloque 4 p4 tiene cuantización 0,04 µV, **sin** corrección kilo, umbral 6.825 µV, y su
   transitorio de 556,9 µV documentado en FINDINGS.md pasa sin marcar. La causa real es
   que `20 × 1.4826 × MAD` no tiene techo.

---

## Tareas

Orden de ejecución: **T0 → T1 → T2 → T3 → T4**. Las demás son independientes entre sí.
Cada tarea termina con `./verify.ps1` en verde antes de pasar a la siguiente.

---

### T0 — Subir el panel de calidad

**Por qué primero:** cuesta una línea, y es el marco interpretativo de todo lo demás.
Hoy se renderizan **4 avisos** para este participante —incluido «Escala kilo corregida
por 1000…»— debajo de las cuatro vistas, fuera de pantalla.

**Archivo:** [EegTab.tsx:548](../../frontend/features/analytics/components/EegTab.tsx#L548)

Mueve el bloque `currentData?.metadata?.warnings?.length ? …` desde el final del JSX a
justo antes de la primera vista. No cambies su contenido ni su `role="status"`.

**Aceptación:** el aviso de kilo es visible sin hacer scroll al abrir la pestaña EEG con
el bloque 5 de SAIO. Los tests de hooks/componentes en Chromium siguen verdes.

> **Superado el 2026-09-24, por decisión del dueño.** Los avisos arriba de la pestaña le
> resultaban congestión visual. Ahora cierran la pestaña en la tarjeta «Calidad y alcance de
> EEG», junto con las salvedades de unidades y «Volver a ingerir». Cada vista muestra, junto a
> su gráfica, una ficha «N avisos de calidad» que resume los primeros al pasar el cursor y
> lleva a esa tarjeta. **No vuelvas a subirlos.** Nueva aceptación: la ficha aparece junto a la
> gráfica y el aviso de kilo se lee en su tooltip y en la tarjeta final.

---

### T1 — Detector de artefactos: amplitud + techo al umbral de escalón

**Archivo:** [eeg_signal.py:114-141](../../backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py#L114-L141)

Tres cambios en el bucle `for channel in channels:`:

1. **Conserva el detector de escalón.** Es el único que captura el bloque 3 c3 (13
   detecciones, paso 713,2 µV), donde el de amplitud falla (z=3,7). No lo sustituyas.
2. **Pon techo al umbral de escalón.** Hoy `max(100.0, 20 * 1.4826 * step_mad)` no tiene
   cota superior y llega a 6.825 µV. Acótalo por arriba a un valor fisiológicamente
   defendible y **documenta el número en `metadata`**, no lo dejes como literal mudo.
3. **Añade el test de amplitud robusta** por canal, sobre los valores finitos:
   `z = |x − mediana(x)| / (1.4826 · MAD(x))`, con **k = 10**.

Además, añade una prueba de pico-a-pico en ventana deslizante para excursiones lentas que
ni el escalón ni el z puntual capturan bien.

**Campos nuevos en `quality[channel]`** (additivos; `transient_candidates` y
`transient_step_threshold_uV_assumed` **se conservan** — no tienen consumidores fuera de
este archivo, verificado, así que puedes añadir sin romper nada):

- `amplitude_outlier_samples: int`
- `amplitude_z_max: float`
- `amplitude_z_threshold: float` (= 10)
- `step_threshold_ceiling_uV_assumed: float`

Añade un aviso nuevo en `warnings` cuando `amplitude_outlier_samples > 0`, con el mismo
tono que los existentes: describe, no limpia.

**Tests de regresión** (`backend/tests/unit/test_eeg_scientific_contract.py`), con estos
valores exactos:

- Una señal sintética con una excursión de z≈95 → `amplitude_outlier_samples > 0` y
  `transient_candidates == 0`. Es el caso b5 f3.
- Una señal sintética con un escalón de una muestra tipo b3 c3 → `transient_candidates > 0`.
  Cubre la complementariedad: ninguno de los dos detectores solo cubre el conjunto.
- Ningún canal con z máximo ≤ 7,8 debe marcarse. Es el margen medido frente a falsos
  positivos.

**Aceptación:** sobre los 42 pares canal/bloque de SAIO, el detector de amplitud marca
**exactamente dos**: b5 f3 y b3 f4. Cero en el resto.

---

### T2 — Devolver los tramos, no un contador

**Archivos:** `eeg_signal.py` (producción), `EegTimeseriesView.tsx` (consumo).

Hoy `transient_candidates` es un entero sin ubicación: dice que hay algo, no dónde.

Añade a `metadata` un `artifact_spans` por canal:

```
[{"channel": str, "start_s": float, "end_s": float, "peak_uV": float,
  "z": float, "detector": "amplitude" | "step"}]
```

`detector` distingue cuál de los dos lo encontró — importa, porque cubren casos distintos.

Usa el helper `runs(mask)` que ya existe en [eeg_signal.py:24](../../backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py#L24) para convertir la
máscara en intervalos; no escribas otro.

En el frontend, sombrea esos tramos en la gráfica temporal (`ReferenceArea` de Recharts)
y permite saltar al instante. `EegMetadata` tiene índice `[key: string]: unknown`
([types.ts:136-140](../../frontend/features/analytics/types.ts#L136-L140)), así que añade el
campo tipado para lo que consumas.

**Valor esperado para el test:** b5 f3 produce un tramo en torno a 120,4–121,4 s
(índices 36157..36459, 247 muestras sobre 2.000 µV, 1,01 s), con `peak_uV` = 9.640,0.

---

### T3 — Marcar las ventanas espectrales contaminadas

**Archivo:** [eeg_analytics_service.py:236-254](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L236-L254) (`compute_psd`)

Reporta por canal en `metadata`: `windows_total` y `windows_flagged`.

**Define el criterio explícitamente en el docstring y en `metadata`**, o los conteos no
cuadrarán: con solapamiento Welch del 50 % (`noverlap=size // 2`), **una sola muestra de
artefacto contamina dos ventanas**. Decide si `flagged` significa «solapa un
`artifact_span`» o «lo contiene», escríbelo, y haz que el test lo fije.

Añade un parámetro **opt-in, apagado por defecto** para excluir las ventanas marcadas.
Por defecto el número reportado sigue siendo el contaminado: la política del proyecto es
no limpiar en silencio. Registra en `metadata` si se aplicó.

**Test con valores medidos** (bloque 5, f3, `use_db=False`):

| | Incluyendo | Excluyendo |
|---|---:|---:|
| `total_power` | 207.384,4 | 3.264,4 |
| `band_power.delta` | 138.625,7 | 1.616,3 |
| ventanas | 55 | 52 |

Tolerancia: `rtol=1e-6` reproduce exacto.

---

### T4 — nperseg: quitar el acoplamiento **sin romper el contrato**

> **Esta tarea necesita el visto bueno del dueño antes de escribir código.** Cambia qué
> canales se reportan como disponibles. No la empieces sin confirmación.

**El problema** ([línea 212](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L212)):
`size = int(min(1024, min(longest[c] for c in usable)))` — el peor canal fija la ventana
de todos. Medido: un canal degradado mueve la potencia total de los demás entre −9,6 % y
−47,4 %.

**Por qué «nperseg por canal» NO es la solución obvia.** Verificado:

- `EegPsdResponse.frequency` es `List[float]`, un array **compartido**
  ([schemas.py:151](../../backend/src/neurodatics/modules/analytics/api/schemas.py#L151)).
- `output["frequency"]` se asigna **dentro** del bucle por canal
  ([línea 278](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L278)).
  Hoy es inocuo porque todos comparten rejilla; con nperseg por canal quedaría la del
  último canal iterado y el frontend graficaría los siete contra ese eje
  (`dataKey="frequency"` en `EegPsdView.tsx:186`).
- Exigiría cambio de schema, rework del PSD view y tocar snapshots de contrato HTTP
  **protegidos** (`backend/tests/characterization/test_analytics_http_contracts.py`).
- Las bandas dejarían de ser comparables entre canales: el alfa de p4 se mueve −29,7 %
  solo por resolución.

**Solución recomendada — mismo beneficio, sin romper contrato:**

Que los canales cortos no fijen el nperseg global. Sube la puerta
`usable = [c for c in selected if longest[c] >= 8]`
([línea 209](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L209))
a exigir la ventana completa, calcula `size` solo con los canales que califican, y
**reporta el canal corto como no disponible** con su razón en `metadata`, en vez de
degradar a los siete. Una sola rejilla de frecuencia, contaminación cruzada eliminada.

Reporta igualmente `nperseg` y `frequency_resolution_hz` por canal en `metadata` aunque
hoy coincidan: es información honesta y no cuesta nada.

**Ojo con el test existente:** `test_short_runs_do_not_become_a_long_recording`
([test_eeg_scientific_contract.py:57](../../backend/tests/unit/test_eeg_scientific_contract.py#L57))
fija que un canal troceado devuelve `frequency == []`. Ese contrato debe seguir en pie.

**Aceptación:** con p4 limitado a 400 muestras, la potencia total de los otros seis
canales no cambia respecto a la base (`rtol=1e-9`), y p4 sale listado como no disponible
con motivo.

---

### T5 — Dominio Y robusto con marcas de recorte

**Archivo:** [EegTimeseriesView.tsx:265](../../frontend/features/analytics/components/eeg/EegTimeseriesView.tsx#L265)

El `<YAxis>` no tiene `domain`, así que Recharts auto-escala: una muestra estira el rango
y aplana los otros seis canales. Con b5 f3 el eje llega a 9.640 µV mientras los demás
canales viven en ±1.500.

Dominio por percentil 0,5–99,5, un indicador visible donde se recorta, y el **valor real
en el tooltip**. Recortar la vista nunca debe recortar el dato.

---

### T6 — Diezmado por envolvente min/max

**Archivo:** [numeric_helpers.py:52-56](../../backend/src/neurodatics/modules/analytics/application/services/numeric_helpers.py#L52-L56)

`_decimation_indices` usa `linspace`: 1 de cada 7,71 muestras. Dos puntos por cubo
(mínimo y máximo) conservan todos los extremos con el mismo presupuesto.

**Dónde paga de verdad — la propuesta original se equivocaba de ejemplo.** En b5 f3 el
artefacto dura 1,01 s y linspace pierde solo el 1 % del pico: la envolvente casi no
aporta. El caso real son los picos de **una sola muestra**: b3 c3 se pierde **entero**
(mostrado 806,3 frente a 916,5 real) y b3 c4 igual (966,0 frente a 1.010,7).

**Cuidado:** `compute_timeseries` usa `indices` para tres cosas —el eje de tiempo, el
corte de líneas por huecos ([líneas 166-174](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L166-L174))
y los valores— y `_decimation_indices` lo comparten también PSD y espectrograma. Una
envolvente devuelve dos puntos por cubo, no uno: no puedes sustituirla en sitio sin
revisar los tres usos y los otros llamantes. Considera una función separada solo para la
traza temporal.

Las estadísticas ya se calculan a resolución completa antes del diezmado
(`statistics_basis: all_finite_samples_before_display_reduction`), verificado:
`statistics.raw.f3.max` devuelve 9.640,0 aunque la gráfica muestre 9.540,0. **No toques
esa ruta.**

---

### T7 — Media / Mínimo / Máximo por canal

**Archivo:** [EegTab.tsx:143-150](../../frontend/features/analytics/components/EegTab.tsx#L143-L150)

`timeRepresentativeStats` promedia canales cuyas medianas en el bloque 5 van de −1.256,2
(c4) a +988,4 (le), y el número cambia al activar o desactivar un chip.

Sepáralos por canal, o etiquétalos explícitamente como agregado dependiente de la
selección. La primera opción es la correcta; la segunda es el mínimo aceptable.

---

### T8 — Insignia de calidad por canal

Todo esto **ya está en `metadata.channels`** y no se muestra. Es solo pintarlo:

- Paso de cuantización (b5 f3 = 10,00 µV exactos frente a 0,01 en el resto).
- `repeated_adjacent_samples` (b5 f3 = 12,41 %).
- `missing_samples`, `median_offset`.

Con T1 se suman `amplitude_z_max` y `amplitude_outlier_samples`.

---

### T9 — Marcar proyectos ingeridos antes de la corrección de unidades

FINDINGS.md dice que necesitan re-ingesta pero nada en la UI lo indica. **El detector ya
existe:** `metadata.assumed_uV_channels` y `metadata.source_units`. Es una insignia más un
botón de re-ingesta, no un sistema nuevo.

Evita exactamente el escenario de comparar un participante corregido con uno sin corregir.

---

### T10 — Medir el impacto en correlación *(investigación, antes de código)*

La propuesta original no cubre esta ruta.
[correlation_service.py:323](../../backend/src/neurodatics/modules/analytics/application/services/correlation_service.py#L323)
pasa `eeg_broadband_power_db` por `prepare_eeg` y de ahí a Pearson (`np.corrcoef`,
[línea 472](../../backend/src/neurodatics/modules/analytics/application/services/correlation_service.py#L472)).
El mismo artefacto entra ahí.

Está en dB, lo que comprime 64× a unos **+18 dB** — sigue siendo apalancamiento grande en
una correlación, pero el artefacto ocupa ~1 s de 128 s, así que el efecto depende del
binning. **Mídelo antes de proponer cambio.** Entrega un número, no una opinión.

---

### T11 — Vista apilada tipo montaje EEG *(P2)*

Un carril por canal, desplazamiento propio y barra de escala en µV. Resuelve el problema
del eje compartido de raíz y es lo que un lector de EEG espera. Hace T5 casi innecesario,
así que si se aprueba T11, replantea T5 antes de hacer los dos.

---

### T12 — Ventana temporal en espectrograma y topografía *(P2)*

**La fontanería ya está medio hecha:** `prepare_eeg` acepta `start_time_s` / `end_time_s`
([eeg_signal.py:55](../../backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py#L55)),
pero `compute_spectrogram` y `compute_topography` llaman a `_prepare` sin pasarlos
([líneas 315](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L315)
y [454-456](../../backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py#L454-L456)),
y las rutas no exponen los parámetros. Falta: parámetros en servicio + ruta,
`_validate_time_window` (ya existe, `routes.py:134`) y `_time_window_key` en la clave de
caché (ya existe, `routes.py:139`).

Hoy el zoom se hace recortando en cliente y
[chartZoom.ts:70](../../frontend/features/analytics/chartZoom.ts#L70) propaga `...data`,
así que `color_domain` sigue siendo el del bloque entero. Recalcula la escala de color
sobre lo visible.

Añade además escala de color **por canal** como opción: en el bloque 5, f3 tiene del orden
de 25 dB más de potencia que sus vecinos y los comprime a todos.

---

### T13 — Filtro documentado y opcional *(P2)*

Paso banda 1–45 Hz + notch de red. Explícito, **apagado por defecto**, registrado en
`metadata`. Hoy la única opción es el boxcar de 0,2 s que la propia auditoría demuestra
que anula 10 Hz (FINDINGS.md §3); no hay forma de mirar alfa de verdad.

El test `test_comparison_chart_preserves_a_ten_hz_raw_signal`
([test_eeg_scientific_contract.py:112](../../backend/tests/unit/test_eeg_scientific_contract.py#L112))
fija que el default no destruye 10 Hz. Debe seguir verde.

---

### T14 — Re-referenciado opcional *(P2)*

Referencia promedio común, explícita, apagada por defecto, **excluyendo canales malos**.
Es la respuesta directa al «el offset depende de la referencia» que FINDINGS.md plantea y
deja abierto. Cambiar esto significa cambiar `metadata.reference`, que hoy es
`"as_exported"`: ese campo debe reflejar siempre lo que se aplicó.

---

## Ajustes sugeridos de modelo y esfuerzo

- **T1, T3, T4, T10** — Claude Opus 5 o Codex equivalente, esfuerzo **high**. Razonamiento
  numérico con verificación contra los bloques de referencia. T4 además exige juicio de
  diseño sobre el contrato de la API.
- **T0, T7, T8, T9** — esfuerzo **medium**. Trabajo mecánico y localizado.
- **T2, T5, T6, T11, T12** — esfuerzo **high** en el frontend por la interacción con
  Recharts y el diezmado; **medium** si se limitan a la parte de backend.
- **T13, T14** — **xhigh**. Son decisiones científicas con consecuencias en la
  interpretación, no features.

Verificación proporcionada: T0 y T7–T9 con `./verify.ps1`. T1–T4 y T10 además con
reproducción explícita contra `docs/RefererenceExperiments/`, comparando contra las
cifras de la sección «Evidencia medida».

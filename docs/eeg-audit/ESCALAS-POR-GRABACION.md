# EEG: escalas diferentes entre grabaciones y canales

Estado comprobado el 27 de septiembre de 2026. Este documento describe el comportamiento existente; esta revisión no cambia la conversión productiva ni reprocesa proyectos guardados. Se incorpora una prueba de regresión para la mezcla de escalas en un mismo CSV.

## Hallazgo y evidencia de origen

En `SAIO 3 EYT-EEG-GSR alta.csv` (`csv-08` de la auditoría), cada bloque de grabación tiene sus propios metadatos por canal. El bloque 5 declara:

```text
155520: Nombre : Electroencefalografía (EEG) / F3
155521: Tiempo de inicio : 23/07/2026 2:07:37,284 p. m.
155522: Frecuencia   : 300,287547754407 Hz
155523: Unidad Tobii : kilo
```

Son números de línea del CSV original; una importación en Excel que retire filas puede cambiar su numeración. `Unidad Tobii` es el nombre literal del campo del exportador, no una unidad física. No está confirmado por qué el campo recibe ese nombre también para EEG, ni por qué se eligió `kilo` en esta grabación. No se atribuye el comportamiento al hardware ni a una configuración automática no documentada.

| Grabación del archivo SAIO | Canal F3: unidad declarada | Factor que aplica la app |
|---|---|---:|
| Bloques 1, 2, 3 y 4 | Vacía | 1 |
| Bloque 5 | `kilo` | 1.000 |
| Bloque 6 | Vacía | 1 |

Los canales LE, F4, C4, P4, P3 y C3 del bloque 5 también tienen la unidad vacía. Por tanto, **F3 del bloque 5 se multiplica por 1.000; los otros canales y bloques no heredan ese factor**. Los números de bloque son posiciones de grabación, no identificadores públicos de personas.

En F3 del bloque 5, el rango exportado es −0,97 a 9,64; normalizado es −970 a 9.640. Los rangos del archivo de adquisición candidato y el metadato respaldan el multiplicador; no demuestran alineación exacta muestra a muestra ni confirman la unidad física. La auditoría reproducida el 25 de septiembre está en [FINDINGS.md](FINDINGS.md).

## Contrato actual de importación

`CsvProcessingService.process` recorre cada bloque delimitado por `Grabación`, vuelve a leer sus metadatos y llama a `_normalize_declared_units` con los canales de ese bloque. No conserva un factor global para F3, para un participante ni para el archivo entero.

Dentro de cada bloque, la normalización se aplica por canal EEG (TRG queda fuera de esta conversión):

| Metadato de origen | Factor hacia la escala almacenada en µV | Interpretación |
|---|---:|---|
| `uV`, `µV`, `μV` | 1 | Unidad física explícita |
| `mV` | 1.000 | Conversión de unidad explícita |
| `V` | 1.000.000 | Conversión de unidad explícita |
| `nV` | 0,001 | Conversión de unidad explícita |
| `kilo` | 1.000 | Multiplicador de visualización; base µV asumida |
| Campo vacío o unidad no declarada | 1 | Conserva valores; base µV asumida |
| Unidad no reconocida | Sin factor válido | Conserva fuente y marca exclusión del análisis cuantitativo EEG |

**Vacío no significa µV confirmado.** El sistema mantiene la suposición histórica de µV para poder trabajar con estas exportaciones y la declara. Tampoco interpreta `kilo` como kilovoltios. No deduce el factor por la amplitud: un valor grande puede ser un offset o un segmento sospechoso y no autoriza dividirlo por 1.000.

La multiplicación ocurre al importar el CSV hacia el almacenamiento procesado. Consultar PSD repetidamente no vuelve a multiplicar una señal ya normalizada. El CSV fuente no se reescribe.

## Qué queda registrado con cada resultado

La app persiste `recording_units.eeg` en los metadatos de Parquet por grabación y por escenario; también restaura esos datos como `DataFrame.attrs.eeg_acquisition`. Incluye:

- `source_units`: unidad declarada por cada canal, o `null` si falta.
- `scale_to_uV`: factor aplicado por canal.
- `assumed_uV_channels`: canales cuya base física no fue declarada; incluye los vacíos y `kilo`.
- `excluded_channels`: canales con unidades no reconocidas.
- `declared_rates_hz`: frecuencia declarada por canal.

Ejemplo simplificado del bloque 5:

```json
{
  "source_units": {"f3": "kilo", "f4": null},
  "scale_to_uV": {"f3": 1000.0, "f4": 1.0},
  "assumed_uV_channels": ["f3", "f4"],
  "excluded_channels": []
}
```

La analítica utiliza estos metadatos para emitir advertencias de unidad asumida, corrección `kilo` y canales excluidos. La interfaz dispone de avisos de calidad/unidades derivados de esa información. Esta revisión verifica backend y persistencia; no certifica el estado de una sesión desplegada ni inspecciona cada proyecto almacenado del usuario.

## Qué resuelve y qué permanece incierto

- **Resuelve:** interpretar el multiplicador declarado de forma local al canal y la grabación, y conservar la procedencia de la conversión.
- **No confirma:** la unidad física cuando el archivo la omite, la referencia eléctrica ni la calibración del equipo.
- **No recupera:** los decimales perdidos. Dos decimales en escala `kilo` generan incrementos de 10 unidades base tras reescalar. Para recuperar precisión se necesita una exportación con más detalle desde la adquisición original.
- **No elimina:** artefactos ni offsets; el control de ventanas sospechosas es una decisión diferente.
- **No prueba:** que todos los participantes tengan la misma calidad ni que sus resultados sean directamente comparables bajo cualquier configuración.

## Proyectos procesados antes de la corrección

Un Parquet antiguo puede contener números sin normalizar y carecer de la escala de origen. El lector no puede reconstruir de forma segura ese dato ausente. Actualizar la app o cambiar su caché no corrige esos archivos.

Se debe verificar el CSV y volver a ingerirlo para generar los valores y metadatos correctos. La mera presencia de una advertencia de µV asumidos no demuestra antigüedad: una importación nueva también la emite cuando la fuente deja la unidad vacía. No se puede determinar qué proyectos concretos necesitan reingesta sin examinar sus archivos procesados y fuentes. Esta tarea no hizo reingestas ni cambios de base de datos.

## Verificación incorporada

`test_eeg_scale_is_scoped_to_each_recording_and_channel` importa un CSV sintético con cuatro grabaciones consecutivas: F3 con `kilo`, F3 sin unidad, F3 con `uV` y F3 nuevamente con `kilo`. F4 mantiene `uV` en todas. Se ejecuta tanto con una línea de unidad vacía como con esa línea omitida.

Comprueba valores, metadatos y advertencias por grabación; almacenamiento por escenario; potencia sobre una señal de amplitud conocida; ausencia de propagación del factor hacia otro canal o bloque; consultas repetidas sin doble conversión; y conservación del CSV fuente. No utiliza datos personales ni modifica snapshots.

Comando desde `backend/`:

```powershell
../.venv/Scripts/python.exe -m pytest tests/unit/test_eeg_scientific_contract.py -k 'eeg_unit_normalization or eeg_scale_is_scoped' -q
```

Resultado: **6 pruebas correctas** (4 casos de conversión existentes y 2 casos nuevos de mezcla de escalas). Los avisos emitidos por pytest corresponden a una deprecación del plugin asyncio. No se ejecutó la batería general.

## Referencias de implementación

- `backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py`: `_parse_metadata`, `_normalize_declared_units`, `_write_parquets`, `_write_parquet_with_metadata` y bucle de bloques de `process`.
- `backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py`: `prepare_eeg`, avisos de unidad y escala.
- `backend/tests/unit/test_eeg_scientific_contract.py`: pruebas de conversión y mezcla de unidades.

Para registrar nuevas anomalías, conservar como mínimo: referencia anónima de archivo y hash, bloque/canal, metadato literal, comportamiento observado, interpretación respaldada, incertidumbres, tratamiento implementado y comprobación reproducible. Evitar presentar una interpretación de exportación como una especificación oficial del fabricante.

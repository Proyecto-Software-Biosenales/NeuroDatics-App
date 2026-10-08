# Comparación reproducible para la presentación

Ejecución: 25 de septiembre de 2026. Esta comparación describe diferencias en resultados sobre exportaciones locales. No estima exactitud, sensibilidad clínica ni validez de una conclusión sobre atención o preferencia.

## Resultado para la lámina principal

Usar **SAIO, `csv-08`, seis bloques y 232.195 filas**, el mismo archivo del ejemplo EEG. Se incluyen todos sus bloques; no se escogió el participante con mayor diferencia.

| Métrica, mínimo configurado 200 ms | I-DT básico | NeuroDatics | Cambio respecto al básico |
|---|---:|---:|---:|
| Eventos de fijación reconstruidos | 862 | 793 | −8,00 % |
| Tiempo total clasificado como fijación | 233,61 s | 237,58 s | +1,70 % |
| Duración media por evento | 271,02 ms | 299,60 ms | — |

**Lectura:** menos eventos y algo más de tiempo total; en este conjunto la distribución de eventos cambia. Un conteo mayor o menor no demuestra por sí mismo un resultado mejor. El tiempo corresponde a la suma de eventos sobre los seis bloques, no a la duración de un experimento individual ni al tiempo total de atención.

**Matiz obligatorio en notas:** el mínimo de 200 ms corresponde a la configuración de detección. La reconstrucción analítica devuelve dos eventos menores, de **199,779 y 156,493 ms**. Se conservan en los resultados; no se alteró la aplicación ni se filtraron para favorecer la comparación. Véase [nota-fijaciones.md](nota-fijaciones.md).

### Desglose por bloque de la lámina principal

| Bloque anónimo | Eventos básicos | Eventos aplicación | Tiempo básico (s) | Tiempo aplicación (s) |
|---|---:|---:|---:|---:|
| B01 | 107 | 96 | 26,411 | 26,367 |
| B02 | 128 | 116 | 31,735 | 32,204 |
| B03 | 192 | 177 | 53,584 | 54,937 |
| B04 | 125 | 117 | 31,991 | 32,588 |
| B05 | 144 | 134 | 42,723 | 43,411 |
| B06 | 166 | 153 | 47,171 | 48,074 |

Los totales se calculan antes de redondear. El reporte JSON también incluye resultados por escenario anónimo, para escoger un ejemplo coherente con la demostración del laboratorio sin exponer sus etiquetas.

## Cobertura y contraste entre conjuntos

| Archivo de auditoría | Bloques exportados | Filas | Eventos básico → app | Tiempo básico → app (s) | Mirada inválida, filas (%) |
|---|---:|---:|---:|---:|---:|
| csv-01, referencia solo mirada | 8 | 28.999 | 632 → 715 | 213,30 → 226,70 | 794 (2,74 %) |
| csv-05, Realidad ~300 Hz | 1 | 27.425 | 127 → 123 | 37,90 → 39,60 | 639 (2,33 %) |
| csv-06, Realidad ~60 Hz | 1 | 5.491 | 122 → 122 | 38,69 → 38,74 | 119 (2,17 %) |
| csv-08, SAIO multisensor | 6 | 232.195 | 862 → 793 | 233,61 → 237,58 | 16.592 (7,15 %) |

En total se procesaron **294.110 filas en 16 bloques exportados**, con **18.144 filas de mirada inválida**. La suma de control da 1.743 → 1.753 eventos y 523,501385 → 542,626383 s. **No usar esa suma como conclusión principal:** combina experimentos y dos exportaciones de una misma grabación, y oculta que las diferencias de conteo cambian de signo entre conjuntos.

Cuatro archivos no entran en la comparación ocular: `csv-02/03/04` tienen filas mal formadas para el lector básico; `csv-07` contiene múltiples relojes. Se registran como `not_compared`, no como cero fijaciones ni como participantes perdidos. La auditoría EEG describe sus problemas de importación con más detalle.

En `csv-01` se observaron 73 filas con coordenadas de fijación del proveedor en rango mientras la mirada cruda no era válida; en `csv-08`, 1.238. Son **discordancias de representación**, no 73 o 1.238 eventos ni errores confirmados del equipo. No se usan para decidir qué algoritmo acertó.

### Gráfica opcional de sensibilidad

Mismo archivo `csv-08`, mismos seis bloques; solo cambia el mínimo configurado en la aplicación:

| Mínimo de detección | Eventos reconstruidos | Tiempo total (s) |
|---|---:|---:|
| 100 ms | 2.372 | 433,271 |
| 150 ms | 1.359 | 322,767 |
| 200 ms | 793 | 237,582 |
| 250 ms | 520 | 183,271 |
| 300 ms | 349 | 141,469 |

Construir dos gráficas pequeñas con el mismo eje X, una para conteo y otra para tiempo. Es una comprobación de sensibilidad a parámetros, no una selección automática del umbral correcto. El reporte conserva las cinco variantes para cada bloque.

## Qué se compara

**Referencia básica:** un lector pequeño e independiente separa las tablas por encabezado `Time`, correspondientes a bloques de grabación. Convierte decimales con coma y extrae tiempo, mirada, escenario y coordenadas de fijación del proveedor, cuando existen. No crea una base de datos ni sube archivos. Los bloques se identifican anónimamente dentro del reporte; no se exportan muestras ni códigos personales.

Sobre cada bloque ejecuta un I-DT básico: coordenadas normalizadas, dispersión `(max X − min X) + (max Y − min Y) ≤ 0,03` y duración mínima configurada de 200 ms. Calcula la frecuencia con la mediana de los intervalos entre filas y cuenta duración como filas del evento divididas por esa frecuencia. Separa escenarios, pérdidas de mirada e interrupciones de más de 1,5 períodos de exportación. No remuestrea ni une pérdidas cortas. No utiliza las fijaciones del proveedor para clasificar.

**NeuroDatics:** se ejecuta el servicio real de importación `CsvProcessingService.process`, se leen sus Parquet temporales y se llama a `FixationEventService.build_events`, el constructor que utiliza la analítica. También se calcula la sensibilidad de las cinco variantes persistidas. Sin calibración física ni ubicación del estímulo suministradas, el modo utilizado es I-DT normalizado y las coordenadas son de pantalla.

Los dos métodos reciben las mismas observaciones. El script comprueba igualdad de `time`, `gx`, `gy` y escenario entre su lectura y la importación, y verifica que la máscara de mirada válida coincida. No se cambian los parámetros para obtener un resultado más atractivo.

Las diferencias combinan frecuencia efectiva, remuestreo, puentes de continuidad y reconstrucción de eventos. Esta comparación no aísla la contribución de cada mecanismo: haría falta desactivar uno por uno en un estudio adicional. Tampoco compara I-DT con I-VT angular.

## Archivos de evidencia

- [comparacion.json](comparacion.json): identificadores anónimos, hashes, parámetros, resultados por bloque y escenario, disponibilidad de mirada y sensibilidad de fijaciones.
- [eeg-comparacion.json](eeg-comparacion.json): control de escala y comparación de ventanas EEG con los servicios actuales.
- [eeg-evidencia.md](eeg-evidencia.md): lectura técnica de los resultados EEG y alcance de las afirmaciones.

Cada bloque es una unidad de análisis local. **No equivale necesariamente a una persona distinta.** Las exportaciones Realidad de ~60 y ~300 Hz pertenecen a una misma grabación; se mantienen separadas para estudiar el efecto del formato, sin sumarlas como sujetos independientes.

## Cómo repetir la ejecución

Desde la raíz del repositorio, en PowerShell:

```powershell
.venv/Scripts/python.exe -X utf8 backend/scripts/presentation_baseline.py docs/RefererenceExperiments --report docs/presentation/propuesta-final/comparacion.json
.venv/Scripts/python.exe -X utf8 backend/scripts/presentation_eeg_comparison.py
```

Para usar otra carpeta de exportaciones compatibles, cambiar el primer argumento de `presentation_baseline.py` y elegir otro reporte. El lector básico tiene un alcance deliberadamente limitado; no sustituye el importador productivo. El script EEG focal comprueba el hash de la referencia concreta y analiza su bloque 5; no es un importador genérico de cualquier EEG.

Los Parquet de la comparación de mirada se crean en una carpeta temporal bajo `output/presentation-baseline-work` y se retiran al terminar. Las fuentes no se modifican. La salida es JSON anónimo con medidas agregadas, no una copia de las señales.

## Criterios para usar cifras en las láminas

1. Identificar conjunto, bloque y método. No presentar la suma de exportaciones como tamaño de muestra poblacional.
2. Mostrar recuento y tiempo en gráficos separados; las unidades no son intercambiables. La media de duración se calcula por evento, no como promedio no ponderado de medias de participantes.
3. Leer los porcentajes como diferencias respecto a la referencia básica: `(aplicación / básico − 1) × 100`. No son porcentajes de mejora en precisión.
4. Si se informa proporción de mirada inválida, su denominador son todas las filas de exportación. No son segundos perdidos ni muestras biológicamente independientes.
5. Las coordenadas de fijación del proveedor que aparecen cuando la mirada es inválida son una discordancia descriptiva; podrían responder a otra semántica del exportador. No etiquetarlas automáticamente como errores.
6. El conteo de desacuerdos de clasificación es por fila. Sin eventos anotados por referencia independiente, no permite calcular exactitud, falsos positivos ni falsos negativos.
7. No aplicar pruebas de significación a millones de filas como si fueran participantes independientes. Se conserva el desglose por bloque y escenario.

## Comprobaciones realizadas

El script comprueba casos sencillos conocidos: fijación constante de un segundo, pérdida intermedia de 200 ms, separación de escenarios y mirada completamente inválida. Durante la ejecución real compara ambas lecturas muestra a muestra, exige duraciones positivas y serialización JSON sin NaN ni infinitos. Se revisa el código añadido con Ruff. Estas son comprobaciones del experimento comparativo; no equivalen a una nueva ejecución de toda la batería de la aplicación.

La ejecución final terminó con código 0. Se verificó que el hash del script coincide con el registrado en el reporte, que los ocho archivos fuente mantienen sus hashes y que las filas, los eventos y el tiempo total de los escenarios reconcilian con los totales de cada uno de los 16 bloques. Ruff terminó sin hallazgos en ambos scripts. Los cambios de interfaz que ya estaban presentes en el directorio de trabajo se conservaron.

## Fuentes de implementación

- `backend/scripts/presentation_baseline.py`: lector básico, referencia I-DT y ejecución de ambos recorridos.
- `backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py`: importación productiva y metadatos.
- `backend/src/neurodatics/modules/projects/application/services/fixation_detection_service.py`: detección y variantes.
- `backend/src/neurodatics/modules/analytics/application/services/fixation_analytics_service.py`: sensibilidad y entrada de eventos canónicos.
- `backend/src/neurodatics/modules/analytics/application/services/fixation_event_reconstruction.py`: duración y separación defensiva de eventos para analítica.

La propuesta de guion está en [PROPUESTA.md](PROPUESTA.md).

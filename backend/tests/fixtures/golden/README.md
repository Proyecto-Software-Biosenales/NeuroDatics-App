# Corpus sintético de caracterización

`synthetic-experiment.zip` son datos de prueba generados, **no un experimento real**. No contiene información
de participantes humanos, bioseñales medidas ni medios externos.

## Contenido y procedencia

- Lo crea `build_synthetic_corpus.py` con aritmética determinista, sin aleatoriedad.
- Dos códigos de participante explícitamente sintéticos: `SYN-01`, `SYN-02`.
- Dos escenarios: `stimulus-a` y `stimulus-b`, de ocho segundos cada uno a 100 Hz.
- Los bloques de grabación del CSV cubren eye tracker, GSR y siete canales de EEG.
- Las trazas de mirada contienen fijaciones estables, transiciones, un hueco de mirada inválida y muestras de
  pupila derecha ausentes.
- Los canales de EEG contienen sinusoides distintas; el GSR y las pupilas varían suavemente y difieren entre
  participantes.
- Dos rectángulos SVG generados identifican los estímulos, de 1280 × 720.
- Las fechas y permisos del ZIP están fijados. El CSV usa nueve decimales.
- SHA-256 del ZIP: `2dac7ab109e8a3578c40670be84706b750389f0e4bdd1b947f4dfe5d2821c168`.

La fixture valida el ZIP con el `ZipValidationService` real, procesa el CSV con el `CsvProcessingService` real
—detección de fijaciones incluida— y lee los Parquet que de verdad se escribieron. No fabrica la salida del
detector. No necesita Redis, PostgreSQL ni Google Drive. La capa HTTP sustituye solo la base de datos, el lector
de Parquet y la caché; la autenticación, la validación de solicitudes, los manejadores de rutas, los cálculos de
analítica y la serialización de respuestas se ejecutan con normalidad.

## Líneas base protegidas

Las líneas base numéricas en CSV viven junto a `test_numeric_characterization.py` y se generan con
`pytest-regressions`; `atol=1e-8` y `rtol=1e-6` admiten el ruido numérico de la implementación. Se fijan los
vectores numéricos completos y las dimensiones de las matrices: columnas numéricas de los eventos del detector,
variantes de duración, métricas de AOI, resúmenes del informe y el sustrato del histograma del mapa de calor.
Los snapshots HTTP fijan las claves y los tipos serializados de forma recursiva, independientemente de los
modelos de respuesta. Nunca se toman snapshots de bytes PNG.

Syrupy 4.6.1 no tiene `--snapshot-update-new-only`. La única invocación inicial de `--snapshot-update` se hizo
en un directorio de pruebas aislado sin ningún `.ambr` previo. La verificación posterior no usa banderas de
actualización. **Nunca se regenera un golden existente para que pase una prueba que falla.**

Se ejecuta desde `backend` con el entorno virtual de la raíz:

```powershell
..\.venv\Scripts\python.exe -m pytest tests/characterization -q
```

`check_mutation.py` cambia en una muestra la ventana de suavizado dentro de su propio proceso, ejecuta un caso
de caracterización sin banderas de actualización y solo tiene éxito si ese caso falla. Primero prepara el
entorno sin conexión de la batería, así que no necesita un `.env` local. El script nunca modifica archivos de
producción ni goldens.

## Límites

Este corpus ejercita contratos numéricos y HTTP deterministas, no la validación científica, la diversidad de
exportaciones reales de los dispositivos, la integración de los contenedores desplegados, la semántica de las
consultas a la base de datos, la disponibilidad del almacenamiento externo ni el uso en campo. Sigue la ruta de
coordenadas heredada, sin metadatos físicos de la pantalla; las transformaciones explícitas de colocación del
estímulo tienen sus propias pruebas.

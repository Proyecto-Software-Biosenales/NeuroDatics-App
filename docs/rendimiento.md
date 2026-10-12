# Rendimiento

Resumen de la campaña de rendimiento cerrada el 3 de octubre de 2026: qué se midió, con qué
corpus, qué cambió y qué decisiones de arquitectura quedaron en el código. Las cifras describen
mediciones sintéticas en una sola máquina. No son una promesa de rendimiento.

## Qué se midió y con qué

Dos corpus sintéticos, ambos construidos a partir de la fixture de caracterización:

- **small**: 2 participantes × 1.600 filas, 2 escenarios y segmentos, 7 canales EEG más GSR,
  mirada, pupila y distancia, con NaN y huecos. 98.844 bytes por Parquet.
- **large**: 64 bloques de un participante de small con los relojes desplazados 16 s, más 16
  señales adicionales. 4 participantes × 102.400 filas, 128 segmentos. 17.366.952 bytes por
  Parquet y 161.056.772 bytes profundos por marco en memoria.

Las rutas HTTP se midieron en proceso, con una demora de 20 ms por descarga para simular el
almacenamiento remoto. La interfaz se midió en Chromium a 1440×1000, DPR 1, con la API
interceptada y la misma demora de 20 ms. Protocolo: una muestra de calentamiento y cinco
conservadas por caso, con mediana y rango; no se calculó p95.

Equipo: Windows, Ryzen 7 9700X (8 núcleos, 16 hilos), 33.994.928.704 bytes de RAM. Python
3.14.3, pandas 2.3.3, NumPy 2.4.4, PyArrow 25.0.0, FastAPI 0.104.1, SQLAlchemy 2.0.48, Typst
0.15.0, Node 24.13.1, Next 16.1.6.

Fuera del alcance: PostgreSQL, Redis, Google Drive y la nube reales; la base de datos se
sustituyó por una sesión que cuenta llamadas y el almacenamiento por archivos locales con
demora simulada. Tampoco se midió una distribución congelada.

## Resultados representativos

Mismo corpus y misma fase de caché en las dos columnas; medianas de cinco muestras.

| Flujo | Antes | Después |
|---|---:|---:|
| Informe, `collect` de grupo, small | 372,10 ms; 16 construcciones de eventos | 186,78 ms; 4 |
| Informe, `collect` de grupo, large | 21.658,69 ms; 32 construcciones | 8.494,72 ms; 8 |
| Carga fría del informe, large, I/O de 20 ms | 393,92 ms; 4 resoluciones | 273,97 ms; 1 lote, mismas 4 descargas |
| AOIs por HTTP sin caché de respuesta, large | 1.162,07 ms | 663,99 ms |
| GSR temporal por HTTP sin caché, large | 172,79 ms | 36,20 ms; mismos 102.704 bytes |
| Inicio de vídeo, 4 consultas, large | 312,77 ms; 4 lecturas de Parquet | 1,71 ms; 0 lecturas |
| Fotograma de vídeo en frío con FFmpeg, small | 181,79 ms | 65,05 ms |
| Informe EyeTracker con figuras y PDF | 2.063,45 ms | 1.300,94 ms; mismos 330.652 bytes de PDF |
| Guardar 1.000 participantes (sesión falsa) | 31,86 ms; 1.000 consultas | 8,24 ms; 2 consultas, 1 `flush` |
| Volver a un proyecto ya visitado, en el navegador | 166,21 ms; 6 peticiones, 70.743 bytes | 99,77 ms; 1 petición, 424 bytes |

Los recuentos que acompañan a cada fila importan más que los milisegundos: son estables entre
ejecuciones y explican el cambio. Donde los bytes se repiten, la respuesta es idéntica y solo
cambió el trabajo para producirla.

No todo bajó. La primera vista de PSD pasó de 98,32 a 165,48 ms porque su carga dejó de hacerse
por adelantado: se paga al abrirla y no en la carga inicial. La topografía del primer proyecto
subió un 19,6 %, dentro del rango de la medición anterior. La respuesta más grande observada
siguió siendo el espectrograma EEG de large, 2.844.387 bytes.

## Decisiones de arquitectura que quedaron

- **Cachés acotadas por tamaño y por entradas, con TTL.** El valor JSON en Redis se limita a
  8 MiB con TTL de 900 s; el respaldo en memoria suma 128 MiB; las imágenes, 256 entradas y
  64 MiB; los metadatos de inicio y duración de vídeo, 1.024 y 256 entradas; el disco de medios,
  2 GiB y 72 h. La caché de Parquet tiene TTL de 4 h y **no** tiene límite global de bytes: no
  debe presentarse como acotada.
- **Claves de caché que incluyen la identidad completa.** Proyecto, participante, escenario,
  generación de ingesta y los parámetros de la petición. Reprocesar o editar un AOI invalida por
  cambio de clave, sin borrados selectivos.
- **Coordinación por clave.** Varias peticiones simultáneas de lo mismo eligen una líder y las
  demás esperan su resultado, en lugar de leer y calcular cada una por su cuenta.
- **Lectura por columnas.** Las rutas de analítica piden al Parquet solo las columnas que usan;
  el resto del marco no se decodifica.
- **Respuestas condicionales.** Los fotogramas de vídeo conservan su ETag y responden 304 sin
  cuerpo cuando el navegador ya los tiene, manteniendo la autorización.
- **Lotes en lugar de N+1.** Un informe de grupo resuelve la identidad de todos sus
  participantes en una consulta; guardar participantes o AOIs usa una escritura por lote.
- **Trabajo compartido dentro de una operación.** Los eventos de fijación se construyen una vez
  por marco y escenario y se reutilizan en las métricas que los necesitan.
- **Presupuestos de concurrencia explícitos.** Las respuestas y los archivos Parquet admiten 4
  operaciones en curso, 32 en cola y hasta 256 esperando un resultado compartido; la E/S de
  informes, 2 en curso y 16 esperando. Una cancelación libera su hueco solo cuando el trabajo
  físico termina, y al final no quedan entradas ni esperas pendientes.
- **Carga diferida en la interfaz.** Las vistas EEG y el diálogo de comparación se cargan al
  abrirse, no al entrar al panel.
- **Un candidato se descartó con evidencia.** Una reescritura geométrica dio una mediana de
  −1,80 % con 12 regresiones y hasta +19,29 %, así que no se adoptó. Medir también sirve para no
  cambiar nada.

Ningún contrato científico cambió: tiempos y señales en float64, orden original, NaN y huecos
preservados, eventos de fijación y sus variantes de duración intactos, goldens sin regenerar.

## Cómo volver a medir

Los microbenchmarks reutilizables de esa campaña están en
[`backend/benchmarks/`](../backend/benchmarks/README.md), con su protocolo y sus límites. Los
resultados no son comparables entre máquinas: para decidir sobre un cambio, mide antes y después
en el mismo equipo, en la misma sesión y sin otros trabajos en marcha, y no llames mejora a una
diferencia que no supere la dispersión de las muestras.

Las fuentes completas de la campaña (plan, asignaciones, actas y evidencia en JSON) quedaron en
el historial de git bajo el tag `docs-archive-pre-release`.

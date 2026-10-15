# Microbenchmarks del backend

Cinco guiones que miden, con corpus sintético, las capas que dominan el coste de una consulta
de analítica: el recorte por escenario, la búsqueda de un instante, el tamaño de la respuesta
temporal, la lectura de Parquet y los algoritmos de AOI y cadencia de fijaciones.

Son medidas de componentes. No son latencia de la API, ni de la aplicación desplegada, ni una
promesa de rendimiento.

## Qué mide cada guion

| Guion | Qué mide | Corpus |
| --- | --- | --- |
| `bench_scenario_scope.py` | `scope_to_scenario`, el recorte a un escenario que precede a casi toda la analítica, frente a las dos operaciones de columna completa en que puede caer (`astype(str).str.strip()` y `pd.unique`) y frente al suelo (máscara booleana más `.loc`). Repite la llamada sobre una columna `category`, porque un Parquet puede llegar de las dos formas. | 300.000 filas, 8 escenarios, en memoria |
| `bench_gaze_at.py` | `find_gaze_at`, el coste de un tic de arrastre en la línea de tiempo, desglosado en los componentes que lo acotan: copia del marco, ordenación por tiempo, barrido lineal `idxmin` y búsqueda binaria `searchsorted`. | 300.000 filas, 26 columnas, en memoria |
| `bench_timeseries_payload.py` | Tiempo de cómputo y tamaño del JSON de `compute_timeseries` sin límite de puntos, y la lectura de Parquet que lo alimenta con el marco completo y con proyección de columnas. | 60.000 y 300.000 filas; un Parquet temporal |
| `bench_parquet_projection.py` | Lectura local de Parquet: marco completo frente a proyección de tres columnas, con los bytes del DataFrame y el ahorro de una columna de escenario categórica. Comprueba que la proyección devuelve exactamente lo mismo que la lectura completa. | 300.000 filas, 35 columnas; un Parquet temporal |
| `bench_aoi_cadence.py` | Pertenencia a un AOI rectangular por tres caminos (escalar `_contains`, el `_mask_for_shape` vectorizado que usan las métricas hoy, y una expresión NumPy en línea) y la cadencia por segmento de fijaciones frente a una reimplementación independiente. Afirma la igualdad de cada par, incluidos NaN, infinitos, rectángulos degenerados, relojes repetidos y segmentos sin tiempo finito. | 300.000 coordenadas y 100.000 tiempos con 1, 20 y 100 segmentos |

Los que comparan dos implementaciones afirman que ambas dan el mismo resultado antes de medir,
así que una diferencia de tiempo nunca puede venir de una respuesta distinta.

## Cómo ejecutarlos

Desde `backend/`, con el entorno virtual de la raíz (`backend/.venv` está incompleto). Cada
guion importa `src` por su cuenta, así que no hace falta `PYTHONPATH`:

```powershell
..\.venv\Scripts\python.exe benchmarks\bench_scenario_scope.py
..\.venv\Scripts\python.exe benchmarks\bench_gaze_at.py
..\.venv\Scripts\python.exe benchmarks\bench_timeseries_payload.py
..\.venv\Scripts\python.exe benchmarks\bench_parquet_projection.py
..\.venv\Scripts\python.exe benchmarks\bench_aoi_cadence.py
```

Cada guion termina en segundos, imprime sus cifras por pantalla (texto alineado o JSON) y no
escribe ningún informe. No necesitan base de datos, Redis, Google Drive, ffmpeg ni red: el
corpus se construye en memoria con una semilla fija o con `numpy.random`.

`bench_timeseries_payload.py` y `bench_parquet_projection.py` son los únicos que tocan el disco:
escriben un Parquet temporal y lo borran al terminar. Eligen el directorio con `--output-dir`,
si no con la variable de entorno `NEURODATICS_BENCH_OUTPUT`, y si no con `output/benchmarks/`
en la raíz del repositorio (`output/` está en `.gitignore`). Conviene darles un directorio en el
disco donde vayan a estar los datos reales: la lectura de Parquet depende del volumen.

```powershell
..\.venv\Scripts\python.exe benchmarks\bench_parquet_projection.py --output-dir D:\tmp\bench
```

## Cómo leer las cifras

Son medianas tras un calentamiento, con pocas muestras (3, 5 o 7 según el guion), de un corpus
sintético y en un solo proceso. Sirven para comparar dos caminos dentro de la misma ejecución y
para ver un orden de magnitud.

**Los resultados no son comparables entre máquinas, ni entre ejecuciones de máquinas distintas.**
Dependen del procesador, del disco, de la caché del sistema operativo, de la versión de Python,
pandas, NumPy y PyArrow, y de qué otra cosa esté corriendo. Una cifra de estos guiones no
contradice ni confirma una cifra tomada en otro equipo. Para decidir sobre un cambio, mide antes
y después en la misma máquina, en la misma sesión y sin otros trabajos en marcha; una diferencia
que no supere la dispersión de las muestras no es una mejora.

Los algoritmos que se miden están sujetos a los contratos científicos del proyecto: los guiones
pueden medirlos, pero no son licencia para cambiarlos. Ninguno escribe en la base de datos,
regenera un golden ni toca datos de participantes.

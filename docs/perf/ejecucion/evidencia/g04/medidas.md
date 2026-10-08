# Medidas G04 — base recibida y final

Mismo runtime Python3.14.3/pandas2.3.3/NumPy2.4.4/PyArrow25; corpus G00/G03 exacto: small1.600 filas/98.844B, large102.400/17.366.952B (SHA-256 en medidas.json). Lector, decodificador, servicios y helper de respuesta reales; resolución de identidad sin DB y almacenamiento sintético20ms; sin Redis. Respuestas pupil max_points=5000, valores completos byte-equivalentes tras model_dump_json. Nivel archivo prueba10 readers/proyecciones independientes y JSONframe equivalente. Auth/teardown HTTP se verifican en tests, no se incluyen sus latencias en este probe.

Una muestra calentamiento + cinco medidas alternadas antes/después por caso. Antes carga código de snapshot output/perf-g04/base, nunca HEAD. Cache respuesta siempre miss para medir overhead; disco precargado o generación nueva fría por muestra. No limpiar OS cache. Median/rango, sin p95. RSS/peak acumulado proceso están en JSON: no peak aislado de operación ni presupuesto RSS garantizado.

| Corpus/nivel/cache/requests | Antes ms, mediana [rango] | Después ms, mediana [rango] | Éxitos antes/después (5×requests) |
|---|---:|---:|---:|
| small/response/disk/1 | 5.88 [5.75–6.25] | 6.71 [6.34–6.95] | 5/5 y 5/5 |
| small/response/cold/1 | 32.49 [31.64–35.72] | 32.95 [32.93–33.44] | 5/5 y 5/5 |
| small/response/disk/10 | 65.80 [64.32–67.22] | 10.33 [9.74–10.67] | 50/50 y 50/50 |
| small/response/cold/10 | 97.58 [96.21–100.04] | 37.46 [36.33–38.35] | 49/50 y 50/50 |
| small/file/cold/10 | 54.96 [52.85–57.08] | 47.59 [45.49–48.05] | 50/50 y 50/50 |
| large/response/disk/1 | 22.11 [20.49–23.79] | 24.03 [22.88–26.79] | 5/5 y 5/5 |
| large/response/cold/1 | 52.14 [50.66–53.75] | 55.68 [53.69–62.47] | 5/5 y 5/5 |
| large/response/disk/10 | 179.71 [177.02–184.28] | 44.60 [41.19–45.75] | 50/50 y 50/50 |
| large/response/cold/10 | 258.33 [255.64–267.65] | 73.94 [73.34–79.13] | 50/50 y 50/50 |
| large/file/cold/10 | 526.97 [517.49–533.33] | 473.78 [472.30–516.75] | 50/50 y 50/50 |

**Ráfaga respuesta:** cada muestra disk before10 lecturas/10cálculos → after1/1, downloads0. Cold before10downloads → after1; byteslarge173.669.520→17.366.952, small988.440→98.844. La descarga sigue archivo completo. **Ráfaga archivo directo:** before10downloads→after1 y resoluciónDBsimulada10→10, lecturas10→10: no comparte DF ni finge deduplicar decodificación de diferentes proyecciones.

**Overhead secuencial:** small disk+0,83ms/+14,2%; large disk+1,92ms/+8,7%; coldsmall+0,46ms/+1,4% y coldlarge+3,54ms/+6,8%. Incluye consulta cache adicional tras admisión, lifecycle/worker settlement y serialización live segura. Rangos/cpu muestran variabilidad; no se promete mejora secuencial ni del tiempo global aplicación. Ráfagas disk small−84,3% y large−75,2% en este harness; no extrapolar a red/DB real.

**Fallo baseline:** coldsmall response1 fallo de50 (49/50); after50/50. Es carrera Windows os.replace(WinError5/32) al publicar el mismo destino mientras otro consumidor lee. Los tiempos del caso con fallo se incluyen como duración observada, **no comparativa válida de aceleración**. Warmups fuera n5 y corrida preliminary.log también mostraron error; no se modificó base para esconderlo. Todas las demás muestras finales completan sus 5×requests. Coldlarge response−71,4% con todas correctas; file directo small−13,4% y large−10,1%, con archivo aún decodificado10 veces.

Corridas diagnósticas conservadas: medidas-preliminary parcial por fallo; medidas-deepcopy y medidas-stdlib-json midieron max_points=0 del servicio (salida full) y variantes retiradas. **Sólo medidas.json corresponde a implementación final y max_points5000 real de ruta.** No comparar sus cifras entre sí como mejora de G04. La configuración live TypeAdapter redujo coste sin cambiar ciencia; final equivalencia163 tests/24 snapshots ambos runtimes.

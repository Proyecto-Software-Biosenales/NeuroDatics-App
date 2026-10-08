# Medidas G06

Protocolo: `.venv` recibido Python3.14.3/Pandas2.3.3/NumPy2.4.4/PyArrow25; corpus sintético G00, mismas semillas/filas/AOIs; una corrida fresca antes de producto y otra final; warmup1+n5; probes aislados. `before.json` y `after.json` guardan muestras, CPU y RSS; `comparacion.json` resume. Los hashes completos de máscaras (rect/elipse/polígono), métricas AOI, recordings de informe y JSON HTTP son idénticos.

| Caso | Antes ms mediana [min–max] | Después | Delta |
|---|---:|---:|---:|
| rect 300k | 144,37 [141,12–146,10] | 67,10 [63,10–69,07] | -53,5% |
| elipse 300k | 166,62 [164,64–169,12] | 70,81 [65,88–72,89] | -57,5% |
| polígono 300k | 250,51 [246,88–253,52] | 209,07 [205,96–221,82] | -16,5%; mismo ray-cast, bounds prefiltrados |
| cadencia 100k / 1 segmento | 51,52 [50,34–54,16] | 0,96 [0,92–1,00] | -98,1% |
| cadencia / 20 | 109,26 [107,87–114,46] | 55,95 [52,55–61,50] | -48,8% |
| cadencia / 100 | 353,51 [350,81–356,58] | 57,67 [55,12–59,51] | -83,7% |
| small AOI | 23,96 [23,04–47,74] | 21,07 [20,43–31,99] | -12,1%; rango solapado |
| small informe | 227,55 [223,53–230,09] | 222,80 [214,89–240,39] | -2,1%; ruido |
| small HTTP AOI | 34,94 [34,34–36,78] | 32,99 [32,38–35,36] | -5,6%; solapado |
| large AOI | 786,09 [783,53–792,88] | 558,63 [553,71–561,02] | -28,9% |
| large informe | 14.228,23 [13.582,28–14.543,09] | 12.155,41 [11.740,70–12.476,21] | -14,6% |
| large HTTP AOI | 908,93 [903,77–917,78] | 691,95 [686,52–700,14] | -23,9% |

CPU mediana acompaña los casos grandes (AOI 781,25→562,50ms; informe 14.187,50→12.109,38; HTTP 906,25→687,50). RSS máximo observado 2.053.156.864→2.047.680.512B; peak acumulado 2.441.777.152→2.443.812.864B. Incluyen corpus/operaciones anteriores y no son pico por operación ni certifican un contenedor. La normalización de resultados forma parte de ambos tiempos, por lo que el microtiempo puro de máscara queda subestimado; no se extrapola a toda la aplicación.

`bench_runtime_algorithms.py` confirma en ambos runtimes que el fast path de un segmento (~1,16ms) evita la regresión de la variante general (~55–59ms); se conserva. Es probe complementario, no base del cierre.

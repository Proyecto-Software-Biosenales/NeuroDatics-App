# Medidas G03

Corpus G00 exacto, runtime recibido, alternancia full/proyectado, 1 calentamiento + n=5, HTTP sin caché de respuesta. ms mediana [mín–máx]. Memoria profunda del frame realmente entregado al servicio, no peak RSS de operación.

| Corpus | Endpoint | Estado | full ms [rango] | proyección ms [rango] | frame full→proyección MiB |
|---|---|---|---:|---:|---:|
| small | `/scenario-timing` | disk | 10.90 [10.24–11.72] | 9.15 [8.53–9.74] | 2.05→0.13 |
| small | `/scenario-timing` | cold | 37.84 [36.46–38.54] | 34.97 [34.76–36.92] | 2.05→0.13 |
| small | `/timeseries/gsr` | disk | 13.31 [12.85–14.01] | 11.54 [11.17–12.96] | 2.05→0.13 |
| small | `/timeseries/gsr` | cold | 40.09 [38.79–45.06] | 38.19 [37.62–39.39] | 2.05→0.13 |
| small | `/statistics/gsr` | disk | 11.44 [11.19–12.32] | 9.77 [9.19–10.41] | 2.05→0.13 |
| small | `/statistics/gsr` | cold | 37.84 [37.01–40.01] | 35.32 [34.96–37.23] | 2.05→0.13 |
| small | `/timeseries/pupil` | disk | 12.52 [11.57–13.05] | 10.73 [10.25–11.98] | 2.05→0.14 |
| small | `/timeseries/pupil` | cold | 39.12 [37.79–39.67] | 36.42 [35.82–37.77] | 2.05→0.14 |
| small | `/statistics/pupil` | disk | 11.15 [10.43–12.45] | 9.67 [9.10–10.34] | 2.05→0.14 |
| small | `/statistics/pupil` | cold | 36.84 [36.26–38.02] | 36.42 [34.96–36.46] | 2.05→0.14 |
| small | `/timeseries/distance` | disk | 10.73 [10.61–11.63] | 9.10 [8.93–10.59] | 2.05→0.13 |
| small | `/timeseries/distance` | cold | 37.23 [37.02–38.49] | 35.80 [35.57–36.01] | 2.05→0.13 |
| small | `/statistics/distance` | disk | 11.22 [10.46–12.58] | 9.38 [9.16–10.35] | 2.05→0.13 |
| small | `/statistics/distance` | cold | 37.31 [36.22–38.23] | 35.79 [34.52–36.14] | 2.05→0.13 |
| small | `/timeseries/eeg` | disk | 22.99 [22.72–24.53] | 22.92 [21.46–29.56] | 2.05→0.20 |
| small | `/timeseries/eeg` | cold | 49.61 [49.23–51.14] | 48.23 [47.64–52.56] | 2.05→0.20 |
| small | `/psd/eeg` | disk | 19.60 [19.12–19.99] | 17.75 [17.38–21.05] | 2.05→0.20 |
| small | `/psd/eeg` | cold | 45.19 [44.63–47.30] | 43.47 [42.59–45.85] | 2.05→0.20 |
| small | `/spectrogram/eeg` | disk | 24.26 [23.65–27.19] | 23.37 [23.08–26.30] | 2.05→0.20 |
| small | `/spectrogram/eeg` | cold | 52.33 [50.94–57.84] | 49.96 [48.87–50.41] | 2.05→0.20 |
| small | `/topography/eeg` | disk | 14.12 [13.32–14.36] | 12.40 [11.71–13.24] | 2.05→0.20 |
| small | `/topography/eeg` | cold | 40.42 [39.35–43.33] | 38.61 [37.82–41.38] | 2.05→0.20 |
| large | `/scenario-timing` | disk | 95.50 [92.19–104.30] | 23.49 [22.59–24.89] | 153.60→13.07 |
| large | `/scenario-timing` | cold | 127.40 [122.31–194.28] | 92.94 [53.72–164.80] | 153.60→13.07 |
| large | `/timeseries/gsr` | disk | 139.59 [132.80–144.67] | 39.16 [34.99–57.46] | 153.60→13.07 |
| large | `/timeseries/gsr` | cold | 162.08 [152.31–229.66] | 104.56 [64.40–204.41] | 153.60→13.07 |
| large | `/statistics/gsr` | disk | 126.84 [114.54–135.12] | 23.05 [21.96–24.19] | 153.60→13.07 |
| large | `/statistics/gsr` | cold | 161.05 [153.28–169.96] | 58.33 [54.43–78.34] | 153.60→13.07 |
| large | `/timeseries/pupil` | disk | 101.64 [96.04–105.64] | 29.41 [28.65–29.97] | 153.60→13.85 |
| large | `/timeseries/pupil` | cold | 143.78 [138.52–179.89] | 72.88 [59.78–93.79] | 153.60→13.85 |
| large | `/statistics/pupil` | disk | 102.44 [98.81–116.03] | 23.44 [22.86–24.98] | 153.60→13.85 |
| large | `/statistics/pupil` | cold | 145.03 [131.31–154.35] | 59.51 [53.66–65.51] | 153.60→13.85 |
| large | `/timeseries/distance` | disk | 106.48 [100.33–128.14] | 27.15 [23.76–35.66] | 153.60→13.07 |
| large | `/timeseries/distance` | cold | 142.28 [131.66–222.68] | 60.27 [54.36–94.83] | 153.60→13.07 |
| large | `/statistics/distance` | disk | 101.57 [98.02–131.95] | 21.38 [20.79–23.74] | 153.60→13.07 |
| large | `/statistics/distance` | cold | 135.17 [133.32–174.08] | 54.21 [52.23–60.67] | 153.60→13.07 |
| large | `/timeseries/eeg` | disk | 277.22 [271.61–287.58] | 213.35 [202.28–214.41] | 153.60→17.76 |
| large | `/timeseries/eeg` | cold | 305.49 [272.75–313.02] | 238.90 [228.35–271.37] | 153.60→17.76 |
| large | `/psd/eeg` | disk | 230.74 [225.19–248.10] | 179.86 [170.56–184.21] | 153.60→17.76 |
| large | `/psd/eeg` | cold | 276.00 [265.38–291.32] | 211.87 [203.07–246.05] | 153.60→17.76 |
| large | `/spectrogram/eeg` | disk | 823.46 [725.83–1016.91] | 691.59 [669.63–928.69] | 153.60→17.76 |
| large | `/spectrogram/eeg` | cold | 777.10 [751.08–838.02] | 674.25 [663.46–773.27] | 153.60→17.76 |
| large | `/topography/eeg` | disk | 183.78 [182.00–195.52] | 123.02 [113.30–134.83] | 153.60→17.76 |
| large | `/topography/eeg` | cold | 225.43 [213.84–232.36] | 157.10 [152.83–185.92] | 153.60→17.76 |

Todas las respuestas son byte-equivalentes. Cada muestra abre 1 Parquet; cold descarga 1 archivo completo: 98.844 B small / 17.366.952 B large con 20 ms de demora. Disco cacheado no descarga. RSS por muestra y pico acumulado del proceso constan en medidas.json: no representan pico por consulta. Caché del SO no vaciada; cache HTTP MemoryCache, no Redis real. La primera corrida se interrumpió mientras se instalaba el entorno aislado; medidas-preliminares.json no se usa para aceptación. La corrida final se ejecutó secuencial y sin instalación/checks concurrentes.

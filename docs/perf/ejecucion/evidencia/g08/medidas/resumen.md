# Medición G08

Corpus real sintético: MP4 H.264 de 6,000 s, 640×360@30, 39.976 B, generado y leído por los binarios FFmpeg/FFprobe disponibles de G00. Mismo archivo y runtime recibido para before/after. Protocolo: warmup no contado + n=5; cada observación navega cuatro tiempos `(1,2; 2,3; 3,4; 2,3)` sobre una identidad fresca. Parquet se sustituye únicamente por un DataFrame determinista en memoria; FFprobe y FFmpeg son procesos reales.

| navegación (4 tiempos) | before mediana [min–max], ms | after mediana [min–max], ms | conteo before→after, n=5 |
|---|---:|---:|---:|
| onset preview | 2,661 [2,526–3,215] | 0,749 [0,637–1,416] | Parquet 20→5; cache-only 20→5 |
| video real | 555,580 [544,769–563,033] | 374,810 [370,338–379,441] | ffprobe 20→5; ffmpeg 20→20; downloads 0→0 |

Dispersión (desviación estándar): onset 0,276→0,323 ms; video 6,804→3,643 ms. La reducción de mediana observada fue 71,9% en el helper de onset y 32,5% en la navegación de video. CPU del proceso Python para video: mediana 46,875→15,625 ms y media 43,750→18,750 ms; la resolución del reloj dio 0 ms en el helper corto y no permite comparar CPU allí. Esta CPU excluye hijos FFmpeg/FFprobe y no representa CPU total del sistema.

RAM: la capa acotada declara hasta 1.024×320 B + 256×256 B = 393.216 B de contenido estimado. Es útil para comparar capacidad lógica, no una medición ni cota RSS. No se infieren latencia HTTP, red/Drive, Redis, PostgreSQL, multiworker, nube o distribución congelada. Los JSON completos son `before.json` y `after.json`; los JPEG de ejecución y el corpus permanecen ignorados bajo `output/perf-g08`.

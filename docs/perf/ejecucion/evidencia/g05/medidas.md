# Medidas G05

Base recibida exacta → final G05, mismo Python3.14.3/pandas2.3.3/NumPy2.4.4/PyArrow25, ZIP sintético G00 y expansión exacta de64 bloques. Small2 participantes×1600 filas×2 escenarios; large4×102400×2. Datos/imágenes en RAM, sin cache global/respuesta ni I/O/DB/red en operación. Cada caso warmup1+n5, probes/tests no simultáneos. Colector incluye captura normalizada de evidencia, idéntica en ambos; PDF incluye figuras/Typst/hash de assets. No p95.

| Caso | Antes mediana [mín–máx], ms | Después, ms | Event builds por muestra |
|---|---:|---:|---:|
| small group collect | 361,89 [356,73–390,19] | 211,39 [209,34–217,07] | 16→4 |
| large group collect | 24.371,75 [23.793,59–24.469,48] | 12.198,25 [12.145,82–12.956,78] | 32→8 |
| small build+figuras+PDF | 1.464,25 [1.445,92–1.514,26] | 1.301,95 [1.298,19–1.344,67] | 16→4 |

Reconstrucciones deterministas **−75%**, una por participante/escenario en collect, con/sin AOIs; no variantes cruzadas. Mejora collect observada −41,6% small/−50,0% large en este corpus, superior a dispersión; no extrapolar a aplicación, red ni nube. PDF se registra descriptivamente: 17 assets y330.652B por muestra en ambas fases, sin afirmar aceleración general de render/PDF ni bytes PDF contractuales.

CPU mediana ms collect small359,38→218,75; large24.328,13→12.156,25; build/PDF1.421,88→1.234,38. Mayor RSS snapshot por caso MiB small687,6→688,9, PDF767,9→768,4, large2144,1→1952,1. Peak **acumulado proceso** large2343,4→2079,7MiB; incluye corpus/copies/evidencia previa, no pico de operación y no certificado deployment. Dentro presupuesto probe G00≤5GiB sin aumento material. Las copias de eventos/metadatos para ownership siguen siendo trabajo deliberado.

`before.json`/`after.json` guardan cada muestra, CPU/RSS, conteos y checksums canónicos de equivalencia. La corrida final comparó **objetos completos** de recordings normalizados (arrays, eventos, parámetros/salidas y metadata), JSON de render y SHA256 de17 assets: iguales. Luego compactó85MB de valores sintéticos por fase a~7,4KB de resumen SHA256 **fuera** de tiempos; el probe final hace esa misma compactación fuera de medición. Los futuros checks comparan hashes canónicos y tamaños, no PDF/timestamps. Eventos DataFrame normalizados con precisión decimal15 para captura; tests/goldens independientes protegen precisión científica y metadatos con sus tolerancias originales; no se cambió reconstrucción.

Todos los samples before/after completaron. Logs/JSON finales enlazados en G05.md; primera corrida diagnóstica del probe corrigió `as_json` ya dict antes de n5 completo. No se descartan muestras por variabilidad ni se comparan contra G00 histórico como si fuese base G05.

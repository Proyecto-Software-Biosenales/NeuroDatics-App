# Resultados de la campaña de rendimiento G00–G12

Fecha de corte: 2026-10-03. Base: `f310003bd734203a41268f40a4627bd99d5a3233` más los cambios locales recibidos e inventariados por G00. G00–G10 están aprobados; G11 fue descartado con evidencia. G12 está completo y aprobado por el coordinador, con gate global verde. Los fallos históricos y su diagnóstico se conservan como trazabilidad, no como estado vigente.

## Resultado ejecutivo

La campaña redujo trabajo repetido sin cambiar los contratos científicos protegidos: carga de vistas EEG bajo demanda, caché frontend aislada por sesión/proyecto/generación/digest espacial, proyecciones Parquet, singleflight backend, eventos de fijación compartidos dentro de una operación, algoritmos AOI/cadencia lineales, carga por lotes y acotada de informes, metadatos de preview, persistencia por lotes y comparativas v3. El candidato geométrico de G11 se descartó porque su mediana fue −1,80% con 12 regresiones y hasta +19,29%.

Las pruebas dirigidas de G12 pasaron, las matrices G00→G12 se reprodujeron en Python 3.14.3/PyArrow 25.0.0 y Chromium con warmup+n=5, y producción/local pasaron sus comprobaciones aisladas. No se validaron PostgreSQL, Redis, Drive, nube ni una distribución congelada reales.

## Comparación homogénea G00 → G12

El detalle de las 54 filas, rangos, muestras, contadores y hashes está en [comparison-g00-g12.json](evidencia/g12/comparison-g00-g12.json). No se suman bytes de modelos directos, JSON, transferencia y archivos; los porcentajes son medianas descriptivas n=5 y los rangos siguen siendo autoritativos.

| Flujo, mismo corpus/fase | G00 | G12 | Cambio observado |
|---|---:|---:|---:|
| Informe `collect`, small | 372,10 ms; 16 builds | 186,78 ms; 4 builds | −49,8%; builds −75% |
| Informe `collect`, large | 21.658,69 ms; 32 builds | 8.494,72 ms; 8 builds | −60,8%; builds −75% |
| Carga fría informe, large, I/O 20 ms | 393,92 ms; 4 resoluciones | 273,97 ms; 1 batch | −30,5%; mismos 4 downloads/reads |
| AOIs HTTP sin caché, large | 1.162,07 ms | 663,99 ms | −42,9%; 1 lectura y bytes iguales |
| GSR temporal HTTP sin caché, large | 172,79 ms | 36,20 ms | −79,0%; 1 lectura y 102.704 B iguales |
| Onset video 4 consultas, large | 312,77 ms; 4 lecturas | 1,71 ms; 0 lecturas | −99,5%; generación aún 4× |
| Preview frío FFmpeg, small | 181,79 ms; ffprobe+FFmpeg | 65,05 ms; FFmpeg | −64,2%; fuente ya local |
| Informe EyeTracker + figuras/PDF | 2.063,45 ms; 16 builds | 1.300,94 ms; 4 builds | −37,0%; 17 assets y PDF 330.652 B iguales |
| Guardado 1.000 participantes, fake | 31,86 ms; 1.000 selects/flush/refresh | 8,24 ms; 2 selects/1 flush | −74,1%; no es latencia SQL real |
| Guardado 1.000 AOIs, fake | 24,85 ms; 1.002 selects/1.000 refresh | 7,10 ms; 3 selects/1 flush | −71,4%; no es latencia SQL real |

### Navegador producción

Misma fixture G00-UI, 1440×1000, DPR 1, demora API 20 ms y n=5. G12 añade sólo las formas de mock que el contrato actual exige (detalle de proyecto y comparativas v3).

| Paso | G00 | G12 | Lectura |
|---|---:|---:|---|
| A inicial | 745,89 ms; 5 req; 53.129 B | 728,57 ms; 5 req; 36.054 B | −2,3% tiempo; −32,1% bytes fixture |
| PSD | 98,32 ms; 0 req | 165,48 ms; 1 req; 17.499 B | coste diferido intencional de la primera vista PSD |
| Espectrograma | 166,16 ms; 1 req | 149,82 ms; 1 req | −9,8%; bytes iguales |
| Topografía A | 167,33 ms | 200,14 ms | +19,6%, dentro del rango G00 167,09–231,94 ms |
| B topografía | 149,91 ms; 6 req; 70.743 B | 249,79 ms; 5 req; 18.352 B | −1 request/−74,1% bytes; tiempo mayor y descriptivo |
| Regreso A topografía | 166,21 ms; 6 req; 70.743 B | 99,77 ms; 1 req; 424 B | −40,0% tiempo; −5 req/−99,4% bytes fixture |
| Comparativas v3 | sin fila G00 | 166,52 ms; 1 req; 126 B | evidencia actual, no baseline inventado |

El build G12 tiene 44 chunks JS y 2.322.862 B sin comprimir frente a 43/2.318.001 en G00 (+4.861 B); gzip independiente 697.829 frente a 695.433 B (+2.396 B). No se interpreta la suma de chunks como descarga inicial.

## Composición de recursos

El caso integrado usa autorización y helpers actuales, Parquet sintético G00 y adaptadores DB/Drive falsos. Solapa tres preparaciones de informe y seis consultas distintas en un proceso/event loop:

| Recurso | Configuración | Máximo observado |
|---|---:|---:|
| respuestas backend | 4 running, 32 queued, 256 consumers | 4 running, 6 entries/consumers |
| archivos Parquet | 4 running, 32 queued, 256 consumers | 4 running, 6 entries/consumers |
| I/O de informe | 2 running, 16 waiting | 2 running, 4 waiting |
| Drive físico fake | gobernado por Parquet | 4 descargas activas |
| decodificaciones Parquet | sin cota global propia | 6 activas |
| cómputos de respuesta | gobernados por respuesta | 4 activos |

Una solicitud no autorizada devolvió 404 antes de consulta de caché o Drive. Una consulta y un informe cancelados dos veces siguieron pendientes con slots 4/4/2 ocupados hasta liberar el trabajo físico; al final todas las entries, consumers, running y waiting quedaron en cero. Evidencia: [integrated-resource-composition.json](evidencia/g12/integrated-resource-composition.json).

El working set muestreado de ese harness small fue 300.539.904 → máximo 318.230.528 B. La matriz backend G12 alcanzó 3.668.959.232 B frente a 3.870.318.592 B actuales en G00, ambos bajo el presupuesto experimental de probe de 5 GiB. Son procesos/harness acumulados, no picos aislados ni cotas de despliegue.

La evidencia separada de bytearrays alcanzó 1.853.132.800 B con diez páginas calibradas a frames large; sigue siendo sólo una estimación contrastiva, no DataFrames ni peak de aplicación. No existe cota global de RAM porque tamaño Parquet, filas/columnas, respuestas, decodificaciones simultáneas e informes concurrentes no tienen un límite numérico conjunto.

Límites vigentes: JSON Redis 8 MiB/valor y TTL 900 s; fallback local 128 MiB total; imagen 256 items/64 MiB; metadatos de preview 1.024 onset + 256 duration (estimación máxima 393.216 B); disco de medios 2 GiB/72 h; Parquet TTL 4 h **sin límite global de bytes**. Frontend mantiene dos presupuestos de 4 activas/128 cola/48 entries con 16+8 MiB de contenido estimado y 64 contextos; el overhead/RSS no está acotado por esas cifras.

## Verificación de G12

| Comprobación | Resultado |
|---|---|
| Integración backend afectada | 235 passed; exit 0 |
| Integración frontend | 37 passed; exit 0 |
| Matrices backend/media/browser | warmup+n=5, exits 0 |
| Build producción aislado | aprobado; 236/236 fuentes coincidían al verificarlo; única diferencia posterior: anotaciones/importaciones de tipo del fixture E2E, sin cambio de producto |
| E2E producción dashboard/Comparativas/EEG | 11 passed; exit 0 |
| Build/export local aislado | aprobado |
| Smoke local Chromium | EEG cuatro vistas, A→B→A y Comparativas; exit 0; 404 de prefetch RSC conocido, sin `pageerror` |
| Caso integrado recursos/cancelación | exit 0; settlement limpio |
| `verify.ps1` | **exit 0**: item 14 completado; ESLint 0 errores/6 warnings, `ALLGREEN`, `VERIFY_EXIT=0` |

## Pendientes y riesgos

- Los fallos históricos de ownership/settings fueron corregidos por el corrector aprobado en cinco fuentes: cuatro fakes con `owner_id=CURRENT_USER` y los dos defaults de `ReportIOBudget` en `backend/.env.example`. La corrección G10 sólo añadió importaciones/anotaciones de contrato al fixture E2E; su typecheck/lint dirigido pasó. El gate global posterior quedó verde en `evidencia/g12-tipos/revision-coordinador-gate.json`.
- El primer aborto por ruta relativa y los diagnósticos intermedios se conservan como histórico. `verify-final.log` no contiene todos los streams, pero la captura completa root y el JSON de revisión confirman el gate verde; no se repite el gate.
- PostgreSQL, Redis, Drive y nube reales quedan pendientes. SQLite/DDL/fakes no prueban equivalencia de motor o despliegue.
- No se reconstruyó ni ejecutó una distribución congelada. El build/export `local` y su smoke no prueban el `.exe`, PostgreSQL embebido o adopción de procesos.
- Los bytes son de fixtures o serialización directa según cada fila; no son ahorro de red o almacenamiento real salvo que la fase lo diga.
- No hubo cambios de producto en G12 ni deploy, publicación, migración o distribución. Revisión root aprobada: 1.092 archivos recibidos intactos y ocho diferencias autorizadas; snapshot 362/362 intacto. No queda trabajo local autorizado pendiente. El cierre y la gestión de la automatización están registrados en ORQUESTACION.md.

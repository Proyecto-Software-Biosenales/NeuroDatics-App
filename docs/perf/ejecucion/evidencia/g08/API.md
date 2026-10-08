# Contrato G08 — preview temporal de video

`GET /projects/{project_id}/files/{file_id}/preview` conserva parámetros, respuesta JPEG, redondeo final a 0,1 s, fallback y límites (`time_s` 0..86400, timeout FFmpeg 45 s). Cada request vuelve a consultar la fila unida a proyecto y exige owner vigente, archivo no eliminado, MIME/kind de video, referencia externa e identidad `id:external_id:updated_at`; ningún hit evita auth ni DB.

## Referencia temporal

Preview conserva su semántica propia: para un escenario concreto hace `dropna(time)`, filtra escenario, convierte a numérico, toma el mínimo y rechaza el onset si ese mínimo no es finito. No redondea el onset, calcula `max(0, absoluto-onset)` y redondea el relativo a 4 decimales antes del redondeo de frame a 0,1 s. `all`, participante ausente, columnas/datos ausentes, `-Inf` mínimo o fallo conservan tiempo absoluto. Esto no se unifica con `ScenarioTimingService`: éste toma el mínimo finito y redondea onset/end a 6; `gsr_origin_s` sigue siendo otro campo.

La primera lectura usa la proyección G03 `video-preview-timing`, opcional `time,scenario`. La clave de onset es `(project_id, generation, participant_code, scenario)`; admite `None` como resultado conocido. Generación desconocida nunca se retiene. Una generación distinta no puede leer entradas anteriores; el sweep post-reingesta limpia la capa, y aun si ese sweep falla las claves antiguas sólo quedan huérfanas hasta TTL/LRU.

## Duración, frames y coordinación

La duración se guarda por identidad vigente `id:external_id:updated_at` y además se valida contra `(st_dev, st_ino, st_size, st_mtime_ns)` del video local. Un cambio o desaparición obliga a reprobar; fallos/no positivos de `ffprobe` no se cachean. Los frames y el ETag siguen incluyendo identidad y tiempo a 0,1 s. Si el frame vigente existe y tiene bytes, un `If-None-Match` exacto responde 304 antes de `read_bytes`; tras una extracción ocurre la misma comprobación antes de leer el JPEG.

El lock existente sigue siendo uno por identidad de video: no aparece pool nuevo ni sube concurrencia FFmpeg. Cada entry cuenta usuarios desde admisión hasta cleanup, por lo que no se elimina durante la ventana `release`→reanudación del waiter; un tercero entra al mismo lock. Descarga y extracción usan `settled_thread`, por lo que cancelación del request no libera el lock hasta settlement físico. Misses simultáneos del mismo video producen una sola descarga/extracción; videos distintos conservan el comportamiento previo.

## Capacidad, TTL e invalidación

- Onset: TTL 300 s, LRU 1.024 entradas, estimación diagnóstica 320 B/entrada.
- Duración: TTL 3.600 s, LRU 256 entradas, estimación diagnóstica 256 B/entrada.
- Máximo estimado conjunto del contenido contable: 393.216 B. No existe un tercer registro por proyecto/generación; las generaciones viven únicamente dentro de la LRU de onset. El exceso de proyectos se prueba con capacidad reducida y expulsa LRU. La suma no es una cota de RSS: excluye overhead del intérprete, locks, DataFrames, requests, JPEG/video y workers/subprocesos.
- Configuración: `VIDEO_ONSET_CACHE_TTL_SECONDS`, `VIDEO_ONSET_CACHE_MAX_ITEMS`, `VIDEO_DURATION_CACHE_TTL_SECONDS`, `VIDEO_DURATION_CACHE_MAX_ITEMS`; mismos defaults en servidor y modo local. Sólo cambian directorios de disco según la política local existente.
- Reingesta: generación nueva aísla inmediatamente onset; el janitor post-commit limpia onset/duración.
- Reemplazo/cambio de archivo: identidad DB nueva cambia todas las claves; cambio local bajo la misma identidad invalida duración por huella.
- Eliminación: la ruta ya no encuentra filas eliminadas y el delete de proyecto invalida onsets del proyecto; duración/frames huérfanos expiran o los retira janitor.
- Janitor: tras cada sweep limpia conservadoramente toda metadata de preview, porque los nombres de disco son hashes opacos. La carrera es segura: una entrada repoblada se vuelve a validar contra generación/identidad/`stat` en su siguiente uso.

Todo es local al proceso, sin Redis ni promesa multiworker/distribuida. Para G12 deben mantenerse auth/identidad antes de hits, la diferencia científica de onset, los límites anteriores y la ausencia de una cota RSS derivada de estimaciones.

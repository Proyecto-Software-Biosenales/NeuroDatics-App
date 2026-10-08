# API G07 — lote, medios y presupuestos

## Parquet por lote

`ParquetReaderService.resolve_user_parquets(project_id, participant_codes)` carga candidatos una vez y devuelve dos mapas, `resolved` y `errors`, keyed por el código solicitado. Conserva comparación exacta salvo whitespace, prioridad `file_metadata.participant_code`/`block_metadata.participant_code`, filtros proyecto/kind/deleted/type y errores visibles por duplicado/desconocido. Sólo si **todos** los candidatos carecen de identidad carga participantes una vez y aplica el legacy posicional; una mezcla identificado/sin identificar continúa siendo ambigua para quien no tenga match.

`prepare_batch(project_id, codes, generation)` fija una generación normalizada; si recibe `None`, consulta la generación vigente **una vez**. Detecta paths cacheados, pero resuelve todas las identidades y un cliente de almacenamiento antes de workers: así cada `PreparedParquetRead` lleva path + UUID/external_id/generación exactos y puede recuperarse sin DB si el janitor elimina el path antes de abrirlo. Devuelve `PreparedParquetBatch(reads, errors, storage_client)`. `read_prepared(...)` no usa DB/ORM, reintenta por la identidad preparada sólo ante `OSError` del path, y devuelve un DataFrame dueño del consumidor. Archivo frío/recovery conserva `parquet_flights` G04 y publicación atómica; nunca cambia a otra generación. Cada código necesario conserva su descarga/decodificación full G03. No hay caché global de frames.

## Imágenes compartidas

`projects.infrastructure.image_cache` es la capa común, sin imports de HTTP:

- `project_image_ref(ProjectFile)` extrae identidad escalar y exige MIME `image/*` + `external_id`.
- `get_cached_project_image(ref)` consulta disco/memoria existentes.
- `load_project_image(ref, storage_client)` reconsulta tras admisión, comparte un miss por `id:external_id:updated_at` y devuelve bytes/MIME/ETag/status.

La ruta HTTP conserva auth/owner/project/deleted antes de llamar la capa y conserva 304 antes de leer caché. El informe parte del `Project` autorizado y de `Scenaries.file` precargado; además exige `file.id == scenario.file_id`, mismo `project_id`, `deleted_at is None`, MIME y storage ref. Escenarios repetidos con el mismo archivo usan un mapa y una descarga. Disco usa SHA-256 de la identidad completa (`id:external_id:updated_at exacto`) y un sidecar versionado con cache_key/MIME/tamaño/SHA-256; sólo tras validar el cuerpo certifica hit. Publica body+metadata con temps/replace y una intercalación incoherente se vuelve miss, nunca cuerpo de otra identidad. Los antiguos archivos UUID/MIME sin identidad quedan ignorados y el janitor real los elimina por edad/presupuesto; no se certifican como hit nuevo. Caché en memoria existente: 256 entradas, 64 MiB de contenido, TTL 300 s; archivos siguen bajo el janitor de medios 2 GiB/72 h. `image_flights`: 2 running/16 queued/128 consumidores por proceso/loop, timeout 120 s.

El cliente Google Drive es compartible entre los dos workers: mantiene `httplib2`/service en `threading.local` y protege cambios de credenciales; el cliente local hace lecturas independientes y protege mutaciones con `RLock`. Los 47 contratos de ambos clientes pasan. El cliente se construye serialmente con la sesión del request antes de workers y éstos reciben sólo el handle + scalars.

## Concurrencia y cancelación

Cada informe crea como máximo `REPORT_IO_MAX_CONCURRENCY` workers, no una task por participante. Configuración validada: `report_io_max_concurrency` ∈ {1,2}, default 2; `report_io_max_waiting` 0–16, default 16. `report_io_budget` es por proceso/event loop: máximo 2 operaciones activas y 16 workers en espera sumando informes. La cola FIFO transfiere el slot ocupado al waiter **antes** de despertarlo; durante el handoff `running` permanece reservado, por lo que un newcomer no excede espera, incluido `max_waiting=0`. Resultados/excepciones se guardan por índice: orden de participantes y warnings no depende del orden de finalización. DB/ORM/generación/OAuth se resuelven antes de los workers; render/Matplotlib/PDF siguen en un único thread posterior, nunca dentro del pool.

Cancelar un worker conserva el slot hasta settlement físico de `settled_thread`; una descarga fría además conserva el slot G04 de `parquet_flights`. Render usa el mismo contrato de settlement. No se cierra DB bajo una tarea: no hay DB dentro de factory/worker y el request espera su cancelación. Errores parciales se transforman en el warning previo por participante; imágenes fallidas quedan `None` y conservan el aviso general.

Composición por proceso: G04 mantiene 4 response flights + 4 file flights, 32 en cola/256 consumidores por nivel. G07 permite 2 decodes/I/O directos de informe; pueden coexistir con hasta 4 decodes HTTP, es decir, una estimación conservadora de 6×161 MiB ≈966 MiB de frames transitorios, **no un bound RSS**, además de hasta cuatro frames retenidos (~644 MiB) por informe. Un informe G07 por sí solo limita transitorio a ~322 MiB (2×161), bajo el candidato 512 MiB; fuente/tamaño desconocido conserva 2 o se configura 1, nunca autoescala. El probe experimental ≤5 GiB no garantiza contenedor/deployment ni cubre informes simultáneos ilimitados.

G08 puede consumir la capa de medios sin importar routes, manteniendo identidad/generación propia de video. G10 puede usar `prepare_batch/read_prepared` sólo si conserva auth, una generación y el presupuesto; no debe retener frames ni crear otro pool.

# Contratos y presupuestos integrados G12

G12 no añade API ni cambia producto. Esta ficha consolida garantías vigentes comprobadas por pruebas previas y por la integración G12.

## Identidad e invalidación

- Cada solicitud backend verifica owner/proyecto antes de unirse a caché o singleflight. Las claves incluyen owner, proyecto, participante, generación, operación/argumentos y proyección; AOI/placement añade digest espacial independiente.
- Frontend aísla sesión/usuario/proyecto/generación/revisión/digest. Logout, cambio de usuario/proyecto, reingesta, AOI/placement, focus/reopen y generación desconocida están cubiertos por integración existente; unknown no se retiene como resultado cacheable.
- Parquet preparado fija proyecto, participante, file id, external id y generación antes de workers. Sweep/filechange recupera esa identidad exacta sin volver a DB.
- Video conserva owner/deleted/MIME/identidad; 304 ocurre después de autorización y antes de bytes JPEG.
- Comparativas v3 conserva errores/empty por señal y estadísticas sobre muestras de resolución completa; la gráfica puede estar decimada sin alterar la tabla.

## Concurrencia y settlement

| Instancia, por proceso/event loop | Running | Cola/waiting | Consumers/entries |
|---|---:|---:|---:|
| respuesta analytics | 4 | 32 | 256 consumers; 36 keys admitidas |
| archivo Parquet | 4 | 32 | 256 consumers; 36 keys admitidas |
| imágenes | 2 | 16 | 128 consumers; 18 keys admitidas |
| I/O informe | 2 | 16 waiting | workers fijos por informe |

El owner conserva recursos de solicitud/DB hasta settlement del factory; `settled_thread` conserva el slot durante trabajo no preemptible. Un follower puede cancelar sin cancelar al survivor. Timeout 120 s solicita cancelación pero no es preempción dura del thread.

El caso integrado observó 4 descargas, 6 decodificaciones y 4 cómputos físicos simultáneos. Por ello las cotas de admisión individuales no forman una cota global de RAM ni de decodificaciones.

## Cachés y almacenamiento

- Redis JSON: 8 MiB por valor, TTL 900 s. Fallback local sin Redis: 128 MiB total.
- Frontend: red 4/128/48/16 MiB y tarjetas 4/128/48/8 MiB, 64 contextos, TTL 5 min. Son pesos de contenido estimados más overhead, no RSS.
- Imágenes: 256 items/64 MiB/300 s. Metadatos video: onset 1.024/300 s y duration 256/3.600 s, máximo estimado 393.216 B.
- Medios en disco: 2 GiB/72 h. Parquet: TTL 4 h y **sin límite global de bytes**.

## No cubierto

No se infiere equivalencia de PostgreSQL, Redis, Drive, nube, multi-proceso, paquete frozen o memoria global. Los adapters G12 son fakes controlados y el corpus es sintético.

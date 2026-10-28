# Arquitectura

Panorama de NeuroDatics para alguien que llega al repositorio por primera vez: qué hace la
aplicación, cómo se reparte en piezas, por dónde pasan los datos y dónde está documentado cada tramo
en detalle. No repite lo que ya está escrito en otra parte: enlaza.

## Qué hace la aplicación

NeuroDatics recibe los datos crudos de una sesión de bioseñales —un experimento con eye tracker,
EEG y GSR— y los convierte en analítica consultable: series de tiempo, fijaciones, mapas de calor,
recorridos de la mirada, áreas de interés, correlaciones e informes en PDF.

La entrada es la carpeta que exporta el software de adquisición: un CSV con todas las grabaciones y
las carpetas de imágenes y vídeos que se mostraron como estímulo. Un solo CSV contiene varios
participantes, cada uno con sus propios metadatos, columnas y frecuencias de muestreo; el formato es
europeo (punto y coma, coma decimal), los encabezados llevan acentos y la codificación puede ser
UTF-16, UTF-8 o Latin-1. La aplicación interpreta ese archivo, detecta las fijaciones desde la mirada
cruda y deja los resultados en un formato columnar que las consultas analíticas pueden leer barato.

La aplicación es multiusuario en la edición de servidor: cada proyecto tiene un dueño, y toda lectura
y escritura pasa por `(project_id, owner_id)`. Un proyecto ajeno devuelve 404 y no 403, de modo que
los identificadores no se pueden sondear.

## Dos ediciones, un solo código

El mismo `backend/` y el mismo `frontend/` sirven a dos ediciones. Solo se entrega la local; la edición en red
se conserva sin uso actual para quien quiera alojarla ([alojamiento-en-red.md](alojamiento-en-red.md)).

| | En red (sin uso actual) | Local (la que se entrega) |
| --- | --- | --- |
| Despliegue | Docker Compose: `db`, `redis`, `backend`, `frontend` | Un ejecutable para Windows, sin instalación |
| Sesión | Inicio de sesión con Google (OAuth 2.0) y un JWT propio | Perfiles con solo un nombre, sin contraseña; cada uno con sus proyectos |
| Base de datos | PostgreSQL (16 en Compose; también sirve una gestionada) | PostgreSQL 16 embebido, arrancado por el lanzador |
| Archivos | Google Drive | Una carpeta en disco bajo el perfil del usuario |
| Caché | Redis | Una caché en proceso, acotada y con vencimiento |
| Frontend | Next.js servido por su propio contenedor, que además hace de proxy de `/api` | Exportación estática que sirve el propio backend |
| Red | Puerto 3000 publicado; el backend solo en la red interna | Solo `127.0.0.1`; cualquier conexión fuera de loopback es un error |

Lo que **no** comparten es exactamente lo que depende de Google o de la infraestructura del
servidor: el inicio de sesión con Google, Drive y su OAuth, Docker, Redis, el proxy y el despliegue en
red. Todo lo demás —ingesta, análisis, informes, pre-experimentos, cuestionarios, migraciones e
interfaz— es el mismo código en las dos ediciones.

La bifurcación está en dos sitios y nada más:

- **Backend:** `settings.is_local` (`backend/src/neurodatics/config/settings.py`). El router decide
  qué se monta (`api/router.py`): en local se monta un router de sesión local y no se montan ni el de
  Google ni el de la integración con Drive; los módulos de proyectos, participantes, escenarios,
  analítica e informes se montan en las dos. Los imports de Google viven dentro de la rama de
  servidor, así que en local las bibliotecas de Google no se cargan nunca.
- **Frontend:** `IS_LOCAL_MODE` (`frontend/lib/appMode.ts`), que lee `NEXT_PUBLIC_APP_MODE` y se
  resuelve en tiempo de compilación. Nunca se decide por la URL.

El código propio de la edición local está en `backend/src/neurodatics/local/`: el lanzador
que prepara el entorno, arranca PostgreSQL y ejecuta las migraciones antes de importar la aplicación
(`launcher.py`), el control del clúster (`postgres.py`), la instancia única (`instance.py`), el
servicio del sitio estático (`static_frontend.py`) y el guard que detecta cualquier intento de salir
a la red (`offline_guard.py`). La construcción y el empaquetado viven en `student/`
([student/README.md](../../student/README.md)).

## El recorrido de los datos

```
Carpeta del laboratorio (CSV + Images/ + Videos/)
  → el navegador la analiza y la empaqueta en un ZIP
  → POST /api/projects/{id}/files/experiment-zip
  → validación del archivo (tamaño, bombas zip, estructura)
  → extracción a un directorio temporal, segura ante recorrido de rutas
  → sondeo de los estímulos (dimensiones intrínsecas) y resolución de su ubicación en pantalla
  → parseo del CSV por bloques de participante → detección de fijaciones → Parquet
  → subida de medios y Parquet al almacén de objetos
  → una transacción publica archivos, escenarios, participantes, sensores y la generación
  → ingestion_status = READY
  → la analítica lee el Parquet desde la caché o el almacén
  → gráficas, mapas de calor, AOI, informes en PDF
```

Todo lo que va de la validación a la publicación corre **de forma sincrónica dentro de la solicitud
HTTP**. No hay cola ni worker de ingesta. Redis sirve a la caché de analítica, no a la durabilidad de
la subida. Lo que sí hay es un registro durable por intento (`upload_attempts`), un bloqueo de
mutación por proyecto y un bucle de recuperación acotado que cierra lo que un corte deje abierto.

El detalle completo —la frontera de recepción, los límites configurables, la cancelación, la
semántica de cada fallo y la recuperación— está en [subida-de-experimentos.md](subida-de-experimentos.md).

### Por qué un Parquet por participante y por escenario

El parseo escribe, para cada bloque de participante, un Parquet completo y además una partición por
escenario:

```
processed/user1/user1.parquet
processed/user1/escenarios/Scenario_1.parquet
```

Casi toda la analítica está acotada a un estímulo, y leer un archivo ya filtrado es mucho más barato
que filtrar una grabación entera en cada solicitud. El formato es columnar, así que una consulta de
EEG lee dos de unas cuarenta columnas. El Parquet es **aditivo**: los valores crudos `gx`/`gy` se
conservan intactos para poder auditarlos, y la salida del detector se añade como columnas nuevas con
su procedencia. Nada se sobrescribe, así que un resultado en disputa siempre se puede recalcular
desde los valores fuente del mismo archivo.

Dos decisiones del parseo que explican casi todo lo demás: **falla en voz alta** —rechaza datos mal
formados en vez de repararlos— y **es conservador** —prefiere reportar menos atención que inventarla.
Cuando dos fuentes se contradicen, gana la más lenta y la más cruda: la mirada cruda vence a las
fijaciones del fabricante, el reloj más lento fija la frecuencia efectiva, una muestra inválida
invalida sin apelación, y una coordenada imposible se rechaza en lugar de recortarse al borde.

El detector de fijaciones, sus cinco variantes de duración mínima, la máscara de validez y la
reconstrucción de `duration_s` están en [deteccion-de-fijaciones.md](deteccion-de-fijaciones.md). La conversión de las
coordenadas de pantalla al sistema del estímulo, que se resuelve antes de detectar, está en
[coordenadas-pantalla-estimulo.md](coordenadas-pantalla-estimulo.md).

## El backend y sus fronteras

El backend es FastAPI sobre Python, con SQLAlchemy 2 asíncrono, pandas, numpy, scipy y pyarrow para
el cálculo, matplotlib y Pillow para las figuras, ffmpeg para los cuadros de vídeo y Typst para la
composición de los informes. Vive en `backend/src/neurodatics/`:

| Carpeta | Contenido |
| --- | --- |
| `main.py`, `api/` | La aplicación, los middlewares, el montaje de routers, `/health` y `/health/ready`. |
| `config/` | `settings.py` (toda la configuración, con validaciones de seguridad para producción) y el registro. |
| `modules/` | Los módulos funcionales: `projects`, `participants`, `scenaries`, `analytics`, `reports`, `settings`, `auth`, `integrations`. |
| `infra/` | Lo que habla con el mundo: `db` (sesión, modelos, repositorios), `cache`, `storage`, `queue` (la conexión a Redis), `health`. |
| `shared/` | Contratos neutros: identidad de escenario, contrato de fijaciones, generación de caché, recursos de la máquina, excepciones. |
| `local/` | La edición local. |
| `diagnostics/` | Comprobación operativa de la conectividad externa, ejecutable desde el contenedor. |

Cada módulo funcional repite la misma estructura interna: `api/` (rutas y esquemas Pydantic),
`application/` (casos de uso y servicios), `domain/` (entidades y reglas) e `infrastructure/`
(repositorios y adaptadores).

Hay una convención asumida en ese `domain/`: los `modules/*/domain/entities.py` son modelos ORM de
SQLAlchemy. Los módulos que tienen entidades —`projects`, `participants`, `scenaries` y `settings`— declaran
sus clases sobre `infra.db.base.BaseModel`, con `Column`, `ForeignKey` y `relationship`, así que el
dominio depende de la persistencia y no al revés. Es deliberado y es coherente en todos, no un
descuido. Lo que implica: una entidad no se instancia fuera de una sesión de SQLAlchemy (ni sirve como
objeto de transporte entre capas; para eso están los esquemas de `api/`), y las reglas que no son de
persistencia no se cuelgan de esas clases, sino que viven en `domain/` como funciones o clases aparte
—el ejemplo es `scenaries/domain/stimulus_placement.py`, que resuelve el contrato
`screen-stimulus-v1` sin importar SQLAlchemy.

Las fronteras que importan no son una convención: están verificadas por `backend/.importlinter`, que
`./verify.ps1` ejecuta como parte de la puerta.

| Contrato | Qué prohíbe |
| --- | --- |
| `analytics-processing` | `modules.analytics` no puede depender de `modules.projects.application`. |
| `processing-analytics` | `modules.projects.application` no puede depender de `modules.analytics`, salvo los cruces declarados. |
| `shared-neutral` | `shared` no puede depender de ningún `modules`. |

Los dos primeros evitan que ingesta y analítica formen un ciclo: la ingesta produce artefactos y la
analítica los consume, sin que ninguna llame a la otra; lo que comparten pasa por `shared/`. El tercero mantiene `shared/` como lo que dice ser, un lugar de contratos sin
dependencias hacia las funciones.

Dos matices de esa frontera, los dos decisiones escritas y no accidentes. El primero es una
dependencia permitida: la analítica **sí** importa `modules.projects.domain.entities` —`Project` y
`ProjectFile`— en sus rutas, en el lector de Parquet y en el almacén de tokens de transformación,
porque necesita esos modelos ORM para resolver de quién es el proyecto, qué archivos tiene y cuál es
la generación vigente. Lo que el contrato prohíbe es depender del `application` de proyectos, es
decir de sus casos de uso y servicios: la analítica lee lo ya publicado, no dispara el procesamiento.
El segundo es una excepción declarada en el sentido contrario: `processing-analytics` cubre hoy todo
`modules.projects.application`, y `ignore_imports` lista los cruces que existen. Al publicar una
generación nueva hay que invalidar lo derivado de la anterior, y la ingesta
(`use_cases/upload_experiment_zip.py`) lo hace llamando directamente a las dos cachés de analítica,
`ParquetCacheService` y `AnalyticsRedisCache`; la poda de medios alcanza el mismo módulo de forma
indirecta, al reutilizar un ayudante numérico de analítica. Al estar declaradas, el contrato impide
que aparezcan cruces nuevos sin que nadie lo note. Cerrarlas del todo sería un puerto en `shared` que
analítica implemente, como ya se hace con `storage_provider`.

La superficie HTTP, toda bajo `/api`:

| Router | Para qué |
| --- | --- |
| `auth` | URL de inicio de sesión con Google e intercambio del código (en local, la sesión fija). |
| `projects` | Proyectos, subida del ZIP, progreso y cancelación, proxy de medios, sensores, finalización, pre-experimentos. |
| `participants` | Participantes de un proyecto. |
| `scenaries` | Escenarios (estímulos), sus AOI y la ubicación del estímulo. |
| `analytics` | Series de tiempo y estadísticas por sensor, PSD, espectrograma y topografía de EEG, fijaciones, histograma, scanpath, mapa de calor, AOI, correlaciones, comparativas, tiempos de escenario. |
| `reports` | Generación de los informes en PDF. |
| `settings` | Ajustes globales de cada persona: la pantalla del experimento (por defecto 1280×1024) y si ya la revisó. |
| `integrations/google-drive` | Solo el retorno (callback) de OAuth, que acepta el enlace firmado que emite el comando de administración `python -m neurodatics.modules.integrations.google_drive.admin`. Solo en servidor. |

Los pre-experimentos y los cuestionarios, que permiten registrar un proyecto antes de tener datos,
se describen en [usuario/pre-experimento.md](../usuario/pre-experimento.md) (cómo se usan) y en
[pre-experimento.md](pre-experimento.md) (cómo se guardan y su API).

### Informes

Los informes son un PDF por dispositivo, no un único informe ejecutivo. Los servicios de analítica
aportan los números, los constructores por dispositivo deciden qué dice el informe, y una plantilla
de Typst hace la composición. Como reutilizan los mismos servicios que el tablero, el PDF y la
pantalla no pueden discrepar. Ver [informes.md](informes.md).

## Dónde viven los archivos

Los datos se reparten en tres lugares, y conviene no confundirlos:

- **PostgreSQL** guarda lo relacional y transaccional: usuarios, proyectos, archivos, participantes,
  sensores, escenarios, AOI, ubicaciones de estímulo, intentos de subida y tareas de limpieza. Las
  columnas JSONB llevan los metadatos variables (`file_metadata`, los tokens de transformación). Las
  migraciones son de Alembic y se ejecutan al arrancar: en Docker por el script de inicio, en la
  edición local por el lanzador, contra el PostgreSQL 16 embebido. Por eso una migración no
  puede usar extensiones que no vengan en ese paquete.
- **El almacén de objetos** guarda los bytes: las imágenes y vídeos de estímulo seleccionados y los
  Parquet derivados. Es Google Drive en servidor y una carpeta en disco en local. La elección la hace
  un solo módulo, `modules/integrations/storage_provider.py`, y todo el que antes importaba el
  cliente de Drive lo importa de ahí. Las dos implementaciones tienen los mismos métodos y las mismas
  formas de retorno, y una prueba compara sus firmas para que no se separen. **Una función nunca
  importa el cliente de Drive directamente.**
- **Las cachés** guardan lo derivado, y nada que esté solo en una caché es un dato.

Los medios nunca se sirven desde Drive al navegador. Dos endpoints autenticados se interponen:
`GET /{project_id}/files/{file_id}/image`, con caché en disco, caché en memoria y un cerrojo por clave
para que dos fallos simultáneos descarguen una sola vez, y
`GET /{project_id}/files/{file_id}/preview`, que extrae el cuadro de un vídeo con `ffprobe` y `ffmpeg`
invocados con una lista de argumentos y tiempos límite acotados, nunca como cadena de shell.

## Las cachés y por qué están acotadas

Hay cuatro en el servidor, y todas tienen un tope:

| Caché | Dónde | Cómo se acota |
| --- | --- | --- |
| Parquet en disco | `PARQUET_CACHE_DIR` | TTL de 4 horas; tras una ingesta se conserva la generación vigente y una anterior, con un tope de borrados por poda. |
| Respuestas analíticas | Redis en servidor, caché en proceso en local | TTL de 900 s; la invalidación por generación rancia tiene un tope de borrados. |
| Medios (imagen, vídeo, cuadro) | `IMAGE_CACHE_DIR`, `VIDEO_CACHE_DIR`, `VIDEO_FRAME_CACHE_DIR` | Un conserje con topes de tamaño (2 GiB), edad (72 h) y número de borrados por pasada. |
| Metadatos de vídeo en memoria | En proceso | TTL y número máximo de entradas. |

Los topes no son adorno. Dos razones concretas:

**Una resubida acuña identificadores nuevos.** Las entradas viejas no se vuelven a visitar nunca, así
que sin un conserje crecerían sin fin. Y el conserje está acotado por pasada precisamente para que
nunca pueda frenar el camino de una solicitud: limpiar es un trabajo de fondo, no un peaje.

**La identidad de la caché es la generación de ingesta.** Cada clave contiene el contador
`ingestion_generation` del proyecto. Resubir lo incrementa en la misma transacción que publica, lo que
vuelve inalcanzable toda entrada anterior de un golpe: sin recorrer claves, sin carrera y sin
posibilidad de servir los números de la subida vieja. Se conserva además una generación por debajo de
la vigente para que una solicitud que resolvió justo antes del cambio pueda terminar. Las claves de
analítica incluyen también un token de la transformación de coordenadas, así que un reprocesamiento
que cambia la geometría tampoco reutiliza respuestas.

Hay una pieza más que no es una caché pero se le parece: `analytics/infrastructure/singleflight.py`
agrupa, dentro de un proceso, las solicitudes idénticas que llegan a la vez, para que un cálculo caro
se haga una sola vez. Es local al bucle de eventos, no coordinación distribuida, y quien aporta el
cálculo es dueño de sus recursos hasta que termina.

**El diálogo de comparar participantes** tiene su propia caché, en la memoria de la pestaña del
navegador: guarda hasta 48 resultados durante cinco minutos, con un peso acotado, y lanza como máximo
cuatro consultas a la vez. Su clave incluye la generación de ingesta, así que reprocesar el proyecto la
vacía. Cerrar el diálogo no deja consultas en curso ni tarjetas montadas. Una consulta que el navegador
aborta puede seguir calculándose en el servidor. La vista que ve quien usa la aplicación está en
[comparar-participantes.md](../usuario/comparar-participantes.md).

### Decisiones de rendimiento

Estos límites salieron de medir, con corpus sintéticos y en una sola máquina, antes y después de cada
cambio. Lo que quedó en el código:

- **Lectura por columnas.** Las rutas de analítica piden al Parquet solo las columnas que usan; el resto
  del marco no se decodifica.
- **Lotes en lugar de N+1.** Un informe de grupo resuelve la identidad de todos sus participantes en una
  consulta; guardar participantes o AOIs usa una escritura por lote.
- **Trabajo compartido dentro de una operación.** Los eventos de fijación se construyen una vez por marco
  y escenario y se reutilizan en las métricas que los necesitan.
- **Respuestas condicionales.** Los fotogramas de vídeo conservan su ETag y responden 304 sin cuerpo
  cuando el navegador ya los tiene, manteniendo la autorización.
- **Presupuestos de concurrencia explícitos.** Las respuestas y los archivos Parquet admiten 4
  operaciones en curso, 32 en cola y hasta 256 esperando un resultado compartido; la E/S de informes, 2
  en curso y 16 esperando. Una cancelación libera su hueco solo cuando el trabajo físico termina.
- **Carga diferida en la interfaz.** Las vistas de EEG y el diálogo de comparación se cargan al abrirse,
  no al entrar al tablero.

Ningún contrato científico cambió por rendimiento: tiempos y señales en float64, orden original, NaN y
huecos preservados, eventos de fijación intactos y goldens sin regenerar. Para volver a medir, los
microbenchmarks y su protocolo están en [backend/benchmarks/](../../backend/benchmarks/README.md).

## Cómo encaja el frontend

El frontend es Next.js con React y TypeScript, Tailwind, shadcn sobre Radix para los controles y
Recharts para las gráficas. La estructura:

```
frontend/
  app/          páginas del App Router: proyectos, dashboard, reportes, configuracion, login, authorize
  features/     módulos por función: analytics, auth, home, projects, reports, settings
  components/   los controles compartidos de interfaz
  lib/          cliente de API, sesión, modo de la aplicación, proveedores
  public/       estáticos, incluidas las fuentes
  tests/        unitarias, de hooks en Chromium y especificaciones de Playwright
```

En la edición de servidor el contenedor del frontend hace además de proxy: `next.config.mjs` reescribe
`/api/:path*` hacia el backend, que por eso nunca publica su puerto. En la edición local no
hay servidor de Next: el frontend se compila como **exportación estática** y el backend la sirve desde
su propio origen.

Esa exportación estática impone restricciones reales a cualquier cambio de interfaz: no puede haber
route handlers en `app/api`, ni middleware, ni server actions, ni `cookies()`/`headers()`, ni
segmentos dinámicos sin `generateStaticParams`, y `useSearchParams` tiene que ir dentro de un
`<Suspense>`. Además, el sitio estático atiende todo lo que no sea una ruta exacta, así que llamar a
una ruta de colección sin su barra final da 404: o se llama con barra, o se añade a
`API_PATH_ALIASES` en `local/static_frontend.py`.

Hay una regla más que vale en las dos ediciones: **nada remoto**. Ni fuentes, ni scripts, ni CDN, ni
telemetría. Poppins se sirve desde `frontend/public/fonts`, y la compilación del paquete de
Windows falla si la exportación contiene una fuente o un script remotos.

Las convenciones de interfaz están en [interfaz.md](../desarrollo/interfaz.md), y la comparación de
participantes, que es la pieza de interfaz más particular, en
[comparar-participantes.md](../usuario/comparar-participantes.md).

## Seguridad y operación, en resumen

- **Sesión.** En servidor, inicio de sesión con Google y un JWT HS256 propio, verificado en firma,
  emisor, tipo, vencimiento y sujeto. El token va en un encabezado, nunca en una cookie, y CORS corre
  con `allow_credentials=False`, así que no hay credencial ambiente que una solicitud de otro sitio
  pueda aprovechar. En local no hay cuenta, y un guard de `Host`/`Origin` rechaza lo que no sea mismo
  origen en loopback, lo que bloquea que otra página maneje la aplicación por *DNS rebinding*.
- **Autorización de Drive.** Es una concesión de OAuth distinta, guardada en el servidor; el token de
  refresco no llega nunca al navegador.
- **Arranque en producción.** `Settings.validate_production_security` se niega a arrancar con
  `DEBUG=true`, con un `AUTH_JWT_SECRET` débil o corto, o con una base de datos externa sin `sslmode`.
- **Red en Compose.** Dos redes: `app`, que conecta frontend y backend, y `data`, marcada como interna,
  de modo que PostgreSQL y Redis no tienen ruta hacia fuera. TLS queda fuera del repositorio: se
  asume un proxy HTTPS delante. El despliegue en una red universitaria está en
  [despliegue-en-red.md](despliegue-en-red.md).
- **Verificación.** La puerta única es `./verify.ps1` desde la raíz: pruebas del backend con sus
  snapshots protegidos, Ruff, Vulture, deptry, arranque de la aplicación, los contratos de
  importación, TypeScript, pruebas unitarias del frontend, regresiones de hooks en Chromium real y
  ESLint. Nada se declara verde si no pasó por ahí, y un golden existente nunca se regenera para que
  una prueba pase.

## Para seguir leyendo

| Tema | Documento |
| --- | --- |
| Pipeline de subida completo | [subida-de-experimentos.md](subida-de-experimentos.md) |
| Detector de fijaciones | [deteccion-de-fijaciones.md](deteccion-de-fijaciones.md) |
| Coordenadas pantalla → estímulo | [coordenadas-pantalla-estimulo.md](coordenadas-pantalla-estimulo.md) |
| Informes en PDF | [informes.md](informes.md) |
| Comparar participantes | [comparar-participantes.md](../usuario/comparar-participantes.md) |
| Convenciones de interfaz | [interfaz.md](../desarrollo/interfaz.md) |
| Pre-experimentos y cuestionarios | [pre-experimento.md](pre-experimento.md) · [uso](../usuario/pre-experimento.md) |
| Métodos de EEG y reproducibilidad | [eeg/metodos.md](eeg/metodos.md) |
| Edición local | [student/README.md](../../student/README.md) |
| Alojar la edición en red | [alojamiento-en-red.md](alojamiento-en-red.md) · [despliegue-en-red.md](despliegue-en-red.md) |
| Cambios de producto | [CHANGELOG.md](../CHANGELOG.md) |

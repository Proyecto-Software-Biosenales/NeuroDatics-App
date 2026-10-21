# NeuroDatics Backend

API FastAPI de NeuroDatics. El mismo código atiende las dos ediciones del producto, y la bandera que las
separa es `settings.is_local` (`APP_MODE`).

## Dónde se ejecuta

**Edición servidor.** El backend es el servicio `backend` del stack de la [raíz del repositorio](../README.md):

```powershell
docker compose up -d --build
```

No ejecutes Docker ni mantengas una configuración independiente desde esta carpeta: el contenedor toma las
variables del `.env` raíz, no publica puerto en el host y queda accesible solo dentro de la red de Docker,
donde el servicio `frontend` le reenvía `/api`, `/docs`, `/openapi.json` y `/redoc`.

**Edición estudiantes (`APP_MODE=local`).** El mismo backend, congelado con PyInstaller, es el programa que
abre el estudiante: escucha en `127.0.0.1` (puerto preferido 8765), arranca su PostgreSQL 16 embebido, aplica
las migraciones y **sirve el frontend** como exportación estática montada en `/`
(`src/neurodatics/local/static_frontend.py`). Al compartir origen no hay CORS, ni segundo puerto, ni proxy.
En esta edición no se importan las rutas de Google ni de Drive (`src/neurodatics/api/router.py`), la caché de
analítica es en proceso en lugar de Redis, y los archivos van al almacenamiento en disco. Construcción,
puertas y arranque desde el código sin congelar: [student/README.md](../student/README.md).

## Responsabilidades

- API HTTP y documentación OpenAPI (`/docs`, `/openapi.json` y `/redoc` siguen activos en las dos ediciones).
- Migraciones de PostgreSQL con Alembic: el contenedor ejecuta `alembic upgrade head` antes de Uvicorn y, en
  local, el launcher las aplica al iniciar sobre el PostgreSQL embebido.
- Sesión: Google OAuth en la edición servidor; en local, la única ruta de sesión
  (`POST /api/auth/local-session`) devuelve la misma forma de respuesta sin cuentas.
- Ingesta del ZIP del experimento dentro de la solicitud HTTP, con sus guardas de descompresión y su control
  de admisión.
- Analítica por escenario y participante con caché (Redis en servidor, en proceso en local), informes y
  entrega de los medios del experimento: imágenes y vistas previas de vídeo con sus fotogramas.

## Configuración

No hay tabla de variables aquí; hay dos archivos de ejemplo, cada uno con su propósito:

- [`../.env.example`](../.env.example): el **contrato del stack Docker**. Es el archivo que lee Compose y el
  que se copia a `.env` en la raíz.
- [`.env.example`](.env.example): la **configuración del backend en sí**, para las dos ediciones. Documenta
  también lo propio del modo local (`APP_MODE`, `LOCAL_DATA_DIR`, `LOCAL_FRONTEND_DIR`). Cópialo a
  `backend/.env` si ejecutas el backend suelto.

Los valores por defecto y las validaciones viven en `src/neurodatics/config/settings.py`. Todo ajuste nuevo
necesita un valor por defecto que funcione en local, o establecerse en `apply_environment`
(`src/neurodatics/local/launcher.py`).

## Rutas montadas

`include_routes` (`src/neurodatics/api/router.py`) monta estas familias bajo `/api`:

- `auth`: URL de inicio de sesión de Google y canje del código (servidor) o `local-session` (local).
- `integrations/google-drive`: solo `GET /callback`, el retorno de OAuth de Google. Acepta únicamente el enlace
  firmado que emite el comando de administración (`python -m neurodatics.modules.integrations.google_drive.admin
  estado|conectar`, que se ejecuta en el servidor): la aplicación no ofrece ruta para ver ni cambiar la cuenta.
  **Solo en la edición servidor.**
- `projects`: alta, consulta, modificación y borrado del proyecto; carga, progreso y cancelación del ZIP
  (para reemplazarlo se sube de nuevo); finalización; sensores, AOIs, participantes, escenarios y pre-experimento (con su exportación y sus
  respuestas); imágenes y vistas previas de los archivos.
- `projects/{project_id}/analytics`: series temporales y estadísticas por señal (mirada, pupila, GSR,
  distancia, EEG), fijaciones con su histograma y sensibilidad, mapa de calor, scanpath, AOIs, escenarios y
  tiempos, correlaciones, comparación de participantes, y PSD, espectrograma y topografía de EEG.
- `reports`: generación del informe ejecutivo.

Fuera de `/api` están `GET /health` y `GET /health/ready`, que informa del estado de la base de datos y de
Redis sin exponer sus detalles.

La lista exacta no se mantiene a mano en este archivo: está fijada en
[`tests/fixtures/route_inventory.json`](tests/fixtures/route_inventory.json), que compara
`tests/unit/test_route_inventory.py` con las rutas realmente montadas, y se puede leer en `/docs` con la
aplicación en marcha.

### La barra final importa

Las rutas de colección se montan **con** barra final: `POST /api/projects/` y `GET /api/projects/`. En la
edición estudiantes el sitio estático atiende todo lo que no sea una ruta exacta, así que una llamada sin la
barra respondería 404 antes de que FastAPI pudiera redirigir. Las excepciones se declaran en
`API_PATH_ALIASES` (`src/neurodatics/local/static_frontend.py`), que es donde se reescribe `"/api/projects"`
a `"/api/projects/"`; en la edición servidor hace lo mismo un rewrite de `frontend/next.config.mjs`.

## Estructura

```text
src/neurodatics/
    main.py          aplicación FastAPI: CORS, middlewares, rutas, salud y, en local, el montaje del sitio
    api/             router.py, middlewares.py y deps.py (dependencias compartidas de las rutas)
    modules/         un paquete por dominio: projects, participants, scenaries, analytics, reports, auth,
                     integrations; con api/, application/, domain/ e infrastructure/ según lo que use
    infra/           adaptadores técnicos: db (base y sesión), cache, queue, storage, health
    shared/          contratos neutros: identidad de escenario, contrato de fijaciones, generación de
                     caché, recursos de la máquina
    config/          settings.py, logging.py y security.py
    local/           edición estudiantes: launcher, PostgreSQL embebido, guard offline, bloqueo de
                     instancia y el sitio estático
    diagnostics/     comprobación previa de red
migrations/          revisiones de Alembic (versions/) y env.py
tests/               unit, characterization (con __snapshots__) y fixtures (golden/); las pruebas de
                     extremo a extremo son de Playwright y viven en frontend/tests/e2e/
benchmarks/          mediciones de rendimiento (bench_*.py); ver benchmarks/README.md
```

Los archivos van siempre a través de `modules/integrations/storage_provider.py`, que en la edición servidor
resuelve a Google Drive y en local al almacenamiento en disco. Ninguna función debe importar el cliente de
Drive directamente.

`.importlinter` fija tres contratos de dependencias entre esas capas: la analítica no depende del código de
aplicación de proyectos, los servicios de procesamiento de proyectos no dependen de la analítica, y `shared`
no depende de ningún módulo de dominio. Los comprueba `verify.ps1`; el detalle está en
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Pruebas

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest
```

El entorno virtual es el de la raíz (`.venv`); `backend\.venv` está incompleto. La configuración de pytest ya
aporta `src` al path. La puerta completa del repositorio es `./verify.ps1` desde la raíz.

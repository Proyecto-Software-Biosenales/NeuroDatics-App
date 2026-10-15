# NeuroDatics

Plataforma de análisis de bioseñales para neuromarketing: ingesta de experimentos de seguimiento ocular,
EEG, GSR, pupila y distancia, analítica por escenario y participante, e informes.

El mismo código (`backend/` y `frontend/`) se entrega en **dos ediciones**:

- **Edición servidor.** Un stack de Docker Compose (`docker-compose.yml`) con interfaz, API, PostgreSQL 16
  y Redis. Inicio de sesión con Google, archivos en Google Drive y proxy opcional de red.
- **NeuroDatics Estudiantes.** El mismo backend con `APP_MODE=local`, para Windows y sin internet:
  congelado con PyInstaller, sirve el frontend como exportación estática desde su propio origen y lleva
  dentro PostgreSQL 16 embebido y ffmpeg. No tiene cuentas, ni Drive, ni Docker, ni Redis: todo escucha
  en `127.0.0.1`.

Cualquier cambio en análisis, ingesta, informes, pre-experimentos, cuestionarios, migraciones o interfaz
tiene que funcionar en las dos. Las reglas están en [AGENTS.md](AGENTS.md) y
[CONTRIBUTING.md](CONTRIBUTING.md).

## Edición servidor

Requisitos: Docker Desktop y Git. No necesitas instalar Node.js, Python, PostgreSQL ni Redis.

```powershell
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
Copy-Item .env.example .env
```

Edita `.env` antes de iniciar:

- `POSTGRES_PASSWORD`: una contraseña única para la base de datos del stack.
- `AUTH_JWT_SECRET`: un secreto aleatorio de al menos 32 caracteres.
- `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`: necesarios para el inicio de sesión real con Google.

El resto de las opciones (Google Drive, base de datos externa, límites de carga, proxy) están comentadas en
[.env.example](.env.example), que es el contrato de configuración del stack.

```powershell
docker compose up -d --build
docker compose ps
```

El stack crea y conecta `frontend`, `backend`, `db` y `redis`. El contenedor del backend aplica las
migraciones (`alembic upgrade head`) antes de arrancar Uvicorn.

| Recurso | URL |
| --- | --- |
| Aplicación | http://localhost:3000 |
| API mediante el proxy | http://localhost:3000/api |
| Swagger UI | http://localhost:3000/docs |

El backend no publica un puerto en el host: el frontend reenvía `/api`, `/docs`, `/openapi.json` y `/redoc`
dentro de la red de Docker (`frontend/next.config.mjs`). PostgreSQL y Redis quedan en una red interna.

Google Drive se conecta desde **Configuración** dentro de la aplicación, con las credenciales del proyecto
de Google; el procedimiento completo está en
[deployment/CONFIGURACION-GOOGLE.md](deployment/CONFIGURACION-GOOGLE.md).

### Entregar la edición servidor sin entorno de desarrollo

Para instalarla en un equipo ajeno al desarrollo existe el
[paquete instalable en español](deployment/README.md): en Windows se abre `INSTALAR.bat`, que comprueba y
prepara WSL y Docker Desktop, configura el entorno y carga las imágenes incluidas; después, cada día, se
abre `INICIAR.bat` o el icono «NeuroDatics» del escritorio, que enciende Docker si hace falta y abre el
navegador. La guía del mantenedor está en [deployment/MANTENIMIENTO.md](deployment/MANTENIMIENTO.md).

## NeuroDatics Estudiantes

El estudiante recibe un ZIP cuya carpeta muestra solo `neurodatics-estudiantes.exe` y `LEEME.txt`
(el resto viaja oculto en `_internal`). Al abrirlo, el programa arranca su PostgreSQL embebido, aplica las
migraciones y abre el navegador en `127.0.0.1`. Los datos no viven junto al programa, sino en
`%LOCALAPPDATA%\NeuroDatics Estudiantes`, así que borrar la carpeta extraída no borra los proyectos.

La construcción, el empaquetado y las puertas de calidad del paquete están en
[student/README.md](student/README.md). En resumen:

```powershell
student\build.ps1 -Work output\student
student\run-frozen.ps1 -Work output\student -Assemble
student\run-frozen.ps1 -Work output\student
student\package.ps1 -Work output\student -Version <versión>
```

## Operación diaria (edición servidor)

Puedes crear un **Pre-experimento** antes de tener la carpeta del experimento y organizar sus
participantes, pantalla y cuestionarios opcionales desde su tarjeta, con **Editar**. **Configuración**
guarda solo ajustes globales: la pantalla del experimento (por defecto 1280×1024) y, en esta edición,
Google Drive. Consulta la
[guía de pre-experimentos y cuestionarios](docs/PRE_EXPERIMENTO.md).

```powershell
# Ver registros de todos los servicios
docker compose logs -f

# Reconstruir después de cambiar el código
docker compose up -d --build

# Detener el stack sin borrar datos
docker compose down

# Borrar base de datos, cachés y datos locales (acción destructiva)
docker compose down -v
```

Después de actualizar el repositorio, ejecuta de nuevo `docker compose up -d --build`. Al actualizar desde
una versión con el worker RQ, usa `docker compose up -d --build --remove-orphans` para retirar su
contenedor antiguo.

## Solución de problemas

```powershell
docker compose config --quiet
docker compose ps
docker compose logs --tail=200 backend
```

Si un servicio aparece como `unhealthy`, revisa sus registros antes de borrar volúmenes o recrear datos.
El backend expone `/health` y `/health/ready`; el segundo informa del estado de la base de datos y de Redis.

Para un despliegue en una red universitaria o corporativa, consulta
[docs/NETWORK_DEPLOYMENT.md](docs/NETWORK_DEPLOYMENT.md).

## Desarrollo

**`./verify.ps1` desde la raíz es la única puerta de verificación.** Ejecuta las pruebas del backend, Ruff,
Vulture, deptry, los contratos de importación, el arranque de la aplicación, TypeScript, las pruebas de
Node del frontend, las regresiones de hooks de React en Chromium real y el trinquete de ESLint.

```powershell
cd frontend; npx playwright install chromium   # una sola vez
cd ..; .\verify.ps1
```

El entorno virtual de Python es el de la raíz (`.venv`), no `backend\.venv`. El detalle de cada puerta, las
convenciones y la regla de las dos ediciones están en [CONTRIBUTING.md](CONTRIBUTING.md).

Las migraciones están en `backend/migrations/versions/`. La cabeza actual se consulta en lugar de fijarla
en la documentación:

```powershell
cd backend; ..\.venv\Scripts\python.exe -m alembic heads
```

## Estructura

- `backend/`: API FastAPI, ingesta, analítica, informes, migraciones y el código de la edición local
  ([backend/README.md](backend/README.md)).
- `frontend/`: interfaz Next.js, común a las dos ediciones.
- `student/`: construcción, empaquetado y puertas de NeuroDatics Estudiantes, más su guía `LEEME.txt`.
- `deployment/`: paquete instalable de la edición servidor para Windows (asistente, scripts y guías).
- `docs/`: documentación técnica y de usuario ([docs/README.md](docs/README.md)).
- `docker-compose.yml`: punto de inicio único del stack de la edición servidor.
- `docker-compose.delivery.yml`: complemento que fija las imágenes de entrega; lo usa `deployment/package.ps1`.
- `verify.ps1`: la puerta de verificación del repositorio.
- `.env.example`: contrato de configuración del stack Docker.
- `AGENTS.md`: reglas de trabajo en el repositorio, incluida la de las dos ediciones.

Las carpetas `delivery/` y `output/` no están en el repositorio: las generan los scripts de empaquetado.

## Documentación

- [docs/README.md](docs/README.md): índice de la documentación.
- [docs/arquitectura.md](docs/arquitectura.md): cómo encajan backend, frontend y las dos ediciones.
- [CONTRIBUTING.md](CONTRIBUTING.md): verificación, contratos y convenciones.
- [docs/LICENCIAMIENTO.md](docs/LICENCIAMIENTO.md): licencias y avisos de terceros.

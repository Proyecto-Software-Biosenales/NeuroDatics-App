# Alojar NeuroDatics en red

NeuroDatics se entrega como una aplicación de escritorio para Windows que funciona sin internet
(`APP_MODE=local`). El repositorio conserva además la **edición en red**: la misma aplicación servida con
Docker, con inicio de sesión con Google, archivos en Google Drive y varios usuarios. Hoy esa edición **no se
usa ni se mantiene**, porque necesita servicios en la nube que el proyecto no puede ofrecer gratis. El código
sigue ahí para quien quiera alojarla por su cuenta.

Esta guía es para quien quiera hacerlo. Explica qué tiene que proveer y dónde se conecta cada pieza.
Entre una versión y otra puede que la edición en red necesite ajustes: `verify.ps1` sigue pasando las pruebas
del backend y comprobando que la aplicación arranca en modo servidor, pero nadie la prueba de punta a punta
con Docker, Google y Drive.

## Qué tienes que proveer

| Pieza | Para qué | Lo que usa el código hoy | Variables |
| --- | --- | --- | --- |
| **Base de datos** | Proyectos, participantes, resultados, cuentas y la autorización de Drive | PostgreSQL 16. Probado con Supabase (solo como PostgreSQL alojado) y con el contenedor `db` del Compose | `DATABASE_URL`, `POSTGRES_*` |
| **Identificación** | Quién entra y con qué cuenta | Google OAuth para iniciar sesión y un JWT que firma el propio backend | `GOOGLE_OAUTH_*`, `AUTH_JWT_SECRET`, `AUTH_ALLOWED_EMAILS` |
| **Almacenamiento** | Los ZIP de experimentos, imágenes, videos, Parquet e informes | Google Drive, con una cuenta compartida que conecta quien administra | `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`, `GDRIVE_*` |
| **Caché** | Resultados de analítica entre solicitudes | Redis (contenedor `redis` del Compose) | `REDIS_*`, `ANALYTICS_REDIS_TTL_SECONDS` |
| **Servidor** | Ejecutar los contenedores y publicar la interfaz con HTTPS | Docker Compose y un proxy inverso que pongas tú | `FRONTEND_PORT`, `CORS_ALLOWED_ORIGINS` |

Todas las variables están en [`.env.example`](../../.env.example), agrupadas por pieza y con lo que debes
rellenar marcado como «Debes proveer». Cópialo a `.env` en la raíz y no lo subas a Git.

### Base de datos

Cualquier PostgreSQL 16 o compatible sirve. Las tablas se crean solas: el backend aplica las migraciones de
`backend/migrations` al arrancar. Las cuentas están en `app_users` y la autorización de Drive, en
`system_integrations`. No hace falta configurar nada más en la base.

- **Con el Compose tal cual:** deja `DATABASE_URL` vacío y define `POSTGRES_PASSWORD`. Los datos quedan en el
  volumen `neurodatics_postgres_data`.
- **Con una base alojada (Supabase u otra):** escribe la URL completa en `DATABASE_URL` con
  `postgresql+psycopg://` y TLS explícito (`?sslmode=require`, o `verify-full` si el certificado de la CA
  está en el contenedor). En Supabase usa el *pooler* de sesión, puerto 5432. En producción, el backend
  rechaza una base externa sin TLS. El Compose sigue levantando su propio PostgreSQL, así que
  `POSTGRES_PASSWORD` sigue siendo obligatorio.

La edición local no usa nada de esto: lleva su propio PostgreSQL 16 embebido.

### Identificación

El inicio de sesión es Google OAuth. El backend canjea el código, crea o actualiza la fila en `app_users` y
entrega un JWT propio que el navegador envía en cada solicitud. Quien aloja la aplicación debe:

1. Crear un cliente OAuth web en Google Cloud y registrar como URL de retorno `https://<tu-dominio>/authorize`
   y `https://<tu-dominio>/api/integrations/google-drive/callback`. Los pasos están en
   [deployment/CONFIGURACION-GOOGLE.md](../../deployment/CONFIGURACION-GOOGLE.md).
2. Rellenar `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y `GOOGLE_OAUTH_REDIRECT_URI`.
3. Poner en `AUTH_JWT_SECRET` un secreto aleatorio de al menos 32 caracteres.
4. Escribir en `AUTH_ALLOWED_EMAILS` las cuentas que pueden entrar. Si se deja vacío, entra cualquier cuenta
   de Google.

Para usar otro proveedor de identidad hay que cambiar código: el inicio de sesión está en
`backend/src/neurodatics/modules/auth/api/routes.py` y la emisión y validación del JWT, en
`backend/src/neurodatics/config/security.py`. En el frontend, el botón de inicio de sesión está en
`frontend/features/auth/components/LoginForm.tsx` y la vuelta desde Google, en
`frontend/features/auth/AuthCallback.tsx`.

### Almacenamiento

Las funciones no hablan con Google Drive directamente: leen y escriben a través de
`backend/src/neurodatics/modules/integrations/storage_provider.py`, que en la edición en red entrega el
cliente de Drive (`infra/storage/gdrive_client.py`) y en la local, el de disco (`infra/storage/local_client.py`).

- **Con Google Drive:** usa el mismo cliente OAuth de la identificación. Quien administra conecta la cuenta
  una vez desde el servidor (`deployment/scripts/conectar-drive.ps1`, o `python -m
  neurodatics.modules.integrations.google_drive.admin conectar` dentro del contenedor del backend). La
  autorización se guarda en `system_integrations`. `GDRIVE_FOLDER_ID` fija la carpeta raíz.
- **Con otro almacenamiento (S3, un disco compartido…):** escribe una clase con los mismos métodos que
  `LocalStorageClient` (`reserve_file_id`, `create_folder`, `upload_file`, `delete_file`, `rename_file`,
  `download_file_content`, `download_file_to_path`) y entrégala desde `storage_provider.py`. El disco local
  es el ejemplo más sencillo de esa interfaz.

## Qué código es solo de la edición en red

Nada de lo siguiente se borra. La edición local no lo importa ni lo muestra, y cada archivo lo dice en su
primera línea.

| Parte | Dónde |
| --- | --- |
| Inicio de sesión con Google | `backend/src/neurodatics/modules/auth/api/routes.py`, `frontend/app/authorize/page.tsx`, `frontend/features/auth/AuthCallback.tsx`, `frontend/features/auth/components/LoginForm.tsx` |
| Conexión con Google Drive | `backend/src/neurodatics/modules/integrations/google_drive/`, `backend/src/neurodatics/infra/storage/gdrive_client.py`, `gdrive_oauth_credentials.py` |
| Contenedores y entrega para Windows con Docker | `docker-compose.yml`, `docker-compose.delivery.yml`, `deployment/` |
| Reenvío de `/api` desde Next.js | `serverConfig` en `frontend/next.config.mjs` |

Otras partes se comparten y cambian de comportamiento según `settings.is_local` (backend) o `IS_LOCAL_MODE`
(frontend): la caché usa Redis en red y memoria en local, y el almacenamiento usa Drive o disco.

## Ponerla en marcha

1. Copia `.env.example` a `.env` y rellena todo lo marcado «Debes proveer».
2. `docker compose up -d --build` desde la raíz. Solo se publica la interfaz (`FRONTEND_PORT`, 3000 por
   defecto). La API, PostgreSQL y Redis quedan dentro de Docker.
3. Ponle delante un proxy inverso con HTTPS y escribe ese origen exacto en `CORS_ALLOWED_ORIGINS`.
4. Conecta Google Drive (ver «Almacenamiento») e inicia sesión con una cuenta permitida.

Si la red es de una universidad o empresa con cortafuegos o proxy, [despliegue-en-red.md](despliegue-en-red.md)
lista las salidas que debe permitir TI y el diagnóstico `network_preflight`. La entrega para Windows con
`INSTALAR.bat` (`deployment/package.ps1`) ya no se genera; su documentación sigue en
[deployment/README.md](../../deployment/README.md).

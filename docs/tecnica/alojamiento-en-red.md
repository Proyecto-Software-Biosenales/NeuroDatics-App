# Edición en red: qué hay y qué haría falta

NeuroDatics se entrega solo como programa local para Windows, sin internet. El repositorio conserva además la
**edición en red**: la misma aplicación servida con Docker, con inicio de sesión con Google y los archivos en
Google Drive. Desde la versión 2.0 (27 de octubre de 2026) **no se usa ni se mantiene**: necesita servicios en la
nube que el proyecto no puede pagar. El código sigue en el repositorio para quien quiera alojarla con sus propios
servicios.

Esta página no explica cómo instalarla. Dice qué parte ya está hecha, qué tendría que aportar quien la aloje y qué
falta o no se ha comprobado, para que pueda estimar el trabajo antes de empezar.

## Qué ya está

| Pieza | Qué hay en el repositorio |
| --- | --- |
| **Contenedores** | `docker-compose.yml` con cuatro servicios: interfaz (`frontend`), API (`backend`), PostgreSQL 16 (`db`) y Redis (`redis`). Solo se publica la interfaz; la API, la base y la caché quedan en redes internas. |
| **Funciones** | Las mismas que la edición local, con el mismo código: carga de experimentos, Dashboard, áreas de interés, pre-experimentos, cuestionarios e informes. |
| **Inicio de sesión** | Google OAuth y un token propio firmado por el backend. Una lista opcional de correos permitidos (`AUTH_ALLOWED_EMAILS`). |
| **Cuentas** | Varias personas en la misma instalación. Cada proyecto pertenece a una cuenta, y las demás no lo ven. |
| **Archivos** | Un cliente de Google Drive con una sola cuenta de Drive para toda la instalación, que conecta quien administra con un comando del backend. |
| **Base de datos** | Las tablas se crean y actualizan solas al arrancar el backend (migraciones). Sirve el contenedor `db` o un PostgreSQL 16 externo con TLS. |
| **Caché** | Redis para los resultados del Dashboard (en local es una caché en memoria). |
| **Configuración** | [`.env.example`](../../.env.example) con todas las variables, y lo que hay que rellenar marcado «DEBES PROVEER». En producción el backend se niega a arrancar con un secreto débil o con una base externa sin TLS. |
| **Diagnóstico de red** | `python -m neurodatics.diagnostics.network_preflight` comprueba desde el backend la base de datos y los servicios de Google. |
| **Instalador para Windows** | `deployment/` guarda un instalador con Docker Desktop (`INSTALAR.bat`, `INICIAR.bat`, `DETENER.bat`) y su documentación. Ya no se genera ni se prueba. |

## Qué tendría que aportar quien la aloje

| Qué | Para qué |
| --- | --- |
| **Un servidor con Docker** | Ejecutar los cuatro contenedores, con disco para la base de datos y memoria para procesar los experimentos. |
| **Un dominio con HTTPS** | Publicar la interfaz. El repositorio no trae proxy inverso ni certificados: se asume uno delante. |
| **Un proyecto de Google Cloud** | Un cliente OAuth de aplicación web, la pantalla de consentimiento publicada y la API de Google Drive habilitada, con las direcciones de retorno del dominio. |
| **Una cuenta de Google Drive** | Guardar experimentos, estímulos, resultados e informes de todos los usuarios, con espacio suficiente. |
| **Secretos propios** | El secreto del token (`AUTH_JWT_SECRET`) y la contraseña de PostgreSQL. |
| **La lista de cuentas permitidas** | Decidir quién entra. Si se deja vacía, entra cualquier cuenta de Google. |
| **Salidas de red** | Si la red tiene cortafuegos: el backend necesita llegar a la base de datos (TCP 5432 si es externa) y por HTTPS a `oauth2.googleapis.com`, `openidconnect.googleapis.com` y `www.googleapis.com`; el navegador de cada persona, a `accounts.google.com`. PostgreSQL no pasa por un proxy HTTP. |
| **Copias de seguridad y mantenimiento** | Respaldar la base y la cuenta de Drive, actualizar las imágenes y vigilar el servicio. |

## Qué falta o no se ha comprobado

- **Nadie la ha probado de punta a punta desde la 2.0.** `verify.ps1` sigue pasando las pruebas del backend y
  comprobando que arranca en modo red, pero no levanta Docker ni entra con Google ni sube a Drive. Es probable
  que haga falta algún ajuste.
- **Los perfiles son solo de la edición local.** En red, cada persona es una cuenta de Google.
- **No hay proyectos compartidos ni roles.** Cada cuenta ve solo sus proyectos; no hay administradores dentro de
  la aplicación ni permisos por proyecto.
- **Otro proveedor de identidad** (Microsoft, el de una universidad…) exige cambiar código: el inicio de sesión
  está en `backend/src/neurodatics/modules/auth/api/routes.py` y el token, en
  `backend/src/neurodatics/config/security.py`; en el frontend, `frontend/features/auth/components/LoginForm.tsx`
  y `frontend/features/auth/AuthCallback.tsx`.
- **Otro almacenamiento** (S3, un disco compartido…) exige una clase con los métodos de `LocalStorageClient`
  (`backend/src/neurodatics/infra/storage/local_client.py`) entregada desde
  `backend/src/neurodatics/modules/integrations/storage_provider.py`, que hoy elige entre Drive y disco.
- **Un solo backend.** La carga de experimentos se procesa dentro del proceso de la API; no hay trabajadores
  aparte ni reparto entre varios servidores.
- **Sin proxy, certificados, copias de seguridad ni monitoreo** en el repositorio.
- **El instalador de Windows con Docker no está al día:** `deployment/package.ps1` no se ejecuta desde la 2.0.

## Qué código es solo de la edición en red

Nada de esto se borra. La edición local no lo importa ni lo muestra, y cada archivo lo dice en su primera línea.

| Parte | Dónde |
| --- | --- |
| Inicio de sesión con Google | `backend/src/neurodatics/modules/auth/api/routes.py`, `frontend/app/authorize/page.tsx`, `frontend/features/auth/AuthCallback.tsx`, `frontend/features/auth/components/LoginForm.tsx` |
| Conexión con Google Drive | `backend/src/neurodatics/modules/integrations/google_drive/`, `backend/src/neurodatics/infra/storage/gdrive_client.py`, `gdrive_oauth_credentials.py` |
| Contenedores e instalador con Docker | `docker-compose.yml`, `docker-compose.delivery.yml`, `deployment/` |
| Reenvío de `/api` desde Next.js | `serverConfig` en `frontend/next.config.mjs` |

Otras partes se comparten y cambian según `settings.is_local` (backend) o `IS_LOCAL_MODE` (frontend): la caché
(Redis o memoria) y el almacenamiento (Drive o disco).

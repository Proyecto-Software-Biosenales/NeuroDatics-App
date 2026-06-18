# NeuroDatics-App

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Guia Principal

Si estas instalando la app por primera vez o no tienes experiencia tecnica, usa la guia paso a paso:

[Guia Docker para usuarios principiantes](./docs/DOCKER_USER_GUIDE.md)

Esa guia explica como instalar Docker Desktop, descargar el proyecto, configurar Google OAuth, abrir la app desde Docker Desktop y resolver errores comunes.

## Inicio Rapido Con Docker

Este es el camino corto para usuarios que ya tienen Docker Desktop y Git instalados. No construye la app localmente: descarga las imagenes publicadas en GHCR.

### 1. Clonar el proyecto

```bash
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
```

### 2. Crear configuracion local

```bash
cp .env.example .env
```

Edita `.env` y completa al menos estas variables para usar login real:

- `AUTH_JWT_SECRET`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

El frontend ya no necesita `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; pide al backend la URL de login de Google en tiempo de ejecucion.

Para usar ingestion de proyectos con Google Drive, configura tambien:

- `GDRIVE_FOLDER_ID` si quieres una carpeta raiz especifica.
- La conexion OAuth de Drive desde `http://localhost:3000/api/integrations/google-drive/authorize` cuando el stack ya este corriendo.

### 3. Levantar toda la app

```bash
docker compose up -d
```

La primera vez Docker intentara descargar las imagenes, creara la base de datos y ejecutara migraciones automaticamente. Si GHCR todavia no entrega alguna imagen o responde `denied`, Compose construira esa imagen localmente desde el codigo del repositorio y continuara.

Para fijar una version publicada, edita `NEURODATICS_VERSION` en `.env`:

```text
NEURODATICS_VERSION=v1.2.3
```

### 4. Abrir

| Recurso | URL |
| --- | --- |
| Aplicacion | http://localhost:3000 |
| API por proxy | http://localhost:3000/api |
| Swagger UI | http://localhost:3000/docs |

En Docker Desktop, la fila padre `neurodatics` puede mostrar `-` en la columna de puertos. Es normal para grupos de Compose. Expande el grupo y haz click en el puerto `3000:3000` del servicio `frontend`.

### 5. Detener

```bash
docker compose down
```

Para borrar tambien base de datos, usuarios locales, cache y volumenes:

```bash
docker compose down -v
```

## Que Incluye Docker

- Frontend Next.js.
- Backend FastAPI.
- PostgreSQL.
- Redis.
- Worker RQ.

No necesitas instalar Node.js, Python, PostgreSQL ni Redis para usar la app con Docker.

## Auth Y Google Drive

- El login real usa Google OAuth.
- El backend genera la URL de Google OAuth y emite `access_token` y `expires_in`.
- No hay refresh token publico en el contrato actual.
- El backend no publica el puerto `8000` al host en el modo Docker principal. El frontend enruta `/api/*`, `/docs`, `/openapi.json` y `/redoc` hacia el backend dentro de Docker.

## Desarrollo Local Con Build

Solo para contributors que modifican codigo:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Para desarrollo de frontend sin Docker completo:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

El frontend llama `/api` en el mismo origen y Next.js usa `NEXT_INTERNAL_API_BASE_URL` para reenviar al backend.

## Actualizar Imagenes

```bash
docker compose pull
docker compose up -d
```

Si usas una version fija en `NEURODATICS_VERSION`, cambia ese valor antes de ejecutar los comandos.

## Estructura

- `frontend/` - UI Next.js App Router.
- `backend/` - API FastAPI con PostgreSQL, Redis y worker.
- `docs/` - documentacion tecnica y guias de uso.
- `docker-compose.yml` - stack Docker recomendado con imagenes publicadas.
- `docker-compose.dev.yml` - override para construir imagenes localmente.

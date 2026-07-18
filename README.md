# NeuroDatics-App

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Guia Principal

Si estas instalando la app por primera vez o no tienes experiencia tecnica, usa la guia paso a paso:

[Guia Docker para usuarios principiantes](./docs/DOCKER_USER_GUIDE.md)

Esa guia explica como instalar Docker Desktop, descargar el proyecto, configurar Google OAuth, abrir la app desde Docker Desktop y resolver errores comunes.

## Inicio Rapido Con Docker

Este es el camino corto para usuarios que ya tienen Docker Desktop y Git instalados. Construye las imagenes localmente desde el codigo fuente del repositorio.

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

- `APP_ENV=production`
- `AUTH_JWT_SECRET`
- `POSTGRES_PASSWORD`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

El frontend ya no necesita `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; pide al backend la URL de login de Google en tiempo de ejecucion.

`AUTH_JWT_SECRET` debe ser un valor aleatorio, único y de al menos 32
caracteres. Si la base de datos es externa (por ejemplo Supabase), su
`DATABASE_URL` debe incluir `?sslmode=require` como mínimo.
`POSTGRES_PASSWORD` también debe ser único: el stack incluye PostgreSQL local
en una red interna, incluso si configuras una base externa.

Para usar ingestion de proyectos con Google Drive, configura tambien:

- `GDRIVE_FOLDER_ID` si quieres una carpeta raiz especifica.
- La conexion OAuth de Drive desde `http://localhost:3000/api/integrations/google-drive/authorize` cuando el stack ya este corriendo.

### 3. Levantar toda la app

```bash
docker compose up -d --build
```

La primera vez Docker construira `neurodatics-backend:local`, `neurodatics-backend-worker:local` y `neurodatics-frontend:local`, creara la base de datos y ejecutara migraciones automaticamente.

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
- El backend no publica un puerto al host. El frontend enruta `/api/*`,
  subidas grandes, `/docs`, `/openapi.json` y `/redoc`
  hacia el backend dentro de Docker.

Para un despliegue en una red universitaria, consulta
[docs/NETWORK_DEPLOYMENT.md](./docs/NETWORK_DEPLOYMENT.md) antes de abrir la
solicitud a TI.

## Desarrollo Local Con Build

Si modificas codigo y quieres reconstruir todo:

```bash
docker compose up -d --build
```

Para desarrollo de frontend sin Docker completo:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

El frontend llama `/api` en el mismo origen y Next.js usa `NEXT_INTERNAL_API_BASE_URL` para reenviar al backend.

## Actualizar Desde Git

```bash
git pull
docker compose up -d --build
```

## Estructura

- `frontend/` - UI Next.js App Router.
- `backend/` - API FastAPI con PostgreSQL, Redis y worker.
- `docs/` - documentacion tecnica y guias de uso.
- `docker-compose.yml` - stack Docker recomendado con imagenes locales construidas desde el codigo.

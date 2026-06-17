# NeuroDatics-App

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Inicio Rapido Con Docker

El modo recomendado levanta toda la aplicacion con Docker Compose:

- Frontend Next.js
- Backend FastAPI
- PostgreSQL
- Redis
- Worker RQ

Solo el frontend publica un puerto en tu computador. En Docker Desktop, expande el grupo `neurodatics` y haz click en el puerto `3000:3000` del servicio `frontend`.

### Requisitos

| Herramienta | Version |
| --- | --- |
| Docker Desktop | 20+ con Docker Compose |
| Git | Cualquier version reciente |

No necesitas instalar Node.js, Python, PostgreSQL ni Redis para usar la app con Docker.

### 1. Clonar

```bash
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
```

### 2. Levantar

```bash
docker compose up --build
```

La primera vez Docker descargara imagenes, construira el frontend/backend, creara la base de datos y ejecutara migraciones automaticamente.

### 3. Abrir

| Recurso | URL |
| --- | --- |
| Aplicacion | http://localhost:3000 |
| API por proxy | http://localhost:3000/api |
| Swagger UI | http://localhost:3000/docs |

En Docker Desktop la fila padre `neurodatics` puede mostrar `-` en la columna de puertos. Es normal para grupos de Compose. Expande la fila y abre el puerto `3000:3000` del contenedor `frontend`.

### 4. Detener

```bash
docker compose down
```

Para borrar tambien los datos locales de la base de datos y caches:

```bash
docker compose down -v
```

## Configuracion

Los valores por defecto funcionan para desarrollo local con Docker. Si necesitas Google OAuth o Google Drive, define las variables antes de reconstruir:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `GDRIVE_FOLDER_ID`
- `GDRIVE_REFRESH_TOKEN`

El backend no publica puerto al host en el modo Docker principal. El frontend enruta `/api/*`, `/docs`, `/openapi.json` y `/redoc` hacia el backend dentro de la red Docker.

## Desarrollo Local Sin Docker Completo

Solo para desarrollo de codigo:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

El frontend local usa `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`, por lo que en ese modo necesitas levantar el backend aparte.

## Estructura

- `frontend/` - UI Next.js App Router.
- `backend/` - API FastAPI con PostgreSQL, Redis y worker.
- `docs/` - documentacion tecnica del proyecto.
- `docker-compose.yml` - stack Docker recomendado.

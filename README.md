# NeuroDatics-App

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Guia Principal

Si estas instalando la app por primera vez o no tienes experiencia tecnica, usa la guia paso a paso:

[Guia Docker para usuarios principiantes](./docs/DOCKER_USER_GUIDE.md)

Esa guia explica como instalar Docker Desktop, descargar el proyecto, configurar Google OAuth, abrir la app desde Docker Desktop y resolver errores comunes.

## Inicio Rapido Con Docker

Este es el camino corto para usuarios que ya tienen Docker Desktop y Git instalados.

### 1. Clonar el proyecto

```bash
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
```

### 2. Crear configuracion local

```bash
cp .env.example .env
```

Edita `.env` y completa al menos estas variables si quieres usar login real:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Para usar ingestion de proyectos con Google Drive, configura tambien:

- `GDRIVE_FOLDER_ID` si quieres una carpeta raiz especifica.
- La conexion OAuth de Drive desde `http://localhost:3000/api/integrations/google-drive/authorize` cuando el stack ya este corriendo.

### 3. Levantar toda la app

```bash
docker compose up -d --build
```

La primera vez Docker descargara imagenes, construira frontend/backend, creara la base de datos y ejecutara migraciones automaticamente.

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
- El backend emite `access_token` y `expires_in`.
- No hay refresh token publico en el contrato actual.
- El login `DEV_ADMIN` es solo una ayuda local de frontend y no reemplaza Google OAuth para usar la API protegida.
- El backend no publica el puerto `8000` al host en el modo Docker principal. El frontend enruta `/api/*`, `/docs`, `/openapi.json` y `/redoc` hacia el backend dentro de Docker.

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
- `docs/` - documentacion tecnica y guias de uso.
- `docker-compose.yml` - stack Docker recomendado.

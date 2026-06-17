# NeuroDatics Backend

API backend para NeuroDatics, construida con FastAPI y PostgreSQL.

## Importante: Docker Recomendado

Para levantar la aplicacion completa no ejecutes Docker desde esta carpeta.

Usa siempre el `docker-compose.yml` de la raiz del repositorio:

```powershell
cd ..
docker compose up -d --build
```

O, si estas en cualquier otra carpeta, entra a la raiz del proyecto, donde estan `frontend/`, `backend/` y `docker-compose.yml`:

```powershell
cd C:\ruta\a\NeuroDatics-App
docker compose up -d --build
```

El stack completo debe aparecer en Docker Desktop como `neurodatics` e incluir:

- `frontend`
- `backend`
- `worker`
- `db`
- `redis`

El puerto para abrir la app es el del servicio `frontend`: `3000:3000`.

Si Docker Desktop muestra un grupo llamado solo `backend` con un contenedor `backend-1` y puerto `8000:8000`, se ejecuto el Compose antiguo/backend-only. Detenlo y vuelve a ejecutar Docker desde la raiz del proyecto.

## Backend-Only Para Desarrollo Avanzado

Solo si necesitas levantar el backend aislado, existe un archivo no recomendado para usuarios finales:

```powershell
cd backend
docker compose -f docker-compose.backend-only.yml up --build
```

Ese modo no levanta frontend, Postgres, Redis ni worker. Para uso normal de la app, no lo uses.

## Arranque Local Sin Docker Completo

Solo para desarrollo de codigo. Requiere tener PostgreSQL corriendo aparte.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .
```

Edita `.env` y usa una URL local:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/neurodatics
```

Luego:

```powershell
alembic upgrade head
python -m uvicorn neurodatics.main:app --reload --host 0.0.0.0 --port 8000 --app-dir src
```

## Variables De Entorno

| Variable | Requerida | Descripcion |
|---|---|---|
| `DATABASE_URL` | Si | URL PostgreSQL con driver `psycopg` |
| `AUTH_JWT_SECRET` | Si | Secreto para firmar tokens JWT |
| `GOOGLE_OAUTH_CLIENT_ID` | Login Google | Client ID de Google OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Login Google | Client Secret de Google OAuth |
| `GOOGLE_OAUTH_REDIRECT_URI` | Login Google | URI de redireccion OAuth |
| `GDRIVE_FOLDER_ID` | Drive | ID carpeta raiz en Drive |
| `DEBUG` | No | Activa logs verbose |

El driver obligatorio para PostgreSQL es `postgresql+psycopg://`.

## Migraciones

Las migraciones corren automaticamente al iniciar el backend Docker del stack principal. Para correrlas manualmente:

```bash
alembic upgrade head
```

## Endpoints Principales

### Auth

- `POST /api/auth/google/authorize` - intercambia code OAuth por access token local.

### Proyectos

- `POST /api/projects` - crear proyecto.
- `GET /api/projects` - listar proyectos.
- `GET /api/projects/{id}` - obtener proyecto.
- `PATCH /api/projects/{id}` - actualizar proyecto.
- `DELETE /api/projects/{id}` - eliminar proyecto.
- `POST /api/projects/{id}/files/experiment-zip` - subir ZIP.
- `PUT /api/projects/{id}/sensors` - actualizar sensores.
- `POST /api/projects/{id}/finalize` - finalizar proyecto.

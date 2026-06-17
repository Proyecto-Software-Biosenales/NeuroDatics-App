# NeuroDatics Backend

API backend para NeuroDatics, construida con FastAPI y PostgreSQL.

---

## Arranque Rápido (Docker Compose — recomendado)

Docker Compose levanta **PostgreSQL + el backend** en un solo comando. No necesitas instalar Postgres manualmente.

### 1. Requisitos

| Herramienta | Versión mínima |
|---|---|
| Docker Desktop | 20+ (con Compose v2 incluido) |

### 2. Configurar `.env`

```powershell
cd backend
copy .env.example .env
```

El `.env.example` ya tiene los valores por defecto para docker-compose. Si no necesitas Google OAuth ni Google Drive para desarrollo básico, puedes dejar esas variables vacías y el backend arrancará igual.

> **Importante:** el `docker-compose.yml` inyecta automáticamente  
> `DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/neurodatics`  
> sobrescribiendo lo que tengas en `.env`. Así el contenedor del backend siempre apunta al servicio `db` interno.

### 3. Levantar

```powershell
cd backend
docker compose up --build
```

Esto:
1. Construye la imagen del backend.
2. Levanta un contenedor PostgreSQL (`db`) con un volumen persistente.
3. Espera a que Postgres esté listo (healthcheck).
4. Ejecuta `alembic upgrade head` — **crea y migra la base de datos automáticamente**.
5. Arranca el servidor FastAPI en el puerto 8000.

### 4. Verificar

| Recurso | URL |
|---|---|                                                                                                                   
| Health check | http://localhost:8000/health |
| Swagger UI | http://localhost:8000/docs |

### 5. Detener

```powershell
# Ctrl+C para detener, luego:
docker compose down
# Para borrar también la base de datos (volumen):
docker compose down -v
```

### 6. Reiniciar limpio (port ocupado u otro error)

```powershell
docker compose down
docker compose up --build
```

---

## Arranque Local (venv, sin Docker)

Solo si prefieres no usar Docker. Requiere tener PostgreSQL instalado y corriendo en tu máquina.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # bash: source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e .                       # instala deps desde pyproject.toml
```

Edita `.env` y cambia `DATABASE_URL` a la variante local:
```
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/neurodatics
```

Luego:
```powershell
alembic upgrade head                   # crea/migra la base de datos
python -m uvicorn neurodatics.main:app --reload --host 0.0.0.0 --port 8000 --app-dir src
```

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | URL de conexión PostgreSQL con driver `psycopg` (psycopg3) |
| `AUTH_JWT_SECRET` | ✅ | Secreto para firmar tokens JWT |
| `GOOGLE_OAUTH_CLIENT_ID` | Solo para login | Client ID de Google OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Solo para login | Client Secret de Google OAuth |
| `GOOGLE_OAUTH_REDIRECT_URI` | Solo para login | URI de redirección OAuth |
| `GDRIVE_SERVICE_ACCOUNT_JSON` | Solo para Drive | JSON de cuenta de servicio |
| `GDRIVE_FOLDER_ID` | Solo para Drive | ID carpeta raíz en Drive |
| `DEBUG` | No | Activa logs verbose. Default: `false` |

> **Driver obligatorio:** `DATABASE_URL` debe usar el esquema `postgresql+psycopg://`, **nunca** `postgresql+asyncpg://`.

Detalle completo: [`../docs/ENVIRONMENT.md`](../docs/ENVIRONMENT.md)

---

## Migraciones

Las migraciones corren **automáticamente** al iniciar el contenedor. Para crearlas manualmente en desarrollo local:

```bash
# Crear nueva migración
alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones pendientes
alembic upgrade head
```

---

## Endpoints Principales

### Auth
- `POST /api/auth/google/authorize` — intercambia code OAuth por access token local

### Proyectos
- `POST /api/projects` — crear proyecto
- `GET /api/projects` — listar proyectos
- `GET /api/projects/{id}` — obtener proyecto
- `PATCH /api/projects/{id}` — actualizar proyecto
- `DELETE /api/projects/{id}` — eliminar proyecto
- `POST /api/projects/{id}/files/experiment-zip` — subir ZIP
- `PUT /api/projects/{id}/sensors` — actualizar sensores
- `POST /api/projects/{id}/finalize` — finalizar proyecto

### Participantes y Estímulos
- `PUT /api/projects/{id}/participants` — actualizar participantes
- `PUT /api/projects/{id}/scenaries` — actualizar estímulos
- `PUT /api/projects/{id}/aois` — actualizar AOIs

---

## Arquitectura

```
src/neurodatics/
├── api/          # Rutas y middlewares
├── config/       # Settings y seguridad
├── infra/        # DB, storage, cache
└── modules/      # Dominio por feature
    ├── auth/
    ├── projects/
    ├── participants/
    ├── scenaries/
    ├── uploads/
    └── integrations/
```

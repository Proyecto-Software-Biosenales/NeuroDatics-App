# NeuroDatics Backend

API backend para la aplicación NeuroDatics, construida con FastAPI y PostgreSQL.

## Arranque Rápido

### Docker (PowerShell)

python -m venv .venv


.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install uvicorn fastapi
python -m uvicorn neurodatics.main:app --reload --host 0.0.0.0 --port 8000 --app-dir src



Inicio backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn neurodatics.main:app --reload --host 0.0.0.0 --port 8000 --app-dir src
```powershell
docker build -t neurodatics-backend .
docker rm -f neurodatics-backend-app 2>$null
docker run --rm -d --name neurodatics-backend-app -p 8000:8000 --env-file .env neurodatics-backend`


docker build -t neurodatics-backend .
docker run --rm -p 8000:8000 --env-file .env neurodatics-backend

Matar puerto
docker ps -q --filter "publish=8000" | xargs -r docker stop
```

### Docker (bash)

```bash
docker build -t neurodatics-backend .
docker rm -f neurodatics-backend-app 2>/dev/null || true
docker run --rm -d --name neurodatics-backend-app -p 8000:8000 --env-file .env neurodatics-backend
```

# Reinicio limpio (PowerShell)
docker rm -f neurodatics-backend-app 2>$null; docker run --rm -d --name neurodatics-backend-app -p 8000:8000 --env-file C:\Projects\NeuroDatics-App\backend\.env neurodatics-backend

## Características

- **Autenticación JWT**: Emisión y validación local de tokens JWT
- **Arquitectura modular**: Organizada por dominios (projects, participants, scenaries)
- **Seguridad PII**: Encriptación y hash de datos sensibles
- **Almacenamiento**: Integración con Google Drive
- **Base de datos**: PostgreSQL con SQLAlchemy async
- **Migraciones**: Alembic para manejo de esquema

## Configuración

### Variables de Entorno

Copia `.env.example` a `.env` y configura:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/neurodatics

# Google OAuth (Backend)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/authorize
GOOGLE_OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
GOOGLE_OAUTH_USERINFO_URL=https://openidconnect.googleapis.com/v1/userinfo

# Auth JWT (Backend)
AUTH_JWT_SECRET=replace-with-a-long-random-secret
AUTH_JWT_ALGORITHM=HS256
AUTH_JWT_ISSUER=neurodatics-backend
AUTH_ACCESS_TOKEN_EXP_MINUTES=60
AUTH_REFRESH_TOKEN_EXP_MINUTES=43200
AUTH_USER_STORE_PATH=./data/auth_users.json

# PII Security
PII_HASH_SALT=your-secure-salt-here
PII_ENCRYPTION_KEY=your-32-byte-encryption-key-here

# Google Drive
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GDRIVE_SERVICE_ACCOUNT_JSON=
GDRIVE_FOLDER_ID=your-google-drive-folder-id

# App
APP_NAME=NeuroDatics API
DEBUG=true
```

### Instalación

```bash
# Instalar dependencias
poetry install

# O con pip
pip install -e .

# Ejecutar migraciones
alembic upgrade head

# Iniciar servidor de desarrollo
python -m neurodatics.main
```

## API Endpoints

### Auth

- `POST /api/auth/google/authorize` - Intercambia code OAuth por tokens locales
- `POST /api/auth/refresh` - Renueva access token usando refresh token

### Proyectos

- `POST /api/projects` - Crear proyecto
- `GET /api/projects` - Listar proyectos
- `GET /api/projects/{id}` - Obtener proyecto
- `PATCH /api/projects/{id}` - Actualizar proyecto
- `DELETE /api/projects/{id}` - Eliminar proyecto
- `POST /api/projects/{id}/files/experiment-zip` - Subir archivo ZIP
- `PUT /api/projects/{id}/sensors` - Actualizar sensores
- `POST /api/projects/{id}/finalize` - Finalizar proyecto

### Participantes

- `PUT /api/projects/{id}/participants` - Actualizar participantes

### Estímulos y AOIs

- `PUT /api/projects/{id}/scenaries` - Actualizar estímulos
- `PUT /api/projects/{id}/aois` - Actualizar AOIs

## Arquitectura

```
src/neurodatics/
├── api/                    # Configuración API
├── config/                 # Configuración y settings
├── infra/                  # Infraestructura
│   ├── db/                # Base de datos
│   └── storage/           # Almacenamiento (Google Drive)
└── modules/               # Módulos de dominio
    ├── projects/          # Gestión de proyectos
    ├── participants/      # Gestión de participantes
    └── scenaries/          # Gestión de estímulos y AOIs
```

## Seguridad

- **Autenticación**: JWT locales firmados por backend
- **Autorización**: Owner-only access a proyectos
- **PII**: Datos sensibles encriptados y hasheados
- **CORS**: Configurado para desarrollo (ajustar para producción)

## Desarrollo

```bash
# Ejecutar servidor de desarrollo
./scripts/dev.sh

# Crear migración
alembic revision --autogenerate -m "descripción"

# Aplicar migraciones
alembic upgrade head

# Linting
./scripts/lint.sh

# Tests
./scripts/test.sh
```

## Verificación rápida

- Health: `GET /health`
- Swagger UI: `GET /docs`
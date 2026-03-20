# NeuroDatics-App

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Estado Actual

- Frontend productivo con Next.js App Router en carpeta frontend.
- Backend FastAPI funcional en carpeta backend.
- Autenticacion con Google OAuth + JWT local (sin Supabase Auth).
- Flujo de proyectos integrado (crear, listar, editar, eliminar, subir zip, finalizar).

## Quick Start

### 1) Backend

Revisar instrucciones completas en backend/README.md.

PowerShell rapido:

```powershell
cd backend
docker build -t neurodatics-backend .
docker rm -f neurodatics-backend-app 2>$null
docker run --rm -d --name neurodatics-backend-app -p 8000:8000 --env-file .env neurodatics-backend
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Aplicacion local:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs

## Variables De Entorno

Resumen rapido:

- Frontend: NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID
- Frontend opcional: NEXT_PUBLIC_DEV_ADMIN_EMAIL, NEXT_PUBLIC_DEV_ADMIN_PASSWORD, NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME
- Backend: ver backend/.env.example

Detalle completo: docs/ENVIRONMENT.md.

## Estructura Del Monorepo

- frontend: UI, rutas App Router, features por dominio.
- backend: API modular por capas (api, application, domain, infrastructure).
- docs: documentacion tecnica y funcional.
- plans: planes de implementacion.

## Documentacion

- Vision general: docs/PROJECT_OVERVIEW.md
- Arquitectura: docs/ARCHITECTURE.md
- Entornos: docs/ENVIRONMENT.md
- Autenticacion: docs/AUTH_SUPABASE.md
- Plan de CRUD: docs/HITO_CRUD_PROJECTS_PLAN.md

## Notas

- Esta rama contiene trabajo activo de CRUD de proyectos.
- Si el backend no inicia por puerto ocupado, usar el reinicio limpio documentado en backend/README.md.

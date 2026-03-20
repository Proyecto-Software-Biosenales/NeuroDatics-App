# PROJECT_OVERVIEW.md

## Resumen

NeuroDatics-App es un monorepo con frontend productivo en Next.js y backend FastAPI para gestionar proyectos de biosenales, incluyendo autenticacion con Google OAuth y JWT local.

## Mapa Del Repositorio

- frontend
  - app: rutas App Router
  - features: logica y UI por dominio (auth, projects, reports)
  - components/ui: primitives reutilizables
  - lib/api: wrapper de fetch y manejo de tokens
  - lib/providers: proveedor de autenticacion y redireccion OAuth
- backend
  - src/neurodatics/main.py: app FastAPI
  - src/neurodatics/api: router, deps y middlewares
  - src/neurodatics/modules: modulos por capas (api, application, domain, infrastructure)
  - migrations: Alembic
- docs
  - documentacion tecnica y de arquitectura

## Rutas Frontend Clave

- / : Home
- /login : Login
- /register : Registro
- /authorize : callback OAuth de Google
- /dashboard : tablero principal
- /proyectos : gestion de proyectos
- /reportes : reportes

## Stack Tecnologico

Frontend:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS

Backend:

- FastAPI
- SQLAlchemy async
- PostgreSQL
- Alembic
- Python-JOSE para JWT

## Flujo De Autenticacion Actual

1. El usuario inicia login con Google desde frontend.
2. Google redirige a /authorize.
3. El frontend llama a POST /api/auth/google/authorize.
4. El backend emite access_token y refresh_token propios.
5. El frontend guarda tokens en localStorage.
6. Las llamadas API incluyen Authorization: Bearer.
7. Si el access token expira, el frontend intenta POST /api/auth/refresh y reintenta la request.

## Flujo De Proyectos (Actual)

El wizard de creacion ejecuta:

1. POST /api/projects/
2. POST /api/projects/{id}/files/experiment-zip
3. PUT /api/projects/{id}/sensors
4. PUT /api/projects/{id}/participants
5. POST /api/projects/{id}/finalize

Incluye rollback del proyecto si falla la carga del zip.

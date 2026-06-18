# NeuroDatics Frontend

Frontend de NeuroDatics construido con Next.js App Router, TypeScript y Tailwind CSS.

## Requisitos

- Node.js 20+
- npm 10+
- Backend disponible en http://localhost:8000

## Variables De Entorno

Crear archivo frontend/.env.local con:

```env
NEXT_INTERNAL_API_BASE_URL=http://localhost:8000

# Opcional (modo admin local para desarrollo)
NEXT_PUBLIC_DEV_ADMIN_EMAIL=
NEXT_PUBLIC_DEV_ADMIN_PASSWORD=
NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME=Administrador NeuroDatics
```

## Ejecutar En Desarrollo

```bash
cd frontend
npm install
npm run dev
```

## Scripts Disponibles

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run format
```

## Autenticacion

- Login principal: Google OAuth.
- Callback de autorizacion: /authorize.
- El frontend guarda accessToken y expiresAt en localStorage.
- El access token dura 2 semanas; al expirar, el wrapper de API limpia la sesion y redirige a login.

## Estructura Principal

- app: rutas App Router (login, dashboard, proyectos, reportes, authorize).
- features: logica por dominio (auth, projects, reports, home).
- components/ui: componentes reutilizables.
- lib/api: wrapper HTTP central.
- lib/providers: contexto de autenticacion y helpers OAuth.

## Integracion Con Backend

- El navegador llama `/api` en el mismo origen.
- Next.js reenvia esas solicitudes al backend usando `NEXT_INTERNAL_API_BASE_URL`.
- Endpoints principales consumidos desde features/projects/api/projectsApi.ts.

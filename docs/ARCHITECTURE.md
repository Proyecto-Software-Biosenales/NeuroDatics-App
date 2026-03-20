# ARCHITECTURE.md

## Vista General

El proyecto sigue arquitectura por dominios con frontend desacoplado del backend mediante API REST autenticada con JWT.

## Frontend

Capas principales:

- app: composicion de rutas (App Router).
- features: logica por dominio.
- components/ui: piezas reutilizables.
- lib/providers: estado global de autenticacion.
- lib/api: cliente HTTP comun con refresh automatico.

Rutas principales:

- /login, /register, /authorize
- /dashboard, /proyectos, /reportes

## Backend

Backend FastAPI en src/neurodatics.

Capas por modulo en src/neurodatics/modules/<modulo>:

- api: endpoints y schemas HTTP.
- application: casos de uso.
- domain: entidades y contratos.
- infrastructure: repositorios y adapters.

Wiring transversal:

- main.py: instancia FastAPI y middlewares.
- api/router.py: registro de routers.
- api/deps.py: auth y DB dependencies.
- config/security.py: JWT.
- infra/db: sesion async y base ORM.

## Modulos Relevantes

- auth: OAuth Google y refresh token.
- projects: CRUD y finalizacion.
- participants: actualizacion de participantes.
- scenaries: actualizacion de estimulos y AOIs.

## Flujo De Peticiones Seguras

1. Frontend envia Authorization: Bearer access_token.
2. Backend valida JWT en deps/security.
3. Se extrae sub como current_user.
4. El modulo valida ownership del recurso.

## Reglas De Dependencia

- api depende de application/domain.
- application depende de domain.
- infrastructure implementa contratos de domain.
- domain no depende de FastAPI ni de SQLAlchemy APIs de capa externa.

## Areas A Mejorar

- Homogeneizar naming de scenaries para consistencia semantica.
- Aumentar cobertura de pruebas de integracion y e2e.
- Endurecer CORS y gestion de secretos para produccion.

# HITO_CRUD_PROJECTS_PLAN.md

## Estado Del Hito

Este documento paso de plan a seguimiento de estado.

## Implementado

Backend:

- CRUD base de proyectos:
  - POST /api/projects/
  - GET /api/projects/
  - GET /api/projects/{id}
  - PATCH /api/projects/{id}
  - DELETE /api/projects/{id}
- Endpoints adicionales del flujo wizard:
  - POST /api/projects/{id}/files/experiment-zip
  - PUT /api/projects/{id}/sensors
  - PUT /api/projects/{id}/participants
  - PUT /api/projects/{id}/scenaries
  - PUT /api/projects/{id}/aois
  - POST /api/projects/{id}/finalize
- Dependencias de auth y DB en api/deps.py.

Frontend:

- Integracion por API en features/projects/api/projectsApi.ts.
- Wrapper comun lib/api/apiFetch.ts con:
  - Bearer token automatico.
  - Refresh token automatico ante 401 por expiracion.
- Wizard create-project conectado a backend con rollback si falla upload zip.

## Pendiente

- Endurecer validaciones de dominio para finalize.
- Mejorar tipado de respuestas (evitar any en scenaries/AOIs frontend).
- Agregar pruebas de integracion automatizadas backend.
- Agregar pruebas e2e del wizard frontend.

## Criterios De Cierre Recomendados

1. Pruebas de ownership pasando.
2. Pruebas de expiracion y refresh de token pasando.
3. Flujo completo del wizard funcionando contra backend en limpio.
4. Manejo de errores consistente (401, 404, 422).

## Matriz Minima De Pruebas

Backend:

- Crear proyecto autenticado.
- Listar solo proyectos del owner.
- Bloquear acceso sin token.
- Finalize falla si faltan zip o sensores.

Frontend:

- Crear proyecto completo con zip.
- Ver rollback si falla upload zip.
- Ver refresh automatico al expirar access token.

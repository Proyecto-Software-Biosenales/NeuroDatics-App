# NeuroDatics - Documentacion Tecnica Y Funcional

Este paquete de documentacion esta pensado para onboarding tecnico real de una persona nueva en el repositorio.
No es una plantilla generica: describe rutas, archivos, capas y flujos que existen en el codigo actual.

## Indice General

1. [01-overview.md](./01-overview.md)
2. [02-frontend-architecture.md](./02-frontend-architecture.md)
3. [03-backend-architecture.md](./03-backend-architecture.md)
4. [04-projects-crud-flow.md](./04-projects-crud-flow.md)
5. [05-create-project-wizard.md](./05-create-project-wizard.md)
6. [06-api-reference.md](./06-api-reference.md)
7. [07-database-model.md](./07-database-model.md)
8. [08-file-map.md](./08-file-map.md)
9. [09-onboarding-guide.md](./09-onboarding-guide.md)
10. [10-known-gaps-and-todos.md](./10-known-gaps-and-todos.md)

## Mapa De Lectura Recomendado

- Si eres nuevo total:
  1. [01-overview.md](./01-overview.md)
  2. [09-onboarding-guide.md](./09-onboarding-guide.md)
  3. [08-file-map.md](./08-file-map.md)
- Si vas a tocar UI o flujos de producto:
  1. [02-frontend-architecture.md](./02-frontend-architecture.md)
  2. [05-create-project-wizard.md](./05-create-project-wizard.md)
  3. [04-projects-crud-flow.md](./04-projects-crud-flow.md)
- Si vas a tocar API o DB:
  1. [03-backend-architecture.md](./03-backend-architecture.md)
  2. [06-api-reference.md](./06-api-reference.md)
  3. [07-database-model.md](./07-database-model.md)

## Que Cubre Esta Documentacion

- Arquitectura frontend y backend real del repo.
- Flujo end-to-end de Proyectos (crear, listar, editar, eliminar, finalizar).
- Wizard de creacion y proceso de ZIP + Google Drive.
- Endpoints activos y capas involucradas (route, schema, use case, repository).
- Modelo de datos actual inferido de entidades SQLAlchemy y migraciones.
- Brechas e inconsistencias detectadas al leer codigo real.

## Alcance Y Limites

- Esta documentacion refleja el estado actual de la rama `projects-CRUD`.
- Si hay comportamientos que dependen de infraestructura externa (Google OAuth, Google Drive, base inicial SQL no incluida), se explicita.
- Donde el codigo esta incompleto o ambiguo, se marca en [10-known-gaps-and-todos.md](./10-known-gaps-and-todos.md).

# 08 - Mapa De Archivos Importantes

Este mapa no lista todo el repo: prioriza archivos clave para entender y modificar el sistema.

## Frontend - Entrada Y Shell

| Archivo | Que hace | Quien lo usa | De que depende | Cuando corre |
|---|---|---|---|---|
| `frontend/app/layout.tsx` | Layout raiz, monta AuthProvider/NavBar/Toaster | Todas las rutas | componentes layout, providers | Siempre |
| `frontend/app/proyectos/page.tsx` | Pantalla principal de proyectos | Usuario autenticado | useProjectsStorage, ProjectsGrid, CreateProjectDialog | Navegar a `/proyectos` |
| `frontend/lib/providers/AuthProvider.tsx` | Estado auth en cliente | AuthGuard y UI | sessionStore | Inicio app + cambios de sesion |

## Frontend - Projects

| Archivo | Que hace | Quien lo usa | De que depende | Cuando corre |
|---|---|---|---|---|
| `frontend/features/projects/api/projectsApi.ts` | SDK de endpoints de proyectos | hooks/dialogs de projects | apiFetch/apiFetchBlob | En cada accion CRUD |
| `frontend/features/projects/create-project/useProjectsStorage.ts` | Store local + carga inicial backend | `app/proyectos/page.tsx` | ProjectsApi | Montaje de pagina proyectos |
| `frontend/features/projects/components/ProjectsGrid.tsx` | Tarjetas y acciones editar/ver/eliminar/archivar | `app/proyectos/page.tsx` | dialogs, ProjectsApi | Render del listado |
| `frontend/features/projects/create-project/CreateProjectDialog.tsx` | UI wizard creacion | `app/proyectos/page.tsx` | useCreateProjectWizard | Crear nuevo proyecto |
| `frontend/features/projects/create-project/useCreateProjectWizard.ts` | Orquestacion completa del wizard | CreateProjectDialog | ProjectsApi | Durante wizard |
| `frontend/features/projects/components/EditProjectDialog.tsx` | Wizard de edicion | ProjectsGrid | ProjectsApi + steps | Editar proyecto |
| `frontend/features/projects/components/ViewProjectDialog.tsx` | Vista detalle de proyecto | ProjectsGrid | ProjectsApi | Ver proyecto |
| `frontend/features/projects/components/DeleteProjectDialog.tsx` | Confirmacion doble de borrado | ProjectsGrid | callback delete | Eliminar proyecto |
| `frontend/features/projects/create-project/CreateProjectStep4.tsx` | Preview de escenarios imagen + AOIs | Create/Edit dialogs | ProjectsApi.fetchScenarioImage | Paso 4 |
| `frontend/lib/api/apiFetch.ts` | Cliente HTTP base + refresh token + upload + blob cache | todo API client | sessionStore | Todas las llamadas backend |

## Backend - Wiring General

| Archivo | Que hace | Quien lo usa | De que depende | Cuando corre |
|---|---|---|---|---|
| `backend/src/neurodatics/main.py` | Crea app FastAPI y registra routers | Uvicorn | api/router, settings | Arranque servidor |
| `backend/src/neurodatics/api/router.py` | Incluye routers de modulos | main.py | routers de modulos | Arranque servidor |
| `backend/src/neurodatics/api/deps.py` | Dependencias de DB y usuario actual | rutas autenticadas | security + session | Cada request |
| `backend/src/neurodatics/config/security.py` | JWT encode/decode y auth guard | deps.py y auth routes | settings | Login y requests protegidas |
| `backend/src/neurodatics/infra/db/session.py` | Session async SQLAlchemy | deps.py, repos | settings.database_url | Cada request DB |

## Backend - Projects Core

| Archivo | Que hace | Quien lo usa | De que depende | Cuando corre |
|---|---|---|---|---|
| `backend/src/neurodatics/modules/projects/api/routes.py` | Endpoints CRUD, ZIP, finalize, image proxy | router global | schemas, use cases, repos, gdrive | Requests `/api/projects/*` |
| `backend/src/neurodatics/modules/projects/api/schemas.py` | Contratos request/response | routes.py | pydantic | Serializacion API |
| `backend/src/neurodatics/modules/projects/infrastructure/repository_impl.py` | Acceso SQLAlchemy a proyectos | routes y use cases | entities + AsyncSession | Operaciones DB |
| `backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py` | Pipeline ingestion ZIP end-to-end | route upload ZIP | gdrive client, validation/extraction, repo | Upload ZIP |
| `backend/src/neurodatics/modules/projects/application/services/zip_validation_service.py` | Validacion estructural ZIP | use case upload | settings | Antes de subir a Drive |
| `backend/src/neurodatics/modules/projects/application/services/drive_upload_progress_registry.py` | Estado de progreso persistido a JSON | upload route/progress route | filesystem local backend/data | Durante upload |
| `backend/src/neurodatics/modules/projects/application/use_cases/delete_project.py` | Borrado coordinado DB+Drive | route delete | repository + gdrive | Delete proyecto |
| `backend/src/neurodatics/modules/projects/domain/entities.py` | Modelo SQLAlchemy de projects/files/sensors | repos y ORM | BaseModel | Consultas y persistencia |

## Backend - Modulos Relacionados A Projects

| Archivo | Que hace | Quien lo usa | De que depende | Cuando corre |
|---|---|---|---|---|
| `backend/src/neurodatics/modules/participants/api/routes.py` | PUT participantes por proyecto | frontend wizard/edit | participant repo + project repo | Guardar participantes |
| `backend/src/neurodatics/modules/scenaries/api/routes.py` | PUT escenarios y AOIs | frontend (si usa endpoints directos) | scenaries repo + project repo | Guardar escenarios/AOIs |
| `backend/src/neurodatics/modules/scenaries/domain/entities.py` | tablas scenaries y aois | ORM | BaseModel | Persistencia escenarios |

## Backend - Integraciones

| Archivo | Que hace | Quien lo usa | De que depende | Cuando corre |
|---|---|---|---|---|
| `backend/src/neurodatics/modules/integrations/google_drive/api/routes.py` | Endpoints OAuth/sync de Drive | UI de integraciones (cuando exista) | service.py | Requests integración |
| `backend/src/neurodatics/modules/integrations/google_drive/application/service.py` | Logica OAuth y operaciones Drive | routes integraciones | repository + gdrive file service | Integracion Drive |
| `backend/src/neurodatics/modules/integrations/google_drive/infrastructure/configure_client.py` | Configura cliente global Drive con cache TTL | upload/image/delete use cases | system_integrations + gdrive_client | Requests que tocan Drive |
| `backend/src/neurodatics/modules/integrations/google_drive/infrastructure/repository.py` | CRUD tabla `system_integrations` | service.py | SQL directo | Persistencia OAuth global |

## Archivos Que Parecen Poco Usados O A Revisar

- `frontend/features/projects/hooks/useProjectApi.ts` (no es el flujo principal actual de pagina proyectos).
- `backend/src/neurodatics/modules/projects/api/routes.py` incluye `register_project_routes(app): pass` sin uso.
- `backend/src/neurodatics/infra/db/models/` esta vacio (solo `.gitkeep`).

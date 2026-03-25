# 02 - Arquitectura Frontend

## Estructura General

Raiz principal: `frontend/`

- `app/`: rutas App Router (paginas y composicion de features).
- `features/`: logica por dominio (auth, projects, reports, home).
- `components/`: componentes compartidos (layout y ui).
- `lib/`: infraestructura cliente (api, auth session, providers, utilidades).
- `hooks/`: hooks globales (uso menor que hooks por feature).

## Rutas App Router Reales

- `app/proyectos/page.tsx`: pagina principal de gestion de proyectos.
- `app/login/page.tsx`: login.
- `app/authorize/page.tsx`: callback de OAuth (usa `AuthCallback`).
- `app/auth/callback/page.tsx`: callback alterno que tambien monta `AuthCallback`.
- `app/layout.tsx`: layout raiz, monta `AuthProvider`, `NavBar`, `Toaster`.

Nota:
- Existen dos rutas de callback (`/authorize` y `/auth/callback`) con la misma logica de componente.

## Modulo Projects (Core Del Producto)

Carpeta: `frontend/features/projects/`

### Subcarpetas clave

- `api/projectsApi.ts`
  - Cliente tipado de endpoints `/api/projects/*`.
  - Tambien consume `/participants` y `/scenaries` bajo prefijo `/projects/{id}`.
- `components/`
  - `ProjectsGrid.tsx`: grilla de tarjetas y acciones.
  - `EditProjectDialog.tsx`: wizard de edicion.
  - `ViewProjectDialog.tsx`: detalle de solo lectura.
  - `DeleteProjectDialog.tsx`: confirmacion en dos pasos.
- `create-project/`
  - `CreateProjectDialog.tsx`: wizard de creacion (4 pasos).
  - `useCreateProjectWizard.ts`: estado y side effects del wizard.
  - `CreateProjectStep1-4.tsx`: UI por paso.
  - `useProjectsStorage.ts`: store local + sincronizacion inicial con backend.
- `types.ts`
  - Tipos de dominio frontend (`Project`, `ProjectStatus`, `SensorType`, etc).

## Data Flow: UI -> API -> UI

```mermaid
flowchart LR
    UI[Components de Projects] --> H[useCreateProjectWizard / useProjectsStorage]
    H --> API[ProjectsApi]
    API --> F[apiFetch / apiUploadFormWithProgress / apiFetchBlob]
    F --> BE[/api/* en backend]
    BE --> F
    F --> H
    H --> UI
```

### Cliente HTTP comun

Archivo: `frontend/lib/api/apiFetch.ts`

Responsabilidades:
- Adjuntar bearer token desde `sessionStore`.
- Refrescar token con `/api/auth/refresh` ante expiracion/401.
- Manejo de timeout.
- Upload multipart con progreso (`XMLHttpRequest`) para ZIP.
- Descarga blob para imagenes de escenarios.

Optimizaciones recientes:
- Cache local de blobs + deduplicacion de requests en vuelo para imagenes.

## Flujo De Estado En Pagina De Proyectos

Archivo: `frontend/app/proyectos/page.tsx`

1. Usa `useProjectsStorage()` para cargar proyectos.
2. Renderiza filtros por estado (all/active/archived).
3. Renderiza `ProjectsGrid` con callbacks `onDelete` y `onEdit`.
4. Monta `CreateProjectDialog` para alta.

## Wizard De Creacion (Resumen)

Archivos:
- UI: `CreateProjectDialog.tsx` + `CreateProjectStep1..4.tsx`
- Logica: `useCreateProjectWizard.ts`

Ideas clave reales:
- Paso 1 crea proyecto en estado draft y procesa ZIP inmediatamente.
- Paso 2 guarda sensores.
- Paso 3 guarda participantes.
- Paso 4 muestra escenarios de imagen para AOIs.
- Al final se llama `/projects/{id}/finalize` para activar.

## Wizard De Edicion (Resumen)

Archivo: `EditProjectDialog.tsx`

Comportamiento real:
- Carga detalle con `ProjectsApi.get(projectId)` al abrir.
- Permite marcar checkbox para reemplazar ZIP.
- Si se reemplaza ZIP, procesa en Paso 1 (no al final).
- Guarda metadatos/sensores/participantes solo si cambiaron.
- Finaliza solo si hubo reprocesamiento de ZIP.

## Modulo Auth (Frontend)

Archivos clave:
- `frontend/lib/providers/AuthProvider.tsx`
- `frontend/features/auth/AuthCallback.tsx`
- `frontend/lib/auth/sessionStore.ts`

Flujo:
1. OAuth retorna a `/authorize` o `/auth/callback`.
2. `AuthCallback` intercambia `code` por tokens locales en backend.
3. Guarda `accessToken` + `refreshToken` en `localStorage`.
4. `AuthProvider` expone `currentUser` y `session`.
5. `AuthGuard` protege rutas privadas.

## Relacion Entre Carpeta UI Compartida Y Features

- `components/ui/*` contiene primitives reutilizables.
- Features no implementan wrappers duplicados cuando ya existe uno en UI.
- `ProjectsGrid`, dialogs y steps combinan UI compartida + logica de feature.

## Inconsistencias Detectadas En Frontend

- `useProjectApi.ts` existe pero no es el camino principal de datos en `app/proyectos/page.tsx`.
- Filtro de estado en `app/proyectos/page.tsx` no incluye explicitamente `draft` (aunque el dominio si soporta draft).
- Documentacion previa menciona Supabase client path que hoy no existe como archivo `frontend/lib/utils/supabase.ts`.

Ver brechas completas en [10-known-gaps-and-todos.md](./10-known-gaps-and-todos.md).

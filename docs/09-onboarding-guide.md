# 09 - Guia De Onboarding Tecnico

## Objetivo De Esta Guia

Que una persona nueva pueda:
- levantar contexto rapido,
- entender como fluye Proyectos de punta a punta,
- empezar a contribuir sin romper contratos clave.

## Ruta De Lectura Sugerida (90 minutos)

### Bloque 1 (15 min): mapa mental

1. Leer [01-overview.md](./01-overview.md)
2. Leer [08-file-map.md](./08-file-map.md)

### Bloque 2 (30 min): frontend real

1. `frontend/app/proyectos/page.tsx`
2. `frontend/features/projects/create-project/useProjectsStorage.ts`
3. `frontend/features/projects/components/ProjectsGrid.tsx`
4. `frontend/features/projects/create-project/useCreateProjectWizard.ts`
5. `frontend/features/projects/components/EditProjectDialog.tsx`

Objetivo del bloque:
- entender como UI dispara llamadas API y como se actualiza estado local.

### Bloque 3 (30 min): backend real

1. `backend/src/neurodatics/main.py`
2. `backend/src/neurodatics/api/router.py`
3. `backend/src/neurodatics/modules/projects/api/routes.py`
4. `backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py`
5. `backend/src/neurodatics/modules/projects/infrastructure/repository_impl.py`

Objetivo del bloque:
- seguir request -> route -> use case/repository -> DB/Drive.

### Bloque 4 (15 min): contratos y riesgos

1. [06-api-reference.md](./06-api-reference.md)
2. [07-database-model.md](./07-database-model.md)
3. [10-known-gaps-and-todos.md](./10-known-gaps-and-todos.md)

## Checklist Para Primer Cambio Seguro

- Confirmar endpoint y payload exactos en `projectsApi.ts`.
- Verificar reglas de finalize y estado draft en backend.
- Si tocas upload ZIP, revisar compensacion y cancelacion.
- Si tocas preview de imagen, revisar cache frontend y backend.
- Correr validaciones:
  - frontend: `npm run typecheck`
  - backend: chequeo sintactico minimo (py_compile) o tests si existen.

## Cosas Que Suelen Confundir

1. Draft vs Active:
- El proyecto puede existir en draft antes de finalizar.

2. Paso 1 del wizard:
- Ya procesa ZIP y sincroniza Drive (no espera al boton final).

3. Auth:
- Backend usa JWT local.
- Hay menciones antiguas a Supabase en docs, pero el flujo activo no depende de cliente Supabase en frontend.

4. Storage:
- DB guarda metadata de archivos.
- Binarios viven en Drive.

5. Tablas base no completas en migraciones:
- `app_users` se usa pero no aparece creada en migraciones actuales.

## Recomendaciones Practicas Para Contribuir

1. Cambios pequeños por capa:
- primero frontend o backend, luego integrar.

2. Mantener contratos:
- evita cambiar shape de respuestas sin actualizar `projectsApi.ts` y dialogs.

3. Revisar rendimiento en imagenes:
- evita queries pesadas en endpoint de imagen.
- evita `cache: no-store` para blobs si buscas performance.

4. Documentar brechas encontradas:
- agrega observaciones en [10-known-gaps-and-todos.md](./10-known-gaps-and-todos.md).

## Donde Empezar Segun Tipo De Tarea

- Tarea UI Projects:
  - `app/proyectos/page.tsx`
  - `features/projects/components/*`
- Tarea wizard:
  - `useCreateProjectWizard.ts`
  - `CreateProjectStep1..4.tsx`
- Tarea API CRUD:
  - `modules/projects/api/routes.py`
  - `modules/projects/api/schemas.py`
  - `modules/projects/infrastructure/repository_impl.py`
- Tarea ingestion ZIP:
  - `upload_experiment_zip.py`
  - `zip_validation_service.py`
  - `zip_extraction_service.py`

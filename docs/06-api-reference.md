# 06 - Referencia API (Enfocada En Lo Que Usa El Frontend)

Base path comun: `/api`

## Auth

### POST /api/auth/google/authorize

- Proposito: intercambiar `code` de Google por un JWT local.
- Implementacion: `backend/src/neurodatics/modules/auth/api/routes.py`
- Request ejemplo:

```json
{
  "code": "google-auth-code",
  "redirect_uri": "http://localhost:3000/authorize"
}
```

- Response (resumen):
  - `access_token`
  - `expires_in`
  - `user`

Errores comunes:
- 400 si code invalido o userinfo falla.
- 500 si faltan variables OAuth en backend.

## Projects - Core CRUD

### POST /api/projects/

- Proposito: crear proyecto.
- Ruta: `projects/api/routes.py -> create_project`
- Capas:
  - Schema: `CreateProjectRequest`
  - Use case: `CreateProjectUseCase`
  - Repository: `SQLProjectRepository.create`

### GET /api/projects/

- Proposito: listar proyectos del usuario autenticado.
- Ruta: `list_projects`
- Use case: `ListProjectsUseCase`
- Repository: `get_by_owner`

### GET /api/projects/{project_id}

- Proposito: detalle de proyecto con archivos, sensores, participantes, escenarios y AOIs.
- Ruta: `get_project`
- Repository: `get_by_id` (carga eager de relaciones).

### PATCH /api/projects/{project_id}

- Proposito: actualizar nombre, descripcion o status.
- Ruta: `update_project`
- Repository: `get_basic_by_id`, `update`, `get_summary_by_id`.

Nota:
- Si existe `drive_root_folder_id`, intenta renombrar carpeta en Drive al cambiar nombre.

### DELETE /api/projects/{project_id}

- Proposito: eliminar proyecto y carpeta root en Drive (si existe).
- Ruta: `delete_project`
- Use case: `DeleteProjectUseCase`

## ZIP E Ingestion

### POST /api/projects/{project_id}/files/experiment-zip

- Proposito: subir ZIP y ejecutar ingestion completa.
- Ruta: `upload_experiment_zip`
- Use case: `UploadExperimentZipUseCase`

Response relevante:
- `ingestion_status`
- `counts`
- `csv_processing`
- `files`

Errores comunes:
- 400 por estructura ZIP invalida.
- 404 si proyecto no existe o no pertenece al usuario.
- 409 si subida fue cancelada.
- 500 por fallo de procesamiento.

### GET /api/projects/{project_id}/files/experiment-zip/progress

- Proposito: progreso de subida/sync.
- Ruta: `get_experiment_zip_upload_progress`
- Fuente: `drive_upload_progress_registry`.

### POST /api/projects/{project_id}/files/experiment-zip/cancel

- Proposito: solicitar cancelacion.
- Ruta: `cancel_experiment_zip_upload`

### DELETE /api/projects/{project_id}/files/experiment-zip

- Proposito: eliminar ZIP del proyecto en DB (kind experiment_zip).
- Ruta: `delete_experiment_zip`

## Proyecto - Datos Derivados

### PUT /api/projects/{project_id}/sensors

- Proposito: reemplazar sensores del proyecto.
- Ruta: `update_sensors`
- Request:

```json
{
  "sensors": ["EEG", "GSR"]
}
```

### PUT /api/projects/{project_id}/participants

- Proposito: upsert participantes.
- Ruta: `modules/participants/api/routes.py -> update_participants`

### PUT /api/projects/{project_id}/scenaries

- Proposito: upsert escenarios.
- Ruta: `modules/scenaries/api/routes.py -> update_scenaries`

### PUT /api/projects/{project_id}/aois

- Proposito: upsert AOIs.
- Ruta: `modules/scenaries/api/routes.py -> update_aois`

### POST /api/projects/{project_id}/finalize

- Proposito: validar y pasar proyecto a ACTIVE.
- Reglas en ruta `finalize_project`:
  - nombre no vacio.
  - debe tener archivos activos o ingestion READY.
  - debe tener al menos un sensor.

## Imagenes De Escenario

### GET /api/projects/{project_id}/files/{file_id}/image

- Proposito: proxy autenticado de imagen desde Drive.
- Ruta: `get_project_file_image`.
- Devuelve bytes imagen (`Response`), no JSON.
- Headers relevantes: `Cache-Control`, `ETag`, `X-Image-Cache`.

## Integrations - Google Drive

Prefijo: `/api/integrations/google-drive`

Endpoints principales:
- `GET /authorize`
- `GET /callback`
- `GET /status`
- `DELETE /`
- `POST /create-folder`
- `POST /sync-folder`
- `POST /sync-folder-scheduled`
- `GET /sync-status/{task_id}`
- `GET /sync-tasks`

Implementacion: `modules/integrations/google_drive/api/routes.py`.

# Prompt para agente: Implementar H4 — Workers, procesamiento en segundo plano, estados de ingesta y UI Draft

---

## Contexto general

Este proyecto (`NeuroDatics-App`) es una aplicación de neuromarketing con un backend FastAPI (Python, SQLAlchemy async, PostgreSQL, Alembic) y un frontend Next.js + TypeScript. La funcionalidad H4 consiste en:

1. Un **worker RQ (Redis Queue)** que procesa carpetas de experimentos en segundo plano.
2. **Estados de ingesta** en los proyectos (`PENDING → PROCESSING → READY | FAILED`).
3. Una **tabla `processing_jobs`** para rastrear el progreso de cada job.
4. Una **UI reactiva** que refleja el estado de procesamiento en las tarjetas de proyecto, el wizard de creación, y el progreso de sincronización con Google Drive.

**Importante**: El procesamiento de la carpeta ocurre de forma **síncrona** directamente en el endpoint HTTP, **no** en un worker desacoplado. La arquitectura de worker con RQ (`process_experiment_zip_task`) está preparada en el código y se debe usar como cola de jobs encolados desde el endpoint. El endpoint `POST /{project_id}/files/experiment-zip` llama directamente a `UploadExperimentZipUseCase.execute()` en el mismo hilo async. El `drive_upload_progress_registry` es un singleton en memoria que permite al frontend hacer polling al endpoint `GET .../progress` mientras el endpoint principal aún está corriendo (aprovechando async I/O).

---

## 1. Infraestructura de cola (Redis + RQ)

**Archivo:** `backend/src/neurodatics/infra/queue/redis_connection.py`

```python
class RedisConnectionPool:
    """Singleton Redis connection pool."""
    _instance: Optional[redis.Redis] = None
    _pool: Optional[ConnectionPool] = None

    @classmethod
    def get_connection(cls) -> redis.Redis:
        if cls._instance is None:
            cls._pool = ConnectionPool.from_url(
                settings.redis_url,
                decode_responses=True,
                max_connections=10,
                socket_keepalive=True,
            )
            cls._instance = redis.Redis(connection_pool=cls._pool)
        return cls._instance

def get_redis_client() -> redis.Redis:
    return RedisConnectionPool.get_connection()
```

**Variable de entorno requerida:** `REDIS_URL=redis://redis:6379`

---

## 2. Worker RQ (entrypoint y lifecycle)

**Archivo:** `backend/src/neurodatics/workers/entrypoint.py`

```python
class WorkerManager:
    def start(self):
        redis_conn = get_redis_client()
        worker = Worker(queues=["default"], connection=redis_conn)

        def handle_sigterm(signum, frame):
            worker.request_stop = True  # graceful shutdown en job actual

        signal.signal(signal.SIGTERM, handle_sigterm)
        worker.work(with_scheduler=False)

def start_worker_with_health_check():
    """Lanza worker RQ + servidor de health check en puerto 8001."""
    # Health check app: GET /health/worker → {"status": "ok"}
    # se levanta en hilo separado en puerto 8001
```

**Archivo:** `backend/src/neurodatics/workers/__main__.py`

```python
from .entrypoint import start_worker_with_health_check
start_worker_with_health_check()
```

**Docker Compose** (`backend/docker-compose.yml`):

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  backend:
    build: { context: ., dockerfile: Dockerfile }
    ports: ["8000:8000"]
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis: { condition: service_healthy }

  worker:
    build: { context: ., dockerfile: Dockerfile }
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis: { condition: service_healthy }
    command: python -m neurodatics.workers.entrypoint
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health/worker"]
```

---

## 3. Entidades de dominio

**Archivo:** `backend/src/neurodatics/modules/projects/domain/entities.py`

```python
class JobStatus(enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELED = "CANCELED"

class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID, ForeignKey("projects.id"), nullable=False)
    job_id = Column(String, unique=True)           # RQ job ID (string)
    job_type = Column(String, nullable=False)       # e.g. "process_experiment_zip"
    status = Column(Enum(JobStatus), default=JobStatus.QUEUED, nullable=False)
    progress_percent = Column(Integer, default=0)
    message = Column(Text)
    error_detail = Column(Text)
    result_metadata = Column(JSONB)
    created_at = Column(DateTime, server_default=func.now())
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    updated_at = Column(DateTime, onupdate=func.now())

class Project(Base):
    # ... campos existentes (id, name, description, status, owner_id, etc.) ...
    ingestion_status = Column(String(20), default="PENDING", nullable=False)
    ingestion_error = Column(Text)
    last_ingested_at = Column(DateTime(timezone=True))
    storage_provider = Column(String(20))
    drive_root_folder_id = Column(String(255))
    drive_root_folder_name = Column(String(255))
    drive_root_folder_url = Column(Text)
```

---

## 4. Migraciones

**`migrations/versions/007_project_ingestion_real_files.py`** — Añade columnas de ingesta a `projects`:

```sql
ALTER TABLE projects ADD COLUMN ingestion_status VARCHAR(20);
ALTER TABLE projects ADD COLUMN ingestion_error TEXT;
ALTER TABLE projects ADD COLUMN last_ingested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE projects ADD COLUMN storage_provider VARCHAR(20);
ALTER TABLE projects ADD COLUMN drive_root_folder_id VARCHAR(255);
ALTER TABLE projects ADD COLUMN drive_root_folder_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN drive_root_folder_url TEXT;
```

**`migrations/versions/008_fix_ingestion_status_default.py`** — Establece default `PENDING`:

```sql
ALTER TABLE projects ALTER COLUMN ingestion_status SET DEFAULT 'PENDING';
UPDATE projects SET ingestion_status = 'PENDING' WHERE ingestion_status IS NULL;
ALTER TABLE projects ALTER COLUMN ingestion_status SET NOT NULL;
```

**`migrations/versions/015_create_processing_jobs_table.py`**:

```sql
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    job_id VARCHAR(255) UNIQUE,
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    progress_percent INTEGER DEFAULT 0,
    message TEXT,
    error_detail TEXT,
    result_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX ix_processing_jobs_project_status ON processing_jobs(project_id, status);
```

---

## 5. Repositorio de processing jobs

**Archivo:** `backend/src/neurodatics/modules/projects/infrastructure/repository_processing_job_impl.py`

```python
class SQLProcessingJobRepository(ProcessingJobRepository):
    async def create(self, job: ProcessingJob) -> ProcessingJob
    async def get_by_id(self, job_id: UUID) -> Optional[ProcessingJob]
    async def get_by_rq_job_id(self, rq_job_id: str) -> Optional[ProcessingJob]
    async def get_by_project_id(self, project_id, status=None, limit=10) -> List[ProcessingJob]
    async def update_status(self, job_id, status, message=None) -> bool
    async def update_progress(self, job_id, progress_percent, message=None) -> bool
    # update_status también setea started_at cuando status → PROCESSING,
    # y completed_at cuando status → SUCCESS | FAILED | CANCELED
```

---

## 6. Registro de progreso en memoria

**Archivo:** `backend/src/neurodatics/modules/projects/application/services/drive_upload_progress_registry.py`

Singleton en memoria que permite al frontend hacer polling mientras el upload corre en el mismo proceso async:

```python
drive_upload_progress_registry.start(project_id, total_bytes)
drive_upload_progress_registry.mark_uploaded_bytes(project_id, uploaded_bytes)
drive_upload_progress_registry.get(project_id)
# → dict: {phase, uploaded_bytes, total_bytes, percent, speed_mbps, eta_seconds, elapsed_seconds, error}
drive_upload_progress_registry.request_cancel(project_id)
drive_upload_progress_registry.is_canceled(project_id) -> bool
```

El use case llama `self._raise_if_canceled(project_id)` periódicamente para abortar si el usuario cancela.

---

## 7. Use case de ingesta del ZIP

**Archivo:** `backend/src/neurodatics/modules/projects/application/use_cases/upload_experiment_zip.py`

```python
class UploadExperimentZipUseCase:
    async def execute(self, project_id, owner_id, file_content, filename, mime_type) -> Dict:
        # 1. Verifica proyecto existe
        # 2. Configura gdrive_client con OAuth del usuario (configure_gdrive_client_with_oauth)
        #    ⚠️ SOLO usar para el upload, nunca para descargas concurrentes — ver sección 10
        # 3. ZipValidationService.validate_and_analyze() → manifest_entries
        # 4. Calcula total_drive_bytes, inicia drive_upload_progress_registry
        # 5. repository.update_project_ingestion(ingestion_status="PROCESSING")
        # 6. Crea carpeta raíz en Drive
        # 7. Sube ZIP original (si settings.ingestion_save_original_zip)
        # 8. ZipExtractionService.extract_to_temp() → extrae a /tmp
        # 9. Por cada entry en manifest:
        #    - _ensure_folder_path() → crea carpeta en Drive si no existe (cache de folders)
        #    - gdrive_client.upload_file() via asyncio.to_thread()
        #    - mark_uploaded_bytes() para progreso
        #    - Para CSVs: _process_csv() → lee encabezados
        #    - Crea ProjectFile + Scenaries records
        # 10. Bulk insert ProjectFile + Scenaries
        # 11. repository.update_project_ingestion(ingestion_status="READY", last_ingested_at=now)
        # 12. Si excepción: limpia Drive (borra IDs subidos), marca FAILED con ingestion_error
        # Retorna dict con project_id, ingestion_status, counts, files, manifest
```

---

## 8. Endpoints de upload y progreso

**Archivo:** `backend/src/neurodatics/modules/projects/api/routes.py`

```python
# Upload ZIP (síncrono — corre el use case directamente en el HTTP request)
POST /{project_id}/files/experiment-zip
→ response_model=UploadedProjectZipSummaryResponse
→ llama UploadExperimentZipUseCase.execute()
→ retorna ingestion_status, drive_root_folder_*, counts, files, manifest

# Polling de progreso (non-blocking, lee del registry en memoria)
GET /{project_id}/files/experiment-zip/progress
→ response_model=DriveUploadProgressResponse
→ si hay snapshot en registry → devuelve phase/percent/bytes/speed/eta
→ si ingestion_status=READY y no hay snapshot → {phase:"idle", percent:0}
  ⚠️ IMPORTANTE: NO inferir "completed" de READY histórico — mostraría
     100% falso durante una nueva subida posterior
→ si ingestion_status=FAILED → {phase:"failed", error: project.ingestion_error}

# Cancelar upload
POST /{project_id}/files/experiment-zip/cancel
→ drive_upload_progress_registry.request_cancel(project_id)
→ retorna {"message": "Cancel requested"}
```

**Schemas** (`api/schemas.py`):

```python
class DriveUploadProgressResponse(BaseModel):
    phase: str                          # idle|uploading|processing|completed|failed|canceling
    uploaded_bytes: int
    total_bytes: int
    percent: int
    speed_mbps: Optional[float] = None
    eta_seconds: Optional[int] = None
    elapsed_seconds: int = 0
    error: Optional[str] = None

class UploadedProjectZipSummaryResponse(BaseModel):
    project_id: UUID
    ingestion_status: str               # READY | FAILED | PROCESSING
    drive_root_folder_id: Optional[str]
    drive_root_folder_name: Optional[str]
    drive_root_folder_url: Optional[str]
    zip_saved: bool
    zip_file: Optional[UploadedProjectZipResponse]
    counts: UploadedProjectCountsResponse
    files: List[UploadedProjectZipResponse]
    csv_processing: UploadedProjectCsvProcessingResponse
    manifest: Dict[str, int]

class ProjectResponse(BaseModel):
    id: UUID
    name: str
    status: ProjectStatus               # draft|active|archived
    ingestion_status: str               # PENDING|PROCESSING|READY|FAILED
    ingestion_error: Optional[str]
    drive_root_folder_id: Optional[str]
    drive_root_folder_name: Optional[str]
    drive_root_folder_url: Optional[str]
    # ...demás campos
```

---

## 9. Worker task (preparado pero no encolado activamente desde el endpoint)

**Archivo:** `backend/src/neurodatics/workers/tasks/process_experiment_zip.py`

```python
def process_experiment_zip_task(job_id, project_id, owner_id, file_content, filename, mime_type):
    """Versión para RQ queue — corre en el worker process separado."""
    # Crea su propia conexión DB y async event loop
    # Actualiza ProcessingJob.status=PROCESSING + project.ingestion_status=PROCESSING
    # Llama misma lógica: ZipValidation → Drive upload → ProjectFile inserts → READY
    # Progreso: job.progress_percent en milestones 5/10/15/30/50/70/85/95%
    # On success: job.status=SUCCESS, project.ingestion_status=READY
    # On failure: limpia Drive, job.status=FAILED, project.ingestion_status=FAILED,
    #             project.ingestion_error = str(exception)
```

Esta función existe en el código y está lista para usarse en el futuro para desacoplar el procesamiento del HTTP request encolando el job con `rq.Queue.enqueue(process_experiment_zip_task, ...)`.

---

## 10. ⚠️ Problema crítico resuelto: aislamiento del cliente Google Drive

**Síntoma:** Al abrir `ViewProjectDialog` para **otro** proyecto mientras el ZIP se estaba procesando, la descarga de imágenes fallaba o el upload del ZIP se interrumpía con un error de Drive (el servicio se ponía en `None` inesperadamente).

**Causa raíz:** El endpoint de imágenes (`GET /{project_id}/files/{file_id}/image`) llamaba a `configure_gdrive_client_with_oauth(db)`, que reconfiguraba el **singleton global** `gdrive_client`. Esto ponía `gdrive_client._service = None` momentáneamente mientras el use case de upload lo estaba usando, matando el upload en vuelo.

**Solución:** El endpoint de imágenes crea un cliente **aislado** en lugar de reconfigurar el global:

```python
# backend/src/neurodatics/modules/projects/api/routes.py

async def _build_isolated_drive_client(db: AsyncSession) -> Optional[GoogleDriveClient]:
    """Crea un GoogleDriveClient fresco sin tocar el singleton global."""
    repository = SystemIntegrationRepository(db)
    integration = await repository.get_by_provider("google_drive")
    if not integration:
        return None
    refresh_token = integration.get("refresh_token")
    if not refresh_token:
        return None
    credentials = build_google_drive_oauth_credentials(
        refresh_token=refresh_token,
        scope=integration.get("scope"),
    )
    client = GoogleDriveClient()         # ← instancia nueva, NO el singleton
    client.set_oauth_credentials(credentials)
    return client

@router.get("/{project_id}/files/{file_id}/image")
async def get_project_file_image(...):
    # USA el cliente aislado, NO configure_gdrive_client_with_oauth()
    drive_client = await _build_isolated_drive_client(db)
    # descarga imagen con drive_client local — sin tocar estado global
```

**Regla de oro:** `configure_gdrive_client_with_oauth()` **solo** debe llamarse en `UploadExperimentZipUseCase.execute()`. Cualquier otra ruta que necesite Drive debe usar `_build_isolated_drive_client()` o una instancia propia y no tocar el singleton.

---

## 11. ⚠️ Problema resuelto: duplicación de toasts de progreso

**Síntoma:** Múltiples toasts de "Procesando archivos..." aparecían en pantalla simultáneamente cada vez que el polling actualizaba el progreso.

**Causa:** Cada llamada a `toast.loading(...)` sin ID fijo generaba un toast nuevo.

**Solución:** Toast ID estable como constante + siempre pasar el mismo ID:

```typescript
// frontend/features/projects/create-project/useCreateProjectWizard.ts

const STEP1_LOADING_TOAST_ID = "create-project-step1-drive-sync";

const updateStep1LoadingToast = (message: string) => {
  step1LoadingToastIdRef.current = toast.loading(message, {
    id: STEP1_LOADING_TOAST_ID,   // ← mismo ID siempre → actualiza en lugar de crear nuevo
    position: "bottom-center",
    duration: Infinity,
  })
}

const clearStep1LoadingToast = () => {
  toast.dismiss(STEP1_LOADING_TOAST_ID)
  step1LoadingToastIdRef.current = STEP1_LOADING_TOAST_ID
}
```

El texto del toast usa el formato: `"Procesando archivos de ${formData.projectName} - ${percent}%"`.  
**No** mencionar "Google Drive" ni "paso 1" en los mensajes de progreso.

---

## 12. ⚠️ Problema resuelto: edición de campos durante procesamiento

**Síntoma:** El usuario podía modificar nombre/descripción del proyecto mientras el ZIP se estaba subiendo, potencialmente corrompiendo el estado.

**Causa:** Los inputs de nombre y descripción en Step1 no se deshabilitaban durante el upload.

**Solución:** Inmediatamente al iniciar el upload, antes de que el HTTP request retorne, se setea `uploadedZip.ingestion_status = "PROCESSING"` en el estado local:

```typescript
// En processStep1ZipAndContinue(), justo antes de llamar uploadZipWithProgress:
setFormData((prev) => ({
  ...prev,
  uploadedZip: {
    project_id: projectIdForUpload || "",
    ingestion_status: "PROCESSING",   // ← activa el lock de inputs inmediatamente
    // ...resto de campos vacíos/defaults
  },
}))
```

En `CreateProjectStep1.tsx`:

```typescript
const disableProjectMetadataEditing =
  uploadedZip?.ingestion_status === "PROCESSING" ||
  uploadedZip?.ingestion_status === "PENDING"

<Input disabled={disableProjectMetadataEditing} ... />
<Textarea disabled={disableProjectMetadataEditing} ... />
```

---

## 13. ⚠️ Problema resuelto: progreso falso 100% al reabrir el wizard

**Síntoma:** Al reabrir el wizard sobre un proyecto con `ingestion_status=READY` (ingesta previa completada), el endpoint de progreso devolvía `percent=100, phase=completed`, mostrando una barra llena falsa.

**Causa:** El endpoint `/progress` estaba infiriendo "completed" desde `ingestion_status=READY` en DB aunque no hubiera ningún upload activo en ese momento.

**Solución:** Si no hay snapshot en el registry en memoria Y el status es READY → devolver `{phase:"idle", percent:0}`:

```python
# routes.py — GET .../progress
progress = drive_upload_progress_registry.get(project_id)
if progress:
    return DriveUploadProgressResponse(...)

# Sin snapshot activo: NO inferir estado de READY histórico
if project.ingestion_status and str(project.ingestion_status).upper() == "READY":
    return DriveUploadProgressResponse(phase="idle", uploaded_bytes=0, total_bytes=0, percent=0, ...)

if project.ingestion_status and str(project.ingestion_status).upper() == "FAILED":
    return DriveUploadProgressResponse(phase="failed", ..., error=project.ingestion_error)

return DriveUploadProgressResponse(phase="idle", ...)
```

---

## 14. Frontend — polling desde useProjectsStorage

**Archivo:** `frontend/features/projects/create-project/useProjectsStorage.ts`

Polling automático cada 3 segundos cuando algún proyecto tiene `ingestionStatus` en `PENDING` o `PROCESSING`:

```typescript
const isDraftStep1Processing = (project: Project): boolean => {
  if (project.status !== "draft") return false
  const ing = normalizeIngestionStatus(project.ingestionStatus)
  return ing === "PENDING" || ing === "PROCESSING"
}

useEffect(() => {
  const hasProcessingDraft = projects.some(isDraftStep1Processing)
  if (!hasProcessingDraft) return

  // snapshot previo para detectar transición a READY
  const previousStatusById = new Map(
    projects.map((p) => [p.id, normalizeIngestionStatus(p.ingestionStatus)])
  )

  const interval = setInterval(async () => {
    const backendProjects = await ProjectsApi.list()
    const nextProjects = backendProjects.map(mapApiProjectToProject)

    for (const project of nextProjects) {
      const previous = previousStatusById.get(project.id)
      const current = normalizeIngestionStatus(project.ingestionStatus)
      // Detectar transición PROCESSING → READY → notificar
      if (
        (previous === "PENDING" || previous === "PROCESSING") &&
        current === "READY" &&
        project.status === "draft"
      ) {
        toast.success(
          `Paso 1 completado para "${project.name}". Ya puedes continuar con los pasos 2, 3 y 4.`,
          { position: "top-center" }
        )
      }
    }
    setProjects(nextProjects)
  }, 3000)

  return () => clearInterval(interval)
}, [projects])
```

`mapApiProjectToProject` debe mapear `bp.ingestion_status` → `project.ingestionStatus` (camelCase).

---

## 15. Frontend — UI de ProjectsGrid durante procesamiento

**Archivo:** `frontend/features/projects/components/ProjectsGrid.tsx`

```typescript
const isDraftProcessing =
  project.status === "draft" &&
  (project.ingestionStatus === "PENDING" || project.ingestionStatus === "PROCESSING")

const canContinueDraft =
  project.status === "draft" &&
  project.ingestionStatus === "READY"

// Footer de la tarjeta cuando está procesando — ancho completo, spinner:
{isDraftProcessing && (
  <div className="w-full flex items-center gap-2 bg-muted/50 rounded-b-lg px-4 py-2 text-sm text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" />
    <span>Procesando archivos...</span>
  </div>
)}

// Menú 3 puntos completamente deshabilitado durante procesamiento:
<DropdownMenuTrigger asChild disabled={isDraftProcessing}>
  <Button variant="ghost" disabled={isDraftProcessing} />
</DropdownMenuTrigger>
// También cada DropdownMenuItem individual: disabled={isDraftProcessing}
// (Incluye opciones Editar, Eliminar y Archivar)

// Botón "Continuar":
<Button disabled={!canContinueDraft}>Continuar</Button>
```

---

## 16. Frontend — tipos

**Archivo:** `frontend/features/projects/types.ts`

```typescript
export interface Project {
  id: string
  name: string
  description?: string
  status: "draft" | "active" | "archived"
  ingestionStatus?: "PENDING" | "PROCESSING" | "READY" | "FAILED"  // ← campo clave H4
  createdAt: string
  updatedAt?: string
  sensors: SensorType[]
  participants: number
}
```

---

## 17. Frontend — wizard hook: resume polling al reabrir

Cuando el usuario reabre el wizard sobre un proyecto que estaba en `PROCESSING` (cerró el dialog antes de que terminara), el hook detecta esto y arranca el polling de `/progress` automáticamente:

```typescript
const isStep1Ready = (detail: ApiProjectDetail): boolean =>
  String(detail.ingestion_status || "").toUpperCase() === "READY"

// En openForResume(project):
if (!isStep1Ready(detail)) {
  // Proyecto aún está procesando — arrancar polling con intervalo de 1.5s
  resumeDriveProgressPollTimerRef.current = setInterval(async () => {
    const snapshot = await ProjectsApi.getZipUploadProgress(projectId)
    applyDriveProgressSnapshot(snapshot)   // actualiza barras/porcentaje en UI
    if (snapshot.phase === "completed" || snapshot.phase === "idle") {
      clearResumeDriveProgressPolling()
      // Recargar detalle del proyecto para mostrar archivos
    }
    if (snapshot.phase === "failed") {
      clearResumeDriveProgressPolling()
      setSaveError(snapshot.error || "Error procesando ZIP")
    }
  }, 1500)
}
```

`applyDriveProgressSnapshot` actualiza todos los estados de UI: `zipUploadPercent`, `zipUploadBytes`, `zipUploadSpeedMbps`, `zipUploadEtaSeconds`, `saveProgressMessage`.

---

## 18. Variables de entorno adicionales requeridas

```env
REDIS_URL=redis://redis:6379

# Ya existentes en el proyecto:
GDRIVE_SERVICE_ACCOUNT_JSON=...
GDRIVE_FOLDER_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

---

## Resumen de contratos de API

| Endpoint | Método | Input | Output clave |
|---|---|---|---|
| `/api/projects/{id}/files/experiment-zip` | POST | `multipart/form-data file` | `ingestion_status`, `drive_root_folder_*`, `files[]`, `counts` |
| `/api/projects/{id}/files/experiment-zip/progress` | GET | — | `phase`, `percent`, `uploaded_bytes`, `total_bytes`, `error` |
| `/api/projects/{id}/files/experiment-zip/cancel` | POST | — | `{message}` |
| `/api/projects` | GET | — | `[{ingestion_status, ingestion_error, drive_root_folder_*}]` |

---

## Ciclo de vida de `ingestion_status` en tabla `projects`

| Estado | Significado |
|---|---|
| `PENDING` | Proyecto creado, nunca se subió ZIP |
| `PROCESSING` | Upload/ingesta en curso |
| `READY` | Ingesta completada exitosamente, archivos disponibles en Drive |
| `FAILED` | Ingesta falló; `ingestion_error` contiene el mensaje de error |

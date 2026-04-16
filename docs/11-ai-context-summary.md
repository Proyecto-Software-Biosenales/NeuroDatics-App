# NeuroDatics App — AI Context Summary

> **Purpose**: This document is a single-file reference for an AI model to quickly understand the full state of the codebase as of April 2026 (branch `projects-CRUD`). It consolidates architecture, domain model, data flows, and known gaps.

---

## 1. What Is NeuroDatics

NeuroDatics is a **neuromarketing experiment management platform**. It lets researchers:

- Create and organize biosignal experiments as **Projects**.
- Upload an **experiment folder** (packaged as a ZIP client-side) that contains raw CSV biosignal files, scenario images/videos, and optional other assets.
- Automatically process the CSV data into **standardized Parquet files** with sensor auto-detection (EEG, GSR, EyeTracker).
- Store all experiment files in **Google Drive** under a per-project folder hierarchy.
- Manage participants, sensors, scenarios, and Areas of Interest (AOIs) for each project.
- Visualize scenario images and AOIs in the browser.

The application is a **monorepo** with two primary workspaces:
- `frontend/` — Next.js 15/16 App Router application.
- `backend/` — FastAPI (Python) REST API with PostgreSQL and Google Drive integration.

---

## 2. Tech Stack

### Frontend
| Technology | Notes |
|---|---|
| Next.js (App Router) | Version 15/16, Turbopack in dev, `next.config.mjs` sets `turbopack.root = __dirname` |
| React + TypeScript | Feature-based folder structure under `features/` |
| Tailwind CSS | Config at `frontend/tailwind.config.ts` (postcss pipeline) |
| shadcn/ui | Component library on top of Radix UI, components in `frontend/components/ui/` |
| JSZip ^3.10.1 | Client-side folder → ZIP packaging before upload (STORE compression mode) |

### Backend
| Technology | Notes |
|---|---|
| FastAPI | Async, uvicorn, all routes under `/api` prefix |
| SQLAlchemy async | `AsyncSession`, `AsyncEngine`, session factory in `infra/db/session.py` |
| Alembic | Incremental migrations in `backend/migrations/versions/` (000–016) |
| PostgreSQL | Primary database for all business state |
| Google Drive API | File/folder storage via `googleapiclient`, OAuth credentials stored in DB |
| Redis + RQ | Worker queue infrastructure (scaffolded, not yet decoupled from sync flow) |
| pandas + pyarrow + numpy | CSV → Parquet processing pipeline |
| Pydantic v2 / pydantic-settings | Request/response schemas and application settings |

### Infrastructure
| Component | Notes |
|---|---|
| Docker Compose | `docker-compose.yml` at repo root and `backend/docker-compose.yml`; services: `backend`, `worker`, `redis` |
| Redis | `redis://redis:6379`, used by RQ worker |
| Worker healthcheck | HTTP on port 8001, implemented with `python urllib` (not curl) |

---

## 3. Monorepo Structure

```
NeuroDatics-App/
├── frontend/                     # Next.js application
│   ├── app/                      # App Router pages
│   ├── components/               # Shared UI components (layout, shadcn ui)
│   ├── features/                 # Domain feature modules
│   │   ├── auth/
│   │   ├── projects/             # Core module (most developed)
│   │   ├── reports/
│   │   └── home/
│   ├── hooks/                    # Global hooks (minimal)
│   └── lib/                      # Infrastructure (api client, auth, providers)
│       ├── api/apiFetch.ts       # HTTP client with JWT + auto-refresh
│       ├── auth/                 # Session store + token management
│       └── providers/            # AuthProvider (React context)
│
├── backend/
│   ├── src/neurodatics/
│   │   ├── main.py               # FastAPI app entry point
│   │   ├── api/                  # Global router, deps, middlewares
│   │   ├── config/               # Settings, JWT security, logging
│   │   ├── infra/                # DB session, Google Drive client, Redis queue
│   │   │   ├── db/
│   │   │   ├── storage/gdrive_client.py
│   │   │   └── queue/redis_connection.py
│   │   ├── modules/              # Domain verticals (DDD structure)
│   │   │   ├── auth/
│   │   │   ├── integrations/     # Google Drive OAuth integration
│   │   │   ├── participants/
│   │   │   ├── processing/       # Processing module (stub/placeholder)
│   │   │   ├── projects/         # Core module — most complete
│   │   │   ├── reports/
│   │   │   ├── scenaries/
│   │   │   └── uploads/
│   │   ├── shared/
│   │   └── workers/              # RQ worker entrypoint, tasks, pipelines
│   │       ├── entrypoint.py
│   │       ├── tasks/
│   │       ├── pipelines/
│   │       └── __main__.py
│   ├── migrations/versions/      # Alembic migrations 000–016
│   └── data/auth_users.json      # Local user store fallback
│
└── docs/                         # Project documentation
```

---

## 4. Domain Model

### Core Entities

#### `Project` (table: `projects`)
The central aggregate. One project per experiment study.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `owner_id` | UUID | FK to `app_users.id` |
| `name` | String(255) | |
| `description` | Text | |
| `status` | Enum | `draft \| active \| archived` |
| `ingestion_status` | String(20) | `PENDING \| PROCESSING \| READY \| FAILED` |
| `ingestion_error` | Text | Last ingestion error message |
| `last_ingested_at` | DateTime | |
| `storage_provider` | String(20) | Always `gdrive` currently |
| `drive_root_folder_id` | String(255) | Google Drive folder ID |
| `drive_root_folder_name` | String(255) | |
| `drive_root_folder_url` | String(500) | |
| `created_at`, `updated_at` | DateTime | Auto-managed by `BaseModel` |

#### `ProjectFile` (table: `project_files`)
Every physical file associated with a project. Kinds: `experiment_zip`, `scenario_image`, `scenario_video`, `raw_csv`, `processed_parquet`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → projects |
| `source_zip_id` | UUID | FK → project_files (self-ref, the origin ZIP) |
| `kind` | String(50) | File type classification |
| `storage_provider` | String(20) | `gdrive` |
| `external_id` | String(255) | Google Drive file ID |
| `filename`, `original_filename` | String | |
| `source_entry_path` | String(1024) | Original path inside ZIP |
| `mime_type`, `extension` | String | |
| `size_bytes` | Integer | |
| `checksum_sha256` | String(64) | |
| `drive_web_view_link`, `drive_download_link` | String | |
| `validation_status`, `validation_errors` | String / JSON | ZIP validation result |
| `processing_status`, `processing_errors` | String / JSON | CSV processing result |
| `processed_at` | DateTime | |
| `file_metadata` | JSON | Arbitrary metadata |
| `zip_manifest`, `entry_count`, `root_folder_name` | JSON / Integer / String | ZIP content info |
| `deleted_at` | DateTime | Soft-delete marker |

#### `ProjectSensor` (table: `project_sensors`)
Sensors used in the study: `EEG`, `GSR`, `EyeTracker`.

#### `Participant` (table: `participants`)
Participant in the experiment.

| Field | Notes |
|---|---|
| `participant_code` | Auto-extracted from CSV metadata ("Grabación") |
| `age` | Optional integer |
| `sex` | `male \| female \| other` |

#### `Scenaries` (table: `scenaries`)
A stimulus shown to participants: can be `image` or `video`.

| Field | Notes |
|---|---|
| `file_id` | FK → `project_files.id` |
| `type` | `image \| video` |
| `width`, `height`, `fps`, `duration_ms` | Media metadata |
| `source_entry_path` | Path within original ZIP |

#### `AOI` (table: `aois`)
Area of Interest drawn on a scenario.

| Field | Notes |
|---|---|
| `scenaries_id` | FK → `scenaries.id` |
| `name`, `color` | Display info |
| `shape_type` | Shape classification |
| `shape` | JSON geometry data |

#### `SystemIntegration` (table: `system_integrations`)
Stores global OAuth credentials for Google Drive (one row per provider).

| Field | Notes |
|---|---|
| `provider` | Unique key (e.g., `google_drive`) |
| `account_email` | Authenticated account |
| `refresh_token`, `access_token` | OAuth tokens |
| `scope`, `token_type`, `expires_at` | Token metadata |

#### `ProcessingJob` (table: `processing_jobs`) — Migration 016
Tracks background processing job state (RQ integration, currently stubs).

| Field | Notes |
|---|---|
| `project_id` | FK → projects (CASCADE DELETE) |
| `job_id` | RQ job ID (unique, nullable) |
| `job_type` | String classification |
| `status` | `QUEUED \| PROCESSING \| SUCCESS \| FAILED \| CANCELED` (VARCHAR, not PG ENUM) |
| `progress_percent` | 0–100 |
| `message`, `error_detail` | Human-readable state |
| `result_metadata` | JSON |
| `started_at`, `completed_at` | Timestamps |

#### `app_users` (table: `app_users`)
User identity table mapping Google accounts to internal users. **Used by `modules/auth/api/routes.py` via raw SQL but has no corresponding Alembic migration in this repo** — a known gap.

---

## 5. Backend Architecture (DDD Pattern)

Every module under `backend/src/neurodatics/modules/<name>/` follows:

```
<module>/
├── api/
│   ├── routes.py      # FastAPI route handlers
│   └── schemas.py     # Pydantic request/response models
├── application/
│   ├── use_cases/     # Orchestration: one file per use case
│   └── services/      # Domain services (reusable logic)
├── domain/
│   ├── entities.py    # SQLAlchemy ORM models
│   └── repository.py  # Abstract repository interface
└── infrastructure/
    └── repository.py  # SQLAlchemy async implementation
```

### Registered Routers (all under `/api`)
- `auth_router` — `/api/auth/*`
- `google_drive_integrations_router` — `/api/integrations/google-drive/*`
- `projects_router` — `/api/projects/*`
- `participants_router` — `/api/projects/{id}/participants`
- `scenaries_router` — `/api/projects/{id}/scenaries`

### Auth & Security
- **Flow**: Google OAuth code exchange → `POST /api/auth/google/authorize` → local JWT issued.
- **JWT**: Access token (60 min, default) + Refresh token (30 days default). Signed with HS256, validated for `iss`, `exp`, `typ`.
- **Middleware**: `get_current_user_id` extracts `sub` from Bearer token. Used by authenticated routes via `api/deps.py`.

---

## 6. Frontend Architecture

### App Router Pages
| Route | Component | Purpose |
|---|---|---|
| `/` | `page.tsx` | Home/landing |
| `/login` | `login/page.tsx` | Login page (Google OAuth redirect) |
| `/authorize` | `authorize/page.tsx` | OAuth callback (AuthCallback) |
| `/auth/callback` | `auth/callback/page.tsx` | Duplicate OAuth callback |
| `/dashboard` | `dashboard/page.tsx` | Dashboard (stub) |
| `/proyectos` | `proyectos/page.tsx` | Main projects management page |
| `/reportes` | `reportes/page.tsx` | Reports (stub) |
| `/register` | `register/page.tsx` | Register |

> Note: Two callback routes (`/authorize` and `/auth/callback`) both mount `AuthCallback`. Next.js requires `useSearchParams` components inside `<Suspense>` boundaries.

### HTTP Client (`frontend/lib/api/apiFetch.ts`)
- Attaches Bearer token from `sessionStore`.
- Auto-refreshes via `POST /api/auth/refresh` on 401.
- `apiUploadFormWithProgress`: multipart upload with `XMLHttpRequest` for real-time progress.
- `apiFetchBlob`: authenticated blob download with in-memory cache and in-flight deduplication (used for scenario images).

### Projects Feature (`frontend/features/projects/`)
The core of the application.

```
projects/
├── api/projectsApi.ts            # Typed API client for all /api/projects/* calls
├── components/
│   ├── ProjectsGrid.tsx          # Card grid with action menus
│   ├── CreateProjectDialog.tsx   # 4-step creation wizard
│   ├── EditProjectDialog.tsx     # Edit wizard (reuses wizard logic)
│   ├── ViewProjectDialog.tsx     # Read-only project detail
│   └── DeleteProjectDialog.tsx   # Two-step confirm delete (type "eliminar")
├── create-project/
│   ├── useCreateProjectWizard.ts # Wizard state machine + API side effects
│   ├── useProjectsStorage.ts     # Local project store + backend sync; polls every 3s for PROCESSING drafts
│   ├── CreateProjectStep1.tsx    # Name + folder picker + ZIP packaging
│   ├── CreateProjectStep2.tsx    # Sensor selection (EEG/GSR/EyeTracker)
│   ├── CreateProjectStep3.tsx    # Participant entry
│   └── CreateProjectStep4.tsx    # Scenario image viewer with AOIs
└── types.ts                      # TypeScript domain types
```

### Folder Upload Pattern (Step 1)
1. User picks a folder via `<input webkitdirectory>` or drag-and-drop.
2. Drag-and-drop uses `FileSystemDirectoryEntry` recursion to reconstruct `webkitRelativePath` via custom `_relativePath` property.
3. Validation: must contain `/images` or `/videos` subdirectory; must include at least one CSV.
4. Folder is zipped **client-side** using JSZip (STORE mode, dynamic import) before uploading to `POST /api/projects/{id}/files/experiment-zip`.
5. Upload progress is tracked with `XMLHttpRequest` and displayed in real-time.

### Polling for Processing State
`useProjectsStorage` polls `GET /api/projects/` every 3 seconds when any project has `ingestionStatus === "PROCESSING"`. The `ProjectsGrid` shows a spinner and disables the action menu for those projects.

---

## 7. Core Flow: Create Project (End-to-End)

```
User fills Step 1 (name + folder)
    → Client zips folder with JSZip
    → POST /api/projects/ (status: draft)
    → POST /api/projects/{id}/files/experiment-zip (ZIP bytes)
        Backend:
            1. ZipValidationService.validate_and_analyze() — check structure (images/ or videos/, CSV presence)
            2. Project ingestion_status → PROCESSING
            3. GoogleDriveClient: create root folder
            4. Optionally upload raw ZIP to Drive
            5. ZipExtractionService: extract files from ZIP
            6. CsvProcessingService: process CSVs → Parquet, detect sensors + participants
            7. Upload each file to Drive (progress tracked in DriveUploadProgressRegistry)
            8. Persist ProjectFile + Scenaries records in DB
            9. Delete previous Drive folder if re-ingestion
            10. Project ingestion_status → READY; save drive_root_folder_*
    → Frontend polls GET .../progress until READY
    → GET /api/projects/{id} to populate Step 4 scenario list
Step 2 → PUT /api/projects/{id}/sensors
Step 3 → PUT /api/projects/{id}/participants
Step 4 → Review scenarios/AOIs (images served via /api/projects/{id}/files/{file_id}/image proxy)
Save → POST /api/projects/{id}/finalize → status: active
```

---

## 8. CSV Processing Pipeline (`CsvProcessingService`)

**File**: `backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py`

### Input
Raw CSV files from the experiment folder. Format: multi-user, UTF-16 encoded, semicolon/comma/tab delimited. Multiple participant blocks in a single file separated by `time` header rows.

### Key Logic
1. **`_find_user_blocks`**: Detects participant blocks by scanning for lines whose first cell is `"time"`.
2. **`_PARTICIPANT_RE`**: Extracts participant codes from `"Grabación: <number>"` metadata lines above each block.
3. **`STD_MAP`**: Maps raw column names (Spanish/multilingual) to standardized names:
   - `gsr / gsr` → `gsr`
   - `electroencefalografía (eeg) / f4` → `f4` (DSI-7 EEG channels: LE, F4, C4, P4, P3, C3, F3, TRG)
   - `bandwidth / lefteyepupildiameter` → `lx_pupil` (VT3 mini Eye Tracker)
   - `scenario / scenario 1` → `scenario`
4. **Sensor auto-detection**: Infers present sensors from column names (e.g., any EEG column → EEG sensor detected).
5. **Output**: Parquet files per participant using `pandas` + `pyarrow`. Only Parquet files (not raw CSVs) are uploaded to Google Drive.

### Output Types (`ProcessingResult`)
- `detected_sensors: List[str]`
- `participants: List[ParticipantInfo]` (code + user_index)
- `user_parquet_paths: List[Tuple[int, str]]`
- `scenario_parquet_paths: List[Tuple[int, str, str]]`

---

## 9. Google Drive Integration

**Client**: `backend/src/neurodatics/infra/storage/gdrive_client.py` — `GoogleDriveClient`

- Supports both **Service Account** (via JSON credentials file) and **OAuth** (via user-authorized credentials stored in `system_integrations` table).
- Global singleton `gdrive_client` used for most operations.
- **Isolated client** (`_build_isolated_drive_client`) built per-request for the image proxy endpoint to prevent cross-request credential races.
- OAuth credentials configured via `configure_gdrive_client_with_oauth(db, silent=True)` called at the start of ingestion.

**Image Proxy Endpoint**: `GET /api/projects/{project_id}/files/{file_id}/image`
- Validates file ownership with `ProjectFile JOIN Project`.
- Verifies MIME type is image and `external_id` is set.
- Checks in-memory cache (process-local, non-distributed).
- Downloads from Drive using isolated client.
- Returns `Response` with `Cache-Control` + `ETag` headers.

**Upload Progress Registry**: `drive_upload_progress_registry`
- Converted from file-based JSON to **in-memory dict** with `threading.Lock`.
- Frontend polls `GET /api/projects/{id}/files/experiment-zip/progress` while main upload endpoint is still running (async I/O).

---

## 10. Worker Infrastructure (H4 — Scaffolded, Partially Integrated)

**Status**: Infrastructure is in place. The `process_experiment_zip_task` RQ task is a stub. ZIP processing currently runs **synchronously** in the HTTP request, not as a background job.

### Components
| File | Purpose |
|---|---|
| `infra/queue/redis_connection.py` | Singleton Redis connection pool using `ConnectionPool.from_url(settings.redis_url)` |
| `workers/entrypoint.py` | `WorkerManager` starts RQ worker with graceful SIGTERM handling; also starts health check HTTP server on port 8001 |
| `workers/__main__.py` | Entrypoint: `start_worker_with_health_check()` |
| `workers/tasks/` | RQ task functions (stubs) |
| `workers/pipelines/` | Processing pipeline logic (stubs) |

### ProcessingJob Entity
Defined in `modules/projects/domain/entities.py` (`JobStatus` enum) and persisted via migration 016. Repository: `SQLProcessingJobRepository` (inferred from repo memory).

---

## 11. Migrations History

| ID | Description |
|---|---|
| 000 | Create initial tables |
| 001 | Fix `project_status` constraint |
| 002 | Fix `project_sensors` schema |
| 003 | Add missing `updated_at` columns |
| 004 | Fix `participants.sex` constraint |
| 005 | Add ZIP validation fields |
| 006 | Add `file_id` to scenaries |
| 007 | Project ingestion real files |
| 008 | Fix ingestion status default |
| 009 | Fix storage provider default |
| 010 | Fix `project_files.kind` constraint |
| 011 | Add `system_integrations` table |
| 012 | Rename stimulus kinds to scenario |
| 013 | Remove draft project status |
| 014 | Restore draft project status |
| 015 | Add `processed_parquet` kind |
| 016 | Create `processing_jobs` table |

---

## 12. API Reference (Key Endpoints)

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/google/authorize` | Exchange Google OAuth code for local JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token using refresh token |

### Projects
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/` | List projects for authenticated user |
| POST | `/api/projects/` | Create project (initially in `draft` status) |
| GET | `/api/projects/{id}` | Get project detail with all relations |
| PATCH | `/api/projects/{id}` | Update name, description, or status |
| DELETE | `/api/projects/{id}` | Delete project + Drive folder |
| POST | `/api/projects/{id}/finalize` | Validate and set status to `active` |

### ZIP Ingestion
| Method | Path | Description |
|---|---|---|
| POST | `/api/projects/{id}/files/experiment-zip` | Upload ZIP and run full ingestion pipeline |
| GET | `/api/projects/{id}/files/experiment-zip/progress` | Poll upload/sync progress |
| POST | `/api/projects/{id}/files/experiment-zip/cancel` | Cancel in-progress upload |
| DELETE | `/api/projects/{id}/files/experiment-zip` | Remove ZIP record from DB |

### Project Data
| Method | Path | Description |
|---|---|---|
| PUT | `/api/projects/{id}/sensors` | Replace sensor list |
| PUT | `/api/projects/{id}/participants` | Upsert participants |
| PUT | `/api/projects/{id}/scenaries` | Upsert scenarios |
| PUT | `/api/projects/{id}/aois` | Upsert AOIs |
| GET | `/api/projects/{id}/files/{file_id}/image` | Proxy scenario image from Drive |

---

## 13. Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | Google OAuth app client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | Google OAuth app client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | e.g., `http://localhost:3000/authorize` |
| `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` | Yes | Drive-specific OAuth redirect |
| `AUTH_JWT_SECRET` | Yes | JWT signing secret (change in production) |
| `REDIS_URL` | Yes (worker) | e.g., `redis://redis:6379` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Service account JSON path (fallback if no OAuth) |
| `GDRIVE_SERVICE_ACCOUNT_JSON` | Optional | Inline JSON for service account |
| `GDRIVE_FOLDER_ID` | Optional | Root Drive folder for service account mode |
| `INGESTION_SAVE_ORIGINAL_ZIP` | Optional | Default: `true` — saves ZIP to Drive |
| `PROJECT_ZIP_MAX_SIZE_MB` | Optional | Default: 500 MB |

---

## 14. Known Gaps and Technical Debt

1. **`app_users` table has no Alembic migration** — auth module uses raw SQL on this table; new environments may fail auth even with all migrations applied.
2. **`startup_event` in `main.py` is `pass`** — no DB connectivity check or bootstrap on startup.
3. **Worker is not decoupled** — ZIP processing runs synchronously in the HTTP request; RQ worker tasks are stubs.
4. **`processing/domain/entities.py` is a placeholder** — contains `class Job: pass`; actual `ProcessingJob` entity is defined in `projects/domain/entities.py`.
5. **In-memory caches are not distributed** — blob cache and `DriveUploadProgressRegistry` live in a single process; do not work correctly with multiple backend replicas.
6. **Two duplicate OAuth callback routes** — `/authorize` and `/auth/callback` both mount the same `AuthCallback` component.
7. **Two identical delete methods in `projectsApi.ts`** — `remove()` and `delete()` both call `DELETE /api/projects/{id}`.
8. **Draft filter missing in UI** — `/proyectos` page only shows `all \| active \| archived` filter buttons; `draft` projects are hidden unless "all" is selected.
9. **`register_project_routes(app): pass`** — placeholder function in `projects/api/routes.py` adds noise.

---

## 15. Data Flow Diagrams

### Overall System
```
Browser (Next.js) ──HTTP /api/*──► FastAPI Backend ──── PostgreSQL
                                         │
                                         └──── Google Drive (files)
                                         │
                                         └──── Redis (job queue)
                                                    │
                                               RQ Worker (Python)
```

### Ingestion Pipeline
```
Client ZIP upload
    │
    ▼
ZipValidationService        ← Checks structure: images/ or videos/, CSV present
    │
    ▼
Project.ingestion_status = PROCESSING
    │
    ▼
GoogleDriveClient           ← Create root folder in Drive
    │
    ▼
ZipExtractionService        ← Iterate ZIP entries per manifest
    │
    ▼
CsvProcessingService        ← UTF-16 CSV → pandas DataFrame → Parquet
    │ (per participant block)
    ▼
DriveUploadProgressRegistry ← In-memory progress tracking
    │
    ▼
GoogleDriveClient.upload()  ← Upload Parquets + images/videos
    │
    ▼
DB: ProjectFile + Scenaries created
    │
    ▼
Project.ingestion_status = READY
```

---

*Last updated: April 13, 2026. Branch: `projects-CRUD`.*

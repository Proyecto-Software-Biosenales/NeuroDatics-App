# NeuroDatics-App — Project Context Summary

## Overview

**NeuroDatics-App** is a web platform for biometric signal analysis applied to neuromarketing research. It enables researchers to upload experiment data (EEG, GSR, Eye Tracker), process and store it, and visualize analytics. The project is a monorepo with a Next.js frontend and a FastAPI backend.

- **Repository:** `Proyecto-Software-Biosenales/NeuroDatics-App`
- **Active branch:** `Processing-implementation`
- **Stack:** Next.js 16 (App Router) + FastAPI + PostgreSQL + Redis + Google Drive API

---

## Architecture

### Monorepo Structure

```
NeuroDatics-App/
├── frontend/          ← Next.js 16 + TypeScript app
├── backend/           ← FastAPI + Python backend (DDD pattern)
├── .github/agents/    ← AI agent configuration files (Coder, Designer, Planner, etc.)
├── docker-compose.yml ← Orchestrates PostgreSQL, Redis, backend, worker
├── docs/
└── README.md
```

### Deployment Model
Self-hosted Docker on researcher's PC (similar to n8n). Single replica. Docker volumes for Parquet cache.

---

## Frontend

### Tech Stack
- **Framework:** Next.js 16.1.6 with App Router + Turbopack
- **Language:** TypeScript 5.x
- **Styling:** Tailwind CSS v4 + shadcn/ui + Radix UI
- **Charts:** Recharts 3.x
- **Auth:** Google OAuth (tokens in localStorage, auto-refresh)
- **File packaging:** JSZip 3.10.1 (client-side folder → ZIP)

### App Routes
| Route | Description |
|---|---|
| `/login` | Login page |
| `/register` | Registration |
| `/authorize` | OAuth callback handler |
| `/auth/callback` | Auth redirect |
| `/proyectos` | Projects listing |
| `/dashboard` | Analytics dashboard |
| `/reportes` | Reports page |

### Feature Modules (`frontend/features/`)
| Module | Responsibility |
|---|---|
| `auth/` | OAuth flow, token management |
| `projects/` | Project CRUD, create-project wizard, project grid |
| `analytics/` | Dashboard charts, analytics API calls |
| `reports/` | Report viewing |
| `home/` | Home/landing |

### Key Patterns
- **Feature-based folder structure** with `api/`, `components/`, `hooks/`, `types.ts` per feature
- **Shared UI:** `components/ui/` (shadcn/Radix components)
- **Auth:** `lib/providers/AuthProvider.tsx` wraps the app
- **HTTP layer:** `lib/api/` central wrapper
- **Create Project Wizard:** Folder picker via hidden `<input webkitdirectory>` + drag-drop with `FileSystemDirectoryEntry` recursion. Reconstructs `webkitRelativePath` via `_relativePath` property. Validates `csv` + `/images` or `/videos` structure. Packages folder into ZIP client-side (JSZip STORE mode) before upload.
- **Project polling:** `useProjectsStorage` polls every 3s for projects with `PROCESSING` ingestion status.
- **Suspense requirement:** Pages using `useSearchParams` in App Router must be wrapped in `<Suspense fallback={null}>`.
- **Turbopack config:** `next.config.mjs` sets `turbopack.root` to `__dirname` (frontend directory) to avoid CSS resolution issues.

---

## Backend

### Tech Stack
- **Framework:** FastAPI 0.104+
- **Language:** Python 3.9+
- **ORM:** SQLAlchemy 2.x (async)
- **Database:** PostgreSQL (via psycopg3)
- **Migrations:** Alembic (016 migrations exist)
- **Queue:** Redis + RQ
- **Data processing:** pandas, pyarrow, numpy
- **Auth:** PyJWT + python-jose (Google OAuth validation)
- **Drive integration:** Google Drive API (via custom `GoogleDriveClient`)

### Module Structure (DDD — `backend/src/neurodatics/modules/`)
Each module follows: `api/` → `application/` → `domain/` → `infrastructure/`

| Module | Status | Description |
|---|---|---|
| `auth/` | Active | Google OAuth login, token refresh |
| `projects/` | Active | Project CRUD, ZIP upload, Drive sync |
| `participants/` | Active | Participant management |
| `scenaries/` | Active | Scenario/image management |
| `integrations/` | Active | Google Drive OAuth integration |
| `processing/` | Active (not yet registered in router) | ProcessingJob entity, enqueue/status use cases |
| `analytics/` | Implemented (H5) | Parquet-based analytics API |
| `reports/` | Scaffold | Report generation |
| `uploads/` | Scaffold | Upload handling |

### Registered API Routers (`api/router.py`, prefix `/api`)
- `auth`, `google_drive_integrations`, `projects`, `participants`, `scenaries`, `analytics`

### Workers (`backend/src/neurodatics/workers/`)
- **Pipelines:** `csv_to_parquet.py`, `feature_extraction.py`, `report_builder.py`, `validations.py`
- **Infrastructure:** Redis + RQ worker (`entrypoint.py`)

---

## Key Implemented Features by Milestone

### H1–H3: Foundation
- Google OAuth authentication
- Project creation wizard (folder upload → ZIP → backend)
- Google Drive integration (OAuth, folder structure on Drive)
- Participant and scenario management
- PostgreSQL schema with Alembic migrations (001–015)

### H4: CSV Processing Pipeline
- **`CsvProcessingService`** (`projects/application/services/csv_processing_service.py`): Processes UTF-16 CSV → standardized Parquet files
- Auto-detects sensors from column headers: **EEG**, **GSR**, **EyeTracker**
- Extracts participant codes from `"Grabación"` metadata field
- Only Parquet files are uploaded to Google Drive (not raw CSV)
- **ProcessingJob entity** + migration `016_create_processing_jobs_table.py`
- `SQLProcessingJobRepository` — status stored as VARCHAR (not PG ENUM, `native_enum=False`)
- Redis + RQ worker infrastructure: `redis_connection.py`, `workers/` package
- `DriveUploadProgressRegistry`: converted from file-based JSON to **in-memory dict with `threading.Lock`**
- `ProjectResponse`/`ProjectDetailResponse` include: `ingestion_status`, `ingestion_error`, `drive_root_folder_*` fields
- **Image endpoint:** uses isolated `GoogleDriveClient` (`_build_isolated_drive_client`) per request to prevent cross-request credential races
- **Docker Compose:** `redis`, `backend`, `worker` services; worker healthcheck uses `python urllib` (not curl)
- **Frontend:** `Project` type has `ingestionStatus`; projects in `PROCESSING` state show spinner + disabled menu in `ProjectsGrid`

### H5: Analytics System (In Implementation)
- **Architecture:** Server-side Parquet reading (no DuckDB-WASM); disk cache for Parquet + Redis cache for computed results
- **Backend module:** `modules/analytics/` (DDD: `api/`, `application/services/`, `domain/`, `infrastructure/`)
  - `parquet_reader_service.py`: reads Parquet files from cache volume
  - `analytics_service.py`: computes metrics
  - Routes registered under `/projects/{project_id}/analytics`
- **Cache strategy:**
  - Parquet cache: `/data/parquet_cache/{project_id}/{participant_code}.parquet` (Docker volume, TTL 4h)
  - Redis cache keys: `analytics:{project_id}:{participant_code}:{endpoint}:{scenario}` (TTL 15min)
- **Scope milestone 1:** Pupil dilation chart only
- **Backend endpoints:** `participants`, `scenarios`, `timeseries/pupil`, `statistics/pupil`, `gaze-at`
- **Gaze snapshot:** backend returns `{gx, gy, scenario, nearest_time_s, scenario_file_id}`; frontend overlays on scenario image via existing image proxy
- **Heatmap:** backend returns PNG overlay; frontend composites with CSS
- **Frontend route:** `/dashboard` with sidebar project tree + sensor sub-nav + per-graph tabs
- **Design reference:** Figma — two screens: (1) Comparativas (stacked charts, dropdown selector, filters bar); (2) Sensor view (EEG example — top tab nav, KPI stats, line chart, scenario image section, stats table)

---

## Infrastructure

### Docker Compose Services
| Service | Description |
|---|---|
| `postgres` | PostgreSQL database |
| `redis` | Redis for RQ job queue + analytics cache |
| `backend` | FastAPI app (uvicorn) |
| `worker` | RQ worker for async processing jobs |

### Environment Variables
**Frontend:**
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_DEV_ADMIN_EMAIL` / `_PASSWORD` / `_DISPLAY_NAME` (optional dev shortcuts)

**Backend:** see `backend/.env.example` (includes DB URL, Google OAuth credentials, Drive config, Redis URL)

### Access Points
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

---

## Dev Conventions

### Frontend
- Feature-based folders; shared UI in `components/ui/`
- `ProjectFormData` uses `experimentFolderFiles: File[] | null`
- Wizard hook: `setExperimentFolder`; Step1 props: `onFolderSelected`, `shouldUpdateFolder`, `onShouldUpdateFolderChange`
- Avoid mutating global `gdrive_client` in request-scoped reads; always build per-request isolated client

### Backend
- DDD module pattern: `api/application/domain/infrastructure`
- Migrations in `backend/migrations/versions/` (Alembic)
- Processing statuses stored as VARCHAR (`native_enum=False`) to avoid PG ENUM migration complexity
- Per-request `GoogleDriveClient` via `_build_isolated_drive_client()` for concurrency safety

### AI Agents (`.github/agents/`)
The repo ships custom AI agent configurations used with GitHub Copilot:
- `orchestrator.agent.md`, `orchestrator.agent-Mini.md` — project coordination
- `planner.agent.md`, `planner.agent-Mini.md` — planning
- `coder.agent.md` — implementation
- `designer.agent.md` — UI/UX
- `reviewer.agent.md` — code review

---

## Current State (April 2026)

- **Branch:** `Processing-implementation`
- H1–H4 are implemented and merged
- H5 (Analytics) backend API is implemented; frontend dashboard is in progress
- `processing` module has routes/schemas but is **not yet registered** in `api/router.py`
- The analytics frontend (`/dashboard`) is the active area of development

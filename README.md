# NeuroDatics-App

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Quick Start

The recommended setup runs the **backend (FastAPI + PostgreSQL) in Docker** and the **frontend (Next.js) locally**. This gives you reliable hot reload on the frontend without Docker file-watch issues on Windows.

### Requirements

| Tool           | Minimum version         |
| -------------- | ----------------------- |
| Docker Desktop | 20+ (with Compose v2)   |
| Node.js        | 20+                     |
| npm            | 10+                     |

### 1. Clone

```bash
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
```

### 2. Configure environment files

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

> Google OAuth and Drive variables can be left empty for local development — the dev-admin login bypass works without them.

### 3. Start the backend

```bash
docker compose up --build
```

This starts PostgreSQL and FastAPI. Migrations run automatically on startup.

### 4. Start the frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

### 5. Access

| Resource     | URL                          |
| ------------ | ---------------------------- |
| Frontend     | http://localhost:3000        |
| Backend API  | http://localhost:8000        |
| Swagger UI   | http://localhost:8000/docs   |
| Health check | http://localhost:8000/health |

### 6. Stop the backend

```bash
# Stop services
docker compose down

# Stop and delete the database volume (clean reset)
docker compose down -v
```

---

## Environment Variables

- **Frontend**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- **Frontend optional**: `NEXT_PUBLIC_DEV_ADMIN_EMAIL`, `NEXT_PUBLIC_DEV_ADMIN_PASSWORD`, `NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME`
- **Backend**: see `backend/.env.example`

Full reference: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)

---

## Project Structure

- `frontend/` — Next.js App Router UI, features by domain.
- `backend/` — FastAPI modular API (api, application, domain, infrastructure).
- `docs/` — Technical and functional documentation.
- `docker-compose.yml` — Docker Compose for backend + database.

## Documentation

- Overview: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Environment: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
- Auth: [docs/AUTH_SUPABASE.md](docs/AUTH_SUPABASE.md)
- Backend details: [backend/README.md](backend/README.md)
- Frontend details: [frontend/README.md](frontend/README.md)

Plataforma para analisis de biosenales aplicada a neuromarketing.

## Quick Start (Docker — recommended)

One command starts the full stack: PostgreSQL + Backend (FastAPI) + Frontend (Next.js).

cd backend
cd ..
docker compose down -v
docker compose up --build

### 1. Prerequisites

| Tool           | Minimum version                      |
| -------------- | ------------------------------------ |
| Docker Desktop | 20+ (with Compose v2)                |
| Git            | Any                                  |

### 2. Clone and configure

```bash
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
```

Create the required environment files from the provided examples:

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

> The defaults work out of the box for local development. Google OAuth and Drive variables can be left empty — the dev-admin login bypass works without them.

### 3. Start

```bash
docker compose up --build
```

This will:
1. Start a PostgreSQL 16 database.
2. Build and start the FastAPI backend (runs migrations automatically).
3. Build and start the Next.js frontend.

### 4. Access

| Resource     | URL                          |
| ------------ | ---------------------------- |
| Frontend     | http://localhost:3000        |
| Backend API  | http://localhost:8000        |
| Swagger UI   | http://localhost:8000/docs   |
| Health check | http://localhost:8000/health |

### 5. Stop

```bash
# Stop all services
docker compose down

# Stop and delete database volume (clean reset)
docker compose down -v
```

---

## Alternative: Local Development (without Docker)

### Backend

See [backend/README.md](backend/README.md) for detailed instructions on running the backend locally with a virtual environment.

### Frontend

```bash
cd frontend
cp .env.example .env.local   # then edit values as needed
npm install
npm run dev
```

See [frontend/README.md](frontend/README.md) for more details.

---

## Environment Variables

Summary:

- **Frontend**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- **Frontend optional**: `NEXT_PUBLIC_DEV_ADMIN_EMAIL`, `NEXT_PUBLIC_DEV_ADMIN_PASSWORD`, `NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME`
- **Backend**: see `backend/.env.example`

Full reference: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)

## Project Structure

- `frontend/` — Next.js App Router UI, features by domain.
- `backend/` — FastAPI modular API (api, application, domain, infrastructure).
- `docs/` — Technical and functional documentation.
- `docker-compose.yml` — Full-stack Docker Compose (db + backend + frontend).

## Documentation

- Overview: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Environment: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
- Auth: [docs/AUTH_SUPABASE.md](docs/AUTH_SUPABASE.md)

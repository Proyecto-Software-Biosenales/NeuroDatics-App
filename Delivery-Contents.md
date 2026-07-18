# NeuroDatics Delivery Contents

This folder is a self-contained Docker delivery package for non-technical users.

## Required Files And Folders

- `docker-compose.yml`: delivery compose file. It builds local images from the included source.
- `.env`: completed production runtime configuration with secrets. Keep it private
  and use unique `AUTH_JWT_SECRET` and `POSTGRES_PASSWORD` values.
- `Final-Instructions.md`: short user guide for starting the app.
- `frontend/`: source needed by Docker to build the Next.js image.
- `backend/`: source needed by Docker to build the FastAPI/worker image.
- `docs/`: extended documentation and troubleshooting.

## Intentionally Excluded

- `frontend/node_modules/`
- `frontend/.next/`
- `frontend/.env.local`
- `frontend/*.tsbuildinfo`
- `backend/.venv/`
- `backend/.env`
- `backend/data/`
- Python caches and test caches
- Git metadata

## Startup Command

Run this from the delivery folder:

```bash
docker compose up -d
```

The first run builds `neurodatics-backend:delivery`,
`neurodatics-backend-worker:delivery`, and `neurodatics-frontend:delivery`
locally, then starts PostgreSQL, Redis, backend, worker, and frontend.

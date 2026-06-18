# ---- Base image ----
FROM python:3.11-slim

# ---- System deps (for some libs + curl for healthchecks) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN printf "precedence ::ffff:0:0/96  100\n" >> /etc/gai.conf

# ---- Poetry ----
ENV POETRY_VERSION=1.8.3 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir "poetry==$POETRY_VERSION"

# ---- Workdir ----
WORKDIR /app

# ---- Install deps first (better cache) ----
COPY pyproject.toml poetry.lock* /app/
RUN poetry install --no-root --only main

# ---- Copy source ----
COPY . /app

# Important for src-layout
ENV PYTHONPATH=/app/src

# ---- Expose port ----
EXPOSE 8000

# ---- Start (with automatic migrations - verbose) ----
CMD sh -c "echo 'Running Alembic migrations...' && alembic upgrade head && echo 'Migrations complete. Starting Uvicorn...' && uvicorn neurodatics.main:app --host 0.0.0.0 --port 8000"

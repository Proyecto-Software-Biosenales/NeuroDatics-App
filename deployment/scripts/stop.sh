#!/usr/bin/env sh
set -eu
cd "$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
docker compose --project-name neurodatics --project-directory . --env-file ../.env -f docker-compose.yml stop --timeout 30
echo 'Aplicación detenida; los contenedores y datos se conservan.'

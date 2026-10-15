#!/usr/bin/env sh
# Arranque manual para equipos Linux x64 con Docker ya configurado.
# Se ejecuta desde _internal; la configuración privada .env está en la raíz de la entrega.
set -eu
cd "$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
if [ ! -f ../.env ]; then
  echo 'Falta .env en la raíz de la entrega. Solicita la configuración al responsable. Consulta README.md.' >&2
  exit 1
fi
compose() { docker compose --project-name neurodatics --project-directory . --env-file ../.env -f docker-compose.yml "$@"; }
echo 'Verificando y cargando todas las imágenes de esta entrega.'
(cd images && sha256sum -c SHA256SUMS.txt)
for archivo in images/*.tar.gz; do docker load --input "$archivo"; done
compose config --quiet
compose up -d --no-build --pull never --remove-orphans --wait --wait-timeout 300
echo 'Servicios listos. Abre http://localhost:3000/configuracion (o el puerto de .env).'

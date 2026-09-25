#!/usr/bin/env sh
# Arranque manual para equipos Linux x64 con Docker ya configurado.
set -eu
cd "$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
if [ ! -f .env ]; then
  echo 'Falta .env. Solicita la configuración al responsable. Consulta README.md.' >&2
  exit 1
fi
echo 'Verificando y cargando todas las imágenes de esta entrega.'
(cd images && sha256sum -c SHA256SUMS.txt)
for archivo in images/*.tar.gz; do docker load --input "$archivo"; done
docker compose config --quiet
docker compose up -d --no-build --pull never --remove-orphans --wait --wait-timeout 300
echo 'Servicios listos. Abre http://localhost:3000/configuracion (o el puerto de .env).'

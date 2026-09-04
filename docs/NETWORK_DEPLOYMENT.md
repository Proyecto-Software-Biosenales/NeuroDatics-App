# Despliegue En Red Universitaria

## Principio De Red

NeuroDatics publica solamente el frontend. El navegador usa el mismo origen
(`https://<host>/api`) y Next.js reenvía internamente las solicitudes al
backend. No se debe publicar PostgreSQL, Redis ni el puerto FastAPI `8000`.

En un servidor central, publica el frontend detrás de un reverse proxy HTTPS en
el puerto `443`. Configura `CORS_ALLOWED_ORIGINS` con el origen exacto de
la interfaz, por ejemplo `https://neurodatics.universidad.edu`.

## Salidas Que Debe Permitir TI

Solicitudes que TI debería permitir:

| Origen | Destino | Puerto | Uso |
| --- | --- | --- | --- |
| Backend Docker | Host configurado en `DATABASE_URL` | TCP `5432` | PostgreSQL/Supabase con TLS usando pooler de sesion |
| Navegador del usuario | `accounts.google.com` | HTTPS `443` | Inicio OAuth |
| Backend Docker | `oauth2.googleapis.com` | HTTPS `443` | Canje y renovación de tokens |
| Backend Docker | `openidconnect.googleapis.com` | HTTPS `443` | Perfil OAuth |
| Backend Docker | `www.googleapis.com` | HTTPS `443` | Google Drive |

Solicita reglas de salida por FQDN cuando el firewall lo permita; no fijes las
IP observadas en una prueba. PostgreSQL no se transporta por `HTTPS_PROXY`: si
la red obliga un proxy HTTP, TI debe autorizar una ruta TCP compatible hacia la
base de datos.

## Configuración De Producción

En `.env`, define como mínimo:

```dotenv
APP_ENV=production
AUTH_JWT_SECRET=<secreto-unico-de-al-menos-32-caracteres>
POSTGRES_PASSWORD=<secreto-url-safe-unico>
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@aws-REGION.pooler.supabase.com:5432/postgres?sslmode=require
CORS_ALLOWED_ORIGINS=https://neurodatics.universidad.edu
REDIS_SOCKET_TIMEOUT_SECONDS=3
```

`sslmode=verify-full` es preferible cuando el certificado CA de Supabase está
provisionado dentro del contenedor. La aplicación rechaza en producción una base
de datos externa sin TLS explícito o un secreto JWT de ejemplo/corto.
El Compose actual también inicia PostgreSQL local, de modo que
`POSTGRES_PASSWORD` sigue siendo obligatorio y no debe ser `postgres`.

Mantén `REDIS_SOCKET_TIMEOUT_SECONDS` corto para API/cache. La ingesta se
ejecuta dentro del backend; el stack ya no inicia un worker RQ.

Si TI provee un proxy explícito para HTTPS, define `HTTP_PROXY`, `HTTPS_PROXY`
y, si hace falta, amplía `NO_PROXY`. No copies esas credenciales a variables
`NEXT_PUBLIC_*`.

Para un dominio que no sea localhost, registra las URL HTTPS equivalentes de
`/authorize` y `/api/integrations/google-drive/callback` en Google Cloud OAuth.

## Preflight Antes De Abrir El Caso Con TI

Después de levantar el stack, ejecuta el siguiente comando. No imprimen
contraseñas, tokens ni la URL completa de base de datos:

```powershell
docker compose exec -T backend python -m neurodatics.diagnostics.network_preflight
```

El preflight valida TCP y `SELECT 1` contra la base de datos, además de DNS,
TLS y HTTPS contra los tres hosts de Google requeridos por el servidor. El
acceso del navegador a `accounts.google.com` debe probarse desde un equipo
usuario. Una respuesta HTTP `401`, `403`
o `404` de un endpoint OAuth/API confirma conectividad; un timeout indica que
la regla de salida o el proxy todavía no permite el destino.

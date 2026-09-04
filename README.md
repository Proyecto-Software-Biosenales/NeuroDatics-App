# NeuroDatics

Plataforma de análisis de bioseñales para neuromarketing. La aplicación se ejecuta como un único stack Docker desde la raíz del repositorio.

## Inicio rápido

Requisitos: Docker Desktop y Git. No necesitas instalar Node.js, Python, PostgreSQL ni Redis.

```powershell
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
cd NeuroDatics-App
Copy-Item .env.example .env
```

Edita `.env` antes de iniciar:

- `POSTGRES_PASSWORD`: una contraseña única para la base de datos local.
- `AUTH_JWT_SECRET`: un secreto aleatorio de al menos 32 caracteres.
- `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`: necesarios para usar el inicio de sesión real con Google.

Las opciones de Google Drive, base de datos externa y proxy están documentadas en `.env.example`.

```powershell
docker compose up -d --build
docker compose ps
```

El stack crea y conecta `frontend`, `backend`, `db` y `redis`. Las migraciones se ejecutan al iniciar el backend.

| Recurso | URL |
| --- | --- |
| Aplicación | http://localhost:3000 |
| API mediante el proxy | http://localhost:3000/api |
| Swagger UI | http://localhost:3000/docs |

El backend no expone un puerto al host: el frontend reenvía `/api`, `/docs`, `/openapi.json` y `/redoc` dentro de la red de Docker.

## Operación diaria

```powershell
# Ver registros de todos los servicios
docker compose logs -f

# Reconstruir después de cambiar el código
docker compose up -d --build

# Detener el stack sin borrar datos
docker compose down

# Borrar base de datos, cachés y datos locales (acción destructiva)
docker compose down -v
```

Después de actualizar el repositorio, ejecuta de nuevo `docker compose up -d --build`.
Al actualizar desde una versión con el worker RQ, usa
`docker compose up -d --build --remove-orphans` para retirar su contenedor antiguo.

## Solución de problemas

```powershell
docker compose config --quiet
docker compose ps
docker compose logs --tail=200 backend
```

Si un servicio está marcado como `unhealthy`, revisa sus registros antes de borrar volúmenes o recrear datos.

Para un despliegue en una red universitaria o corporativa, consulta [NETWORK_DEPLOYMENT.md](./docs/NETWORK_DEPLOYMENT.md).

## Estructura

- `docker-compose.yml`: punto de inicio único del stack.
- `frontend/`: interfaz Next.js.
- `backend/`: API FastAPI, migraciones e ingesta de experimentos.
- `docs/NETWORK_DEPLOYMENT.md`: guía de red y proxy.

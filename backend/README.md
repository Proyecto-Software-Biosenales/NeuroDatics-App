# NeuroDatics Backend

API FastAPI de NeuroDatics. La aplicación completa se inicia únicamente desde la [raíz del repositorio](../README.md):

```powershell
docker compose up -d --build
```

No ejecutes Docker ni mantengas una configuración independiente desde esta carpeta. El backend usa las variables del `.env` raíz y permanece accesible solo dentro de la red de Docker.

## Responsabilidades

- API HTTP y documentación OpenAPI.
- Migraciones de PostgreSQL al iniciar el contenedor.
- Autenticación con Google OAuth y gestión de proyectos.
- Ingesta de ZIP dentro de la solicitud HTTP y caché de analítica en Redis.

## Configuración relevante

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL; si se omite, usa la base de datos del stack. |
| `AUTH_JWT_SECRET` | Secreto obligatorio para firmar tokens. |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Inicio de sesión con Google. |
| `GDRIVE_FOLDER_ID` | Carpeta raíz opcional para la integración con Drive. |

Consulta `.env.example` en la raíz para el contrato completo de configuración.

## Endpoints principales

### Autenticación

- `GET /api/auth/google/login-url`: genera la URL de inicio de sesión de Google.
- `POST /api/auth/google/authorize`: intercambia el código OAuth por la sesión local.

### Proyectos

- `POST /api/projects`: crear proyecto.
- `GET /api/projects`: listar proyectos.
- `GET /api/projects/{id}`: obtener proyecto.
- `PATCH /api/projects/{id}`: actualizar proyecto.
- `DELETE /api/projects/{id}`: eliminar proyecto.
- `POST /api/projects/{id}/files/experiment-zip`: subir ZIP.
- `PUT /api/projects/{id}/sensors`: actualizar sensores.
- `POST /api/projects/{id}/finalize`: finalizar proyecto.

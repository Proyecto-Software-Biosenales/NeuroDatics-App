# 10 - Gaps, Deuda Tecnica Y Pendientes Detectados

Este documento enumera hallazgos concretos al leer codigo real.

## 1) startup_event Sin Implementacion

Archivo:
- `backend/src/neurodatics/main.py`

Estado:
- `startup_event()` tiene `pass`.

Riesgo:
- Falsa expectativa de bootstrap automatico de DB.

Accion sugerida:
- O implementar chequeo minimo de conectividad, o eliminar handler vacio.

## 2) Placeholder Sin Uso En Rutas De Projects

Archivo:
- `backend/src/neurodatics/modules/projects/api/routes.py`

Estado:
- `register_project_routes(app): pass` al final del archivo.

Riesgo:
- Ruido y confusion sobre mecanismo real de routing.

Accion sugerida:
- Eliminar funcion placeholder o implementarla y usarla consistentemente.

## 3) Filtro De Estado En UI No Incluye Draft

Archivo:
- `frontend/app/proyectos/page.tsx`

Estado:
- Botones de filtro: `all`, `active`, `archived`.
- Dominio y backend soportan `draft`.

Riesgo:
- Proyectos draft quedan menos visibles para usuario.

Accion sugerida:
- agregar filtro draft o normalizar comportamiento esperado.

## 4) Doble Metodo Frontend Para El Mismo Delete

Archivo:
- `frontend/features/projects/api/projectsApi.ts`

Estado:
- Existen `remove` y `delete`, ambos hacen `DELETE /api/projects/{id}`.

Riesgo:
- API client redundante y mas costo de mantenimiento.

Accion sugerida:
- dejar uno solo y refactorizar llamadas.

## 5) Inconsistencia De Documentacion Sobre Supabase

Estado:
- Instrucciones antiguas mencionan cliente Supabase en path que no existe.
- Flujo auth activo usa Google OAuth + JWT local + `sessionStore`.

Riesgo:
- onboarding confuso.

Accion sugerida:
- alinear docs antiguas con estado actual.

## 6) backend/README.md Con Bloques Mezclados

Estado:
- Tiene comandos y secciones mezcladas (venv, docker, markdown desalineado).

Riesgo:
- setup inicial con errores para contributors nuevos.

Accion sugerida:
- limpieza de README backend y separar rutas de setup oficiales.

## 7) Cache En Memoria No Distribuida

Estado:
- Cache de imagenes en backend vive en memoria de proceso.

Riesgo:
- En despliegue multi-instancia no comparte cache.

Accion sugerida:
- si escala horizontal, evaluar cache distribuida (Redis) o CDN.

## 8) Validacion De Tamano ZIP Duplicada Y No Alineada

Estado:
- Frontend valida 100MB en Step1.
- Backend valida por `project_zip_max_size_mb` (settings; default 500MB).

Riesgo:
- UX inconsistente (frontend puede rechazar archivo que backend aceptaria).

Accion sugerida:
- unificar limite y exponerlo desde backend/config.

## 9) Historial Reciente De Estado Draft (013/014)

Estado:
- Migracion 013 removio draft.
- Migracion 014 lo restaura.

Riesgo:
- Ambientes con historial parcial pueden quedar en constraints inconsistentes.

Accion sugerida:
- validar estado final de constraints al desplegar.

## Resuelto Recientemente

- `app_users` ya tiene migracion Alembic explicita: `017_create_app_users_table.py`.

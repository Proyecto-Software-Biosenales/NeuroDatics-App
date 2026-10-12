# Instrucciones para agentes

## Dos ediciones, un solo código: todo cambio llega también a NeuroDatics Estudiantes

NeuroDatics se entrega en dos ediciones construidas con el mismo `backend/` y el mismo `frontend/`:

- **Servidor** (Docker, `docker-compose.yml`): inicio de sesión con Google, archivos en Google Drive, Redis, proxy.
- **NeuroDatics Estudiantes** (`APP_MODE=local`, Windows, sin internet): el backend congelado con PyInstaller,
  PostgreSQL 16 embebido, ffmpeg y el frontend como exportación estática. Código propio en
  `backend/src/neurodatics/local/`; empaquetado en `student/` (ver `student/README.md`).

**Regla:** todo cambio que hagas debe funcionar también en la edición de estudiantes. Lo único que queda fuera es lo
que depende de Google o de la infraestructura del servidor: inicio de sesión con Google, Google Drive y su OAuth,
Docker, Redis, el proxy y el despliegue en red. Análisis, ingesta, reportes, pre-experimentos, cuestionarios,
migraciones e interfaz aplican siempre. Si dudas si algo aplica, asume que sí.

### Al escribir el cambio

1. **Separa por edición solo lo que lo necesita.** Frontend: `IS_LOCAL_MODE` (`frontend/lib/appMode.ts`), nunca la URL.
   Backend: `settings.is_local`. Oculta en local únicamente la parte de Google/Drive/Docker, no lo que la rodea
   (ejemplo: el botón «Ir a proyectos» de Configuración quedó oculto en local por estar dentro del bloque de Drive).
2. **Archivos:** las funciones leen y escriben a través de `modules/integrations/storage_provider.py` (en local lo
   reemplaza el almacenamiento en disco). No importes el cliente de Drive desde una función.
3. **Sin red:** nada de fuentes, scripts, CDNs ni telemetría remotos. En local, cualquier conexión fuera de
   `127.0.0.1` es un error (la detecta el guard offline y `student/build.ps1` falla con fuentes o scripts remotos).
4. **Configuración nueva:** todo ajuste nuevo de `config/settings.py` necesita un valor por defecto que funcione en
   local, o establecerse en `launcher.apply_environment` (`backend/src/neurodatics/local/launcher.py`).
5. **Exportación estática del frontend:** nada de route handlers en `app/api`, middleware, server actions,
   `cookies()`/`headers()` ni segmentos dinámicos sin `generateStaticParams`; `useSearchParams` va dentro de `<Suspense>`.
6. **Rutas sin barra final:** en local el sitio estático atiende todo lo que no sea una ruta exacta, así que una ruta
   de colección (`"/"`) llamada sin barra final da 404. Llámala con barra o añádela a `API_PATH_ALIASES`
   (`backend/src/neurodatics/local/static_frontend.py`).
7. **Migraciones:** el launcher las ejecuta al iniciar sobre PostgreSQL 16 embebido; no uses extensiones que no
   vengan en el zip de EDB.
8. **Empaquetado (PyInstaller, `student/build.ps1`):**
   - dependencia de Python nueva: fíjala en `student/requirements.txt` y `student/requirements-frozen.txt`
     (`student/check-pins.py` lo exige); si trae datos o plugins, añade su `--collect-*`;
   - archivo de datos nuevo fuera de `backend/migrations`, `reports/application/assets` y
     `reports/infrastructure/templates`: añade su `--add-data`;
   - módulo importado dinámicamente: añade su `--hidden-import`;
   - lo que viaje en el paquete va dentro de `_internal`. Junto al exe solo pueden estar
     `neurodatics-estudiantes.exe` y `LEEME.txt`.
9. **Pruebas:** si añades una función visible para el usuario, cúbrela también en
   `frontend/tests/local/student-offline.spec.ts` cuando aplique a local.
10. **Guía del estudiante:** si cambia algo que el estudiante ve o hace (pasos, requisitos, mensajes), actualiza
    `student/LEEME.txt` (español; nunca la copia del paquete).

### Al terminar: reconstruir el paquete de estudiantes

Si tu cambio toca `backend/src`, `backend/migrations`, `frontend/` o `student/`, después de que `./verify.ps1`
quede en verde reconstruye y entrega el paquete (unos 15 minutos). Las entradas están en `output/student-m1`:

```powershell
student\build.ps1 -Work output\student-m1
student\run-frozen.ps1 -Work output\student-m1 -Assemble -TemplateSource output\student-m1\pg-template
student\run-frozen.ps1 -Work output\student-m1
student\package.ps1 -Work output\student-m1 -Version <siguiente>
```

- `<siguiente>`: la versión del zip actual en `delivery/` más uno en el último número (0.2 → 0.3).
- Si `frontend/node_modules` está vacío, ejecuta antes `npm ci` en `frontend`.
- Las pruebas de `run-frozen.ps1` deben pasar todas. El código de salida no basta: lee el log y comprueba que el
  navegador diga `passed` y no `failed`, que haya 0 conexiones fuera de loopback y que no queden procesos postgres.
- No edites `delivery/` a mano: solo `package.ps1` lo escribe. `delivery/NeuroDatics-Estudiantes` debe mostrar
  únicamente el exe y `LEEME.txt`.
- Si no puedes reconstruir (faltan entradas, otra máquina, falla una prueba), no lo ocultes: dilo en tu respuesta
  final y en `docs/CHANGELOG.md` («paquete de estudiantes no reconstruido» y el motivo).
- Anota en la entrada de `docs/CHANGELOG.md` la versión, el SHA-256 del zip y qué pruebas pasaron.

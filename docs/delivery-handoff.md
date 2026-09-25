# Entrega instalable de NeuroDatics

Solicitud: actualizar `delivery/NeuroDatics-App` en español, con instalación de requisitos Windows y uso diario desde Docker Desktop.

## Implementado

- Fuentes versionables en `deployment/`; entrega privada generada en `delivery/NeuroDatics-App` con su `.env` original conservado (4163 bytes; fecha original 2026-08-11). No se imprimieron sus valores.
- Doble clic en `INSTALAR.bat` o `INICIAR.bat`; PowerShell 5.1, comprobación de archivos SHA256, Windows x64, RAM, disco, virtualización, WSL >= 2.1.5 y Docker Compose >= 2.20.
- Preparación elevada solo de componentes Windows/WSL y servicio LanmanServer. Docker Desktop se instala para el usuario original desde el proveedor, comprobando Authenticode. Continúa mediante RunOnce después del reinicio, sin forzarlo ni sobrescribir otras entradas de inicio.
- Credenciales locales aleatorias si se crea `.env`; configuración existente conservada. Las variables heredadas del shell no pueden desviar Compose a otra base. Contexto Docker local explícito.
- Imágenes actuales linux/amd64, ID y hash exactos; cuatro servicios, sin worker retirado. `stop` conserva contenedores/volúmenes para el arranque diario desde Docker Desktop.
- Generador reproducible desde Compose raíz; la entrega no construye ni descarga imágenes. La huella de fuentes detecta cambios durante la generación. Se excluyen datos locales de la imagen backend.
- Página `/configuracion` y enlace de navegación, con estado autenticado de Drive, consentimiento de Google y confirmación antes de reconectar una cuenta compartida. No expone tokens. El callback confirma el éxito en una página española para navegadores y conserva JSON para clientes API.
- Manuales, mensajes del instalador y guías en español. Windows ARM y macOS no se anuncian como compatibles con este instalador.
- Cambios anteriores de aplicación, analítica, informes y autenticación preservados. Stack de desarrollo `neurodatics` en puerto 3000 permanece activo y sus datos no se tocaron.

## Evidencia del 18 de septiembre de 2026

- `output/delivery-unit.log`: **55 comprobaciones** correctas en Windows PowerShell 5.1. Incluyen archivos corruptos, etiquetas antiguas, variables heredadas, firmas, códigos de error, Windows/CPU/RAM/virtualización, WSL ausente/antiguo, reinicio pendiente y RunOnce.
- `output/delivery-verify.log`: `verify.ps1` **ALL GREEN**. Backend **810 pruebas**, 24 snapshots; Ruff, Vulture, deptry y contratos de imports correctos. TypeScript, pruebas frontend y **36 regresiones de hooks** correctas. ESLint: 0 errores, 6 avisos preexistentes permitidos.
- `output/delivery-e2e.log`: **7 E2E Chromium** correctas: autenticación requerida, primera conexión Drive, reconexión confirmada, recuperación de errores, vista móvil y navegación a 768/1024/1440 px. Google se simula en estas pruebas.
- Tras añadir la confirmación visual de Drive: **26 pruebas** de conexión, callback, seguridad e inventario correctas; Ruff y ESLint del código afectado correctos. Incluye comprobación de HTML español y conservación de JSON.
- `output/delivery-smoke-final.log` y `output/entrega-prueba-f60e18de/resultado.txt`: carga real de los **cuatro archivos comprimidos**, instalador real PowerShell 5.1, base PostgreSQL vacía con migración **025**, cuatro servicios saludables, HTTP de interfaz/configuración/proxy, endpoint Drive protegido, segunda ejecución idempotente, parada y arranque directo de los mismos contenedores, datos conservados.
- En ese ensayo se comprobó que la imagen backend no incluye `.env` ni `data/auth_users.json` del desarrollador. Se usaron credenciales sintéticas, proyectos Docker aleatorios y volúmenes exclusivos; se eliminan solo esos recursos al finalizar.

## Límites de la comprobación

No se dispone de VM Windows limpia: las ramas privilegiadas de instalación de WSL/Docker se probaron con simulaciones, no desinstalando el Docker del usuario. La instalación en hardware sin requisitos y el consentimiento real de Google requieren un ensayo adicional antes de una distribución amplia. BIOS, permisos de administrador, términos de Docker y consentimiento de Google pueden necesitar intervención humana.

## Cierre

**Completado.** La última generación y el ensayo de sus archivos exactos terminaron con código 0: `output/delivery-build-final.log`, `output/delivery-smoke-release.log` y `output/entrega-prueba-4c2d61cb/resultado.txt`. Incluyen la confirmación visual de Google Drive. Los recursos Docker temporales fueron retirados; el stack habitual sigue saludable.

- Entrega: `delivery/NeuroDatics-App/INSTALAR.bat`.
- Fecha del manifiesto: `2026-09-19T00:32:12Z` (18 de septiembre, hora de Bogotá).
- Huella de fuentes: `cc8670941aeca7e35b6e5fdb7cb263bc9709cbda5651e592f4753b9b5dcfadee`.
- Imagen backend: `sha256:10112ec5bc71424c669598657a7dee97b865ffd338cc4f957b7ed1a312277266`.
- Imagen frontend: `sha256:5d1c13f751995aeef8e66378aabdda87d1aba0da9c79bc98c6e3d9d2e4581f1d`.
- Cuatro imágenes, 25 archivos comprobados; imágenes comprimidas: 1 214 716 915 bytes.

No quedan acciones de implementación. Autorresumen `codex-d8183484506d` detenido a las 19:35 de Bogotá. Antes de una distribución amplia, realizar el ensayo de Windows limpio y consentimiento Google descrito en los límites; no se representa ese ensayo como ejecutado.

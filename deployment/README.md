# NeuroDatics: instalar y usar

La carpeta de la entrega muestra solo cuatro archivos:

| Archivo | Para qué |
| --- | --- |
| **INSTALAR.bat** | Una sola vez. Prepara el equipo y deja NeuroDatics funcionando. |
| **INICIAR.bat** | Cada día, o el icono **NeuroDatics** del escritorio que crea INSTALAR. |
| **DETENER.bat** | Apaga NeuroDatics sin borrar datos. |
| **LEEME-PRIMERO.txt** | La guía corta. |

Después de instalar aparece también **`.env`**, la configuración privada de esta instalación. Todo lo demás (scripts, imágenes, Compose, manifiesto y esta documentación) está en la carpeta `_internal`, que INSTALAR oculta.

## Primera vez en Windows: INSTALAR

1. Extrae **toda la carpeta** del ZIP y guárdala en una ubicación permanente, preferiblemente `C:\NeuroDatics`. No ejecutes archivos desde dentro del ZIP.
2. Haz doble clic en **INSTALAR.bat** desde la sesión de Windows de la persona que va a usar NeuroDatics. No necesitas abrir una terminal ni instalar Git, Python, Node.js, PostgreSQL o Redis.
3. Si falta WSL, Windows pide permiso de administrador una vez. Si se solicita reiniciar, guarda tu trabajo y reinicia: la instalación continúa sola al iniciar sesión. También puedes abrir otra vez `INSTALAR.bat`.
4. Docker Desktop se instala para tu usuario aceptando sus [condiciones de servicio](https://www.docker.com/legal/docker-subscription-service-agreement/); no hace falta una cuenta de Docker Hub. Es gratuito para uso personal, educativo y organizaciones pequeñas; las grandes necesitan suscripción.
5. Al terminar, el instalador crea el icono **NeuroDatics** en el escritorio y abre la aplicación. Inicia sesión con Google y entra en **Configuración** para conectar Google Drive si esta instalación todavía no tiene una cuenta configurada. Ese consentimiento solo puede darlo el propietario de la cuenta.

El asistente comprueba Windows, procesador, RAM, espacio, virtualización, WSL, Docker Desktop, Docker Compose, archivos y SHA256, configuración, puerto e imágenes. Después carga las imágenes, aplica las migraciones y espera la salud de los cuatro servicios. Puedes repetirlo tras un error o para actualizar: conserva las credenciales y los datos existentes.

Si la entrega incluye `.env`, utiliza esa configuración y no pregunta nada. Si no lo incluye, el asistente crea secretos locales y solicita una vez las dos credenciales de Google del proyecto. El responsable debe proporcionarlas; consulta [CONFIGURACION-GOOGLE.md](CONFIGURACION-GOOGLE.md).

### Permisos de administrador

No hace falta abrir INSTALAR «como administrador». Solo la preparación de WSL se eleva, en una ventana aparte, y únicamente cuando falta. Si una persona sin permisos de administrador instala, alguien con esos permisos escribe su contraseña en esa ventana: WSL es del equipo, mientras que Docker Desktop, la aplicación y sus datos quedan en la cuenta de quien abrió INSTALAR.

Abrir INSTALAR «como administrador» desde la misma cuenta también funciona: Windows no vuelve a preguntar y Docker Desktop y el navegador se abren con los permisos normales de la sesión. Si la ventana pertenece a otra cuenta (por ejemplo, «Ejecutar como otro usuario»), el asistente se detiene: Docker y los datos acabarían en la cuenta equivocada. INICIAR y DETENER nunca piden permisos de administrador.

## Cada día: INICIAR

Doble clic en el icono **NeuroDatics** del escritorio o en **INICIAR.bat**. Una ventana muestra el progreso:

1. Si NeuroDatics ya está abierta, abre el navegador y termina.
2. Si Docker Desktop está apagado, lo enciende y espera hasta cuatro minutos (normalmente menos de uno).
3. Comprueba que las imágenes cargadas en Docker son las de esta carpeta, sin volver a calcular huellas.
4. Inicia los cuatro servicios, recrea los contenedores que falten y conserva los datos.
5. Abre `http://localhost:3000` (o el puerto de `.env`) y la ventana se cierra sola.

Si algo falla, la ventana se queda abierta con el motivo. Si INSTALAR no se completó, INICIAR no instala nada: pide abrir INSTALAR.

Para apagar la aplicación abre `DETENER.bat`. Los contenedores y datos quedan guardados. En Docker Desktop evita **Delete**, eliminar volúmenes o restablecer Docker a valores de fábrica: esas operaciones pueden borrar datos.

## Requisitos

- Windows x64 en procesador Intel/AMD: Windows 11 23H2 o posterior, o Windows 10 22H2 con soporte vigente. No Windows Server ni Windows ARM en este paquete.
- 8 GB de RAM como mínimo; 16 GB recomendados. Al menos 15 GB libres para la instalación, más espacio para experimentos.
- Virtualización habilitada en BIOS/UEFI.
- Internet para instalar WSL/Docker por primera vez, iniciar sesión en Google y usar Drive o una base externa.
- Las cuatro imágenes de la aplicación viajan en `_internal\images`; no se compila código ni se descargan de un registro.

Los requisitos de Windows/WSL siguen la [documentación de Docker](https://docs.docker.com/desktop/setup/install/windows-install/) y los [comandos oficiales de WSL](https://learn.microsoft.com/es-es/windows/wsl/basic-commands). El asistente no instala una distribución Ubuntu, editores ni herramientas de desarrollo.

## Archivos y datos

- `.env` (raíz): configuración privada con la contraseña de la base y los secretos. Consérvala con tus copias de seguridad y compártela únicamente con el equipo autorizado. Está en la raíz, fuera de `_internal`, para que actualizar la entrega nunca la sustituya.
- `_internal\manifest.json`, `_internal\VERSION.txt`, `_internal\images\`: versión exacta, huellas y cuatro imágenes construidas.
- `_internal\scripts\`: automatización compatible con Windows PowerShell 5.1.
- `_internal\instalacion.log`: etapas y resultado general, sin copiar credenciales.
- [SOLUCION-DE-PROBLEMAS.md](SOLUCION-DE-PROBLEMAS.md): errores y diagnóstico.

Servicios: interfaz `frontend`, API `backend`, base `db` y caché `redis`. Los datos viven en volúmenes de Docker llamados `neurodatics_postgres_data`, `neurodatics_redis_data` y `neurodatics_neurodatics_data`: dependen del nombre del proyecto, no de la carpeta, así que mover o actualizar la entrega no los toca. La aplicación solo publica el puerto de la interfaz en este equipo; API, PostgreSQL y Redis quedan internos.

## Actualizar una instalación existente

1. Haz una copia de seguridad de `.env`.
2. Extrae la nueva entrega encima de la carpeta actual, o sustituye `INSTALAR.bat`, `INICIAR.bat`, `DETENER.bat`, `LEEME-PRIMERO.txt` y la carpeta `_internal` completa. **No sustituyas ni borres `.env`.**
3. Abre `INSTALAR.bat` una vez. Carga las imágenes nuevas, retira contenedores obsoletos del mismo grupo y nunca elimina volúmenes. Después sigue usando INICIAR.

Si la carpeta venía de una entrega anterior con todo en la raíz (`scripts\`, `images\`, `docker-compose.yml`…), INSTALAR retira esos archivos siempre que sigan intactos según el manifiesto antiguo. No toca `.env` ni archivos que alguien haya cambiado, y guarda el registro anterior como `_internal\instalacion-anterior.log`. No ejecutes simultáneamente dos copias del paquete con configuraciones diferentes.

## Otros sistemas

El instalador automático es para Windows x64. En Linux x64 con Docker y Compose ya instalados, `.env` completo en la raíz de la entrega y `sha256sum`, un responsable puede usar `sh _internal/scripts/start.sh` y `sh _internal/scripts/stop.sh`. Este paquete no instala dependencias de macOS/Linux ni ofrece imágenes ARM64 nativas.

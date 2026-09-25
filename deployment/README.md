# NeuroDatics: instalar y usar

## Primera vez en Windows

1. Descarga **toda la carpeta**, extráela del ZIP y guárdala en una ubicación permanente, preferiblemente `C:\NeuroDatics`. No ejecutes archivos desde dentro del ZIP.
2. Haz doble clic en **INSTALAR.bat**. No necesitas abrir una terminal ni instalar Git, Python, Node.js, PostgreSQL o Redis.
3. Si Windows pide permiso de administrador para preparar WSL, autorízalo. Si se solicita reiniciar, guarda tu trabajo y reinicia: la instalación continuará al iniciar sesión. También puedes abrir otra vez `INSTALAR.bat`.
4. En la bienvenida de Docker Desktop, acepta sus condiciones para utilizarlo. No necesitas una cuenta de Docker Hub.
5. Al abrirse NeuroDatics, inicia sesión con Google y entra en **Configuración**. Conecta Google Drive si esta instalación todavía no tiene una cuenta configurada. Ese consentimiento solo puede darlo el propietario de la cuenta.

El asistente comprueba Windows, procesador, RAM, espacio, virtualización, WSL, Docker Desktop, Docker Compose, archivos y SHA256, configuración, puerto e imágenes. Después carga las imágenes, aplica las migraciones y espera la salud de los cuatro servicios. Puedes repetirlo tras un error o para actualizar: conserva las credenciales y los datos existentes.

Si la entrega incluye `.env`, utiliza esa configuración. Si no lo incluye, el asistente crea secretos locales y solicita las dos credenciales de Google del proyecto. El responsable debe proporcionarlas; no se pueden obtener de una cuenta personal automáticamente. Consulta [CONFIGURACION-GOOGLE.md](CONFIGURACION-GOOGLE.md).

## Las siguientes veces: solo Docker Desktop

1. Abre **Docker Desktop**.
2. En **Containers**, busca el grupo **neurodatics** y pulsa **Iniciar / ▶** en el grupo completo.
3. Espera a que sus cuatro servicios estén activos y abre **http://localhost:3000** o el archivo **ABRIR-NEURODATICS.url** que crea el instalador.

Para apagar la aplicación, pulsa **Detener / ■** en el grupo, o abre `DETENER.bat`. Los contenedores y datos quedan guardados. Evita **Delete**, eliminar volúmenes o restablecer Docker a valores de fábrica: esas operaciones pueden borrar datos. Si apagas Windows con la aplicación activa, Docker puede volver a iniciarla al arrancar su motor.

## Requisitos

- Windows x64 en procesador Intel/AMD: Windows 11 23H2 o posterior, o Windows 10 22H2 con soporte vigente. No Windows Server ni Windows ARM en este paquete.
- 8 GB de RAM como mínimo; 16 GB recomendados. Al menos 15 GB libres para la instalación, más espacio para experimentos.
- Virtualización habilitada en BIOS/UEFI; permiso de administrador para preparar componentes de Windows cuando falten.
- Internet para instalar WSL/Docker por primera vez, iniciar sesión en Google y usar Drive o una base externa.
- En un equipo ya preparado, las cuatro imágenes de la aplicación se cargan desde `images/`; no se compila código ni se descargan de un registro.

Los requisitos de Windows/WSL siguen la [documentación de Docker](https://docs.docker.com/desktop/setup/install/windows-install/) y los [comandos oficiales de WSL](https://learn.microsoft.com/es-es/windows/wsl/basic-commands). El asistente no instala una distribución Ubuntu, editores ni herramientas de desarrollo.

## Archivos y datos

- `INSTALAR.bat` / `INICIAR.bat`: mismo asistente de instalación, recuperación y actualización.
- `DETENER.bat`: detiene sin eliminar contenedores.
- `.env`: configuración privada. Consérvala; compártela únicamente con el equipo autorizado.
- `manifest.json`, `VERSION.txt`, `images/`: versión exacta, huellas y cuatro imágenes construidas.
- `scripts/`: automatización compatible con Windows PowerShell 5.1.
- `instalacion.log`: etapas y resultado general, sin copiar credenciales.
- [SOLUCION-DE-PROBLEMAS.md](SOLUCION-DE-PROBLEMAS.md): errores y diagnóstico.

Servicios: interfaz `frontend`, API `backend`, base `db` y caché `redis`. Ya no existe un worker separado. Los volúmenes de Docker conservan base, datos y cachés. La aplicación solo publica el puerto de la interfaz en este equipo; API, PostgreSQL y Redis quedan internos.

## Actualizar una instalación existente

Conserva una copia de seguridad de tus datos y de `.env`. Sustituye los archivos del paquete por la nueva entrega **conservando tu `.env`** y abre `INSTALAR.bat`. El asistente identifica imágenes antiguas por su ID, carga las nuevas y retira contenedores obsoletos del mismo grupo. No elimina volúmenes. No ejecutes simultáneamente dos copias del paquete con configuraciones diferentes.

## Otros sistemas

El instalador automático es para Windows x64. En Linux x64 con Docker y Compose ya instalados, configuración `.env` completa y `sha256sum`, un responsable puede usar `sh scripts/start.sh` y `sh scripts/stop.sh`. Este paquete no instala dependencias de macOS/Linux ni ofrece imágenes ARM64 nativas.

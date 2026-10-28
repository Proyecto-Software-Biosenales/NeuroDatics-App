# Generar y verificar la entrega

> **Edición en red, sin uso actual.** NeuroDatics se entrega solo como programa local para Windows; esta entrega con
> Docker ya no se genera ni se prueba. Se conserva para quien quiera alojar la aplicación y aporte sus servicios: ver
> [docs/tecnica/alojamiento-en-red.md](../docs/tecnica/alojamiento-en-red.md).

El código fuente del instalador vive en `deployment/` y está versionado. El resultado en `delivery/NeuroDatics-App/` está excluido de Git porque puede contener configuración privada e imágenes grandes.

El mantenedor necesita PowerShell 7, Git y Docker Desktop con contenedores Linux. El usuario final solo necesita Windows PowerShell 5.1, que viene con Windows; el asistente prepara WSL y Docker.

```powershell
pwsh -NoProfile -File deployment/package.ps1
```

Construye desde el árbol de trabajo actual, incluidos cambios sin confirmar. Usa `docker-compose.yml` y su complemento `docker-compose.delivery.yml`, retira las instrucciones de construcción, fija arquitectura linux/amd64 y genera el Compose de entrega. Se exportan cuatro imágenes y un manifiesto con ID, tamaño y SHA256. No se utilizan imágenes antiguas por el mero hecho de tener la misma etiqueta. No edites el código mientras genera: compara la huella del código al empezar y al terminar.

## Estructura de la entrega

```text
NeuroDatics-App/
├── INSTALAR.bat          → _internal/scripts/instalar.ps1 (una vez; reanuda tras reiniciar)
├── INICIAR.bat           → _internal/scripts/iniciar.ps1  (uso diario; el icono del escritorio apunta aquí)
├── DETENER.bat           → _internal/scripts/detener.ps1
├── LEEME-PRIMERO.txt     (UTF-8 con BOM y CRLF para el Bloc de notas)
├── .env                  (solo si se entrega preconfigurada o tras instalar)
└── _internal/            docker-compose.yml, manifest.json, VERSION.txt, images/, scripts/,
                          .env.example, README.md, CONFIGURACION-GOOGLE.md,
                          SOLUCION-DE-PROBLEMAS.md, neurodatics.ico, instalacion.log
```

Las rutas del manifiesto son relativas a la raíz de la entrega e incluyen los cuatro archivos visibles. `_internal` sale visible del generador porque `Compress-Archive` y otros compresores omiten carpetas ocultas; INSTALAR la oculta en el equipo del usuario. El generador falla antes de construir si la carpeta de destino contiene algo que no sea de la entrega, y al terminar comprueba que la raíz solo muestre los cuatro archivos (más `.env` si existe).

**Por qué `.env` está en la raíz y no en `_internal`:** al actualizar se sustituye `_internal` entero; si los secretos vivieran allí, una actualización descuidada borraría la contraseña de PostgreSQL y la base quedaría inaccesible. En la raíz, además, las instalaciones anteriores ya lo tenían donde está (no hay que mover secretos), `-Configuracion` lo deja junto a los lanzadores y el responsable lo ve para sus copias de seguridad.

**Migración desde la estructura anterior** (todo en la raíz): `Remove-EntregaAnterior` (en `scripts/comun.ps1`), que ejecutan INSTALAR y el generador, lee el `manifest.json` antiguo de la raíz y borra solo los archivos que esa entrega instaló y siguen intactos según su huella, además de `VERSION.txt`, `images/SHA256SUMS.txt` y el `ABRIR-NEURODATICS.url` que generaba. Nunca toca `.env`, los lanzadores actuales ni archivos modificados; mueve `instalacion.log` a `_internal/instalacion-anterior.log`. Los volúmenes se llaman `neurodatics_<volumen>` (proyecto Compose fijo y sin `name:` propio), así que no dependen de la ruta y sobreviven al cambio de carpeta.

**Continuación tras reiniciar:** RunOnce registra `INSTALAR.bat -Proyecto <proyecto>`. Una instalación anterior registraba `INICIAR.bat -Proyecto`; INICIAR acepta ese argumento y, si la instalación está incompleta, pide abrir INSTALAR.

## Permisos de administrador

- INSTALAR no exige abrirse como administrador. Solo `requisitos-admin.ps1` (WSL y el servicio LanmanServer) se eleva con UAC, y solo cuando falta algo. Si la persona no es administradora, quien lo sea escribe sus credenciales en esa ventana; el resto del proceso sigue en la cuenta de la persona.
- Abierto como administrador desde la misma cuenta, funciona igual: UAC no vuelve a preguntar, Docker Desktop se instala por usuario en esa misma cuenta, y Docker Desktop y el navegador se abren a través de `explorer.exe` con los permisos normales de la sesión (`Start-ComoUsuario`). Docker Desktop nunca se lanza elevado.
- Si el proceso pertenece a una cuenta distinta de la dueña del escritorio de la sesión (`explorer.exe`), INSTALAR e INICIAR se detienen (`Assert-CuentaDeSesion`).
- INICIAR y DETENER nunca piden elevación ni usan `Read-Host`, y no modifican `.env`. INICIAR comparte el mutex `Local\NeuroDaticsInstalacion` con INSTALAR.

## Entrega preconfigurada

El `.env` del destino se conserva. No se copia el del repositorio. Para crear una entrega privada preconfigurada en una carpeta nueva:

```powershell
pwsh -NoProfile -File deployment/package.ps1 -Destino C:\Entregas\NeuroDatics -Configuracion C:\Privado\neurodatics.env
```

Con ese `.env`, INSTALAR no pregunta nada. Sin él, pide una vez las dos credenciales de Google. Revisa el destinatario antes de compartir un paquete con `.env`. Para **actualizar** una instalación existente, entrega la carpeta sin `.env`: al extraerla encima, un `.env` nuevo podría sustituir el que guarda la contraseña de su base. No distribuyas una carpeta de generación fallida: solo el mensaje final confirma que se exportaron y verificaron todos los archivos. Distribuye la carpeta completa; no únicamente los BAT.

## El `.env` de la entrega contiene secretos reales

`delivery/NeuroDatics-App/.env` guarda la configuración real de la instalación de esta máquina: la contraseña de PostgreSQL y el secreto JWT, entre otras claves. Coincide con la del repositorio y usa el mismo proyecto Compose (`neurodatics`) y los mismos volúmenes, así que arrancar la entrega aquí sustituye los contenedores del stack de desarrollo, conservando sus datos. Nunca debe viajar en un zip, en un correo ni en una copia del repositorio. Por eso `delivery/` está en `.gitignore`: si alguna vez necesitas compartir el árbol de la entrega, saca ese archivo antes y entrégalo por un canal aparte al responsable.

## Al actualizar desde una versión con `auth_users.json`

Las versiones anteriores guardaban una copia de los usuarios (correo, nombre e identificador de Google) en
`/data/auth_users.json`, dentro del volumen del backend. Ya no se lee ni se escribe: los usuarios están solo en
la base de datos. Tras actualizar, bórrala con los servicios en marcha:

```powershell
docker exec neurodatics-backend-1 rm -f /data/auth_users.json
```

## Verificación

```powershell
# Regresiones del instalador y de INICIAR en PowerShell 5.1, sin instalar software del sistema.
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/tests/instalador.Tests.ps1

# Ensayo real con volúmenes y puerto independientes del stack habitual.
pwsh -NoProfile -File deployment/tests/smoke.ps1
```

Las regresiones simulan Docker, la red y el navegador para cubrir INICIAR sin instalación, con el motor apagado, con imágenes que no coinciden, con la aplicación ya activa, con argumentos RunOnce antiguos y abierto con otra cuenta, además de la migración de carpeta, el acceso directo y la elevación. Ejecutan también `INICIAR.bat -Proyecto` real sobre una carpeta sin instalar.

La prueba de integración comprueba las imágenes, configuración, salud y migraciones de una base nueva, rutas HTTP, que la carpeta instalada solo muestre los lanzadores, la guía y `.env`, y la conservación de datos al detener/iniciar directamente los contenedores. Ejecuta INICIAR real con la aplicación activa, detenida y sin contenedores, y anota cuánto tarda cada caso en `resultado.txt`. No obtiene consentimiento real de Google ni instala WSL/Docker en este equipo. Esas ramas se deben ensayar también en una VM Windows limpia antes de una distribución amplia; ese ensayo sigue pendiente.

`./verify.ps1` no cubre `deployment/`: ejecuta estas dos pruebas aparte cuando cambies el instalador.

Los instaladores se descargan del proveedor al necesitarlos, por lo que una PC nueva necesita Internet. La aplicación ya construida viaja en el paquete. No se requiere publicar imágenes ni dar acceso a un registro Docker.

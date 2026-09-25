# Generar y verificar la entrega

El código fuente del instalador vive en `deployment/` y está versionado. El resultado en `delivery/NeuroDatics-App/` está excluido de Git porque puede contener configuración privada e imágenes grandes.

El mantenedor necesita PowerShell 7, Git y Docker Desktop con contenedores Linux. El usuario final solo necesita Windows PowerShell 5.1, que viene con Windows; el asistente prepara WSL y Docker.

```powershell
pwsh -NoProfile -File deployment/package.ps1
```

Construye desde el árbol de trabajo actual, incluidos cambios sin confirmar. Usa `docker-compose.yml` y su complemento `docker-compose.delivery.yml`, retira las instrucciones de construcción, fija arquitectura linux/amd64 y genera el Compose de entrega. Se exportan cuatro imágenes y un manifiesto con ID, tamaño y SHA256. No se utilizan imágenes antiguas por el mero hecho de tener la misma etiqueta.

El `.env` del destino se conserva. No se copia el del repositorio. Para crear una entrega privada preconfigurada en una carpeta nueva:

```powershell
pwsh -NoProfile -File deployment/package.ps1 -Destino C:\Entregas\NeuroDatics -Configuracion C:\Privado\neurodatics.env
```

Revisa el destinatario antes de compartir un paquete con `.env`. No distribuyas una carpeta de generación fallida: solo el mensaje final confirma que se exportaron y verificaron todos los archivos. Distribuye la carpeta completa; no únicamente los BAT.

## Verificación

```powershell
# Regresiones del instalador en PowerShell 5.1, sin instalar software del sistema.
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/tests/instalador.Tests.ps1

# Ensayo real con volúmenes y puerto independientes del stack habitual.
pwsh -NoProfile -File deployment/tests/smoke.ps1
```

La prueba de integración comprueba las imágenes, configuración, salud y migraciones de una base nueva, rutas HTTP y conservación de datos al detener/iniciar directamente los contenedores como hace Docker Desktop. No obtiene consentimiento real de Google ni instala WSL/Docker en este equipo. Esas ramas se deben ensayar también en una VM Windows limpia antes de una distribución amplia; consulta los resultados registrados en `docs/delivery-handoff.md`.

Los instaladores se descargan del proveedor al necesitarlos, por lo que una PC nueva necesita Internet. La aplicación ya construida viaja en el paquete. No se requiere publicar imágenes ni dar acceso a un registro Docker.

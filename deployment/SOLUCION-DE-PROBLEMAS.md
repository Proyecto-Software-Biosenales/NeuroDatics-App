# Resolver problemas

Puedes repetir `INSTALAR.bat` después de corregir un problema. No borres volúmenes para solucionar un fallo de arranque.

## Al iniciar (INICIAR.bat o el icono del escritorio)

| Mensaje o situación | Qué hacer |
| --- | --- |
| NeuroDatics no está instalado o la instalación quedó incompleta: ejecuta INSTALAR | Abre `INSTALAR.bat` y deja que termine. INICIAR nunca instala nada. Aparece también si la instalación espera un reinicio pendiente. |
| La aplicación cargada en Docker no coincide con esta carpeta | Suele pasar después de recibir una versión nueva de la carpeta. Abre `INSTALAR.bat` una vez para cargarla; después sigue usando INICIAR. |
| Docker Desktop no terminó de encenderse en 4 minutos | Ábrelo desde el menú Inicio y espera a que indique que está en marcha. Si muestra un aviso o una actualización, complétalo. Después abre otra vez INICIAR. |
| Aparece la ventana de Docker Desktop | Es normal la primera vez que se enciende en la sesión. Puedes minimizarla o cerrarla: Docker sigue funcionando en segundo plano. |
| Esta ventana se abrió con otra cuenta de Windows | Ciérrala y abre el archivo con doble clic desde la sesión de la persona que usa NeuroDatics, sin «Ejecutar como otro usuario». |
| NeuroDatics ya se está iniciando o instalando en otra ventana | Espera a que la otra ventana termine. Si no ves ninguna, reinicia la sesión de Windows. |
| Los servicios de NeuroDatics no arrancaron | Abre otra vez INICIAR. Si se repite, revisa el diagnóstico de abajo con el responsable. |
| El puerto 3000 está ocupado | Cierra la otra aplicación que usa ese puerto. Para elegir otro puerto consulta [CONFIGURACION-GOOGLE.md](CONFIGURACION-GOOGLE.md); Google exige redirects coincidentes. |
| Modo Windows containers | En el menú de Docker Desktop selecciona **Switch to Linux containers** y abre otra vez INICIAR. |
| El icono del escritorio no aparece o no abre | Usa `INICIAR.bat` de la carpeta. Repetir `INSTALAR.bat` vuelve a crear el icono. Si moviste la carpeta, repite INSTALAR desde la nueva ubicación. |

## Al instalar (INSTALAR.bat)

| Mensaje o situación | Qué hacer |
| --- | --- |
| Faltan archivos, hash diferente o archivo incompleto | Descarga toda la entrega y extráela fuera del ZIP. Conserva tu `.env`. No mezcles imágenes de versiones diferentes. |
| Windows bloquea el archivo descargado | Verifica que la carpeta procede del responsable del proyecto. En las propiedades del ZIP usa Desbloquear si aparece y extráelo de nuevo. En equipos administrados, solicita la autorización a TI. |
| Virtualización deshabilitada | Activa Intel VT-x/AMD-V en BIOS/UEFI. En una VM habilita virtualización anidada. El instalador no puede cambiar el firmware. |
| Permiso de administrador rechazado | Hace falta para preparar WSL. Alguien con permisos de administrador puede escribir su contraseña en la ventana de Windows; la aplicación queda en tu cuenta. |
| Reinicio necesario | Guarda tu trabajo y reinicia Windows. La instalación continúa sola al iniciar sesión. Si no aparece, abre otra vez `INSTALAR.bat`. No muevas la carpeta entre ambos pasos. |
| No se pudo preparar WSL | Revisa Internet, Windows Update y las restricciones de la organización. Consulta las instrucciones oficiales enlazadas abajo. |
| Docker tarda en arrancar la primera vez | Si su ventana muestra una bienvenida o una encuesta, puedes omitirla. El asistente espera hasta diez minutos. No hace falta iniciar sesión en Docker Hub. |
| Docker instalado en otra ubicación | Se buscan las ubicaciones estándar y el registro de instalación. Si la instalación está incompleta, repárala con el instalador oficial. |
| Google muestra redirect_uri_mismatch | Verifica las dos URI en Google Cloud y utiliza localhost con el puerto configurado. |
| Google rechaza el acceso | El responsable debe revisar las credenciales y qué cuentas pueden usar el proyecto OAuth. |
| Cargar experimentos falla por Drive | Quien administra la instalación debe conectar o renovar la cuenta de Drive con `_internal\scripts\conectar-drive.ps1` (ver CONFIGURACION-GOOGLE.md). La aplicación no ofrece esa opción y la salud de los contenedores no verifica permisos de Google. |
| Error de base de datos | Revisa la configuración conservada de `.env`. Para una base externa comprueba TLS, acceso de red y credenciales con el responsable. |
| Eliminaste los contenedores en Docker Desktop | Abre INICIAR: los vuelve a crear con los volúmenes de datos conservados. |
| Red institucional bloquea descargas | Solicita acceso a los sitios oficiales de Microsoft, GitHub (WSL), Docker y Google. Configura el proxy del sistema/Docker con TI. No desactives la verificación de firmas. |

## Diagnóstico para el responsable

En PowerShell, dentro de la carpeta de la entrega (la que contiene `INSTALAR.bat` y `.env`):

```powershell
# Revisa archivos y requisitos, sin instalar ni iniciar contenedores.
powershell -NoProfile -ExecutionPolicy Bypass -File .\_internal\scripts\instalar.ps1 -SoloComprobar

docker --context desktop-linux compose -p neurodatics --env-file .env -f .\_internal\docker-compose.yml ps
docker --context desktop-linux compose -p neurodatics --env-file .env -f .\_internal\docker-compose.yml logs --tail=100 backend
wsl --version
wsl --status
```

`_internal\instalacion.log` guarda las etapas, no las credenciales. Revisa los registros de servicios antes de compartirlos porque pueden contener información privada. No publiques `.env` ni la salida completa de `docker compose config`.

Al instalar Docker Desktop se aceptan sus condiciones de servicio en nombre de quien instala (lo avisa `LEEME-PRIMERO.txt`). La instalación automática no fuerza reinicios, no cambia la BIOS y no desactiva políticas corporativas. Las dependencias se preparan con los [comandos oficiales de WSL](https://learn.microsoft.com/es-es/windows/wsl/basic-commands); Docker se instala siguiendo su [documentación para Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

# Resolver problemas

Puedes repetir `INSTALAR.bat` después de corregir un problema. No borres volúmenes para solucionar un fallo de arranque.

| Mensaje o situación | Qué hacer |
| --- | --- |
| Faltan archivos, hash diferente o archivo incompleto | Descarga toda la entrega y extráela fuera del ZIP. Conserva tu `.env`. No mezcles imágenes de versiones diferentes. |
| Windows bloquea el archivo descargado | Verifica que la carpeta procede del responsable del proyecto. En las propiedades del ZIP usa Desbloquear si aparece y extráelo de nuevo. En equipos administrados, solicita la autorización a TI. |
| Virtualización deshabilitada | Activa Intel VT-x/AMD-V en BIOS/UEFI. En una VM habilita virtualización anidada. El instalador no puede cambiar el firmware. |
| Permiso de administrador rechazado | Un administrador debe autorizar la preparación de WSL. Después la aplicación se ejecuta con tu usuario habitual. |
| Reinicio necesario | Guarda tu trabajo y reinicia Windows. Se registra una continuación para tu próximo inicio de sesión. Si no aparece, abre otra vez `INSTALAR.bat`. No muevas la carpeta entre ambos pasos. |
| No se pudo preparar WSL | Revisa Internet, Windows Update y las restricciones de la organización. Consulta las instrucciones oficiales enlazadas abajo. |
| Docker tarda en arrancar | Abre su ventana, completa la bienvenida y acepta sus condiciones. El asistente espera hasta diez minutos. No hace falta iniciar sesión en Docker Hub. |
| Modo Windows containers | En el menú de Docker Desktop selecciona **Switch to Linux containers** y repite el instalador. |
| Docker instalado en otra ubicación | Se buscan las ubicaciones estándar y el registro de instalación. Si la instalación está incompleta, repárala con el instalador oficial. |
| Puerto 3000 ocupado | Cierra la otra aplicación. Para elegir otro puerto consulta CONFIGURACION-GOOGLE.md; Google exige redirects coincidentes. |
| Google muestra redirect_uri_mismatch | Verifica las dos URI en Google Cloud y utiliza localhost con el puerto configurado. |
| Google rechaza el acceso | El responsable debe revisar las credenciales y qué cuentas pueden usar el proyecto OAuth. |
| Cargar experimentos falla por Drive | Inicia sesión, abre Configuración y conecta Google Drive. La salud de los contenedores no verifica permisos de Google. |
| Error de base de datos | Revisa la configuración conservada de `.env`. Para una base externa comprueba TLS, acceso de red y credenciales con el responsable. |
| Docker Desktop no muestra neurodatics | Completa `INSTALAR.bat`. Si eliminaste los contenedores, repítelo para recrearlos con los volúmenes conservados. |
| Red institucional bloquea descargas | Solicita acceso a los sitios oficiales de Microsoft, GitHub (WSL), Docker y Google. Configura el proxy del sistema/Docker con TI. No desactives la verificación de firmas. |

## Diagnóstico para el responsable

En PowerShell, dentro de la carpeta de entrega:

```powershell
# Revisa archivos y requisitos, sin instalar ni iniciar contenedores.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\instalar.ps1 -SoloComprobar

docker --context desktop-linux compose --env-file .env -p neurodatics ps
docker --context desktop-linux compose --env-file .env -p neurodatics logs --tail=100 backend
wsl --version
wsl --status
```

`instalacion.log` guarda las etapas, no las credenciales. Revisa los registros de servicios antes de compartirlos porque pueden contener información privada. No publiques `.env` ni la salida completa de `docker compose config`.

La instalación automática no fuerza reinicios, cambia BIOS, desactiva políticas corporativas ni acepta condiciones de Docker en nombre del usuario. Las dependencias se preparan con los [comandos oficiales de WSL](https://learn.microsoft.com/es-es/windows/wsl/basic-commands); Docker se instala siguiendo su [documentación para Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

# Configurar Google una vez

El responsable de la entrega prepara el proyecto de Google y quien administra la instalación elige la cuenta de Google Drive que guarda los archivos. El usuario final solo inicia sesión: la aplicación no le muestra ni le deja cambiar esa cuenta. Un instalador local no puede crear ni autorizar credenciales de otra cuenta.

## Responsable del proyecto

1. En Google Cloud, configura la pantalla de consentimiento OAuth y habilita Google Drive API.
2. Crea un cliente OAuth de tipo **Aplicación web**.
3. Registra estas URI de redirección autorizadas exactamente:
   - `http://localhost:3000/authorize`
   - `http://localhost:3000/api/integrations/google-drive/callback`
4. Completa `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` en `.env` (en la carpeta principal, junto a `INSTALAR.bat`), o entrégalos al usuario para que el asistente los solicite una vez durante la instalación.
5. Autoriza las cuentas que usarán el proyecto según su estado de publicación y las políticas de la organización. Consulta la [guía OAuth de Google](https://developers.google.com/identity/protocols/oauth2/web-server).

No incluyas `.env` en Git ni lo publiques. El generador no copia las credenciales del repositorio automáticamente. Una entrega privada ya configurada puede incluir su propio `.env`.

## Cuenta de Google Drive (solo administradores)

La cuenta de Drive se comparte entre todos los usuarios de esa base de datos y solo se define desde el equipo donde corre NeuroDatics, nunca desde la aplicación. Con NeuroDatics iniciada:

1. En la carpeta de la entrega, abre PowerShell y ejecuta:
   `powershell -ExecutionPolicy Bypass -File _internal\scripts\conectar-drive.ps1`
2. El script muestra la cuenta actual y abre el navegador con el enlace de Google, que caduca en diez minutos. Inicia sesión con la cuenta que guardará los archivos y acepta los permisos.
3. Cuando el navegador diga «Google Drive conectado», la cuenta queda guardada para todos.

Para consultar la cuenta sin cambiarla, añade `-Estado`. Fuera del instalador, el comando equivalente es `docker compose exec backend python -m neurodatics.modules.integrations.google_drive.admin estado` (o `conectar`).

Si ya hay una cuenta conectada, consérvala salvo que quieras sustituirla: la nueva cuenta debe tener acceso a los archivos existentes o los proyectos ya guardados dejarán de abrirse. La autorización se guarda en la base de datos, no en el antiguo `GDRIVE_REFRESH_TOKEN` del `.env`. Si Google la revoca, los usuarios verán un aviso para contactar con quien administra NeuroDatics; repite estos pasos con la misma cuenta. Comprobar la URL de login durante la instalación no sustituye un inicio de sesión real.

## Puerto y base de datos

El puerto predeterminado es 3000. Si está ocupado, cierra la otra aplicación. Si debes cambiarlo, cambia `FRONTEND_PORT`, ambos redirects de Google y `CORS_ALLOWED_ORIGINS` en `.env`, registra las dos nuevas URI en Google Cloud y repite `INSTALAR.bat`. No alternes entre `localhost` y `127.0.0.1` durante la autorización.

`DATABASE_URL` vacío utiliza PostgreSQL local. Para una base compartida, el responsable debe proporcionar la URL PostgreSQL con TLS (`sslmode=require` o una verificación más estricta). No cambies la contraseña de una base ya creada editando únicamente `.env`: PostgreSQL conserva su contraseña original. El instalador conserva toda configuración existente y las migraciones pueden actualizar el esquema de la base seleccionada.

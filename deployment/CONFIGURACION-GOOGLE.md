# Configurar Google una vez

El responsable de la entrega prepara el proyecto de Google. El usuario final solo debe iniciar sesión y autorizar Drive. Un instalador local no puede crear ni autorizar credenciales de otra cuenta.

## Responsable del proyecto

1. En Google Cloud, configura la pantalla de consentimiento OAuth y habilita Google Drive API.
2. Crea un cliente OAuth de tipo **Aplicación web**.
3. Registra estas URI de redirección autorizadas exactamente:
   - `http://localhost:3000/authorize`
   - `http://localhost:3000/api/integrations/google-drive/callback`
4. Completa `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` en `.env`, o entrégalos al usuario para que el asistente los solicite.
5. Autoriza las cuentas que usarán el proyecto según su estado de publicación y las políticas de la organización. Consulta la [guía OAuth de Google](https://developers.google.com/identity/protocols/oauth2/web-server).

No incluyas `.env` en Git ni lo publiques. El generador no copia las credenciales del repositorio automáticamente. Una entrega privada ya configurada puede incluir su propio `.env`.

## Usuario de NeuroDatics

1. Abre la aplicación e inicia sesión con Google.
2. Entra en **Configuración**. Si es necesario, abre `http://localhost:3000/configuracion`.
3. Si Drive no está conectado, pulsa el botón para conectarlo y acepta los permisos en Google.
4. Vuelve a Configuración y comprueba que la conexión se haya guardado. Después podrás cargar experimentos.

La cuenta de Drive se comparte entre los usuarios de esa base de datos. Si ya aparece una cuenta conectada, consérvala salvo que el responsable quiera sustituirla. La autorización se guarda en la base de datos, no en el antiguo `GDRIVE_REFRESH_TOKEN` del `.env`.

El estado de conexión indica que existe una autorización guardada; si Google la revoca, tendrás que volver a conectarla. Comprobar la URL de login durante la instalación no sustituye un inicio de sesión real.

## Puerto y base de datos

El puerto predeterminado es 3000. Si está ocupado, cierra la otra aplicación. Si debes cambiarlo, cambia `FRONTEND_PORT`, ambos redirects de Google y `CORS_ALLOWED_ORIGINS` en `.env`, registra las dos nuevas URI en Google Cloud y repite `INSTALAR.bat`. No alternes entre `localhost` y `127.0.0.1` durante la autorización.

`DATABASE_URL` vacío utiliza PostgreSQL local. Para una base compartida, el responsable debe proporcionar la URL PostgreSQL con TLS (`sslmode=require` o una verificación más estricta). No cambies la contraseña de una base ya creada editando únicamente `.env`: PostgreSQL conserva su contraseña original. El instalador conserva toda configuración existente y las migraciones pueden actualizar el esquema de la base seleccionada.

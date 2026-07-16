# Guia Docker Para Usuarios Principiantes

Esta guia explica como instalar todo lo necesario y dejar NeuroDatics corriendo en tu computador con Docker. Esta pensada para una persona sin experiencia tecnica.

## Que Vas A Instalar

Solo necesitas instalar:

1. Docker Desktop: ejecuta la aplicacion y todos sus servicios.
2. Git: descarga el proyecto desde GitHub.

No necesitas instalar Python, Node.js, PostgreSQL ni Redis. Docker los maneja por dentro.

## Resultado Esperado

Al terminar, podras abrir:

- Aplicacion: `http://localhost:3000`
- Documentacion tecnica de la API: `http://localhost:3000/docs`

En Docker Desktop veras un grupo llamado `neurodatics`. Al expandirlo, el servicio `frontend` mostrara el puerto `3000:3000`; ese puerto es el que se puede abrir con click.

## Parte 1: Instalar Docker Desktop

### Windows

1. Abre esta pagina: https://www.docker.com/products/docker-desktop/
2. Haz click en Download for Windows.
3. Abre el instalador descargado.
4. Si el instalador pregunta por WSL 2, deja esa opcion activada.
5. Termina la instalacion.
6. Reinicia el computador si Docker lo pide.
7. Abre Docker Desktop desde el menu Inicio.
8. Espera hasta que diga que Docker esta corriendo.

Si Windows pide instalar o actualizar WSL 2:

1. Acepta la instalacion.
2. Reinicia el computador.
3. Abre Docker Desktop otra vez.

### macOS

1. Abre https://www.docker.com/products/docker-desktop/
2. Descarga Docker Desktop para Mac.
3. Abre el archivo descargado.
4. Arrastra Docker a Applications.
5. Abre Docker Desktop y espera a que termine de iniciar.

### Linux

Instala Docker Engine y Docker Compose siguiendo la guia oficial de tu distribucion. Para usuarios no tecnicos se recomienda usar Windows o macOS con Docker Desktop.

## Parte 2: Instalar Git

### Windows

1. Abre https://git-scm.com/download/win
2. Descarga Git for Windows.
3. Abre el instalador.
4. Puedes dejar las opciones por defecto.
5. Termina la instalacion.

### macOS

1. Abre Terminal.
2. Escribe:

```bash
git --version
```

3. Si macOS pide instalar Command Line Tools, acepta.

### Alternativa Sin Git

Si no quieres instalar Git:

1. Abre el repositorio en GitHub.
2. Haz click en Code.
3. Haz click en Download ZIP.
4. Descomprime el ZIP.
5. Abre una terminal dentro de la carpeta descomprimida.

Para actualizar la app en el futuro, Git es mas comodo que descargar ZIP otra vez.

## Parte 3: Descargar NeuroDatics

1. Abre una terminal.

En Windows, abre el menu Inicio, busca PowerShell y abre Windows PowerShell.

2. Ve a la carpeta donde quieres guardar el proyecto. Ejemplo:

```powershell
cd "$HOME\Desktop"
```

3. Descarga el proyecto:

```bash
git clone https://github.com/Proyecto-Software-Biosenales/NeuroDatics-App.git
```

4. Entra a la carpeta:

```bash
cd NeuroDatics-App
```

## Parte 4: Crear El Archivo De Configuracion

Docker Compose lee un archivo llamado `.env` en la carpeta principal del proyecto.

1. Copia el ejemplo:

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

En macOS/Linux:

```bash
cp .env.example .env
```

2. Abre el archivo `.env` con un editor de texto.

En Windows puedes usar Notepad:

```powershell
notepad .env
```

3. Guarda el archivo cuando termines.

Importante: no compartas el archivo `.env`. Puede contener secretos de Google.

## Parte 5: Configurar Google OAuth Para Login Real

Para usar la app de verdad, necesitas login con Google. Sin esto la app puede abrir, pero las funciones protegidas no funcionaran correctamente.

### Crear Proyecto En Google Cloud

1. Abre https://console.cloud.google.com/
2. Inicia sesion con tu cuenta de Google.
3. En la parte superior, abre el selector de proyectos.
4. Haz click en New Project.
5. Escribe un nombre, por ejemplo `NeuroDatics Local`.
6. Haz click en Create.
7. Asegurate de estar dentro del proyecto nuevo.

### Configurar Pantalla De Consentimiento

1. En Google Cloud, busca APIs & Services.
2. Entra a OAuth consent screen.
3. Elige External si es una cuenta personal o de pruebas.
4. Completa los campos obligatorios:
   - App name: NeuroDatics
   - User support email: tu correo
   - Developer contact information: tu correo
5. Guarda y continua.
6. En Test users, agrega el correo de Google con el que iniciaras sesion.
7. Guarda.

### Crear Credenciales OAuth

1. En Google Cloud, entra a APIs & Services.
2. Entra a Credentials.
3. Haz click en Create Credentials.
4. Elige OAuth client ID.
5. En Application type, elige Web application.
6. En Name, escribe `NeuroDatics Local`.
7. En Authorized JavaScript origins agrega:

```text
http://localhost:3000
```

8. En Authorized redirect URIs agrega estas dos URLs:

```text
http://localhost:3000/authorize
http://localhost:3000/api/integrations/google-drive/callback
```

9. Haz click en Create.
10. Copia el Client ID y el Client Secret.

### Pegar Credenciales En .env

Abre `.env` y completa:

```text
GOOGLE_OAUTH_CLIENT_ID=pega-aqui-tu-client-id
GOOGLE_OAUTH_CLIENT_SECRET=pega-aqui-tu-client-secret
```

No agregues comillas. El frontend no necesita una variable `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; ahora pide al backend la URL de login de Google cuando el usuario hace click.

## Parte 6: Configurar Google Drive

NeuroDatics usa Google Drive para guardar archivos de proyectos.

### Habilitar Google Drive API

1. En Google Cloud, entra a APIs & Services.
2. Entra a Library.
3. Busca Google Drive API.
4. Abre Google Drive API.
5. Haz click en Enable.

### Carpeta Raiz Opcional

Puedes usar una carpeta especifica de Google Drive como raiz:

1. Abre Google Drive.
2. Crea una carpeta, por ejemplo `NeuroDatics`.
3. Abre esa carpeta.
4. Copia el ID desde la URL.

Ejemplo de URL:

```text
https://drive.google.com/drive/folders/1AbCDefG...
```

El ID es la parte despues de `/folders/`.

5. Pega ese ID en `.env`:

```text
GDRIVE_FOLDER_ID=pega-aqui-el-id-de-la-carpeta
```

### Conectar Drive

Cuando Docker ya este corriendo:

1. Abre esta URL:

```text
http://localhost:3000/api/integrations/google-drive/authorize
```

2. El navegador mostrara un texto con `authorization_url`.
3. Copia la URL larga que aparece despues de `authorization_url`.
4. Pegala en la barra del navegador y presiona Enter.
5. Acepta los permisos de Google Drive.
6. Google volvera a NeuroDatics y veras una respuesta indicando `connected: true`.

Hasta que exista una pantalla visual de integraciones, este paso es manual.

## Parte 7: Iniciar La App Con Docker

1. Asegurate de que Docker Desktop este abierto.
2. En la terminal, dentro de la carpeta `NeuroDatics-App`, ejecuta:

```bash
docker compose up -d
```

La primera vez puede tardar varios minutos. Docker descargara imagenes publicadas, creara la base de datos y ejecutara migraciones.

## Parte 8: Abrir La App

Opcion A: desde el navegador:

```text
http://localhost:3000
```

Opcion B: desde Docker Desktop:

1. Abre Docker Desktop.
2. En Containers, busca `neurodatics`.
3. Expande el grupo `neurodatics`.
4. Busca el servicio `frontend`.
5. Haz click en el puerto `3000:3000`.

Es normal que la fila principal `neurodatics` muestre `-` en Ports. Esa fila es solo el grupo. El puerto clicable esta en `frontend`.

## Parte 9: Iniciar Sesion

1. Abre `http://localhost:3000`.
2. Haz click en Continuar con Google.
3. Usa el correo que agregaste como test user en Google Cloud.
4. Si Google muestra advertencia de app en pruebas, continua solo si estas usando tu propio proyecto de Google Cloud.

El login local `DEV_ADMIN` es solo una ayuda de desarrollo para el frontend. No reemplaza el login Google para usar endpoints protegidos del backend.

## Parte 10: Revisar Que Todo Este Bien

En Docker Desktop, los servicios deberian verse como running o healthy:

- `db`
- `redis`
- `backend`
- `worker`
- `frontend`

Tambien puedes abrir:

```text
http://localhost:3000/docs
```

Si Swagger carga, el proxy frontend-backend esta funcionando.

## Comandos Utiles

### Detener La App

```bash
docker compose down
```

### Iniciar Otra Vez

```bash
docker compose up -d
```

### Aplicar Cambios De .env

Usa esto si cambiaste Google OAuth, Drive, puerto o configuracion importante:

```bash
docker compose up -d
```

### Ver Logs

```bash
docker compose logs -f
```

### Ver Logs Solo Del Backend

```bash
docker compose logs -f backend
```

### Borrar Todos Los Datos Locales

Esto elimina base de datos, usuarios locales y caches de Docker:

```bash
docker compose down -v
```

Usalo solo si quieres empezar desde cero.

### Actualizar El Proyecto Con Git

```bash
git pull
docker compose pull
docker compose up -d
```

Si quieres usar una version fija, cambia `NEURODATICS_VERSION` en `.env`, por ejemplo `NEURODATICS_VERSION=v1.2.3`, antes de ejecutar `docker compose pull`.

## Problemas Comunes

### Docker Desktop No Inicia

1. Reinicia el computador.
2. Abre Docker Desktop otra vez.
3. En Windows, revisa que WSL 2 este instalado si Docker lo solicita.

### Puerto 3000 Ocupado

Si Docker dice que el puerto `3000` ya esta en uso:

1. Abre `.env`.
2. Cambia:

```text
FRONTEND_PORT=3100
```

3. Aplica el cambio:

```bash
docker compose up -d
```

4. Abre:

```text
http://localhost:3100
```

Si cambias el puerto para login Google, tambien debes agregar las URLs con ese puerto en Google Cloud.

### Docker Desktop Muestra "-" En El Puerto

Es normal en la fila padre `neurodatics`. Expande el grupo y abre el puerto del servicio `frontend`.

### Solo Aparece Un Grupo Llamado "backend"

Si Docker Desktop muestra solo un grupo llamado `backend` y no aparece el grupo `neurodatics`, se ejecuto Docker desde la carpeta incorrecta o con una configuracion backend-only.

Para corregirlo:

1. En Docker Desktop, detén y elimina el grupo `backend`.
2. Abre una terminal en la carpeta principal `NeuroDatics-App`, no dentro de `backend`.
3. Verifica que en esa carpeta existan `frontend`, `backend` y `docker-compose.yml`.
4. Ejecuta:

```bash
docker compose up -d
```

El grupo correcto se llama `neurodatics` y debe mostrar los servicios `frontend`, `backend`, `worker`, `db` y `redis`.

### redirect_uri_mismatch En Google

Esto significa que Google no reconoce la URL de retorno.

Revisa en Google Cloud que existan exactamente estas URLs:

```text
http://localhost:3000/authorize
http://localhost:3000/api/integrations/google-drive/callback
```

Si usas otro puerto, cambia `3000` por tu puerto real.

### La Sesion Expira

El token actual dura 14 dias por defecto. Si la sesion expira:

1. Cierra sesion.
2. Inicia sesion con Google otra vez.

### Google Drive No Esta Conectado

Si al crear o editar proyectos aparece un error de Drive:

1. Confirma que Google Drive API este habilitada.
2. Confirma que `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` esten en `.env`.
3. Abre:

```text
http://localhost:3000/api/integrations/google-drive/status
```

4. Si dice `connected: false`, repite el paso de conectar Drive.

### Cambie .env Pero No Se Refleja

Ejecuta:

```bash
docker compose up -d
```

### Quiero Empezar Desde Cero

```bash
docker compose down -v
docker compose up -d
```

## Nota Para Usuarios Tecnicos

El stack recomendado usa Docker Compose con servicios separados:

- `frontend`
- `backend`
- `worker`
- `db`
- `redis`

`frontend` publica el puerto `3000` y `backend` publica el puerto `8000`. La app usa `http://localhost:3000/api` para solicitudes normales y `http://localhost:8000` para subidas largas de proyectos.

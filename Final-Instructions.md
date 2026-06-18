# Instrucciones Finales: Poner NeuroDatics En Marcha

Esta es la guia mas corta para dejar la app funcionando. Recibiras por interno una
carpeta ya configurada (incluye `docker-compose.yml` y un archivo `.env` con todo
completo). No necesitas programar, ni clonar nada, ni crear cuentas. Solo instalar
Docker Desktop y ejecutar un comando.

## Resumen (3 Pasos)

1. Instalar Docker Desktop.
2. Copiar la carpeta que te pasaron y abrir una terminal dentro de ella.
3. Ejecutar un comando para arrancar y abrir `http://localhost:3000`.

## Lo Que Recibes Por Interno

Una carpeta (o un ZIP) que contiene al menos:

- `docker-compose.yml`
- `.env` (ya completo, con los secretos de Google y la configuracion)
- `frontend/`
- `backend/`
- `Final-Instructions.md`

Importante:

- Manten el `.env` en la misma carpeta que `docker-compose.yml` y no lo renombres.
- No compartas el `.env` con nadie: contiene secretos.
- No borres las carpetas `frontend/` ni `backend/`. Sirven como respaldo si Docker
  no puede descargar las imagenes publicadas.

## Paso 1: Instalar Docker Desktop

### Windows (10 u 11)

1. Abre https://www.docker.com/products/docker-desktop/
2. Haz click en "Download for Windows".
3. Abre el instalador descargado (`Docker Desktop Installer.exe`).
4. En las opciones del instalador deja marcado:
   - "Use WSL 2 instead of Hyper-V" (recomendado).
   - "Add shortcut to desktop" (opcional).
5. Haz click en "Ok" / "Install" y espera a que termine.
6. Reinicia el computador si Docker lo pide.
7. Abre "Docker Desktop" desde el menu Inicio.
8. Si aparece el acuerdo de servicio, haz click en "Accept".
9. Si te pide iniciar sesion o crear una cuenta de Docker, puedes OMITIRLO
   ("Skip" / "Continue without signing in"). No hace falta cuenta para usar la app.
10. Espera hasta que el indicador de abajo a la izquierda este en verde y diga
    "Engine running".

Si Windows pide instalar o actualizar WSL 2:

1. Acepta la instalacion.
2. Reinicia el computador.
3. Abre Docker Desktop otra vez y espera a que diga "Engine running".

### macOS

1. Abre https://www.docker.com/products/docker-desktop/
2. Descarga la version para tu Mac (Apple Silicon o Intel, segun tu equipo).
3. Abre el archivo `.dmg` y arrastra Docker a "Applications".
4. Abre Docker Desktop, acepta el acuerdo y, si te pide cuenta, puedes omitirlo.
5. Espera a que diga que Docker esta corriendo.

## Paso 2: Colocar La Carpeta Del Proyecto

1. Si te llego como ZIP, descomprimelo (click derecho -> "Extraer todo").
2. Guarda la carpeta en un lugar comodo, por ejemplo el Escritorio.
3. Abre la carpeta y confirma que dentro estan `docker-compose.yml` y `.env`.

Nota: Windows oculta las extensiones por defecto. El archivo de configuracion debe
llamarse exactamente `.env`, no `.env.txt`.

## Paso 3: Abrir Una Terminal En Esa Carpeta

En Windows 11:

1. Entra a la carpeta del proyecto.
2. Haz click derecho en un espacio vacio dentro de la carpeta.
3. Elige "Abrir en Terminal" ("Open in Terminal").

Se abrira una terminal ya ubicada en la carpeta correcta.

En Windows 10: abre PowerShell desde el menu Inicio y escribe `cd ` seguido de la
ruta de la carpeta, por ejemplo:

```powershell
cd "$HOME\Desktop\NeuroDatics-App"
```

## Paso 4: Arrancar La App

En la terminal, escribe este unico comando y presiona Enter:

```bash
docker compose up -d
```

La primera vez Docker construira las imagenes de NeuroDatics desde las carpetas
`frontend/` y `backend/`. Esto puede tardar varios minutos porque descarga
dependencias de Node.js y Python dentro de Docker.

Luego Docker creara la base de datos y aplicara las migraciones automaticamente.

Cuando el comando termine, los servicios siguen iniciando unos segundos mas.
Espera alrededor de 1 minuto antes de abrir la app.

## Paso 5: Abrir La App

Abre en tu navegador:

```text
http://localhost:3000
```

Si ves un error en el primer intento, espera unos segundos y refresca: el backend
puede estar terminando de iniciar. Para confirmar que todo conecta, puedes abrir
`http://localhost:3000/docs`; si carga, el sistema esta listo.

Tambien puedes abrir la app desde Docker Desktop:

1. Abre Docker Desktop -> "Containers".
2. Expande el grupo `neurodatics`.
3. En el servicio `frontend`, haz click en el puerto `3000:3000`.

Es normal que la fila padre `neurodatics` muestre `-` en la columna de puertos.
El puerto clicable esta en el servicio `frontend`.

## Paso 6: Iniciar Sesion

1. En `http://localhost:3000`, haz click en "Continuar con Google".
2. Inicia sesion con la cuenta de Google autorizada para el proyecto.
3. Acepta los permisos.

El acceso con Google ya viene configurado en el `.env` que te entregaron.

## Uso Diario

Detener la app (libera memoria; los datos se conservan):

```bash
docker compose down
```

Volver a arrancarla:

```bash
docker compose up -d
```

Atajo sin terminal: despues de la primera vez, en Docker Desktop puedes usar los
botones Start / Stop del grupo `neurodatics`.

## Actualizar A Una Version Nueva (Opcional)

Cuando te avisen que hay una version nueva, normalmente recibiras una carpeta o ZIP
actualizado. Cierra la app anterior y usa la carpeta nueva:

```bash
docker compose down
```

Luego abre la carpeta nueva y ejecuta:

```bash
docker compose up -d
```

Si el responsable confirma que las imagenes de GHCR ya son publicas y te entrega un
paquete liviano, tambien puedes actualizar desde la misma carpeta con
`docker compose pull` y luego `docker compose up -d`.

## Problemas Comunes

La app no carga al abrir `http://localhost:3000`

- Espera 1 a 2 minutos despues de `docker compose up -d` y refresca. La primera vez
  tarda mas porque descarga imagenes y prepara la base de datos.

"port is already allocated" o el puerto 3000 esta ocupado

- Abre el `.env`, cambia `FRONTEND_PORT=3000` por `FRONTEND_PORT=3100`, guarda y
  ejecuta `docker compose up -d`. Luego abre `http://localhost:3100`.

Error al descargar imagenes ("denied", "unauthorized" o "pull access denied")

- Estas instrucciones son para el paquete actualizado, que no descarga las imagenes
  privadas de GHCR. Si ves ese error, probablemente tienes un ZIP anterior.
- Pide el ZIP actualizado y confirma que la carpeta tenga `frontend/`, `backend/`,
  `docker-compose.yml` y `.env`.

Docker pide iniciar sesion o crear cuenta

- No es necesario. Puedes omitir el inicio de sesion de Docker.

Quiero empezar de cero (borra base de datos y datos locales)

```bash
docker compose down -v
docker compose up -d
```

Para detalles de Google OAuth, Google Drive y mas resolucion de problemas, revisa la
guia completa en `docs/DOCKER_USER_GUIDE.md`.

---

## Apendice A: Solo Para El Responsable Del Proyecto (Una Sola Vez)

Para que los usuarios NO tengan que iniciar sesion en GitHub ni usar tokens, las
imagenes de Docker deben ser PUBLICAS. Hoy estan privadas. Haz esto una sola vez:

1. Entra a https://github.com/orgs/Proyecto-Software-Biosenales/packages
2. Abre el paquete `neurodatics-frontend`.
3. En la barra derecha, haz click en "Package settings".
4. Baja hasta "Danger Zone" -> "Change visibility".
5. Elige "Public", confirma escribiendo el nombre del paquete y guarda.
6. Repite los pasos 2 a 5 con el paquete `neurodatics-backend`.

Las imagenes de PostgreSQL y Redis ya son publicas; no requieren ninguna accion.

Para verificar que quedaron publicas, abre de nuevo
https://github.com/orgs/Proyecto-Software-Biosenales/packages y confirma que ambos
paquetes muestran la etiqueta "Public".

## Apendice B: Como Preparar La Carpeta De Entrega (Responsable)

La carpeta o ZIP que entregas por interno necesita estos archivos en la raiz:

- `docker-compose.yml` (tal cual esta en el repositorio).
- `.env` (basado en `.env.example`, con los secretos de Google ya completos).
- `frontend/` (sin `node_modules`, `.next`, `.env.local` ni caches).
- `backend/` (sin `.venv`, `.env`, `data` ni caches).
- `Final-Instructions.md` (recomendado, para que la persona tenga esta guia a mano).

Para esta entrega, copia `docker-compose.delivery.yml` como `docker-compose.yml`
dentro del ZIP. Ese compose usa imagenes locales (`neurodatics-*:delivery`) y no
intenta descargar `ghcr.io/proyecto-software-biosenales/*`.

Cuando ambos paquetes GHCR sean publicos y verificados, puedes entregar una version
liviana sin `frontend/` ni `backend/`.

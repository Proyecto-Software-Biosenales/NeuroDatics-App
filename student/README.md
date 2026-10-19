# NeuroDatics Estudiantes: construcción y comprobaciones

La edición de estudiantes es el backend en `APP_MODE=local`, congelado con PyInstaller junto a un PostgreSQL 16
embebido, ffmpeg y la aplicación web como exportación estática (`frontend/`) que el propio backend sirve. El
código de ejecución vive en el backend (`backend/src/neurodatics/local/`); esta carpeta contiene solo lo que
construye y comprueba el paquete.

| Archivo | Qué es |
| --- | --- |
| `requirements.txt` | Dependencias directas, fijadas a las versiones con que corren las pruebas del backend. Sin bibliotecas de Google. |
| `requirements-frozen.txt` | `pip freeze` del entorno de construcción que produjo el paquete probado. |
| `check-pins.py` | Falla si una versión difiere del entorno probado (`.venv`) o del entorno de construcción. |
| `build.ps1` | Compila la aplicación web (`NEXT_PUBLIC_APP_MODE=local`, salida en `frontend/.next-local`, copiada a `<Work>/frontend`) y congela `src/student_entry.py` en `<Work>/dist/neurodatics-estudiantes`. |
| `run-frozen.ps1` | Ensambla la carpeta del paquete (PostgreSQL, plantilla, ffmpeg y web dentro de `_internal`, sin baterías de pruebas, cabeceras, bibliotecas de enlace ni los programas gráficos y de prueba de PostgreSQL) y ejecuta sobre ella las comprobaciones de abajo. |
| `check-pe-imports.py` | Comprueba que cada binario de PostgreSQL encuentre las DLL que importa dentro del paquete. |
| `package.ps1` | Añade la guía (junto al exe) y los avisos (en `_internal`), oculta `_internal`, comprime el paquete en `<Work>/release/`, escribe `SHA256.txt` y `package-report.json`, arranca la aplicación desde el zip extraído (ruta con acentos, perfil vacío) y prepara `delivery\`. |
| `LEEME.txt` | La guía del estudiante, que viaja en el paquete. Se edita aquí, nunca en el paquete. |
| `make-notices.py` | Escribe `THIRD-PARTY-NOTICES.txt` a partir del entorno de construcción, `frontend/package.json` y el ffmpeg que de verdad está en `tools\`. |
| `laptop-test.ps1` | Se ejecuta en un portátil de prueba (Windows PowerShell 5.1): datos de la máquina, un experimento real por la aplicación, muestreo de memoria y conexiones, y un zip para devolver. |
| `src/` | El punto de entrada congelado y las comprobaciones que lleva dentro: `selftest`, `pg-check`, `pg-adopt`, `http-check`. |

## Construir y comprobar

La compilación web necesita Node con los `node_modules` del frontend instalados (si están vacíos, `npm ci` en
`frontend`). La parte de navegador de la comprobación `serve` necesita Chromium una vez:
`cd frontend; npx playwright install chromium`.

Las entradas viven en `<Work>` (por defecto `output/student`, ignorado por Git): un `build-venv` creado desde
`requirements-frozen.txt`, `tools/` (`ffmpeg.exe`, `ffprobe.exe`), las carpetas `bin`/`lib`/`share` del zip de
PostgreSQL 16 de EDB (`pgsql/`, o `-PgSource`), una plantilla de clúster (`pg-template`, creada con
`initdb -A trust -U postgres -E UTF8 --locale=C` **desde una ruta ASCII**; mejor fuera de `%TEMP%`, que Windows
puede vaciar) y `data/saio-raw.zip`, un ZIP de experimento crudo con imágenes y un vídeo (datos privados, nunca
en el repositorio).

```powershell
student\build.ps1 -Work output\student
student\run-frozen.ps1 -Work output\student -Assemble -TemplateSource output\student\pg-template
student\run-frozen.ps1 -Work output\student            # todas las comprobaciones, o -Only selftest|pg|serve|race
```

La evidencia queda en `<Work>/frozen-results/` (`selftest.json`, `pg-check.json`, `http-check.json`,
`browser.out.txt`, `serve-evidence.json`). Las comprobaciones:

- **selftest**: ingesta, analítica, informes y medios reales dentro del ejecutable congelado. Falla con un
  resultado vacío, dimensiones de medios nulas, una fixture sin vídeo o sin imágenes, o cualquier intento de
  conexión fuera de loopback; la guarda que hace esto último se demuestra antes en vivo dentro del ejecutable.
- **pg**: copia de la plantilla, contraseña de loopback, migraciones, bloqueo consultivo, fusión JSONB, parada
  limpia, recuperación tras un cierre abrupto, adopción de un servidor ya en marcha y una primera copia
  interrumpida.
- **serve**: la aplicación real en un perfil nuevo y vacío, bajo la guarda sin conexión y un muestreador de
  conexiones TCP, recorrida dos veces. Primero por sus rutas HTTP con un ZIP real (web servida desde el mismo
  origen, sesión, subida, analítica, medios, informe y borrado). Después en un Chromium real cuya resolución de
  nombres está desactivada para todo lo que no sea loopback (`frontend/tests/local/student-offline.spec.ts`): sin
  pantallas de cuenta ni de Drive, las fuentes, la subida de la carpeta del experimento por el asistente, sus
  imágenes, la analítica y el borrado del proyecto, fallando ante cualquier petición que salga de la máquina.
- **race**: dos arranques en el mismo instante sobre un mismo directorio de datos.

Las rutas contienen a propósito acentos y espacios. Nada de esto sustituye a la prueba en un portátil limpio y sin
red (abajo).

## Empaquetar y entregar

```powershell
student\package.ps1 -Work output\student -Version <versión>
student\run-frozen.ps1 -Work output\student -Pkg "<release-check\...\NeuroDatics Estudiantes>" -Only serve   # opcional: la comprobación completa sobre el zip extraído
```

`<versión>` es la del zip actual en `delivery/` más uno en el último número. Para dar por bueno un paquete no basta
el código de salida: en el log de `run-frozen.ps1` el navegador debe decir `passed` (no `failed`), debe haber 0
conexiones fuera de loopback y no deben quedar procesos de PostgreSQL. La versión, el SHA-256 del zip y las
comprobaciones que pasaron se anotan en `docs/CHANGELOG.md`. `delivery/` solo lo escribe `package.ps1`.

El paquete que abre el estudiante muestra dos archivos y nada más:

```text
NeuroDatics Estudiantes\
    neurodatics-estudiantes.exe
    LEEME.txt
    _internal\          oculto: Python, pgsql\, pg-template\, tools\, frontend\, THIRD-PARTY-NOTICES.txt
```

`run-frozen.ps1 -Assemble` coloca las piezas dentro del `_internal` de PyInstaller y el lanzador las encuentra con
`sys._MEIPASS` (`neurodatics.local.launcher.package_dir`; una carpeta con `pgsql` junto al exe también sirve).
`package.ps1` marca `_internal` como oculto en la carpeta y en el zip («Extraer todo» del Explorador lo
conserva), y el lanzador lo vuelve a ocultar al arrancar si un extractor perdió el atributo.

`package.ps1` crea `delivery\NeuroDatics-Estudiantes\` (ignorado por Git, junto al `delivery\NeuroDatics-App` de
la edición servidor) con la carpeta del programa, y deja al lado el zip como
`delivery\NeuroDatics-Estudiantes-<versión>-win64.zip`, retirando los anteriores (`-NoDelivery` omite este paso).
Los archivos del mantenedor quedan en `<Work>\release`: el zip, `SHA256.txt`, `laptop-test.ps1` y
`package-report.json`, cuyo `release_blockers` enumera lo que ningún script puede resolver. Un arranque con doble
clic (sin argumentos) que falla muestra el error, escribe `logs\launcher-errors.log` en el directorio de datos y
espera a que se pulse Enter; los arranques con argumentos (todas las comprobaciones) nunca esperan.

### Prueba en un portátil

Lo único que ninguna comprobación de esta máquina puede cubrir es un portátil de estudiante real: SmartScreen,
Smart App Control, el antivirus, un equipo sin herramientas de desarrollo y poca memoria. El procedimiento:
subir el zip a Drive y descargarlo **desde Drive en el portátil**; comparar `Get-FileHash` con `SHA256.txt`;
extraer con el Explorador; seguir `LEEME.txt` anotando cada paso que no sea cierto en esa máquina; activar el modo
avión; abrir `neurodatics-estudiantes.exe` anotando el aviso de SmartScreen exacto; subir un experimento crudo,
abrir el tablero, un informe, una imagen y un vídeo; y ejecutar `laptop-test.ps1`, que reúne los datos de la
máquina y devuelve un zip con el resultado.

## La aplicación web en modo local

`frontend/next.config.mjs` devuelve una configuración de exportación estática cuando
`NEXT_PUBLIC_APP_MODE=local` (la compilación de servidor no cambia). `build.ps1` falla si la exportación contiene
un valor de `frontend/.env*` o una referencia a una fuente remota o a un script de Google. A mano:

```powershell
cd frontend
$env:NEXT_PUBLIC_APP_MODE = 'local'; npx next build      # escribe frontend/.next-local
```

La misma prueba de navegador se ejecuta contra cualquier aplicación local en marcha, incluida una arrancada desde
el código:

```powershell
$env:STUDENT_BASE_URL = 'http://neurodatics.localhost:8765'
$env:STUDENT_RAW_FOLDER = '<carpeta de un experimento crudo>'   # datos privados; sin ella se omite el flujo completo
npx playwright test -c playwright.local.config.ts
```

## Ejecutar desde el código (sin congelar)

```powershell
cd backend
$env:PYTHONPATH = 'src'
..\.venv\Scripts\python.exe -m neurodatics.local --pkg <carpeta con pgsql, pg-template, tools, frontend> --data-dir <dir> --no-browser
```

`pg-adopt` continúa el directorio de datos que dejó un `pg-check --leave-running` anterior. `--help` lista las
opciones (`--port`, `--offline-guard`, `--exit-after`, `--stop-file`).

## Por qué está construido así

Cada decisión está en el código que describe (`backend/src/neurodatics/local/`, `student/*.ps1`) y existe porque
una opción más simple se probó o se descartó.

**El mismo PostgreSQL 16, embebido, en lugar de una base de datos más ligera.** El SQL de la aplicación no es
portable: el bloqueo de mutación de proyectos es un bloqueo consultivo de PostgreSQL, los tokens de
transformación de la analítica se fusionan con el operador JSONB `||` y un tercio de las migraciones nombran
tipos de PostgreSQL. Otro motor obligaría a reescribir todo eso y volver a demostrarlo contra los goldens, así que
la edición de estudiantes lleva la compilación de EDB del mismo servidor como segundo proceso y el código de la
aplicación no cambia. Las migraciones se ejecutan en cada arranque, por eso una migración no puede usar una
extensión que el zip de EDB no traiga.

**El clúster se copia de una plantilla; nunca se crea en la máquina del estudiante.** `initdb` falla desde una
ruta con caracteres no ASCII, y la carpeta de usuario de un estudiante bien puede tenerlos. `pg-template` se
construye aparte desde una ruta ASCII y se copia en el primer arranque. La copia se arma con un nombre
`.building` y se renombra al final, así que un primer arranque interrumpido no deja nada que parezca un clúster;
el renombrado espera y reintenta, porque un antivirus o el indexador de búsqueda pueden seguir sujetando los
archivos recién copiados. El clúster queda protegido antes de aceptar ninguna conexión: una contraseña aleatoria
fijada con el servidor detenido y un `pg_hba.conf` con solo loopback y `scram-sha-256`. El servidor arranca
siempre en UTC, sea cual sea la zona horaria de la plantilla, y la disponibilidad se sondea con `pg_isready` en
lugar de fiarse de `pg_ctl -w`, porque un `postmaster.pid` rancio informa éxito mientras empieza la recuperación.

**Un servidor en marcha se adopta, no se combate.** Un lanzador que murió deja su postmaster en marcha. El
siguiente arranque lee el archivo de pid, lo acepta solo si es un `postgres.exe` vivo de nuestra propia carpeta
`bin` (los pid se reutilizan y la máquina puede tener otros servidores), toma el puerto del archivo y continúa con
ese servidor. Un segundo arranque sobre el mismo directorio de datos tampoco inicia un segundo servidor: el
bloqueo de instancia hace que abra la aplicación que ya corre y salga.

**Todo vive en el perfil del usuario, no junto al programa.** Una carpeta extraída en Descargas o en el
Escritorio suele sincronizarla OneDrive, y sincronizar un directorio de base de datos vivo lo corrompe, así que la
raíz de datos es `%LOCALAPPDATA%\NeuroDatics Estudiantes` (`--data-dir` la cambia). El coste es deliberado y está
en la guía: borrar la carpeta extraída del programa no borra los proyectos del estudiante.

**La web es una exportación estática que sirve el propio backend.** Un solo origen significa sin CORS, sin
segundo puerto y sin proxy: las páginas llaman a `/api/...` en la dirección desde la que se cargaron. El sitio se
monta el último para que cada ruta de la API gane a su comodín, y delante se resuelven dos detalles de la
exportación en Windows: la ruta de colección que la aplicación pide sin barra final, y la precarga de datos de
página de Next, que una exportación en Windows escribe en una carpeta anidada.

**Todo escucha en 127.0.0.1, y no hay inicio de sesión.** El puerto de la aplicación se reserva en loopback antes
de arrancar el servidor, para que ningún otro programa lo tome entretanto, y PostgreSQL arranca con
`listen_addresses=127.0.0.1`. Sin cuentas, lo único que impide que otra página web maneje la API es que un
navegador no puede nombrar un `Host` de loopback que no es suyo ni enviar un `Origin` distinto de aquel desde el
que se sirvió: el modo local rechaza ambos. La guarda sin conexión es la otra mitad de la promesa, y es una
comprobación, no una defensa: rechaza y registra cada conexión fuera de loopback que intenta el proceso,
enganchando el módulo `socket` y el `sock_connect` de asyncio en las dos clases de bucle, porque el bucle por
defecto de Windows conecta con `ConnectEx` y nunca llama a `socket.connect`. No ve a ffmpeg, a Typst ni a otros
procesos, así que las comprobaciones también muestrean la tabla de conexiones del sistema operativo. En modo local
las rutas de Google ni siquiera se importan, la caché es en proceso (no hay Redis que pueda caerse) y los archivos
pasan por el cliente de almacenamiento local, así que no queda nada que quiera la red.

**Congelado con PyInstaller en un directorio, y todo viaja dentro de `_internal`.** El estudiante ve
`neurodatics-estudiantes.exe` y `LEEME.txt`; PostgreSQL, su plantilla, ffmpeg, la web y los avisos están en la
carpeta del propio ejecutable, que el lanzador encuentra con `sys._MEIPASS` y vuelve a ocultar al arrancar.
ffmpeg viaja porque el sondeo de estímulos busca `ffprobe` en el `PATH`, que el lanzador apunta a la carpeta
`tools` incluida; el runtime de Visual C++ viaja junto a `pgsql\bin` porque los binarios de PostgreSQL lo
necesitan y la máquina de un estudiante puede no tenerlo. `-Assemble` copia un juego coherente (`msvcp140*.dll`,
`vcruntime140*.dll`) de la carpeta de redistribuibles de Visual Studio y pasa `check-pe-imports.py` sobre cada
binario de PostgreSQL: la máquina de construcción tiene el runtime en System32, así que una DLL que falte solo se
nota en un Windows limpio. La aplicación también se niega a ejecutarse con privilegios de administrador, con un
mensaje, porque PostgreSQL no arranca con un token de administrador.

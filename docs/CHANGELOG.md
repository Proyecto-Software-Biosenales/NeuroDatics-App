# Cambios de NeuroDatics

Qué cambia en la aplicación, versión a versión, contado para quien la usa. Las entradas nuevas van arriba,
bajo **Sin publicar**, y pasan a una versión al entregarla.

## Sin publicar

### Fijaciones con el tamaño de pantalla y un parpadeo

- **Un parpadeo ya no hace fallar la subida.** Con el tamaño de pantalla en centímetros (sin distancia
  escrita) y una exportación cuya rejilla es más rápida que la mirada, cualquier tramo sin mirada dejaba sin
  distancia la casilla remuestreada y la detección angular abortaba el CSV entero. Ahora solo se exige
  distancia donde hay mirada válida; las casillas perdidas siguen sin clasificarse.
- **Pruebas:** `test_angular_resampling_survives_a_blink_without_typed_distance` en
  `test_fixation_v2_pipeline.py` (falla sin el cambio).

### Paquete NeuroDatics 2.2

`delivery/NeuroDatics-2.2-win64.zip` (252,0 MiB, 4076 archivos), SHA-256
`C999D7A8187FD16921F6C2033C6DA81D96F5203AE47D736BD27A3C2FCE31AAE6`, compilado el 28 de octubre sobre `6a1c06d`
más el arreglo del parpadeo en modo angular (sin confirmar aún). Reemplaza al paquete 2.1. `run-frozen.ps1`:
selftest, las etapas del PostgreSQL embebido, pg-adopt, http-check y la carrera de dos arranques correctos;
navegador 8/8 `passed`; 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído en una ruta
con tildes arranca en 10,7 s. Siguen abiertos los 3 bloqueos de publicación. Antes de compilar, `verify.ps1` en
verde (1293 pruebas del backend, 3 contratos de importación; ESLint: 0 errores, 6 avisos).

### Perfiles

- **La primera vez, NeuroDatics pide crear un perfil**: solo el nombre, que aparece arriba a la derecha en
  lugar de «Investigador». Al pulsarlo, «Cambiar de perfil» lleva a la lista de perfiles del computador, donde
  se abre otro, se crea uno nuevo o se elimina uno.
- **Cada perfil tiene sus propios proyectos.** El primer perfil que se crea se queda con los proyectos que ya
  había. La configuración de pantalla es del computador y la comparten todos.
- **Eliminar un perfil borra de este computador todos sus proyectos**, con sus archivos, tras la misma doble
  confirmación que eliminar un proyecto. Si uno de ellos se está procesando, no se elimina nada más y lo dice.
- **Pruebas:** `test_local_profiles.py` y `test_local_mode.py` (backend) y `student-offline.spec.ts` (crear el
  primer perfil, proyectos separados, cambiar de perfil y eliminar uno con su proyecto).

### Paquete NeuroDatics 2.1

`delivery/NeuroDatics-2.1-win64.zip` (252,0 MiB, 4076 archivos), SHA-256
`6BA89DC5D0BC98406C03592FF108FCD280DE4957093A80F5EFD32CF103A7D610`, compilado el 27 de octubre sobre `4433397`
más el cambio a una sola edición y los perfiles (sin confirmar aún). Reemplaza al paquete 2.0. `run-frozen.ps1`:
selftest, las etapas del PostgreSQL embebido, pg-adopt, http-check 11/11 (ahora crea un perfil y lo elimina con su
proyecto) y la carrera de dos arranques correctos; navegador 8/8 `passed`; 0 conexiones fuera de loopback; 0
procesos postgres al salir. El zip extraído en una ruta con tildes arranca en 14,8 s, pide un perfil y emite la
sesión al crearlo. Siguen abiertos los 3 bloqueos de publicación. Antes de compilar, `verify.ps1` en verde (1292
pruebas del backend, 3 contratos de importación; ESLint: 0 errores, 6 avisos).

### NeuroDatics 2.0: una sola edición, para el investigador

- **«NeuroDatics Estudiantes» pasa a llamarse NeuroDatics**, y el menú de arriba a la derecha dice
  «Investigador». El programa es `neurodatics.exe`, el zip `NeuroDatics-<versión>-win64.zip` y los proyectos se
  guardan en `%LOCALAPPDATA%\NeuroDatics`. El programa no busca la carpeta antigua
  (`%LOCALAPPDATA%\NeuroDatics Estudiantes`): quien ya la tenga debe cambiarle el nombre, con la app cerrada,
  para seguir viendo sus proyectos. `LEEME.txt` ya no habla de estudiantes ni de docentes.
- **La edición en red (Docker, Google, Drive) queda sin uso.** No se puede mantener gratis: necesita una base de
  datos, un servicio de identificación y un almacenamiento en la nube. El código se conserva y cada archivo
  exclusivo de esa edición lo dice en su primera línea. La nueva guía
  [tecnica/alojamiento-en-red.md](tecnica/alojamiento-en-red.md) explica qué debe proveer quien quiera alojarla
  y dónde se conecta cada pieza, y `.env.example` marca esos huecos como «DEBES PROVEER». La entrega de Windows
  con Docker (`delivery/NeuroDatics-App`) ya no se genera.
- **Documentación:** README, CONTRIBUTING, `docs/`, `backend/`, `frontend/` y `student/` describen la edición
  local como la que se entrega. Los manuales en PDF se actualizan aparte.

### Paquete NeuroDatics 2.0

`delivery/NeuroDatics-2.0-win64.zip` (251,9 MiB, 4066 archivos), SHA-256
`70E391B8F4F5CD5606171AC761B100E9B0C63EF69354126E491348108744BDEF`, compilado el 27 de octubre sobre `4433397`
más el cambio a una sola edición (sin confirmar aún). Reemplaza al paquete de estudiantes 1.20. `run-frozen.ps1`:
selftest, las etapas del PostgreSQL embebido, pg-adopt, http-check y la carrera de dos arranques correctos;
navegador 7/7 `passed` (incluido «Investigador» en la cabecera); 0 conexiones fuera de loopback; 0 procesos
postgres al salir. El zip extraído en una ruta con tildes arranca en 8,2 s. Siguen abiertos los 3 bloqueos de
publicación. Antes de compilar, `verify.ps1` en verde (1273 pruebas del backend; ESLint: 0 errores, 6 avisos).

### «Responder cuestionario» desde cada cuestionario

- **Nuevo botón bajo «Agregar pregunta»**, del mismo tamaño, en «Antes del experimento» y «Después del
  experimento». Abre la toma de respuestas ya en ese cuestionario, así que solo pide el participante. El botón de
  la pestaña «Respuestas» sigue preguntando por los dos. Como allí, espera a que se guarden los cambios y lo dice.
- **Pruebas:** `pre-experiment.test.mjs` (fase fija, sin elegir cuestionario, bloqueo con cambios sin guardar),
  `tests/e2e/questionnaire-answer.spec.ts` (mismo ancho y alto que «Agregar pregunta» a 1536 y 390 px, sin
  desplazamiento horizontal) y `student-offline.spec.ts` (respuesta guardada en la base local).

### Guía de procesamiento y correcciones de cálculo

- **Nueva guía en PDF** para investigadores, estudiantes y profesores:
  [manuales/NeuroDatics-Guia-de-procesamiento.pdf](../manuales/NeuroDatics-Guia-de-procesamiento.pdf) (versión
  1.1). Explica cómo se limpian, calculan y resumen las señales, con todos los parámetros, y qué recalcular si el
  objetivo del estudio es otro.
- **Pupila en «Comparativas»:** los instantes en que se pierde un ojo quedan en blanco y no cuentan en las cifras,
  como en la pestaña de pupila. Antes se dibujaban y se promediaban como 0 mm.
- **Tarjetas de punto de mirada:** con «Eje Y», las tarjetas, la línea de la media, el mínimo y el máximo
  marcados y el valor del instante elegido son los del eje Y. Antes eran siempre los del X.
- **Distancia:** un valor de 0 o negativo es una pérdida del ojo y ya no entra en la gráfica ni en las cifras de
  la distancia, de la distancia por área de interés ni de las correlaciones. El detector de fijaciones ya lo
  hacía.
- **Cifras sin datos:** si el tramo elegido no tiene ninguna muestra válida, la pupila, el punto de mirada, la
  distancia y el sensor galvánico muestran «—» en lugar de 0, y ese participante ya no cuenta como 0 en el
  «Promedio» de un grupo.
- **Mapa de recorridos:** dos fijaciones separadas por un corte de tramo del detector (más de 75 ms sin datos o
  una muestra fuera del estímulo) ya no se unen con una línea, en el tablero ni en el informe. La tarjeta
  «Distancia» ya no sumaba ese salto. La respuesta de `/scanpath` lleva `segment_id` en cada recorrido.
- **Informe del sensor galvánico:** el eje cuenta desde el inicio del escenario, como dice su rótulo y como los
  demás informes; antes contaba desde la primera muestra del sensor.
- **Metodología de los informes:** el Pico % se escribe con |base|, como se calcula; la potencia relativa del EEG
  se divide entre la suma de las bandas que pudieron calcularse, no «de las cinco», y la figura del sensor
  galvánico ya no llama «reposo» a la base.
- **Código del participante:** en archivos separados por comas o tabuladores, las celdas vacías del final de la
  línea «Grabación» ya no se pegan al código (`P01,,,` pasa a ser `P01`). Solo afecta a carpetas procesadas de
  nuevo.
- **Pruebas:** `test_lost_samples_and_empty_figures.py` cubre lo anterior. Dos líneas base protegidas cambian a
  propósito, revisadas línea a línea: la instantánea de forma de `/comparison/charts` (las filas de pupila pueden
  traer `null`) y el resumen numérico del informe ejecutivo (pupila derecha de los datos sintéticos: 1600 → 1580
  puntos, media +0,00005 mm; mínimo y máximo iguales).

### Manuales en PDF, a la vista

- **Nueva carpeta `manuales/`** en la raíz del repositorio, con el manual de uso y las guías de instalación de la
  edición servidor y de NeuroDatics Estudiantes, en PDF. El README y `docs/README.md` los enlazan.
- **Retirado el manual anterior:** la carpeta `manual/` (fuentes en Markdown, figuras, capturas y scripts de
  construcción) y las pruebas que generaban sus figuras (`frontend/tests/manual/`, `playwright.manual.config.ts` y
  `npm run capture:manual`). Paquete de estudiantes no reconstruido: nada de esto viaja en él.

### «Superposición» y «Promedio»: varios participantes en una sola gráfica

- **Dos opciones nuevas en el selector de participante**, bajo «Varios participantes». «Superposición» dibuja a
  los participantes elegidos uno encima de otro, cada uno con su color; «Promedio» dibuja su media y muestra
  como cifras el promedio de las cifras de cada uno. El desplegable «Participantes (n de N)» elige a quién
  incluir. Cómo funciona y cómo se calcula: [usuario/superposicion-y-promedio.md](usuario/superposicion-y-promedio.md).
- **Vistas:** pupila, punto de mirada, distancia, sensor galvánico y EEG por canal (las dos opciones, curva media
  con banda de ±1 desviación estándar); densidad espectral (las dos, media en potencia lineal); espectrograma y
  topografía (promedio); mapa de calor (fijaciones de cada participante, o el mapa del grupo); mapa de
  recorridos (superposición); comparativa AOIs (las dos). El histograma de fijaciones y «Comparativas» no las
  admiten y lo dicen.
- **Mapa de calor del grupo:** nueva ruta `GET /analytics/heatmap/group`, con el mismo suavizado y color que el
  mapa individual; cada participante pesa lo mismo.
- **Corrección de paso:** en punto de mirada, distancia y sensor galvánico, la columna «Media» de la tabla y de
  las tarjetas mostraba la mediana; ahora muestra la media.
- **Escenarios de vídeo:** mapa de calor, mapa de recorridos, comparativa AOIs, punto de mirada, distancia,
  «Comparar participantes» y «Comparativas» se dibujan sobre un fotograma del vídeo (el mismo que muestra «Ver
  proyecto»), con un participante o con varios. Antes pedían el vídeo como imagen, el servidor respondía con un
  error y la vista individual se quedaba cargando.
- **Líneas enteras:** una muestra perdida suelta (un parpadeo) ya no corta la línea de un participante ni la
  curva media; solo una pérdida larga de señal deja un hueco. Antes, con datos reales, cada línea salía en muchos
  trozos y la ayuda emergente de un instante listaba solo a parte de los participantes; ahora lista a todos los
  que tienen dato ahí.
- **Nombres repetidos:** si dos o más participantes tienen el mismo nombre visible, llevan detrás su código, por
  ejemplo «232 (P07)», en la leyenda, la ayuda emergente, la tabla y el desplegable «Participantes».
- **«Todos los escenarios» en las vistas de tiempo:** pupila, punto de mirada, distancia, sensor galvánico, EEG
  por canal y espectrograma admiten ya las dos opciones sin elegir escenario. Cada participante se cuenta desde el
  inicio de su propia grabación (el sensor galvánico, desde su primera muestra de GSR), y la ficha «Tiempo de
  grabación» avisa de que el mismo segundo puede corresponder a estímulos distintos. Topografía, mapa de calor,
  mapa de recorridos y comparativa AOIs siguen pidiendo un escenario concreto.
- **Eje de tiempo:** las marcas del eje ya no muestran «-0».
- **Cifras promedio también en «Superposición»:** las tarjetas sobre la gráfica muestran el promedio de los
  participantes elegidos en las dos opciones (antes solo en «Promedio»; el mapa de recorridos y la comparativa
  AOIs también las tienen ahora), y la tabla de estadísticas empieza siempre por la fila «Promedio (n
  participantes)».
- **Estímulo en un instante del grupo:** en pupila, punto de mirada, distancia, sensor galvánico y EEG por canal,
  un clic en la gráfica de «Superposición» o «Promedio» muestra el estímulo con el punto de mirada de cada
  participante en su color. Antes la tarjeta del estímulo desaparecía en estas opciones.
- **Tabla de estadísticas sin cifras repetidas:** en pupila, punto de mirada, distancia y sensor galvánico, la
  tarjeta «Estadísticas» ya no repite encima de la tabla los cuatro recuadros de media, mínimo, máximo y pico,
  que ya estaban en la tabla y en las tarjetas de arriba.

### Paquete de estudiantes 1.20

`delivery/NeuroDatics-Estudiantes-1.20-win64.zip` (252 MiB, 4066 archivos), SHA-256
`C405738215B86388A867F0E9F81CD0867CE5F2D2530EF28F331A1B153231ED03`, compilado el 27 de octubre sobre `131e075`
más «Responder cuestionario» desde cada cuestionario (sin confirmar aún). Reemplaza a la 1.19. `run-frozen.ps1`:
selftest, las etapas del PostgreSQL embebido, pg-adopt y http-check correctos; navegador 7/7 `passed` (incluida la
respuesta tomada desde el cuestionario y guardada en la base local); 0 conexiones fuera de loopback; 0 procesos
postgres al salir. El zip extraído en una ruta con tildes arranca en 10,4 s. Siguen abiertos los 3 bloqueos de
publicación. Antes de compilar, `verify.ps1` en verde (ESLint: 0 errores, 6 avisos).

### Paquete de estudiantes 1.19

`delivery/NeuroDatics-Estudiantes-1.19-win64.zip` (252 MiB, 4066 archivos), SHA-256
`872D9AC2B3AA2943C7CBD23C37EB1462C0C9C3DE8787C99180EB5A9A84AF4CF8`, compilado el 27 de octubre sobre `7c694e8`
más las correcciones de cálculo de «Guía de procesamiento y correcciones de cálculo» (sin confirmar aún).
Reemplaza a la 1.18. `run-frozen.ps1`: selftest, las etapas del PostgreSQL embebido y http-check correctos;
navegador 7/7 `passed`; 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído en una ruta
con tildes arranca en 8,5 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg, prueba en un
portátil real, datos de participantes). Antes de compilar, `verify.ps1` en verde: backend (1273 pruebas, 25
snapshots), unidad del frontend, navegador, Ruff, Vulture, deptry, contratos de importación y ESLint (0 errores, 6
avisos); además, la suite E2E completa (73 pruebas).

### Paquete de estudiantes 1.18

`delivery/NeuroDatics-Estudiantes-1.18-win64.zip` (252 MiB, 4066 archivos), SHA-256
`AF94ED22FAC3C151C71CCEB2B8EFDB4E72D34757F968E480B1E1FD6DBF723D97`, compilado el 25 de octubre tras `f885fb1`
con las cifras promedio también en «Superposición», el estímulo en un instante del grupo y la tabla de
estadísticas sin los cuatro recuadros repetidos. Reemplaza a la 1.17. `run-frozen.ps1`: selftest, las ocho etapas
del PostgreSQL embebido, pg-adopt, http-check y carrera de arranques correctos; navegador 7/7 `passed` (el flujo
completo hace ahora clic en la gráfica de «Promedio» y comprueba la tarjeta del estímulo); 0 conexiones fuera de
loopback; 0 procesos postgres al salir. El zip extraído en una ruta con tildes arranca en 10,1 s. Siguen abiertos
los 3 bloqueos de publicación (licencia de ffmpeg, prueba en un portátil real, datos de participantes). Antes de
compilar, `verify.ps1` en verde: backend (1267 pruebas, 25 snapshots), unidad del frontend, navegador, Ruff,
Vulture, deptry, contratos de importación y ESLint (0 errores, 6 avisos de 6); además, la suite E2E completa
(73 pruebas, entre ellas una nueva del clic sobre la gráfica de grupo).

### Paquete de estudiantes 1.17

`delivery/NeuroDatics-Estudiantes-1.17-win64.zip` (252 MiB, 4066 archivos), SHA-256
`7538BB8984A76B81B76E0159406F50E5B312D968973872FE51B9F52D28125E9F`, compilado el 24 de octubre tras `3fef9cf`
con las líneas enteras, los nombres repetidos distinguidos y «Todos los escenarios» en los modos de grupo.
Reemplaza a la 1.16. `run-frozen.ps1`: selftest, las ocho etapas del PostgreSQL embebido, pg-adopt, http-check y
carrera de arranques correctos; navegador 7/7 `passed` (el flujo completo pasa ahora también por «Promedio» con
«Todos los escenarios»); 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído en una
ruta con tildes arranca en 9,8 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg, prueba en un
portátil real, datos de participantes). Antes de compilar, `verify.ps1` en verde: backend (1267 pruebas, 25
snapshots), unidad del frontend (155), navegador (76), Ruff, Vulture, deptry, contratos de importación y ESLint
(0 errores, 6 avisos de 6); además, 31 pruebas E2E de los modos de grupo y «Comparar participantes».

### Paquete de estudiantes 1.16

`delivery/NeuroDatics-Estudiantes-1.16-win64.zip` (252 MiB, 4066 archivos), SHA-256
`EAC307051A5C57DC6FDF283DB7EBC29CE852D5430F4F263D64543E33DE9A5B55`, compilado el 24 de octubre tras `c528d79`
con «Superposición» y «Promedio» y los escenarios de vídeo. Reemplaza a la 1.15. `run-frozen.ps1`: selftest, las
ocho etapas del PostgreSQL embebido, pg-adopt, http-check y carrera de arranques correctos; navegador 7/7
`passed` (el flujo completo ahora pasa también por «Promedio», el mapa de calor del grupo y «Superposición»);
0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído en una ruta con tildes arranca en
7,6 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg, prueba en un portátil real, datos de
participantes). Antes de compilar, `verify.ps1` en verde: backend (1267 pruebas, 25 snapshots), unidad del
frontend (148), navegador (76), Ruff, Vulture, deptry, contratos de importación y ESLint (0 errores, 6 avisos de
6); además, las 36 pruebas E2E de los modos de grupo, «Comparar participantes» y «Comparativas».

### Manual de uso en Word (primera versión para revisión)

Nuevo manual de uso de las dos ediciones (13 capítulos, 43 figuras con datos de demostración), escrito en
`manual/fuentes/` y construido con `manual/construir_manual.js`; cómo regenerarlo está en `manual/README.md`. Se
revisó contra el código, por estilo, página por página y siguiendo sus procedimientos en la interfaz con la API
simulada (161 de 167 pasos completados al pie de la letra; los 6 restantes se corrigieron en el texto). Las figuras
salen de `frontend/tests/manual/manual_figures.spec.ts`, que ya no deja avisos de ESLint. Paquete de estudiantes no
reconstruido: el cambio solo toca pruebas de `frontend/tests/manual/` y archivos de `manual/`, que no viajan en él.

### Paquete de estudiantes 1.15

`delivery/NeuroDatics-Estudiantes-1.15-win64.zip` (252 MiB, 4067 archivos), SHA-256
`375DBFDF904F906771228207141BDEAC0C80E8A6D9ACDA884BF349F4D827AB91`, compilado el 21 de octubre tras `7b55ac6`
con los cambios de la 1.14 y la escala común P1–P99 de «Comparar participantes». Reemplaza a la 1.14.
`run-frozen.ps1`: selftest, las ocho etapas del PostgreSQL embebido, pg-adopt, http-check y carrera de arranques
correctos; navegador 7/7 `passed`; 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído
en una ruta con tildes arranca en 9,5 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg,
prueba en un portátil real, datos de participantes). Antes de compilar: backend (1252 pruebas), unidad del
frontend (125), navegador (76), TypeScript, Ruff, Vulture, deptry, contratos de importación y las 10 pruebas E2E
de «Comparar participantes», en verde. `verify.ps1` no queda en verde por ESLint: 9 avisos frente al tope de 6,
los mismos de la 1.14 (3 imports sin usar de `frontend/tests/manual/manual_figures.spec.ts`, archivo sin
seguimiento del trabajo del manual); este cambio no añade ninguno.

### Paquete de estudiantes 1.14

`delivery/NeuroDatics-Estudiantes-1.14-win64.zip` (252 MiB, 4067 archivos), SHA-256
`F9732D1726F8AEFC6E81CD3D7E63D64C31B37C8DE45B06C99E3A6EFF42C4A753`, compilado el 21 de octubre tras `7b55ac6`
con los cambios de «Ajustar más ceñido y µV como unidad fija del EEG». Reemplaza a la 1.13. `run-frozen.ps1`:
selftest, las ocho etapas del PostgreSQL embebido, pg-adopt, http-check y carrera de arranques correctos;
navegador 7/7 `passed`; 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído en una ruta
con tildes arranca en 10,4 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg, prueba en un
portátil real, datos de participantes). Antes de compilar: backend (1252 pruebas), unidad del frontend (124),
navegador (76), TypeScript y las pruebas E2E de «Ajustar», en verde. ESLint queda con 9 avisos frente al tope
de 6: los 6 de siempre y 3 imports sin usar de `frontend/tests/manual/manual_figures.spec.ts`, archivo sin
seguimiento del trabajo del manual.

### Paquete de estudiantes 1.13

`delivery/NeuroDatics-Estudiantes-1.13-win64.zip` (252 MiB, 4067 archivos), SHA-256
`0D29744D608EA371D6CB53106ABE542837EBAB68784DF850DCFBA78B078EE2A8`, compilado el 21 de octubre tras `fb2373a`.
Reemplaza a la 1.12 (sin publicar) y añade las correcciones de la revisión final: la limpieza de la caché de
vídeo al arrancar y la lista de correos permitidos aplicada a las sesiones abiertas. `run-frozen.ps1`: selftest,
las ocho etapas del PostgreSQL embebido, pg-adopt, http-check y carrera de arranques correctos; navegador 7/7
`passed`; 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído en una ruta con tildes
arranca en 10,1 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg, prueba en un portátil real,
datos de participantes).

### Paquete de estudiantes 1.12

`delivery/NeuroDatics-Estudiantes-1.12-win64.zip` (252 MiB, 4067 archivos), SHA-256
`47EBA169CB2CB3298A3D9EFE99D3A0858AB2C2DAF3E2661D0D238094762A9580`, compilado el 20 de octubre tras `8f8154f`:
incluye todo lo que sigue en esta sección (también «Ajustar» y el aviso de escenario, que no estaban en la 1.11).
`run-frozen.ps1`: las ocho etapas del PostgreSQL embebido, selftest, pg-adopt, http-check y carrera de arranques
correctos; navegador 7/7 `passed`; 0 conexiones fuera de loopback; 0 procesos postgres al salir. El zip extraído
en una ruta con tildes arranca en 9,8 s. Siguen abiertos los 3 bloqueos de publicación (licencia de ffmpeg,
prueba en un portátil real, datos de participantes).

### «Comparar participantes»: la escala común ya no la estira un artefacto

- **Señales en el tiempo (pupila, mirada, distancia, sensor galvánico y EEG por canal):** «Escala común» ya no
  va del mínimo al máximo de todos los participantes seleccionados, sino del percentil 1 al 99 de todos sus
  puntos dibujados, juntos (cada punto pesa lo mismo). Un pico suelto de un participante ya no aplana las
  gráficas de los demás; lo que queda fuera del rango se corta en el borde, y la nota de la comparación lo dice.
  «Escalas propias» y la vista de un solo participante no cambian.
- **Densidad espectral, histograma de fijaciones, espectrograma y topografía** siguen con el rango completo:
  en la densidad espectral el percentil 99 cortaría justo el pico de baja frecuencia, que es lo que se compara.

### «Ajustar» más ceñido y µV como unidad fija del EEG

- **«Ajustar» se ciñe a los datos con un decimal de margen.** Antes llevaba el eje a los valores redondos que
  envolvían la gráfica (en la pupila, al milímetro entero: 2,9–3,98 mm quedaba en 2–4); ahora cada extremo se
  redondea hacia fuera un decimal por debajo del orden del rango (2,8–4,0 mm) y siempre deja un margen pequeño
  para que la línea no toque el borde. Las marcas del eje siguen siendo valores redondos dentro de ese rango.
  Igual en dilatación pupilar, punto de mirada, distancia al dispositivo, sensor galvánico y densidad espectral.
- **EEG: µV es la unidad fija mientras las exportaciones no declaren ninguna.** Desaparecen el aviso «Unidad
  EEG no declarada», la etiqueta «uV supuesto» de la calidad por canal, la tarjeta «Unidades EEG con salvedades»
  y su botón «Volver a procesar» cuando ese era el único motivo, y la limitación equivalente de la metodología
  del informe. La suposición sigue registrada en `assumed_uV_channels`; los avisos de reescalado (`kilo`, `mV`,
  `V`) y de canales excluidos por unidad ambigua se mantienen.

### Seguridad y fallos

- **Estudiantes:** la aplicación ya no intenta abrir rutas de red (`\\equipo\carpeta`) que lleguen en la
  dirección de una página. Antes, una web visitada con NeuroDatics abierto podía hacer que Windows enviara la
  identidad del estudiante a otro equipo.
- **Estudiantes:** la caché de vídeos y fotogramas se guarda en la carpeta de datos de NeuroDatics y se limpia
  al arrancar y después de cada subida. Antes crecía sin límite en `C:\data\video_cache` y
  `C:\data\video_frame_cache`, que quien venga de una versión anterior puede borrar a mano.
- **Servidor:** nueva opción `AUTH_ALLOWED_EMAILS` para decidir qué cuentas de Google pueden entrar (vacía =
  todas, como hasta ahora). Vale también para las sesiones ya abiertas: quitar un correo de la lista lo deja
  fuera sin esperar a que caduque su sesión. `deployment/CONFIGURACION-GOOGLE.md` recomienda además dejar la app de Google en modo
  de prueba con las cuentas del laboratorio.
- **Servidor:** Next.js 16.4.2, que corrige varios fallos de seguridad del servidor web.
- Un proyecto ajeno responde «no encontrado» antes de reservarse: nadie puede bloquear la edición de un proyecto
  que no es suyo.
- Los errores de Google ya no se muestran tal cual, y ni el registro de la aplicación ni el de accesos del servidor
  guardan los parámetros de las direcciones (códigos de participante, código de autorización de Drive).
  Los errores internos y las secciones de informe que fallan dejan en el registro dónde fallaron, sin datos del
  participante.
- Renombrar un proyecto con carpeta en Drive ya no congela el servidor mientras responde Google.
- Si la lista de proyectos no se puede cargar, se muestra solo el aviso de error. Ya no se guarda una copia de la
  lista en el navegador, que otro usuario del mismo equipo podía ver.

### Limpieza del repositorio

- Se retiró código sin uso del backend y del frontend, y dos rutas que nadie llamaba (`PUT
  /api/projects/{id}/scenaries` y `DELETE /api/projects/{id}/files/experiment-zip`): la colocación del estímulo
  viaja con la subida y el ZIP se reemplaza subiéndolo de nuevo. `route_inventory.json` pasa de 52 a 50
  operaciones por este motivo.
- Se retira `auth_users.json` y la variable `AUTH_USER_STORE_PATH`: los usuarios viven solo en la base de datos.
  Al actualizar un servidor, el archivo antiguo se borra como indica `deployment/MANTENIMIENTO.md`.
- El servidor instala las mismas versiones de pyarrow (25) y Pillow (12) con las que se prueba la aplicación.
- Un solo manual de usuario, `manual/manual_usuario_neurodatics.md`, al día con la interfaz; capturas
  regeneradas con `npm run capture:manual` (fuera de las pruebas e2e). El PDF se genera según `manual/README.md`
  y se entrega como adjunto, fuera de git.
- La documentación técnica refleja que Google Drive se administra solo desde el servidor. La entrega del
  servidor ya no trae scripts para Linux.
- Pruebas: `verify.ps1` en verde (1248 pruebas del backend, 25 snapshots sin regenerar, ESLint 0/6) y 50 pruebas
  e2e.

### Un solo aviso para «Selecciona un escenario específico»

- **Las gráficas que necesitan un escenario concreto muestran el mismo aviso con «Todos los escenarios»:** un
  icono de cursor y una frase, «Selecciona un escenario específico para visualizar …». Antes cada vista tenía
  el suyo (llama, chincheta, solo texto). Llega al mapa de calor, el mapa de recorridos y la comparativa de
  AOIs (vista individual y Comparativas), a las correlaciones entre señales y a «Comparar participantes»
  cuando la gráfica no se puede comparar sin escenario.
- La comparativa de AOIs ya no repite el aviso como descripción: muestra la misma que con un escenario.
- El componente compartido vive en `features/analytics/components/AnalyticsMessageSurface.tsx`.
- Pruebas: `verify.ps1` en verde; `comparison-dashboard`, `participant-comparison` y `ui-consistency` pasan;
  revisado en pantalla a 1536×730 y a 390 px con la API simulada.

### «Ajustar» en más gráficas de líneas

- **El botón «Ajustar» de la dilatación pupilar llega a la respuesta galvánica, la distancia al dispositivo,
  el punto de mirada y la densidad espectral del EEG.** Acerca el eje vertical a los valores de la gráfica en
  lugar de empezar en cero, con marcas redondas. Como con las dos pupilas, la señal suavizada y la cruda de la
  GSR, y los ejes X e Y de la mirada, fijan juntos la escala, así que cambiar de modo no la mueve; en la
  densidad espectral cuentan los canales visibles.
- No se añade donde no aplica: el histograma de fijaciones y la comparativa de AOI son barras que deben
  empezar en cero, y la señal EEG por canal y las tarjetas de «Comparar participantes» ya ajustan su eje a los
  datos.
- Pruebas: `features/analytics/fittedAxis.test.mjs` (escala ajustada) y `tests/e2e/fit-axis.spec.ts` (las
  cuatro gráficas a 1536×730 y 390 px, sin desplazamiento horizontal); la prueba sin conexión de estudiantes
  pulsa «Ajustar» en la GSR. `verify.ps1` en verde.
- Llega a los estudiantes con el paquete 1.12 (y la 1.13).

### Mirada: pérdidas del ojo y su rampa

- **Una pérdida del ojo ya no se dibuja como una caída hacia 0.** El Tobii escribe la pérdida como `(0,0)` y
  su exportador añade una rampa hacia 0 de un periodo nativo a cada lado. La ingesta marca esas muestras de
  rampa (dos periodos nativos, ≈ 33 ms a 60 Hz, alrededor de cada pérdida) como `signal_transition` y deja la
  mirada en blanco; un hueco largo llega al navegador como `null` y la gráfica corta la línea. Afecta al punto
  de mirada, la comparación, las AOI, las correlaciones y el informe.
- **La mirada se limpia una sola vez, al procesar la carpeta** (columnas `gaze_x_clean`, `gaze_y_clean` del
  Parquet), con el mismo proceso de antes: rango, parpadeo por pupila, velocidad, interpolación de hasta 150 ms
  desde cada lado y suavizado. Antes se limpiaba en cada consulta, así que el mismo instante cambiaba con el
  zoom; ahora vale lo mismo en cualquier ventana. Con ubicación del estímulo se limpia en coordenadas del
  estímulo (antes no se suavizaba). Las fijaciones no cambian: el detector usa la máscara sin el margen.
- **Un proyecto procesado antes de este cambio muestra «Actualizar proyecto» en rojo** en su tarjeta y no
  tiene punto de mirada (no hay cálculo de respaldo). Se crea de nuevo con la misma carpeta.
- **Pupila:** un diámetro de 0 o negativo (se vio −0,75 mm) ya no cuenta como medida en la serie ni en sus
  estadísticas.
- **Comparación:** el TTFF de la tabla de AOI se mide desde el inicio del escenario, como en el resto de
  vistas, y se muestra en segundos.
- Pruebas: los goldens numéricos no cambian; el snapshot del esquema del Parquet gana las dos columnas
  nuevas, añadidas a mano (no regenerado). Las pruebas de la limpieza en consulta se reescribieron sobre las
  columnas limpias.
- **Paquete de estudiantes 1.11** (`delivery/NeuroDatics-Estudiantes-1.11-win64.zip`, SHA-256
  `4E1C5DC3B411003F2FA2319684755C37757BBE07D18381746E09F38A5718518B`), compilado con `verify.ps1` en verde.
  `run-frozen.ps1`: selftest, pg-check, pg-adopt, http-check y carrera de arranques correctos; navegador 7/7
  `passed` (incluye que un proyecto recién procesado no pide actualizarse); 0 conexiones fuera de loopback; 0
  procesos postgres al salir. Siguen abiertos los 3 bloqueos de publicación de la 1.10. El árbol de trabajo
  llevaba también los cambios aún sin commit de Configuración y Google Drive y del eje de la pupila, así que el
  paquete los incluye.

### Configuración y Google Drive

- **La cuenta de Google Drive que guarda los archivos ya no se ve ni se cambia desde la aplicación.**
  Configuración solo muestra la pantalla. La definen los administradores en el equipo donde corre NeuroDatics:
  `_internal\scripts\conectar-drive.ps1` en la instalación con Docker (o
  `python -m neurodatics.modules.integrations.google_drive.admin estado|conectar` dentro del backend). El
  instalador avisa si aún no hay cuenta. Ver `deployment/CONFIGURACION-GOOGLE.md`.
- **El backend tampoco la expone:** se retiraron `GET /api/integrations/google-drive/connection` y
  `/authorize`, con los que cualquier usuario con sesión podía sustituir la cuenta compartida. Solo queda
  `/callback`, que acepta únicamente el enlace firmado y con caducidad que emite el comando de administración.
  `backend/tests/fixtures/route_inventory.json` pierde esas dos rutas por este motivo.
- Si Drive falla al guardar un proyecto, el aviso pide contactar con quien administra NeuroDatics en lugar de
  «Vuelve a conectar Google Drive».
- La edición de estudiantes no cambia: ya no mostraba Drive. El paquete de estudiantes 1.11 ya se compiló con
  este cambio en el árbol de trabajo. `verify.ps1` en verde (1231 pruebas del backend).

### Dashboard

- **El eje de la dilatación pupilar va de 0 al primer milímetro entero por encima del máximo** (antes podía
  llegar a 8 mm con valores de 5), con una marca por milímetro. Las dos pupilas fijan la escala, así que
  cambiar entre «Ambas pupilas», «Izquierda» y «Derecha» no la mueve.
- **«Ajustar», a la izquierda de las pupilas,** acerca el eje a los milímetros enteros entre los que están
  los valores (por ejemplo, de 2 a 6 mm). Viene desactivado; al pulsarlo otra vez vuelve la escala desde 0.
- **«Comparar participantes» pasa a la barra de filtros**, junto al participante y con la misma altura que
  sus selectores, y compara la gráfica abierta. En «Comparativas» cada panel conserva su botón.
- Los selectores de modo (pupilas, ejes, señal) tienen la misma altura que «Todo el experimento».

### Pestaña del navegador y dirección

- **La pestaña del navegador muestra el icono y el nombre de NeuroDatics** en las dos ediciones, en lugar
  del icono genérico de Next.js y la dirección.
- **NeuroDatics Estudiantes se abre en `http://neurodatics.localhost:8765/`** en lugar de
  `http://127.0.0.1:8765/`. Sigue siendo el propio equipo (el navegador resuelve cualquier nombre `.localhost`
  sin red) y el mismo puerto. La ventana negra también muestra la dirección numérica por si un navegador no abre
  el nombre.

### Proyectos

- Las fechas de los proyectos se ven igual en todas las pantallas, también justo después de crear uno.
- Los errores al guardar un proyecto dicen el motivo, y el aviso de la conexión con Google Drive ya no aparece en
  NeuroDatics Estudiantes.
- La edición de un proyecto con carpeta **ya no tiene las pestañas Carpeta ni Dispositivos**: un proyecto
  queda unido a la carpeta y a los dispositivos con los que se creó. Para cambiarlos, se elimina el proyecto y
  se crea de nuevo.
- **Participantes es igual con carpeta o sin ella:** una sola lista con las tarjetas del pre-experimento. Los
  participantes leídos de los datos van primero, no se pueden quitar y piden sexo y edad; si la preparación
  tiene a alguien con el mismo documento, comparte su tarjeta y los cambios llegan a los dos registros.
- **Subir la carpeta a un pre-experimento empareja a sus participantes con los de los datos.** En
  «Datos del participante» aparecen primero los de la preparación, cada uno con «Asignar documento»: si el
  documento coincide queda asignado; si difiere en pocos caracteres se sugiere el más parecido; si no, queda
  sin asignar. El asignado toma el documento, el nombre, el sexo y la edad de la preparación y los dos
  registros quedan como uno. Debajo van los que solo están en los datos. Los que queden sin asignar siguen en
  el proyecto con sus cuestionarios y notas, pero no entran en el dashboard, los informes ni las estadísticas;
  el asistente lo avisa y la edición del proyecto permite asignarlos después.
- **Corregido:** la edición de un proyecto mostraba vacíos el nombre y el documento corregido de los
  participantes leídos de los datos, y al guardar sus participantes los borraba. Ahora los muestra y los
  conserva.
- **«Datos del participante», al subir una carpeta, usa las tarjetas de Participantes:** siguen abriéndose de
  una en una, pero nombre, documento, sexo y edad van en una fila, el sexo se elige en un desplegable, la edad
  solo admite números y cada tarjeta tiene «Notas del participante». Las notas se guardan con la preparación del
  proyecto, como en la edición.
- **La pestaña Pantalla ya no pide el modelo de pantalla**, ni al crear un pre-experimento ni al editar un
  proyecto: era un nombre que nada usaba. La migración 029 lo borra de las preparaciones guardadas, y si un
  guardado antiguo lo trae, se descarta en lugar de rechazarse.
- La barra de secciones de crear y editar muestra solo el icono y el nombre de cada pestaña, sin marcas de
  completado ni recuentos; en pantallas anchas va en una sola línea y ningún nombre se corta.

### Alineación tras las ayudas ⓘ

- **Sensores utilizados (crear proyecto):** en la tarjeta marcada, la caja del icono y la etiqueta «Detectado»
  ya no se confunden con el fondo; icono, nombre y etiqueta empiezan en la misma línea, y «Electroencefalógrafo»
  cabe con su ⓘ dentro de la tarjeta.
- **Pantalla del pre-experimento:** las tres medidas físicas van en una sola fila, también en la ventana de
  creación. La distancia se llama ahora «Distancia (cm)» (su ⓘ dice que es la del participante a la pantalla),
  así cabe en una línea y su etiqueta queda a la altura de las demás.
- **Informes:** las opciones de Alcance, Dispositivo y Opciones del informe comparten el mismo diseño: el botón
  o la casilla quedan a la altura de la primera línea, «Un participante» lleva icono como «Resumen de todos los
  participantes», y en el móvil el ⓘ queda pegado a la última palabra en lugar de irse al borde.
- **Proyectos:** un borrador con la carpeta sin procesar tiene el pie a la misma altura que las demás tarjetas y
  el mismo botón, «Retomar»; «Carpeta sin procesar» pasa a la fila de los dispositivos. «Procesando archivos»
  también se muestra en el pie.

### Paquete de estudiantes 1.10

`NeuroDatics-Estudiantes-1.10-win64.zip` (252 MiB), SHA-256
`72B6310EE91410B6CC502A90737AB4B349CCDB7AA67DEC1497AC7DAFBC606C10`. Reemplaza al 1.9 (sin publicar) y trae las
medidas físicas de la pantalla del pre-experimento en una sola fila, con «Distancia (cm)». Pasó la autoprueba, las
ocho etapas del PostgreSQL embebido, la adopción de un servidor huérfano, el servicio real por HTTP, el navegador
(7 de 7, con «Distancia (cm)» vacía al crear un pre-experimento), dos arranques simultáneos y el arranque del zip
extraído en una ruta con tildes, con 0 conexiones fuera de loopback y ningún proceso de PostgreSQL al salir.
Siguen pendientes la licencia de ffmpeg, la prueba en un portátil de estudiante real y el manejo de los datos de
participantes.

### Paquete de estudiantes 1.9

`NeuroDatics-Estudiantes-1.9-win64.zip` (252 MiB), SHA-256
`885FEF4B24DA6CCE10DB83D54276CAB2664C04162B66BCDB6721CDDD56608B38`. Reemplaza al 1.8 (sin publicar) y trae los
cambios del dashboard: la escala de la dilatación pupilar desde 0, «Ajustar» y «Comparar participantes» en la barra
de filtros. Pasó la autoprueba, las ocho etapas del PostgreSQL embebido, la adopción de un servidor huérfano, el
servicio real por HTTP, el navegador (7 de 7, con «Ajustar» y un único botón de comparar), dos arranques
simultáneos y el arranque del zip extraído en una ruta con tildes, con 0 conexiones fuera de loopback y ningún
proceso de PostgreSQL al salir. Siguen pendientes la licencia de ffmpeg, la prueba en un portátil de estudiante
real y el manejo de los datos de participantes.

### Paquete de estudiantes 1.8

`NeuroDatics-Estudiantes-1.8-win64.zip` (252 MiB), SHA-256
`082F6E4EF6C71243609E7D4698CEC6EDDA6FD06A19CEE4F3F8F70AFDEB53D068`. Reemplaza al 1.7 (sin publicar) y vuelve al
puerto fijo 8765: el 1.7 ocupaba el 80, que podía impedir arrancar a otros servidores web del equipo (XAMPP,
Apache, IIS) y cambiar la dirección entre usos. Se abre en `http://neurodatics.localhost:8765/`. Pasó la
autoprueba, las ocho etapas del PostgreSQL embebido (caída y recuperación incluidas), la adopción de un servidor
huérfano, el servicio real por HTTP, el navegador (7 de 7, entrando por `neurodatics.localhost`), dos arranques
simultáneos y el arranque del zip extraído en una ruta con tildes, con 0 conexiones fuera de loopback y ningún
proceso de PostgreSQL al salir. Siguen pendientes la licencia de ffmpeg, la prueba en un portátil de estudiante
real y el manejo de los datos de participantes.

### Paquete de estudiantes 1.7

`NeuroDatics-Estudiantes-1.7-win64.zip` (252 MiB), SHA-256
`C3A300C33183EDD7E52CFFAB8C7C8B121596CD452901F86C9B8CFDAFACCF43E6`. Reemplaza al 1.6 (sin publicar): se abre en
`http://neurodatics.localhost/` y la pestaña muestra el icono y el nombre de NeuroDatics. Pasó la autoprueba, las
ocho etapas del PostgreSQL embebido (caída y recuperación incluidas), la adopción de un servidor huérfano, el
servicio real por HTTP, el navegador (7 de 7, entrando por `neurodatics.localhost`), dos arranques simultáneos y
el arranque del zip extraído en una ruta con tildes, con 0 conexiones fuera de loopback y ningún proceso de
PostgreSQL al salir. Siguen pendientes la licencia de ffmpeg, la prueba en un portátil de estudiante real y el
manejo de los datos de participantes.

### Paquete de estudiantes 1.6

`NeuroDatics-Estudiantes-1.6-win64.zip` (252 MiB), SHA-256
`FE3B8B8340D9F54D6533A9359815A675189C99DD97983ED093442709C183D253`. Reemplaza al 1.5 (sin publicar) y quita el
modelo de pantalla de crear y editar, con la migración 029. Pasó la autoprueba, las ocho etapas del PostgreSQL
embebido (caída y recuperación incluidas), la adopción de un servidor huérfano, el servicio real por HTTP, el
navegador (6 de 6), dos arranques simultáneos y el arranque del zip extraído en una ruta con tildes, con 0
conexiones fuera de loopback y ningún proceso de PostgreSQL al salir. Siguen pendientes la licencia de ffmpeg, la
prueba en un portátil de estudiante real y el manejo de los datos de participantes.

### Paquete de estudiantes 1.5

`NeuroDatics-Estudiantes-1.5-win64.zip` (252 MiB), SHA-256
`ED59DA8DF2B9AB109C17AD699A954473FCCBCFCE625309DA40DFA92E26A34D25`. Reemplaza al 1.4 (sin publicar) y trae la
alineación corregida de sensores, pantalla del pre-experimento, informes y tarjetas de proyectos. Pasó la
autoprueba, las ocho etapas del PostgreSQL embebido (caída y recuperación incluidas, a la primera), la adopción
de un servidor huérfano, el servicio real por HTTP, el navegador (6 de 6), dos arranques simultáneos y el
arranque del zip extraído en una ruta con tildes, con 0 conexiones fuera de loopback y ningún proceso de
PostgreSQL al salir. Siguen pendientes la licencia de ffmpeg, la prueba en un portátil de estudiante real y el
manejo de los datos de participantes.

### Paquete de estudiantes 1.4

`NeuroDatics-Estudiantes-1.4-win64.zip` (252 MiB), SHA-256
`ED8B225266C52635B9C4CF10FA3A44ACEDCA4C6DAFDD051BD6ED04D372ACD311`. Reemplaza al 1.3 (sin publicar) y trae las
tarjetas de participantes con notas en «Datos del participante». Pasó la autoprueba, las ocho etapas del
PostgreSQL embebido (caída y recuperación incluidas, a la primera), la adopción de un servidor huérfano, el
servicio real por HTTP, el navegador (6 de 6), dos arranques simultáneos y el arranque del zip extraído en una
ruta con tildes, con 0 conexiones fuera de loopback y ningún proceso de PostgreSQL al salir. Siguen pendientes la
licencia de ffmpeg, la prueba en un portátil de estudiante real y el manejo de los datos de participantes.

### Paquete de estudiantes 1.3

`NeuroDatics-Estudiantes-1.3-win64.zip` (252 MiB), SHA-256
`93C9AC66B8B6FBAB78641346FD8AA9DC4AB063348E413C9858A5671A9E78D6F7`. Reemplaza al 1.2 (sin publicar) y quita la
pestaña Dispositivos de la edición. Pasó la autoprueba, el servicio real por HTTP, el navegador (6 de 6), dos
arranques simultáneos y el arranque del zip extraído en una ruta con tildes, con 0 conexiones fuera de loopback
y ningún proceso de PostgreSQL al salir. Las etapas B y C del PostgreSQL embebido (caída y recuperación)
volvieron a fallar en la primera pasada, igual que con el 1.1: tras reiniciar, el proceso checkpointer sale con
código 1 y queda vivo un proceso auxiliar huérfano que el recuento de procesos no detecta. Repetidas con el
mismo paquete pasaron las ocho etapas y la adopción. Es un fallo intermitente del arranque tras una caída que
conviene investigar antes de publicar.

### Paquete de estudiantes 1.2

`NeuroDatics-Estudiantes-1.2-win64.zip` (252 MiB), SHA-256
`CC3EAD3AA2C1351862DC21563A9FEA7779E09F4482F8B5D1BEAC212614715758`. Reemplaza al 1.1 (SHA-256
`66FFD238…AFDAB904C2`, sin publicar) e incluye el emparejamiento de participantes al subir la carpeta de un
pre-experimento. Pasó la autoprueba, las ocho etapas del PostgreSQL embebido, la adopción de un servidor
huérfano, el servicio real por HTTP, el navegador (6 de 6, con la nueva prueba de pre-experimento con carpeta),
dos arranques simultáneos y el arranque del zip extraído en una ruta con tildes, con 0 conexiones fuera de
loopback y ningún proceso de PostgreSQL al salir. Con el 1.1, en una pasada las etapas B y C (caída y
recuperación) fallaron una vez y dejaron vivo un proceso auxiliar de PostgreSQL que el recuento final no
detectó; las pasadas siguientes pasaron completas. Siguen pendientes la prueba en un portátil de estudiante
real, la licencia de ffmpeg y el manejo de los datos de participantes.

## 1.0.0 — 15 de octubre de 2026

Primera entrega. Reúne todo el trabajo anterior a esta fecha; lo más relevante, por áreas:

### Proyectos y pre-experimentos

- Un proyecto puede registrarse **antes de tener datos** (pre-experimento): participantes, pantalla,
  cuestionarios de antes y después, y notas. La carpeta del experimento se agrega después. Ver
  [pre-experimento.md](usuario/pre-experimento.md).
- **Un solo «Editar» por proyecto**, tenga carpeta o no, en una página con pestañas: Proyecto, Participantes,
  Cuestionarios, Pantalla y Notas; con datos, además Dispositivos, Áreas de interés y Carpeta. «Guardar cambios»
  envía solo lo que cambió.
- Los participantes tienen **nombre y documento** editables; el tablero y la comparación muestran el nombre
  cuando existe. Dos participantes de un mismo proyecto no pueden compartir documento.
- Todas las tarjetas de proyecto tienen el mismo tamaño y se abren con un clic: un pre-experimento abre su
  edición, un borrador continúa el proceso y un proyecto activo abre su tablero.

### Configuración

- **Configuración es global:** guarda la pantalla donde se presentan los estímulos (por defecto 1280×1024, con
  ancho y alto físicos si se conocen) y, en la edición servidor, la conexión con Google Drive. Se abre desde el
  menú del usuario.
- Mientras la pantalla no se haya revisado, un aviso lo recuerda una vez por inicio, sin bloquear nada.
- La distancia ojo-pantalla la mide el eye tracker en cada muestra; la aplicación no pide datos que habría que
  inventar.

### Subida y procesamiento

- Cada subida prepara sus datos aparte y los publica en una sola operación: si algo falla, el proyecto conserva
  los datos que ya tenía. Los límites de tamaño se aplican antes de recibir el archivo, y cancelar desde el
  navegador detiene de verdad el trabajo del servidor. Ver
  [subida-de-experimentos.md](tecnica/subida-de-experimentos.md).
- El procesamiento reparte los participantes entre varios procesos: una grabación de prueba de seis bloques pasó
  de 51 s a 10 s en ocho núcleos, con resultados idénticos.
- Las fijaciones se detectan desde la mirada cruda, en grados cuando se conoce la geometría física, y la mirada se
  lleva al sistema de coordenadas del estímulo antes de detectar. Ver
  [deteccion-de-fijaciones.md](tecnica/deteccion-de-fijaciones.md) y
  [coordenadas-pantalla-estimulo.md](tecnica/coordenadas-pantalla-estimulo.md).

### Análisis

- La pestaña de **áreas de interés** trae hallazgos clave, la secuencia de atención, métricas por AOI y las
  transiciones principales. El tiempo hasta la primera fijación se mide desde el inicio del escenario.
- **Comparar participantes** marca el mismo instante en todas las tarjetas. Ver
  [comparar-participantes.md](usuario/comparar-participantes.md).
- Las gráficas cargan mucho más rápido: las series vienen acotadas, los resultados se reutilizan mientras sigan
  siendo válidos y volver a un proyecto ya visto es casi instantáneo.
- Los modos y las vistas se explican al pasar el ratón, y las salvedades de cada gráfica son chips con su
  explicación, no avisos que tapen los datos.
- El tablero cabe en la pantalla de un portátil (1536×730) sin desplazarse.

### EEG

- **Corregido:** un canal exportado con multiplicador `kilo` quedaba mil veces más pequeño (60 dB menos de
  potencia). Ahora se aplica el multiplicador y se registra su origen.
- **Corregido:** las muestras ausentes se descartaban, se interpolaban o se rellenaban con ceros; hoy se
  conservan como huecos y los cálculos usan solo tramos válidos.
- **Corregido:** el suavizado de 0,2 s que se aplicaba por defecto escondía el ritmo alfa; ahora es una opción
  explícita. Ver [eeg/validacion.md](tecnica/eeg/validacion.md) y [eeg/metodos.md](tecnica/eeg/metodos.md).
- El espectrograma se ve continuo también en escenarios cortos, y la calidad de los datos se reúne en una
  tarjeta al final de la pestaña.

### Informes

- Un **informe PDF por dispositivo**, para un participante o para el grupo, con el logo de NeuroDatics. En modo
  comparativo se recibe un PDF por dispositivo en un archivo comprimido. Los valores usan las mismas
  definiciones que el tablero. Ver [informes.md](tecnica/informes.md).

### Edición servidor

- Entrega para Windows en español con dos botones: **INSTALAR** (comprueba el equipo, instala Docker Desktop y
  continúa tras reiniciar) e **INICIAR** (enciende Docker si hace falta, arranca la aplicación y abre el
  navegador). Ver [deployment/README.md](../deployment/README.md).

### NeuroDatics Estudiantes

- La aplicación completa como un programa de Windows que no necesita instalación, cuenta, internet ni Docker. Al
  abrirlo arranca su propia base de datos y abre el navegador; los datos quedan en el perfil del usuario. Trae
  su guía, `LEEME.txt`.
- Funciona en un Windows sin Visual C++ instalado: el paquete lleva el runtime que necesita PostgreSQL.

### Interfaz

- Todo el texto en español llano, dicho una vez: sin jerga técnica, sin «(opcional)» ni ejemplos dentro de los
  campos. Las explicaciones viven en un icono de ayuda junto a cada etiqueta.

### Paquete de estudiantes 1.0

`NeuroDatics-Estudiantes-1.0-win64.zip` (252 MiB), SHA-256
`ECB3A871E8623AF16E96BDEEC4613B2394FB2D6767EF85AB0D1E51E5C84380CC`. Pasó la autoprueba, las ocho etapas del
PostgreSQL embebido, la adopción de un servidor huérfano, el servicio real por HTTP, el navegador (5 de 5) y dos
arranques simultáneos, con 0 conexiones fuera de loopback y ningún proceso de PostgreSQL al salir. Sigue
pendiente la prueba en un portátil de estudiante real.

### Acción necesaria al actualizar

- Los proyectos cargados antes de las correcciones de EEG (septiembre de 2026) deben **volver a subirse** para
  tomar la escala corregida y los metadatos de adquisición.
- Los archivos que venían en metros o centímetros y se importaron antes de que la aplicación normalizara las
  unidades declaradas también deben reimportarse.

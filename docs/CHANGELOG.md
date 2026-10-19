# Cambios de NeuroDatics

Qué cambia en la aplicación, versión a versión, contado para quien la usa. Las entradas nuevas van arriba,
bajo **Sin publicar**, y pasan a una versión al entregarla.

## Sin publicar

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
- **Pantalla del pre-experimento:** en la ventana de creación, las medidas físicas van en dos columnas para que
  «Distancia a la pantalla (cm)» no se parta y su etiqueta quede a la altura de las demás; en la edición siguen
  en tres.
- **Informes:** las opciones de Alcance, Dispositivo y Opciones del informe comparten el mismo diseño: el botón
  o la casilla quedan a la altura de la primera línea, «Un participante» lleva icono como «Resumen de todos los
  participantes», y en el móvil el ⓘ queda pegado a la última palabra en lugar de irse al borde.
- **Proyectos:** un borrador con la carpeta sin procesar tiene el pie a la misma altura que las demás tarjetas y
  el mismo botón, «Retomar»; «Carpeta sin procesar» pasa a la fila de los dispositivos. «Procesando archivos»
  también se muestra en el pie.

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

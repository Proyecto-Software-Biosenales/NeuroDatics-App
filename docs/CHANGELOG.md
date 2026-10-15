# Cambios de NeuroDatics

Qué cambia en la aplicación, versión a versión, contado para quien la usa. Las entradas nuevas van arriba,
bajo **Sin publicar**, y pasan a una versión al entregarla.

## Sin publicar

Nada todavía.

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

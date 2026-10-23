# Referencia {#cap-referencia}

Este capítulo reúne en tablas lo que muestra cada pantalla, los estados de un proyecto, los formatos y límites, los archivos que descarga NeuroDatics, sus avisos y las diferencias entre ediciones. Para los pasos de cada tarea, sigue las remisiones.

## Pantallas y controles {#ref-pantallas}

### Barra superior

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| **Inicio**, **Proyectos**, **Dashboard**, **Informes** | Abren las cuatro secciones. La sección en la que estás aparece subrayada. En pantallas angostas están tras el botón de tres rayas. |
| **Cambiar tema** | Alterna el tema claro y el oscuro. También con la tecla **D**, fuera de un campo de texto. Ver [[ref:tema]]. |
| **Menú de usuario** | Muestra tu nombre ({estudiantes} **Estudiante**) y contiene **Configuración**. |
| {servidor} **Salir** | Cierra la sesión y vuelve a **Inicio**. |
| **Ir a proyectos** (en **Inicio**) | Abre la lista de proyectos. |

### Proyectos

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| **Crear proyecto** | Abre el diálogo para crear un proyecto con datos o un pre-experimento. Ver [[ref:crear-proyecto]]. |
| **Todos**, **Borradores**, **Activos**, **Archivados** | Filtran las tarjetas por estado. **Borradores** incluye los pre-experimentos. Ver [[ref:ver-proyectos]]. |
| Cuerpo de la tarjeta | Depende del estado: abre el Dashboard, el asistente, el editor o el resumen. Ver [[ref:tarjeta]]. |
| Botón del pie de la tarjeta | **Retomar**, **Continuar**, **Subir**, **Ver proyecto** o **Editar**, según el estado. |
| **Ver proyecto** | Abre el resumen. Ver [[ref:ver-resumen]]. |
| **Opciones del proyecto** (icono de tres puntos) | Menú con **Editar**, **Eliminar** y **Archivar** o **Desarchivar**. Desactivado mientras se procesan archivos. |
| **Por qué actualizar el proyecto** | Explica el aviso «Actualizar proyecto». |

### Crear proyecto

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| **Con datos** / **Pre-experimento** | Eligen el tipo de proyecto. Solo aparecen al empezar. |
| **Nombre del proyecto**, **Descripción** | Identifican el proyecto. El nombre es obligatorio y no puede repetirse. |
| **Pantalla distinta a la configuración** | Permite indicar otra pantalla solo para este proyecto. Ver [[ref:cargar-carpeta]]. |
| **Seleccionar carpeta** o arrastrar | Elige la carpeta del experimento. La X junto a «Carpeta seleccionada» la quita. |
| **Sí, continuar** / **No, elegir otra carpeta** y botones de elección | Responden a «Confirma la carpeta». Ver [[ref:confirmar-carpeta]]. |
| **Ubicación del estímulo en pantalla** | Sección plegable para registrar cómo se mostró cada imagen o vídeo. Ver [[ref:ubicacion-estimulo]]. |
| **Cancelar** (panel de progreso) | Detiene la carga en curso. Ver [[ref:procesamiento]]. |
| Tarjetas **Electroencefalógrafo**, **Sensor galvánico**, **Eye tracker** | Marcan los sensores del proyecto (paso 2). Al menos uno. |
| **Sexo**, **Edad**, **Nombre**, **Documento**, **Notas del participante** | Datos de cada participante (paso 3). Sexo y edad son obligatorios. |
| **Asignar documento** | Une un participante del pre-experimento con su documento en los datos. Ver [[ref:asignar-documento]]. |
| **Silueta**, **Rectángulo**, **Círculo**, colores, **Elegir color personalizado** | Dibujan las áreas de interés (paso 4). Ver [[ref:aoi]]. |
| **Anterior**, **Siguiente**, **Cancelar**, **Guardar proyecto** | Mueven entre pasos (en un pre-experimento, entre pestañas), cierran o terminan el proyecto. |
| Pestañas **Proyecto**, **Participantes**, **Cuestionarios**, **Pantalla**, **Notas** | Secciones de un pre-experimento. Ver [[ref:crear-preexperimento]]. |
| **Crear pre-experimento** | Crea el pre-experimento. Si falta algo, abre la pestaña con el problema marcada en rojo. |

### Editor del proyecto

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| Pestañas **Proyecto**, **Participantes**, **Cuestionarios**, **Pantalla**, **Áreas de interés**, **Notas** | Secciones del proyecto. **Áreas de interés** solo aparece si el proyecto tiene datos. Ver [[ref:editar-proyecto]]. |
| **Agregar participante**, **Quitar participante** | Añaden o quitan participantes planificados. Los leídos de los datos no se pueden quitar. Ver [[ref:participantes]]. |
| **Antes del experimento**, **Después del experimento**, **Respuestas** | Subpestañas de **Cuestionarios**. Ver [[ref:cuestionarios]]. |
| **Agregar pregunta**, **Tipo de pregunta**, **Obligatoria**, **Agregar opción**, subir, bajar, quitar | Construyen cada cuestionario. |
| **Responder cuestionario** | Abre el formulario para que un participante responda. Ver [[ref:responder]]. |
| **Descargar respuestas** | Descarga el historial de respuestas. Ver [[ref:respuestas]]. |
| **Distancia (cm)** y demás campos de **Pantalla** | Pantalla de este proyecto. Ver [[ref:pantalla-proyecto]]. |
| **Agregar nota**, **Quitar nota** | Notas del proyecto. Ver [[ref:notas]]. |
| **Guardar cambios** | Guarda todo lo que cambió. Desactivado si no hay cambios. |

### Dashboard

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| Panel «Proyectos» | Elige el proyecto y el sensor: **Eye tracker**, **Electroencefalógrafo**, **Sensor galvánico** o **Comparativas**. **Contraer panel** lo reduce a iconos. Ver [[ref:abrir-dashboard]]. |
| Desplegables de escenario y participante | Eligen qué datos ver. Al cambiarlos se reinician la ventana temporal, la ampliación y la selección. Ver [[ref:filtros]]. |
| **Comparar participantes** | Abre la vista actual para varios participantes. Ver [[ref:comparar-participantes]]. |
| Modos (**Ambas pupilas**, **Eje X**, **Suavizada**, **Montaje**…) | Cambian qué serie se dibuja y cómo. |
| **Ajustar** | Acerca el eje vertical a los valores. Existe en pupila, mirada, distancia, GSR y densidad espectral. |
| **Todo el experimento** / **Ventana activa** | Abre la ventana temporal: **Inicio**, **Fin**, **Aplicar**, **Restablecer**. Ver [[ref:ventana-zoom]]. |
| Arrastrar sobre la gráfica | Amplía una zona. **Volver al zoom anterior** y **Volver a la vista completa** deshacen la ampliación. |
| Clic en la gráfica, **Mínimo** o **Máximo** | Muestra dónde miraba el participante en ese instante. **Limpiar selección** lo borra. Ver [[ref:instante]]. |
| **AOIs (n)** | Muestra u oculta las áreas de interés sobre el estímulo. |
| **Duración mínima** | Elige el umbral de fijación para las cuatro vistas de fijación. **Usar** en la tabla de sensibilidad hace lo mismo. Ver [[ref:fijaciones]]. |
| **Filtro violeta** | Tiñe la imagen de fondo del mapa de calor. |
| Deslizador y **Ver todos** | Reproducen el mapa de recorridos fijación a fijación. Ver [[ref:mapa-calor]]. |
| **Cómo leerlos**, **Cómo se calculan**, **Cómo se cuentan** | Abren las definiciones de la comparativa de áreas de interés. Ver [[ref:aoi-analisis]]. |
| Botones de canal (LE, F4, C4, P4, P3, C3, F3) | Eligen los canales del EEG. Ver [[ref:eeg]]. |
| **Excluir ventanas con artefacto**, **Escala de color por canal**, **Interpolar celdas** | Opciones de la densidad espectral y del espectrograma. |
| **Volver a procesar** | Aparece en «Calidad y alcance de EEG» junto a «Unidades EEG con salvedades» y lleva a **Proyectos**. Para procesar de nuevo, crea el proyecto otra vez con la misma carpeta. |
| **Gráficas a comparar** | Elige los paneles de Comparativas: **Seleccionar disponibles**, **Limpiar**, **Aplicar selección**. Ver [[ref:comparativas]]. |
| **Reintentar** | Vuelve a pedir un cálculo que falló (correlaciones, tarjetas de comparación). |

### Diálogo Comparar participantes

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| **Participantes** | Busca por nombre o documento; **Seleccionar todos**, **Quitar selección**. |
| **Escala común** / **Escalas propias** | Mismo rango vertical para todos (en las señales en el tiempo, del percentil 1 al 99 de sus valores) o uno por tarjeta. Ver [[ref:entender-comparar]]. |
| **Cerrar comparación** (X) o tecla Esc | Cierra el diálogo. |

### Informes

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| «Selección de proyecto» | Elige el proyecto. Ver [[ref:generar-informe]]. |
| **Un participante** / **Resumen de todos los participantes** | Eligen el alcance. Con un participante aparece su desplegable («Participante» y su código). |
| **Eye tracker**, **GSR**, **EEG**, **Todos los dispositivos** | Eligen el dispositivo. **Todos los dispositivos** solo aparece con más de un sensor. Ver [[ref:informe-grupo]]. |
| «Contenido del informe» | Vista previa de lo que incluirá el PDF. |
| **Incluir portada**, **Incluir fecha y nombre del proyecto** | Opciones del PDF. Las dos vienen marcadas. |
| **Descargar informe PDF** / **Descargar informes (ZIP)** | Generan y descargan el informe. |

### Configuración

<!-- anchos: 30 70 -->
| Control | Para qué sirve |
| --- | --- |
| **Ancho (px)**, **Alto (px)** | Resolución de la pantalla del laboratorio. Valor de partida: 1280 × 1024. |
| **Ancho (cm)**, **Alto (cm)** | Medidas físicas de la pantalla. Pueden quedar vacías. |
| **Guardar configuración de pantalla** | Guarda la pantalla para los proyectos nuevos. Ver [[ref:config-pantalla]]. |
| **Ir a Configuración** | Botón del aviso «Revisa la configuración de pantalla». Ver [[ref:aviso-pantalla]]. |

## Estados de un proyecto {#ref-estados}

Un proyecto tiene un estado (**Borrador**, **Activo**, **Archivado**) y, mientras es borrador, un estado de procesamiento de su carpeta. Un pre-experimento es un borrador que todavía no ha recibido ninguna carpeta. Qué muestra la tarjeta en cada caso, su botón y qué abre un clic en ella están en [[ref:tarjeta]].

- Al terminar el asistente con **Guardar proyecto**, el borrador pasa a **Activo**.
- Al desarchivar, un pre-experimento vuelve a **Pre-experimento**; cualquier otro proyecto pasa a **Activo**.
- Al cargar la carpeta de un pre-experimento, deja de serlo y el editor muestra la pestaña **Áreas de interés**.
- El Dashboard y la página Informes muestran todos los proyectos, también los archivados y los borradores.

## Formatos de archivo aceptados {#ref-formatos}

NeuroDatics recibe una **carpeta**, no un archivo suelto. De ella solo usa los archivos `.csv`, el contenido de las subcarpetas `Images` y `Videos` y los nombres de la subcarpeta `Acquisition`. Todo lo demás se ignora, igual que los archivos ocultos. Los nombres de las subcarpetas no distinguen mayúsculas y pueden estar en cualquier nivel. Ver [[ref:preparar-carpeta]].

<!-- anchos: 20 40 40 -->
| Elemento | Formato | Reglas |
| --- | --- | --- |
| Datos del experimento | `.csv`, uno solo | Si hay varios, NeuroDatics pregunta cuál usar. Los `.csv` dentro de `Acquisition` no cuentan. |
| Imágenes de los escenarios | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tif`, `.tiff`, `.svg` | Dentro de `Images`. El nombre del archivo, sin extensión, es el nombre del escenario. |
| Vídeos de los escenarios | `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`, `.m4v` | Dentro de `Videos`. Mismo criterio de nombre. |
| Carpeta de adquisición | Subcarpetas `Sujet_<código>_Scenario_<nombre>_Rec<n>` | Solo se leen sus nombres para proponer participantes y escenarios. No se guarda su contenido. |

### El archivo CSV

<!-- anchos: 30 70 -->
| Aspecto | Qué acepta |
| --- | --- |
| Estructura | Uno o varios bloques, uno por grabación, que empiezan con una línea `Grabación : <código> \| Rec <n>`, seguida de líneas de datos del canal y de una fila de encabezados con la columna de tiempo. |
| Columna de tiempo | Una sola, llamada `Time` (también `time`, `timestamp`, `tiempo`, `time (s)` o `tiempo (s)`). Los tiempos deben crecer siempre. |
| Separador | Punto y coma, tabulador o coma. |
| Decimales | Coma o punto. |
| Codificación | UTF-16, UTF-8 o Latin-1. |
| Código de participante | Lo que sigue a `Grabación :`, hasta 50 caracteres. Cada código debe aparecer en un solo bloque. Si falta, se asigna `participante_<n>`. |
| Escenario de cada fila | Columna `Scenario 1` o `Scenario`. Sus valores deben coincidir con los nombres de las imágenes y vídeos, sin importar mayúsculas, espacios, comillas ni la extensión. |

### Columnas por sensor

<!-- anchos: 22 78 -->
| Sensor | Columnas que lo identifican |
| --- | --- |
| Eye tracker | `Bandwidth / X`, `Bandwidth / Y` (mirada); `Bandwidth / Distance` (distancia); `Bandwidth / LeftEyePupilDiameter`, `Bandwidth / RightEyePupilDiameter` (pupilas). |
| GSR | `GSR / GSR`. |
| EEG | `Electroencefalografía (EEG) / F3`, y así con F4, C3, C4, P3, P4, LE y TRG (también sin tilde o como `EEG / F3`). |

Un sensor se marca como «Detectado» en el paso 2 cuando el archivo trae alguna de sus columnas.

## Límites {#ref-limites}

<!-- anchos: 50 50 -->
| Qué | Límite |
| --- | --- |
| Tamaño de la carpeta del experimento | 500 MB, sumando todos los archivos visibles de la carpeta, también los que no se van a usar |
| Archivos de la carpeta que se envían (CSV, imágenes, vídeos y `Acquisition`) | 20 000 |
| Tiempo máximo de una carga | 30 minutos |
| Subidas a la vez | Una por persona |
| Tiempo máximo para generar un informe | 10 minutos |
| Código de participante en el CSV | 50 caracteres |
| Participantes planificados por proyecto | 1000 |
| Nombre de un participante | 255 caracteres (120 en los participantes leídos de los datos) |
| Documento de un participante | 100 caracteres (50 en los participantes leídos de los datos) |
| Edad | Número entero de 0 a 150 en los participantes planificados, donde puede quedar vacía; obligatoria y mayor que cero en los leídos de los datos |
| Preparación del proyecto (participantes, cuestionarios, pantalla y notas) | 2 MB en total |
| Preguntas por cuestionario | 200 |
| Texto de una pregunta | 5000 caracteres |
| Opciones de una pregunta de selección múltiple | De 2 a 100, de hasta 1000 caracteres cada una |
| Respuestas de un cuestionario | 2 MB por envío |
| Notas del proyecto | 500 notas; título de hasta 255 caracteres y texto de hasta 10 000 |
| Notas de un participante | 10 000 caracteres |
| Resolución de pantalla | Número entero de píxeles, mayor que cero y hasta 100 000 |
| Medidas físicas de pantalla | Mayores que cero y hasta 10 000 cm |
| Puntos por gráfica en el Dashboard | 5000 (2000 en cada tarjeta de **Comparar participantes**) |
| Duración mínima de fijación | 100, 150, 200, 250 o 300 ms |
| Correlaciones | Al menos 10 intervalos de 250 ms compartidos por las dos señales |
| Topografía EEG | Al menos 3 electrodos seleccionados |
| Participantes con color propio en las gráficas de un informe de grupo | 8; el resto se dibuja en gris |

## Archivos que descarga NeuroDatics {#ref-descargas}

Los nombres de los informes van en minúsculas, sin tildes y con guiones. La fecha y la hora del nombre están en hora universal (UTC), así que en Colombia aparecen cinco horas por delante.

<!-- anchos: 30 70 -->
| Qué descargas | Nombre del archivo |
| --- | --- |
| Informe de Eye tracker de un participante | `informe-eye-tracking-<proyecto>-participante-<código>-<AAAAMMDD-HHMM>.pdf` |
| Informe de Eye tracker de grupo | `informe-eye-tracking-<proyecto>-grupo-<AAAAMMDD-HHMM>.pdf` |
| Informe de GSR | `informe-gsr-<proyecto>-participante-<código>-<AAAAMMDD-HHMM>.pdf` o `informe-gsr-<proyecto>-grupo-<AAAAMMDD-HHMM>.pdf` |
| Informe de EEG | `informe-eeg-<proyecto>-participante-<código>-<AAAAMMDD-HHMM>.pdf` o `informe-eeg-<proyecto>-grupo-<AAAAMMDD-HHMM>.pdf` |
| **Todos los dispositivos** | `informes-<proyecto>-participante-<código>-<AAAAMMDD-HHMM>.zip` o `informes-<proyecto>-grupo-<AAAAMMDD-HHMM>.zip`, con un PDF por dispositivo (Eye tracker, GSR, EEG) con los nombres de arriba |
| Respuestas de los cuestionarios | `pre-experimento-<identificador del proyecto>.json`, con la preparación del proyecto y el historial de respuestas |

Si el navegador no recibe el nombre, guarda el archivo como `informe.pdf` o `informe.zip`. Lo que contiene cada informe está en [[ref:contenido-informe]].

## Avisos de la aplicación {#ref-mensajes}

Los avisos de estado y de confirmación más frecuentes. Donde dice «…» va un nombre o un número. Los mensajes de error, con su causa y qué hacer, están en [[ref:cap-problemas]].

<!-- anchos: 36 32 32 -->
| Aviso | Qué significa | Qué hacer |
| --- | --- | --- |
| {servidor} «Sesión cerrada.» | Saliste de NeuroDatics. | Nada. |
| «Revisa la configuración de pantalla» | Aún no has guardado la pantalla del laboratorio. | Haz clic en **Ir a Configuración** y guarda. Ver [[ref:aviso-pantalla]]. |
| «Configuración de pantalla guardada.» | La pantalla quedó guardada. | Nada. |
| «No hay proyectos en este estado.» | El filtro elegido no tiene proyectos. | Elige **Todos**. |
| «Confirma la carpeta» | La carpeta admite más de una lectura. | Responde cada pregunta. Ver [[ref:confirmar-carpeta]]. |
| «Procesando archivos de «…» · …%» | La carpeta se está procesando. | Espera sin cerrar el diálogo: cerrarlo cancela la carga. Ver [[ref:procesamiento]]. |
| «Carpeta de «…» procesada. Puedes continuar.» | Terminó de procesarse una carpeta cuya tarjeta mostraba «Procesando archivos» en la lista. Suena un aviso. | Haz clic en **Continuar** en la tarjeta. |
| «Subida cancelada.» | Cancelaste la carga de la carpeta. | Vuelve a elegir la carpeta cuando quieras. |
| «… participantes del pre-experimento quedan sin asignar.» | Algunos participantes planificados no tienen documento en los datos. | Asígnalos si participaron. Ver [[ref:asignar-documento]]. |
| «Proyecto «…» creado.» | El proyecto quedó activo. | Ábrelo desde su tarjeta. |
| «Proyecto archivado.» / «Proyecto desarchivado.» | El estado cambió. | Nada. |
| {servidor} «Proyecto «…» y carpeta de Drive eliminados.» / {estudiantes} «Proyecto «…» y sus archivos eliminados.» | Se borraron el proyecto y sus archivos. | Nada. No se puede deshacer. |
| {servidor} «Proyecto «…» eliminado. Carpeta de Drive no confirmada.» | Se borró el proyecto, pero no se pudo comprobar el borrado de sus archivos. | Avisa a quien administra NeuroDatics si te preocupa el espacio. |
| {estudiantes} «Proyecto «…» eliminado. Archivos no confirmados.» | Se borró el proyecto, pero no se pudo comprobar el borrado de sus archivos. | Nada; el proyecto ya no aparece. |
| «Hay cambios sin guardar.» | Cambiaste algo y aún no lo guardas. | **Guardar cambios** o **Descartar cambios**. |
| «Cambios guardados.» | Todo quedó guardado. | Nada. |
| «Respuestas guardadas.» | El cuestionario quedó en el historial. | **Cerrar**. |
| «Generando informe…» / «Informe generado.» | El informe se está preparando o ya se descargó. | Espera; busca el archivo en tus descargas. |

## Quién puede hacer qué {#ref-permisos}

NeuroDatics no tiene roles ni permisos por proyecto: no hay administradores, editores ni lectores dentro de la aplicación, y los proyectos no se comparten. Cada proyecto pertenece a la cuenta que lo creó.

<!-- anchos: 42 32 26 -->
| Persona | Puede | No puede |
| --- | --- | --- |
| {servidor} Visitante sin sesión | Ver **Inicio** y la pantalla de acceso. | Entrar a Proyectos, Dashboard, Informes o Configuración. |
| {servidor} Cuenta de Google permitida | Todo, sobre sus propios proyectos y su propia configuración de pantalla. | Ver o editar proyectos de otras cuentas; elegir la cuenta de Google Drive. |
| {servidor} Cuenta no permitida | Nada: ve el aviso de acceso denegado. | Entrar. |
| {estudiantes} **Estudiante** | Todo, sin cuenta. | Cerrar sesión; usar Google o Google Drive. |
| Quien administra NeuroDatics | Instalarlo, decidir qué cuentas entran ({servidor}) y conectar Google Drive ({servidor}), fuera de la aplicación. | — |

La configuración de pantalla se guarda por cuenta, no por computador.

## Diferencias entre ediciones {#ref-ediciones}

El análisis, el Dashboard, los cuestionarios, los informes y los formatos son iguales en las dos ediciones. Cambia lo que tiene que ver con la cuenta y con dónde se guardan los archivos.

<!-- anchos: 26 37 37 -->
| Aspecto | Edición servidor | Edición estudiantes |
| --- | --- | --- |
| Entrar | Con **Continuar con Google** | Sin iniciar sesión |
| Nombre en la barra superior | Tu nombre o correo de Google | **Estudiante** |
| **Salir** | Sí | No; se sale cerrando la ventana negra |
| Duración de la sesión | 14 días; después hay que entrar de nuevo | No caduca |
| Cuentas permitidas | Las que defina quien administra NeuroDatics | No aplica |
| Dónde quedan los archivos | Google Drive, en una cuenta que conecta quien administra NeuroDatics | En el propio computador |
| Textos del procesamiento | Hablan de Google Drive («Sincronizando con Google Drive») | Hablan de «este equipo» («Guardando archivos en este equipo»). Ver [[ref:procesamiento]] |
| Pantalla si el programa no responde | — | «NeuroDatics no está disponible» |
| Configuración de pantalla | Igual | Igual. El aviso «Revisa la configuración de pantalla» sale cada vez que abres NeuroDatics hasta que la guardes |
| Internet | Necesario | No se usa: nada sale del computador |

# Conocer NeuroDatics {#cap-conocer}

Este capítulo explica qué hace NeuroDatics, las palabras que usa y cómo está organizada la pantalla. Léelo una vez antes de empezar; después puedes ir directo a la tarea que necesites.

## Qué hace NeuroDatics {#que-hace}

NeuroDatics reúne en un solo lugar los datos de los sensores de un experimento y los convierte en gráficas, estadísticas e informes. Trabaja con tres tipos de sensor:

- **Eye tracker**: registra hacia dónde mira cada participante. NeuroDatics muestra mapas de calor, fijaciones, recorridos de la mirada, áreas de interés y la dilatación de la pupila.
- **EEG** (electroencefalógrafo): registra la actividad eléctrica del cerebro. NeuroDatics muestra la señal de cada canal, su contenido en frecuencia y la potencia por bandas.
- **GSR** (sensor galvánico): mide la conductancia de la piel. NeuroDatics muestra los picos de activación y cuánto varía la señal respecto a su nivel de base.

El trabajo con NeuroDatics sigue casi siempre el mismo orden:

1. **Crea un proyecto** con la carpeta del experimento y registra a los participantes.
2. **Marca las áreas de interés** sobre cada imagen que viste el participante.
3. **Analiza los resultados** en el Dashboard y compara participantes.
4. **Descarga los informes** en PDF, de un participante o de todo el grupo.

Si todavía no tienes las grabaciones, puedes empezar por un pre-experimento: preparas participantes, cuestionarios y notas, y cargas la carpeta cuando la tengas. Ver [[ref:cap-preexperimento]].

NeuroDatics no registra las señales: trabaja con los archivos que exporta el equipo de adquisición. Tampoco comparte proyectos entre personas: cada cuenta ve solo los proyectos que creó.

## Conceptos clave {#conceptos}

<!-- anchos: 24 76 -->
| Término | Qué significa en NeuroDatics |
| --- | --- |
| **Proyecto** | Un estudio: reúne la carpeta del experimento, los participantes, los escenarios, las áreas de interés, los cuestionarios y las notas. Ver [[ref:cap-proyectos]]. |
| **Carpeta del experimento** | La carpeta de tu computador con el archivo `.csv` de las grabaciones y las subcarpetas `Images` y `Videos` con lo que se mostró. Ver [[ref:preparar-carpeta]]. |
| **Participante** | Cada persona que hizo el experimento. Se identifica por su **documento** de identidad, que no puede repetirse dentro del proyecto. |
| **Código del participante** | El identificador que trae cada grabación en el `.csv`. Puede ser distinto del documento. Ver [[ref:ref-formatos]]. |
| **Escenario** | Cada imagen o vídeo que se mostró a los participantes. Su nombre es el nombre del archivo de imagen o vídeo. |
| **Sensor o dispositivo** | Eye tracker, EEG o GSR. Un proyecto puede tener uno, dos o los tres. |
| **Área de interés (AOI)** | Una zona que dibujas sobre una imagen para medir cuánta atención recibió. Ver [[ref:aoi]]. |
| **Pre-experimento** | Un proyecto que todavía no tiene datos: sirve para preparar participantes, cuestionarios, pantalla y notas. Ver [[ref:crear-preexperimento]]. |
| **Cuestionario** | Preguntas que el participante responde antes o después del experimento, en el mismo computador. Ver [[ref:cuestionarios]]. |
| **Informe** | Un PDF por dispositivo con las gráficas y estadísticas de cada escenario. Ver [[ref:cap-informes]]. |

Un proyecto pasa por varios estados (**Borrador**, **Activo**, **Archivado**, **Pre-experimento**). La tarjeta de cada proyecto te dice en cuál está y qué puedes hacer. Ver [[ref:tarjeta]].

## Recorrido por la interfaz {#interfaz}

La barra superior aparece en todas las pantallas. La [[fig:1-1]] señala sus partes principales.

![[fig:1-1|La barra superior: secciones, cambio de tema y menú de usuario.|w=6.5]]

- **Inicio**, **Proyectos**, **Dashboard** e **Informes** (1) llevan a las cuatro secciones de la aplicación. La sección en la que estás aparece subrayada.
- **Cambiar tema** (2) alterna entre el tema claro y el oscuro. Ver [[ref:tema]].
- El **menú de usuario** (3) muestra tu nombre y contiene **Configuración**. Ver [[ref:config-pantalla]].
- {servidor} El botón **Salir**, a la derecha, cierra tu sesión.

<!-- anchos: 22 78 -->
| Sección | Para qué sirve |
| --- | --- |
| **Inicio** | Presenta NeuroDatics y lleva a tus proyectos con **Ir a proyectos**. |
| **Proyectos** | Crear, revisar, editar, archivar y eliminar proyectos. Ver [[ref:cap-proyectos]]. |
| **Dashboard** | Ver las gráficas y estadísticas de cada participante y escenario. Ver [[ref:cap-dashboard]]. |
| **Informes** | Descargar los informes en PDF. Ver [[ref:cap-informes]]. |
| **Configuración** | Ajustes que comparten todos tus proyectos, como la pantalla del laboratorio. Ver [[ref:cap-configuracion]]. |

Los avisos de la aplicación (por ejemplo «Cambios guardados.») aparecen unos segundos en la esquina inferior derecha. Algunos, como el de la configuración de pantalla, se quedan hasta que los cierras. En pantallas angostas, las secciones se esconden detrás del botón de tres rayas de la esquina superior.

## Las dos ediciones {#ediciones}

NeuroDatics existe en dos ediciones con las mismas funciones de análisis:

- **Edición servidor**: se abre en el navegador desde la dirección que te dé quien administra NeuroDatics. Entras con tu cuenta de Google y los archivos de los proyectos se guardan en Google Drive.
- **Edición estudiantes**: funciona en un solo computador con Windows, sin internet. No hay que iniciar sesión y los archivos se guardan en el propio computador.

En este manual, lo que solo existe en una edición lleva una de estas etiquetas: {servidor} o {estudiantes}. Todo lo que no lleva etiqueta funciona igual en las dos. La lista completa de diferencias está en [[ref:ref-ediciones]].

## Entrar y salir {#entrar-salir}

### Entrar con tu cuenta de Google

{servidor} Para entrar necesitas una cuenta de Google con acceso a NeuroDatics.

1. Abre la dirección de NeuroDatics en el navegador.
2. Haz clic en **Proyectos**, **Dashboard** o **Informes**, o en el icono de usuario de la barra superior.
   Se abre la pantalla «Acceder a NeuroDatics».
3. Haz clic en **Continuar con Google**, como muestra la [[fig:1-2]].
4. Elige tu cuenta de Google.
   Aparece «Iniciando sesión…» y después se abre el **Dashboard**.

![[fig:1-2|La pantalla de acceso de la edición servidor.|w=3.8]]

La primera vez, tu cuenta de NeuroDatics se crea sola al continuar con Google. La sesión dura 14 días; después, NeuroDatics te pide entrar de nuevo.

::: nota
Si aparece «Esta cuenta de Google no tiene acceso a NeuroDatics. Pide a quien la administra que la añada.», tu cuenta no está en la lista de cuentas permitidas. Solo quien administra NeuroDatics puede añadirla.
:::

### Salir

{servidor} Haz clic en **Salir**, a la derecha de la barra superior. Aparece «Sesión cerrada.» y vuelves a **Inicio**. Si usas un computador compartido, cierra también la sesión de Google en el navegador.

### En la edición estudiantes

{estudiantes} No hay que iniciar sesión: al abrir NeuroDatics entras directamente y en la barra superior aparece **Estudiante**. Para salir, cierra la ventana negra de NeuroDatics; mientras uses la aplicación, no la cierres. Si en lugar de la aplicación ves «NeuroDatics no está disponible», el programa no está abierto. Ver [[ref:problemas-acceso]].

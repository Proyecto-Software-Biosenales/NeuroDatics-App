# Pre-experimentos y cuestionarios

## Uso

1. En **Crear proyecto**, selecciona **Pre-experimento**. Solo el nombre del proyecto es necesario. Puedes agregar información y preguntas durante la creación o hacerlo después.
2. En **Proyectos**, pulsa la tarjeta del proyecto (o los tres puntos > **Editar**). Se abre la página de edición del proyecto (`/proyectos/editar?proyecto=<id>`), con su nombre y su descripción arriba y sus secciones en pestañas: **Proyecto**, **Participantes**, **Cuestionarios**, **Pantalla** y **Notas**. Registra participantes, información de pantalla y datos relevantes. Las medidas de pantalla vacías (resolución y tamaño físico) se completan con las guardadas en **Configuración**, que es global. La distancia a la pantalla solo respalda el registro de distancia del eye tracker: al agregar la carpeta, rellena las muestras donde ese registro falló (o todas, si el archivo no lo trae) siempre que se conozca el tamaño físico de la pantalla. Los participantes tienen los mismos campos que en un proyecto creado con su carpeta: el documento de identificación los identifica, es obligatorio y no puede repetirse en el proyecto; nombre, sexo (Masculino, Femenino u Otro, en un desplegable), edad y notas son opcionales. Los guardados antiguos identificados por un código se siguen abriendo y piden el documento al guardarlos de nuevo.
3. En **Cuestionarios**, agrega preguntas en **Antes del experimento**, **Después del experimento**, o en ambos: un cuestionario existe en cuanto tiene una pregunta, sin interruptor aparte. Cada cuestionario permite preguntas abiertas, selección múltiple con una o varias opciones, y verdadero/falso. Puedes marcar preguntas como obligatorias y ordenar las preguntas. Los guardados antiguos con preguntas en un cuestionario desactivado se abren como activos y se guardan así. En **Notas** se apunta lo que haya que recordar del proyecto: cada nota tiene un título y su texto, y las que quedan vacías no se guardan.
4. Guarda los cambios antes de aplicar un cuestionario. En **Cuestionarios** > **Respuestas**, pulsa **Responder cuestionario**, selecciona participante y cuestionario, abre el formulario y entrega la aplicación al participante para que responda. Esta primera versión usa la sesión del investigador; no genera cuentas de participantes ni enlaces públicos.
5. Consulta las respuestas en **Cuestionarios** > **Respuestas**. Cada envío conserva la identidad, las preguntas, las opciones y las respuestas tal como existían en ese momento. Si el cuestionario o el participante se editan después, el historial anterior permanece.
6. Cuando tengas la carpeta, pulsa **Subir** en la tarjeta del proyecto para continuar con el asistente de carga habitual. La preparación y las respuestas se conservan.

Un proyecto con carpeta se edita en la misma página, desde los tres puntos > **Editar**: no hay un menú aparte para el pre-experimento, y las respuestas tomadas antes de agregar la carpeta siguen disponibles. Esa página añade **Dispositivos**, **Áreas de interés** (las AOI de cada estímulo de imagen) y **Carpeta** (reemplazar la carpeta del experimento). **Guardar cambios** envía solo lo que cambió.

En un proyecto con carpeta, **Participantes** tiene dos listas: **Del experimento** (los detectados en los archivos, con sexo y edad obligatorios para el análisis) y **Para cuestionarios** (los de la preparación, a quienes se aplican los cuestionarios). Se guardan por separado. Usar el mismo documento facilita reconocer a una persona entre ambos registros; esta versión no los enlaza automáticamente.

## Persistencia y exportación

La preparación se guarda en la base de datos del proyecto, no en el almacenamiento del navegador ni en Google Drive. La migración **026** agrega la configuración con su revisión y una tabla de envíos. La aplicación de las migraciones sigue el mecanismo habitual de inicio del backend; no se necesita una carpeta ni conexión de Drive para preparar el proyecto.

La descarga JSON (**Cuestionarios** > **Respuestas** > **Descargar respuestas**) contiene los datos del proyecto, la preparación y el historial con sus copias originales. Estos datos quedan disponibles para una integración posterior con los informes. Esta etapa no modifica el generador de informes.

Si otra sesión cambia la configuración, una edición o un envío con una revisión antigua se rechaza y requiere recargar. El formulario conserva los datos locales para poder revisarlos antes de descartar o reintentar. Las respuestas ya guardadas no se sobrescriben; una nueva aplicación produce un nuevo envío.

Solo el propietario autenticado del proyecto puede consultar, modificar, responder o exportar estos datos. Eliminar el proyecto elimina también su configuración e historial.

## Contrato de API

- `POST /api/projects/`: `pre_experiment` opcional; cuando se proporciona, crea un borrador sin archivos. `{}` es válido y permite configurar todo después.
- `GET /api/projects/{id}/pre-experiment`: devuelve `revision`, `config` y `responses`. Los proyectos existentes sin preparación devuelven una configuración vacía con revisión 0.
- `PUT /api/projects/{id}/pre-experiment`: recibe `revision` y `config`; actualiza solo si la revisión coincide y devuelve el estado persistido.
- `POST /api/projects/{id}/pre-experiment/responses`: recibe `revision`, `participant_id`, `phase` (`before` o `after`) y `answers`; devuelve el envío guardado con sus copias originales.
- `GET /api/projects/{id}/pre-experiment/export`: descarga JSON con la preparación y los envíos.

Las preguntas y opciones tienen identificadores UUID estables. Las respuestas abiertas son cadenas, verdadero/falso usa booleanos JSON, y selección múltiple acepta una opción o una lista de identificadores de opciones. Se validan las respuestas obligatorias, la pertenencia de participantes y opciones, y la disponibilidad del cuestionario.

# Pre-experimentos y cuestionarios

## Uso

1. En **Crear nuevo proyecto**, selecciona **Pre-experimento**. Solo el nombre del proyecto es necesario. Puedes agregar información y preguntas durante la creación o hacerlo después.
2. Abre **Configuración** y selecciona el proyecto. Registra participantes, información de pantalla y datos relevantes. Cada participante tiene un código estable para reconocerlo; nombre y código son necesarios al agregarlo, y documento, género, edad y notas son opcionales.
3. Habilita el cuestionario **Antes del experimento**, **Después del experimento**, o ambos. Cada cuestionario permite preguntas abiertas, selección múltiple con una o varias opciones, y verdadero/falso. Puedes marcar preguntas como obligatorias y ordenar las preguntas. Un cuestionario deshabilitado conserva su definición.
4. Guarda la configuración antes de aplicar un cuestionario. Selecciona participante y momento, abre el formulario y entrega la aplicación al participante para que responda. Esta primera versión usa la sesión del investigador; no genera cuentas de participantes ni enlaces públicos.
5. Consulta las respuestas desde la misma configuración. Cada envío conserva la identidad, las preguntas, las opciones y las respuestas tal como existían en ese momento. Si el cuestionario o el participante se editan después, el historial anterior permanece.
6. Cuando tengas la carpeta, usa **Agregar carpeta** en el proyecto para continuar con el asistente de carga habitual. La preparación y las respuestas se conservan.

Los proyectos con carpeta también pueden usar esta configuración. Los participantes de preparación se guardan independientemente de los detectados en los archivos. Usar el mismo código facilita reconocer a una persona entre ambos registros; esta versión no los enlaza automáticamente.

## Persistencia y exportación

La preparación se guarda en la base de datos del proyecto, no en el almacenamiento del navegador ni en Google Drive. La migración **026** agrega la configuración con su revisión y una tabla de envíos. La aplicación de las migraciones sigue el mecanismo habitual de inicio del backend; no se necesita una carpeta ni conexión de Drive para preparar el proyecto.

La descarga JSON desde Configuración contiene los datos del proyecto, la preparación y el historial con sus copias originales. Estos datos quedan disponibles para una integración posterior con los informes. Esta etapa no modifica el generador de informes.

Si otra sesión cambia la configuración, una edición o un envío con una revisión antigua se rechaza y requiere recargar. El formulario conserva los datos locales para poder revisarlos antes de descartar o reintentar. Las respuestas ya guardadas no se sobrescriben; una nueva aplicación produce un nuevo envío.

Solo el propietario autenticado del proyecto puede consultar, modificar, responder o exportar estos datos. Eliminar el proyecto elimina también su configuración e historial.

## Contrato de API

- `POST /api/projects/`: `pre_experiment` opcional; cuando se proporciona, crea un borrador sin archivos. `{}` es válido y permite configurar todo después.
- `GET /api/projects/{id}/pre-experiment`: devuelve `revision`, `config` y `responses`. Los proyectos existentes sin preparación devuelven una configuración vacía con revisión 0.
- `PUT /api/projects/{id}/pre-experiment`: recibe `revision` y `config`; actualiza solo si la revisión coincide y devuelve el estado persistido.
- `POST /api/projects/{id}/pre-experiment/responses`: recibe `revision`, `participant_id`, `phase` (`before` o `after`) y `answers`; devuelve el envío guardado con sus copias originales.
- `GET /api/projects/{id}/pre-experiment/export`: descarga JSON con la preparación y los envíos.

Las preguntas y opciones tienen identificadores UUID estables. Las respuestas abiertas son cadenas, verdadero/falso usa booleanos JSON, y selección múltiple acepta una opción o una lista de identificadores de opciones. Se validan las respuestas obligatorias, la pertenencia de participantes y opciones, y la disponibilidad del cuestionario.

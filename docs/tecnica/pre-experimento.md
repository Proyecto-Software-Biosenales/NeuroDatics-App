# Pre-experimentos y cuestionarios: persistencia y API

Cómo se guarda y se expone la preparación de un proyecto (participantes, pantalla, cuestionarios y notas). Cómo
se usa desde la interfaz está en [usuario/pre-experimento.md](../usuario/pre-experimento.md).

## Persistencia y exportación

La preparación se guarda en la base de datos del proyecto, no en el almacenamiento del navegador ni en Google
Drive. La migración `026` agrega la configuración con su revisión y una tabla de envíos. Las migraciones se
aplican con el mecanismo habitual de inicio del backend; para preparar un proyecto no hace falta una carpeta ni
una conexión de Drive.

La descarga JSON (**Cuestionarios** > **Respuestas** > **Descargar respuestas**) contiene los datos del proyecto,
la preparación y el historial con sus copias originales. El generador de informes no la usa.

Si otra sesión cambia la configuración, una edición o un envío con una revisión antigua se rechaza y requiere
recargar. El formulario conserva los datos locales para poder revisarlos antes de descartar o reintentar. Las
respuestas ya guardadas no se sobrescriben; una nueva aplicación produce un nuevo envío.

Solo el propietario autenticado del proyecto puede consultar, modificar, responder o exportar estos datos.
Eliminar el proyecto elimina también su configuración e historial.

## Compatibilidad con guardados antiguos

- Un participante guardado con un código en lugar de documento se sigue abriendo; el documento se pide al
  guardarlo de nuevo.
- Un cuestionario guardado como desactivado pero con preguntas se abre como activo y se guarda así: un
  cuestionario existe en cuanto tiene una pregunta.

## Contrato de API

- `POST /api/projects/`: `pre_experiment` opcional; cuando se proporciona, crea un borrador sin archivos. `{}` es
  válido y permite configurar todo después.
- `GET /api/projects/{id}/pre-experiment`: devuelve `revision`, `config` y `responses`. Los proyectos existentes
  sin preparación devuelven una configuración vacía con revisión 0.
- `PUT /api/projects/{id}/pre-experiment`: recibe `revision` y `config`; actualiza solo si la revisión coincide y
  devuelve el estado persistido.
- `POST /api/projects/{id}/pre-experiment/responses`: recibe `revision`, `participant_id`, `phase` (`before` o
  `after`) y `answers`; devuelve el envío guardado con sus copias originales.
- `GET /api/projects/{id}/pre-experiment/export`: descarga JSON con la preparación y los envíos.

Las preguntas y opciones tienen identificadores UUID estables. Las respuestas abiertas son cadenas,
verdadero/falso usa booleanos JSON, y selección múltiple acepta una opción o una lista de identificadores de
opciones. Se validan las respuestas obligatorias, la pertenencia de participantes y opciones, y la
disponibilidad del cuestionario.

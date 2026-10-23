# Pre-experimento y cuestionarios {#cap-preexperimento}

Un pre-experimento es un proyecto que todavía no tiene datos. Úsalo para preparar el estudio antes de grabar: registrar a los participantes, escribir los cuestionarios, anotar la pantalla y tomar notas. Cuando tengas las grabaciones, cargas la carpeta desde la tarjeta del proyecto y todo lo preparado se conserva.

Todo lo de este capítulo funciona igual en las dos ediciones. Los cuestionarios, la pantalla y las notas también existen en los proyectos con datos: se editan en las mismas pestañas del editor del proyecto. Ver [[ref:editar-proyecto]].

## Crear un pre-experimento {#crear-preexperimento}

Crea el pre-experimento con su nombre y, si ya los tienes, sus participantes, cuestionarios, pantalla y notas. Lo que no completes ahora puedes añadirlo después en el editor.

La [[fig:6-1]] muestra el diálogo de creación en modo pre-experimento.

![[fig:6-1|El diálogo «Crear proyecto» en modo pre-experimento, con sus pestañas.|w=5.3]]

1. En **Proyectos**, haz clic en **Crear proyecto**.
2. Haz clic en **Pre-experimento** (1).
   Aparecen las pestañas (2) **Proyecto**, **Participantes**, **Cuestionarios**, **Pantalla** y **Notas**.
3. En **Proyecto**, escribe el **Nombre del proyecto** y, si quieres, una **Descripción**.
   El asterisco (*) junto a un campo indica que es obligatorio.
4. Completa las demás pestañas que ya puedas. Pasa de una a otra haciendo clic en ellas o con **Siguiente** y **Anterior**.
5. Haz clic en **Crear pre-experimento** (3).

Al terminar, el diálogo se cierra y aparece la tarjeta del proyecto con el estado **Pre-experimento**, el número de participantes registrados y el botón **Subir**. Para seguir preparándolo, haz clic en la tarjeta: se abre el editor del proyecto. Ver [[ref:editar-proyecto]].

Para salir sin crear nada, haz clic en **Cancelar**.

### Si algo sale mal

Al hacer clic en **Crear pre-experimento**, NeuroDatics revisa las pestañas en orden. Si alguna tiene un problema, se abre, su nombre se marca en rojo con un punto y el motivo aparece en un recuadro rojo. Corrígelo y vuelve a hacer clic en **Crear pre-experimento**.

Si aparece «Ya existe un proyecto con ese nombre», elige otro nombre. Ver [[ref:problemas-edicion]].

## Registrar participantes planificados {#participantes-planificados}

Registra a las personas que harán el experimento. El documento de identidad es lo que después une a cada persona con sus datos grabados, así que escríbelo tal como aparecerá en las grabaciones.

1. Abre la pestaña **Participantes**, en el diálogo de creación o en el editor del proyecto.
2. Haz clic en **Agregar participante**.
   Aparece la tarjeta «Participante 1».
3. Escribe el **Documento** de la persona, como en la [[fig:6-2]].
4. Completa, si los tienes, **Nombre**, **Sexo**, **Edad** y **Notas del participante**.
5. Repite los pasos 2 a 4 con cada persona.
6. Guarda con **Crear pre-experimento** o, en el editor, con **Guardar cambios**.

![[fig:6-2|La tarjeta de un participante planificado; el documento es el único campo obligatorio.|w=5.3]]

Al terminar, cada tarjeta muestra, bajo «Participante N», el documento y el nombre de la persona.

<!-- anchos: 28 72 -->
| Campo | Qué escribir |
| --- | --- |
| **Nombre** | El nombre de la persona. Si lo dejas vacío, se muestra el documento. |
| **Documento** | Su documento de identidad. Es obligatorio y no puede repetirse en el proyecto. |
| **Sexo** | **Masculino**, **Femenino** u **Otro**. |
| **Edad** | Un número entero entre 0 y 150. |
| **Notas del participante** | Observaciones o condiciones especiales de esa persona. |

Para quitar a alguien, haz clic en la papelera de su tarjeta (**Quitar participante**).

::: nota
En un pre-experimento, el sexo y la edad pueden quedar vacíos. Cuando cargues la carpeta, NeuroDatics los pedirá para los participantes que aparezcan en las grabaciones. Ver [[ref:participantes]].
:::

### Si algo sale mal

<!-- anchos: 50 50 -->
| Mensaje | Qué hacer |
| --- | --- |
| «Escribe el documento de identificación de cada participante.» | Completa el **Documento** de la tarjeta que dice «Sin documento todavía». |
| «Hay dos participantes con el documento …» | Corrige uno de los dos; la tarjeta repetida dice «Documento repetido» en rojo. |
| «La edad debe ser un entero entre 0 y 150.» | Escribe la edad sin decimales. |

## Preparar los cuestionarios {#cuestionarios}

Cada proyecto puede tener dos cuestionarios: uno **Antes del experimento** (datos previos, estado inicial, expectativas) y otro **Después del experimento** (percepción, recuerdo, satisfacción). El participante los responde en el mismo computador. Ver [[ref:responder]].

1. Abre la pestaña **Cuestionarios** y elige **Antes del experimento** o **Después del experimento**.
2. Haz clic en **Agregar pregunta**.
3. Escribe la pregunta en el recuadro «Escribe la pregunta…».
4. Elige el **Tipo de pregunta** (1): **Respuesta abierta**, **Selección múltiple** o **Verdadero o falso**.
5. Si es de selección múltiple, escribe cada opción y haz clic en **Agregar opción** (2) para añadir más.
6. Deja marcada **Obligatoria** (3) si el participante no puede dejarla en blanco, o desmárcala.
7. Guarda con **Crear pre-experimento** o, en el editor, con **Guardar cambios**.

La [[fig:6-3]] muestra una pregunta de selección múltiple.

![[fig:6-3|Una pregunta de selección múltiple con su tipo, sus opciones y la casilla Obligatoria.|w=5.3]]

Al terminar, la pestaña del momento muestra un número con la cantidad de preguntas. Un cuestionario existe en cuanto tiene una pregunta; no hay que activarlo.

- Para cambiar el orden, usa las flechas **Subir** y **Bajar** de cada pregunta.
- Para borrar una pregunta, haz clic en **Quitar**; para borrar una opción, en la X **Quitar opción**.
- Una pregunta de selección múltiple empieza con dos opciones vacías, y el participante puede marcar varias.

::: importante
Si cambias el tipo de una pregunta de selección múltiple, sus opciones se borran.
:::

El cuestionario no tiene un campo de título: el participante verá «Cuestionario antes del experimento» o «Cuestionario después del experimento».

### Si algo sale mal

- «Escribe todas las preguntas de «Antes del experimento».» (o de «Después del experimento»): hay una pregunta sin texto. Escríbela o quítala.
- «Cada pregunta de selección múltiple necesita al menos dos opciones completas.»: completa las opciones vacías o quítalas.

Ver [[ref:problemas-edicion]]. Los límites de preguntas y opciones están en [[ref:ref-limites]].

## Configurar la pantalla del experimento {#pantalla-proyecto}

La pestaña **Pantalla** guarda cómo era la pantalla de este proyecto y las condiciones de la sala. Sus medidas empiezan con los valores de Configuración, la pantalla general del laboratorio (ver [[ref:config-pantalla]]); cámbialas solo si en este experimento usaste otra.

1. Abre la pestaña **Pantalla**.
2. En «Pantalla», revisa **Ancho (px)** y **Alto (px)**: la resolución en píxeles.
3. En «Medidas físicas», revisa **Ancho (cm)** y **Alto (cm)** y escribe la **Distancia (cm)** del participante a la pantalla, como en la [[fig:6-4]].
4. En «Notas», escribe las **Notas de pantalla** (brillo, calibración, iluminación) y los **Datos relevantes del experimento** (objetivo, condiciones, orden de los estímulos).
5. Guarda con **Crear pre-experimento** o con **Guardar cambios**.

![[fig:6-4|La pestaña Pantalla con sus medidas físicas.|w=5.3]]

Al terminar, las medidas quedan guardadas con el proyecto. Los campos pueden quedar vacíos si no conoces el dato.

::: nota
La **Distancia (cm)** solo se usa si falla el registro de distancia del Eye tracker, que es más preciso.
:::

Si aparece «Las medidas de pantalla deben ser positivas; los píxeles deben ser enteros.», corrige el valor: los píxeles van sin decimales y ninguna medida puede ser cero ni negativa.

## Tomar notas del proyecto {#notas}

La pestaña **Notas** guarda lo que quieras recordar del proyecto: decisiones, incidencias o pendientes. Son distintas de las notas de cada participante y de las notas de pantalla.

1. Abre la pestaña **Notas**.
2. Haz clic en **Agregar nota**.
3. Escribe el título y el texto de la nota.
4. Para borrar una nota, haz clic en su papelera (**Quitar nota**).
5. Guarda con **Crear pre-experimento** o con **Guardar cambios**.

Al terminar, las notas quedan guardadas con el proyecto. Una nota sin título ni texto no se guarda.

## Aplicar un cuestionario a un participante {#responder}

El cuestionario se responde en el mismo computador, con NeuroDatics abierto: eliges al participante y le entregas el computador. No hace falta que el participante tenga cuenta.

Antes de empezar:

- **Guarda los cambios**: si hay cambios sin guardar, no puedes responder.
- **Al menos un participante** guardado en el proyecto.
- **Al menos un cuestionario** con una pregunta.

1. Abre el proyecto en el editor y haz clic en la pestaña **Cuestionarios**. Ver [[ref:editar-proyecto]].
2. Haz clic en **Respuestas** y después en **Responder cuestionario**.
3. Elige el **Participante** y el **Cuestionario**, y haz clic en **Comenzar**.
4. Entrega el computador al participante.
   Mientras responde, el diálogo no se cierra por accidente: no tiene X, ni se cierra con Esc ni con un clic fuera.
5. Espera a que el participante responda. Las preguntas con * son obligatorias (1).
6. Haz clic en **Guardar respuestas** (2).
   Aparece «Respuestas guardadas.».
7. Haz clic en **Cerrar**.

La [[fig:6-5]] muestra el formulario que ve el participante.

![[fig:6-5|El formulario del cuestionario, con una pregunta obligatoria y el botón Guardar respuestas.|w=4.5]]

Al terminar, la respuesta aparece en la subpestaña **Respuestas**. Para abandonar un cuestionario a medias, haz clic en **Descartar**.

En las preguntas de verdadero o falso se elige **Verdadero** o **Falso**; en las de selección múltiple, «Marca una o varias opciones.».

::: nota
Cada respuesta guarda una copia del participante y del cuestionario tal como estaban al responder. Si después editas el cuestionario, las respuestas anteriores no cambian.
:::

### Si algo sale mal

- **Responder cuestionario** está desactivado y aparece «Guarda los cambios para responder o descargar.»: haz clic en **Guardar cambios**.
- Aparece «Para responder, agrega un participante y una pregunta, y guarda.»: falta un participante o una pregunta.
- Aparece «Completa todas las respuestas obligatorias.»: hay una pregunta con * sin responder.
- Aparece un mensaje que empieza por «No se pudo completar la operación:»: lee el motivo que sigue. Ver [[ref:problemas-edicion]].

## Revisar y descargar las respuestas {#respuestas}

La subpestaña **Respuestas** guarda el historial de todos los cuestionarios respondidos en el proyecto, del más reciente al más antiguo.

1. Abre el proyecto en el editor, haz clic en **Cuestionarios** y después en **Respuestas**.
2. Haz clic en una respuesta para abrirla.
   Cada respuesta se titula con el participante, el momento del cuestionario y la fecha y hora.
3. Para guardar todas las respuestas en tu computador, haz clic en **Descargar respuestas**, como en la [[fig:6-6]].

![[fig:6-6|Una respuesta abierta en el historial y el botón Descargar respuestas.|w=5.3]]

Al abrir una respuesta ves el título del cuestionario, el documento, el sexo y la edad del participante («Sin dato» si falta alguno) y cada pregunta con lo que contestó, o «Sin respuesta».

La descarga es un archivo `pre-experimento-<id>.json`, donde `<id>` es el identificador del proyecto. Contiene la preparación completa del proyecto y todo el historial de respuestas. Lo encuentras en la carpeta de descargas del navegador.

Si todavía no hay respuestas, aparece «Todavía no hay respuestas guardadas». Si **Descargar respuestas** está desactivado, guarda antes los cambios pendientes. Ver [[ref:problemas-edicion]].

## Subir los datos de un pre-experimento {#subir-preexperimento}

Cuando tengas las grabaciones, carga la carpeta del experimento en el pre-experimento. NeuroDatics une a cada participante planificado con sus datos por el documento.

Antes de empezar, prepara la carpeta del experimento. Ver [[ref:preparar-carpeta]].

1. En **Proyectos**, haz clic en **Subir** en la tarjeta del pre-experimento.
   Se abre el asistente con el nombre y la descripción del proyecto ya escritos.
2. Elige la carpeta del experimento y haz clic en **Siguiente**. Ver [[ref:cargar-carpeta]].
3. Revisa los sensores detectados y haz clic en **Siguiente**.
4. En el paso de participantes, revisa el **Asignar documento** de cada participante planificado. Ver [[ref:asignar-documento]].
5. Completa el sexo y la edad que falten y continúa.
6. Dibuja las áreas de interés y haz clic en **Guardar proyecto**. Ver [[ref:aoi]].

Al terminar, el proyecto pasa a **Activo** y conserva los cuestionarios, las respuestas, la pantalla y las notas del pre-experimento.

Si alguien queda **Sin asignar**, puedes asignarle su documento más tarde en el editor. Ver [[ref:participantes]].

Si algo falla al cargar la carpeta, ver [[ref:problemas-datos]].

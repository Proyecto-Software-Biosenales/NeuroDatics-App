# Proyectos {#cap-proyectos}

Un proyecto reúne todo lo de un estudio: la carpeta con los datos del experimento, los sensores, los participantes, los escenarios y sus áreas de interés. Este capítulo explica cómo crear, revisar, editar, archivar y eliminar proyectos. La carga de la carpeta y su procesamiento están en [[ref:cap-datos]].

## Ver y filtrar tus proyectos {#ver-proyectos}

La página **Proyectos** muestra tus proyectos como tarjetas. Desde aquí creas proyectos y abres los que ya tienes. La [[fig:3-1]] muestra la lista.

![[fig:3-1|La lista de proyectos: filtros por estado, botón para crear un proyecto y menú de opciones de cada tarjeta.|w=6.5]]

1. Haz clic en **Proyectos** en la barra superior.
2. Haz clic en un filtro (1): **Todos**, **Borradores**, **Activos** o **Archivados**. **Borradores** incluye los pre-experimentos.
3. Para crear un proyecto, haz clic en **Crear proyecto** (2). Ver [[ref:crear-proyecto]].
4. Para editar, archivar o eliminar un proyecto, haz clic en **Opciones del proyecto** (3), el botón de tres puntos de su tarjeta.

Al terminar, solo ves las tarjetas del estado elegido; si no hay ninguna, aparece «No hay proyectos en este estado.». Sin ningún proyecto, la página muestra «No hay proyectos creados».

La lista se actualiza sola mientras se procesa una carpeta. Cuando termina, aparece el aviso «Carpeta de «…» procesada. Puedes continuar.» con un sonido breve.

Si aparece «No se pudieron cargar los proyectos.», recarga la página del navegador. Si sigue igual, ver [[ref:problemas-edicion]].

## Entender la tarjeta de un proyecto {#tarjeta}

Cada tarjeta resume un proyecto y te dice qué hacer a continuación. De arriba abajo muestra:

- El nombre del proyecto y su estado con un punto de color: **Borrador** (ámbar), **Activo** (verde) o **Archivado** (gris). Un pre-experimento que aún no tiene datos muestra **Pre-experimento**.
- La fecha de creación, como «Creado: 14/10/2026», y, si el proyecto cambió después, la de su último cambio («Modificado: …»).
- Los sensores del proyecto: **EEG**, **GSR** y **Eye tracker**.
- Al pie, el número de participantes y un botón con la acción siguiente.
- Arriba a la derecha, el botón **Opciones del proyecto** con **Editar**, **Eliminar** y **Archivar** (o **Desarchivar**).

La [[fig:3-2]] muestra tres tarjetas en estados distintos.

![[fig:3-2|Tres tarjetas en estados distintos: cada una ofrece en el pie el botón que corresponde a su estado.|w=6.5]]

<!-- anchos: 22 30 26 22 -->
| Lo que ves | Qué significa | Botón del pie | Clic en la tarjeta |
| --- | --- | --- | --- |
| **Activo** | Proyecto completo y listo para analizar. | **Ver proyecto**: abre el resumen ([[ref:ver-resumen]]). | Abre el Dashboard. |
| Atenuada, con «Procesando archivos» | Se está procesando la carpeta. La lista se actualiza sola. | Ninguno: espera. El menú tampoco responde. | No hace nada. |
| **Borrador** y «Carpeta sin procesar» | La carpeta no terminó de cargarse: la carga se interrumpió o no empezó. | **Retomar** ([[ref:retomar]]). | Abre el asistente en el paso 1. |
| **Borrador** con **Continuar** | Carpeta procesada; falta terminar el asistente. | **Continuar** ([[ref:retomar]]). | Abre el asistente en el paso 2. |
| **Borrador** con solo **Ver proyecto** | La carga falló mientras se procesaba. | **Ver proyecto**. Elimina el borrador ([[ref:eliminar]]) y crea el proyecto de nuevo. | Abre el resumen. |
| **Pre-experimento** | Proyecto preparado, aún sin datos. | **Subir** ([[ref:subir-preexperimento]]). | Abre el editor. |
| **Archivado** | Proyecto apartado de la vista principal; se conserva todo. | **Ver proyecto** (**Editar** en un pre-experimento). | Abre el resumen (el editor en un pre-experimento). |
| «Actualizar proyecto» en rojo | Se procesó con una versión anterior y no muestra el punto de mirada. | El de su estado. Vuelve a procesar la carpeta ([[ref:cap-problemas]]). | El de su estado. |

## Crear un proyecto con datos {#crear-proyecto}

Crea un proyecto cuando ya tienes la carpeta del experimento con los datos registrados. Si todavía no has hecho las grabaciones y quieres preparar participantes y cuestionarios, crea un pre-experimento. Ver [[ref:crear-preexperimento]].

Antes de empezar:

- Ten a mano la **carpeta del experimento** preparada. Ver [[ref:preparar-carpeta]].
- Revisa que la **pantalla** de Configuración sea la del laboratorio. Ver [[ref:config-pantalla]].

El asistente tiene cuatro pasos («Paso 1 de 4», etc.): nombre y carpeta, sensores, participantes y áreas de interés. La carpeta se procesa al salir del paso 1; el proyecto queda terminado con **Guardar proyecto** en el paso 4.

### Paso 1. Nombre y carpeta

La [[fig:3-3]] muestra el primer paso del asistente.

![[fig:3-3|Primer paso del asistente: tipo de proyecto, nombre y botón para elegir la carpeta.|w=4.5]]

1. En **Proyectos**, haz clic en **Crear proyecto**.
   Se abre el diálogo «Crear proyecto».
2. Deja seleccionado **Con datos** (1).
3. Escribe el **Nombre del proyecto** (2) y, si quieres, una **Descripción**.
4. Haz clic en **Seleccionar carpeta** (3), elige la carpeta del experimento y sigue [[ref:cargar-carpeta]].

### Paso 2. Sensores

En **Sensores utilizados** hay tres tarjetas: **Electroencefalógrafo**, **Sensor galvánico** y **Eye tracker**. Los sensores encontrados en los datos ya vienen marcados y llevan la insignia **Detectado**, como en la [[fig:3-4]].

![[fig:3-4|Paso 2: los sensores encontrados en los datos aparecen marcados con la insignia «Detectado».|w=4.5]]

1. Revisa los sensores marcados. Haz clic en una tarjeta para marcarla o desmarcarla.
2. Haz clic en **Siguiente**.

Debe quedar al menos un sensor marcado; si no, **Siguiente** no se activa.

### Paso 3. Participantes

En **Datos del participante** hay una tarjeta por cada participante encontrado en los datos, con el título «Participante 1», «Participante 2», etc. La [[fig:3-5]] muestra una tarjeta abierta.

![[fig:3-5|Paso 3: cada participante necesita sexo y edad para poder continuar.|w=4.5]]

1. Haz clic en el título de un participante para abrir su tarjeta. La primera ya viene abierta.
2. Elige el **Sexo** (1): **Masculino**, **Femenino** u **Otro**.
3. Escribe la **Edad** (2), en años y mayor que cero.
4. Si quieres, escribe el **Nombre**, corrige el **Documento** y añade **Notas del participante**.
5. Repite con cada tarjeta que lleve la insignia **Completar**.
6. Haz clic en **Siguiente**.

Mientras falte algún dato, aparece un aviso como «2 participantes requieren sexo y edad para continuar.» y **Siguiente** no se activa. Si dejas el **Documento** vacío, se usa el que viene en los datos; si dejas el **Nombre** vacío, se muestra el documento.

::: nota
Si el proyecto era un pre-experimento, este paso muestra también **Asignar documento** para unir cada participante planificado con sus datos. Ver [[ref:asignar-documento]].
:::

### Paso 4. Áreas de interés

En **Áreas de interés (AOI)** hay una tarjeta por cada escenario de imagen. Los escenarios de vídeo no aparecen aquí. Dibuja las zonas que quieras analizar con el Eye tracker; puedes guardar sin dibujar ninguna y añadirlas más tarde desde el editor. Ver [[ref:aoi]].

### Guardar el proyecto

Haz clic en **Guardar proyecto**. Verás «Guardando sensores y participantes…», «Finalizando la configuración del proyecto…» y «Listo. Cerrando…».

Al terminar, el diálogo se cierra, aparece el aviso «Proyecto «…» creado.» y la tarjeta queda como **Activo**.

### Cancelar o salir a medias

Sal del asistente con **Cancelar** o con la X de la esquina; el diálogo no se cierra al hacer clic fuera ni con Esc. Si la carpeta aún no se había procesado, el borrador se descarta, salvo que lo hubieras abierto con **Retomar**: entonces sigue en la lista. Si ya se procesó, el borrador se conserva con **Continuar** en su tarjeta. No lo cierres mientras se procesa. Ver [[ref:procesamiento]].

### Si algo sale mal

<!-- anchos: 40 60 -->
| Síntoma | Qué hacer |
| --- | --- |
| **Siguiente** no se activa en el paso 1 | Escribe el nombre, elige la carpeta y responde «Confirma la carpeta». Revisa los mensajes en rojo. Ver [[ref:cargar-carpeta]]. |
| «Ya existe un proyecto con ese nombre» | Elige otro nombre. |
| Error en rojo al procesar la carpeta | Corrige lo que indica el mensaje, vuelve a elegir la carpeta si hace falta y haz clic en **Siguiente** otra vez. Ver [[ref:problemas-datos]]. |
| «Error: No se pudo guardar el proyecto. Falló el paso: …» | Haz clic en **Cancelar**, vuelve a abrir el borrador con **Continuar** y guarda otra vez. |

## Dibujar áreas de interés {#aoi}

Un área de interés (AOI) es una zona de la imagen que quieres analizar por separado: un logotipo, un precio, un producto. El Dashboard y los informes del Eye tracker calculan sus métricas para cada área.

Las áreas se dibujan en el paso 4 del asistente o, más tarde, en la pestaña **Áreas de interés** del editor del proyecto ([[ref:editar-proyecto]]). En los dos sitios el editor es el mismo, como muestra la [[fig:3-6]].

![[fig:3-6|Editor de áreas de interés: modos de dibujo, colores y lista de áreas creadas.|w=6.5]]

1. Haz clic en el título del escenario para abrir su tarjeta. La primera ya viene abierta.
   Se muestra la imagen del escenario.
2. En la barra **Nueva AOI**, elige el modo de dibujo (1): **Silueta**, **Rectángulo** o **Círculo**.
3. Elige un color (2), o haz clic en el icono de paleta (**Elegir color personalizado**).
4. Arrastra sobre la imagen para dibujar el área.
   En **Silueta**, sigue el contorno de la forma; NeuroDatics suaviza el trazo.
5. En la lista **AOIs creadas** (3), escribe un nombre que diga qué es el área.
6. Repite con cada área que necesites.

Al terminar, cada área aparece en **AOIs creadas** con su forma, posición y tamaño. Para cambiar un área ya dibujada:

- **Mover:** arrastra la forma sobre la imagen.
- **Cambiar el tamaño:** selecciona el área en la lista y arrastra sus esquinas (rectángulo y círculo) o sus puntos (silueta).
- **Cambiar el color:** haz clic en otro color en la fila del área.
- **Eliminar:** haz clic en la papelera de su fila.

::: importante
Un área con el nombre vacío no se guarda. Cada área nueva recibe un nombre como «AOI 1»; si lo borras, escribe otro antes de guardar.
:::

Si un escenario muestra «No se pudo cargar la imagen del escenario.», no podrás dibujar en él. Ver [[ref:problemas-edicion]].

## Ver el resumen de un proyecto {#ver-resumen}

El resumen muestra, sin poder cambiarlo, lo que contiene un proyecto: sirve para comprobar participantes y áreas de interés antes de analizar.

1. En la tarjeta del proyecto, haz clic en **Ver proyecto**.
   Se abre «Ver proyecto: …», como en la [[fig:3-7]].
2. Revisa sus secciones y ciérralo con la X de la esquina.

![[fig:3-7|Resumen de un proyecto, con sus datos generales, sensores, participantes y escenarios.|w=5.3]]

<!-- anchos: 25 75 -->
| Sección | Qué muestra |
| --- | --- |
| **Información general** | Nombre, descripción y nombre de la carpeta que se cargó. |
| **Sensores** | Los sensores del proyecto. |
| **Participantes** | Una tabla con nombre, documento, edad y sexo. |
| **Escenarios** | Cada escenario, si es imagen o vídeo, y la imagen con sus áreas de interés dibujadas. |

Si aparece «No se pudo cargar el proyecto.», cierra el diálogo y vuelve a abrirlo. Para cambiar algo, usa el editor. Ver [[ref:editar-proyecto]].

## Editar un proyecto {#editar-proyecto}

El editor es el único lugar donde se cambia un proyecto, tenga datos o no.

1. En la tarjeta del proyecto, haz clic en **Opciones del proyecto** y luego en **Editar**.
   - En un pre-experimento también puedes hacer clic en la tarjeta.
2. Haz clic en la pestaña de lo que quieres cambiar (1).
3. Haz los cambios.
   Aparece «Hay cambios sin guardar.» (2).
4. Haz clic en **Guardar cambios** (3).

La [[fig:3-8]] muestra el editor de un proyecto con datos.

![[fig:3-8|Editor de un proyecto: pestañas de secciones, aviso de cambios pendientes y botón para guardar.|w=6.5]]

Al terminar, aparece «Cambios guardados.». **Descartar cambios** recupera lo último guardado y **Volver a proyectos** te lleva a la lista.

<!-- anchos: 25 75 -->
| Pestaña | Qué puedes cambiar |
| --- | --- |
| **Proyecto** | El **Nombre del proyecto**, obligatorio, y la **Descripción**. |
| **Participantes** | Los datos de cada participante ([[ref:participantes]]). |
| **Cuestionarios** | Las preguntas y sus respuestas ([[ref:cuestionarios]]). |
| **Pantalla** | La pantalla de este proyecto ([[ref:pantalla-proyecto]]). |
| **Áreas de interés** | Solo en proyectos con datos ([[ref:aoi]]). |
| **Notas** | Notas libres ([[ref:notas]]). |

La carpeta del experimento y los sensores no se cambian en el editor: para usar otra carpeta, crea un proyecto nuevo.

::: importante
Si cierras o recargas la página con cambios sin guardar, el navegador te pide confirmar. Si aceptas, los cambios se pierden.
:::

### Si algo sale mal

Si al guardar falta algo, la pestaña con el problema se marca en rojo y se abre sola con el mensaje en un recuadro rojo.

<!-- anchos: 45 55 -->
| Mensaje | Qué hacer |
| --- | --- |
| «Escribe el nombre del proyecto.» | Escribe un nombre en la pestaña **Proyecto**. |
| «Ya existe un proyecto con ese nombre» | Usa otro nombre. |
| «Completa sexo y edad de los participantes leídos de los datos.» | Completa esos campos en **Participantes**. |
| «Hay dos participantes con el documento …» | Corrige uno de los dos documentos. Ver [[ref:participantes]]. |
| «La configuración cambió en otra sesión. Conservamos tus cambios; descártalos y recarga la versión guardada antes de continuar.» | Se guardó desde otra pestaña o computador. Haz clic en **Descartar cambios** y repite tus cambios. |

Para otros mensajes, ver [[ref:problemas-edicion]].

## Gestionar los participantes {#participantes}

La pestaña **Participantes** del editor reúne a todas las personas del proyecto en una sola lista, con dos tipos:

- **De los datos.** Vienen de la carpeta, van primero y no se pueden quitar. **Sexo** y **Edad** son obligatorios; si dejas el **Documento** vacío, se usa el de los datos.
- **Planificados.** Los añadiste tú, por ejemplo en un pre-experimento. Van después, se pueden quitar con su papelera y su **Documento** es obligatorio.

Un participante de los datos y uno planificado con el mismo documento son la misma persona y comparten tarjeta. La [[fig:3-9]] muestra uno de cada tipo todavía sin unir.

![[fig:3-9|Pestaña Participantes: un participante de los datos y otro planificado que aún no tiene su documento en los datos.|w=6.5]]

Para corregir un participante:

1. En el editor, haz clic en la pestaña **Participantes**.
2. En la tarjeta del participante, cambia el **Documento** (1), el **Nombre**, el **Sexo**, la **Edad** o las **Notas del participante**.
3. Haz clic en **Guardar cambios**.

Para unir un participante planificado con sus datos:

1. Busca la tarjeta del participante planificado.
2. En **Asignar documento** (2), elige el documento con el que aparece en los datos.
   Las dos tarjetas se unen en una.
3. Haz clic en **Guardar cambios**. Si te equivocaste, haz clic en **Descartar cambios** antes de guardar.

Para añadir a alguien, haz clic en **Agregar participante** al final de la lista y escribe al menos su **Documento**. Mientras no esté unido a sus datos, no entra en el análisis. Ver [[ref:asignar-documento]].

El documento no puede repetirse en el proyecto. Si dos tarjetas tienen el mismo, una de ellas muestra «Documento repetido» en rojo y al guardar aparece «Hay dos participantes con el documento …». Corrige uno de los dos.

Al cargar la carpeta de un pre-experimento, esta unión se hace en el paso 3 del asistente. Ver [[ref:asignar-documento]].

## Archivar y desarchivar {#archivar}

Archiva un proyecto que ya no usas para que no ocupe la vista principal. Archivar no borra nada: el proyecto conserva sus datos, participantes y áreas de interés.

1. En la tarjeta del proyecto, haz clic en **Opciones del proyecto**.
2. Haz clic en **Archivar**, como en la [[fig:3-10]].

![[fig:3-10|Menú de opciones de una tarjeta, con la opción para archivar el proyecto.|w=5.3]]

Al terminar, aparece «Proyecto archivado.» y la tarjeta pasa a **Archivado**. Para verla, usa el filtro **Archivados** o **Todos**.

Para desarchivarlo, abre **Opciones del proyecto** en su tarjeta y haz clic en **Desarchivar**. Aparece «Proyecto desarchivado.». Un proyecto con datos vuelve a **Activo** y un pre-experimento vuelve a **Pre-experimento** (aparece también en el filtro **Borradores**).

::: importante
Un borrador que se archiva sin terminar vuelve como **Activo** al desarchivarlo, aunque nunca se haya completado. Termina el asistente antes de archivarlo, o elimínalo si ya no lo necesitas.
:::

**Archivar** no está disponible mientras la tarjeta muestra «Procesando archivos». Si aparece «No se pudo archivar el proyecto.» o «No se pudo desarchivar el proyecto.», inténtalo de nuevo; si sigue, ver [[ref:problemas-edicion]].

## Eliminar un proyecto {#eliminar}

Elimina un proyecto cuando ya no lo necesitas o cuando un borrador quedó con un error y quieres crearlo de nuevo.

::: importante
Eliminar no se puede deshacer y no hay papelera: se borran el proyecto, todo lo que contiene y sus archivos. Si solo quieres apartarlo, archívalo ([[ref:archivar]]).
:::

1. En la tarjeta del proyecto, haz clic en **Opciones del proyecto** y luego en **Eliminar**.
   Se abre «¿Eliminar proyecto?» con el aviso «Esta acción no se puede deshacer.», seguido de lo que se borra:
   - {servidor} el proyecto, sus registros asociados y su carpeta en Google Drive.
   - {estudiantes} el proyecto, sus registros asociados y sus archivos en este equipo.
2. Haz clic en **Continuar**.
   Aparece «Confirma la eliminación».
3. Escribe `eliminar` en el campo (1).
4. Haz clic en **Eliminar proyecto** (2).

La [[fig:3-11]] muestra el segundo paso.

![[fig:3-11|Segundo paso para eliminar: escribe «eliminar» para activar el botón.|w=5.3]]

El botón **Eliminar proyecto** solo se activa cuando el campo dice `eliminar`; no importan las mayúsculas. Para no eliminar, haz clic en **Cancelar** en cualquiera de los dos pasos.

Mientras se elimina, la tarjeta muestra «Eliminando proyecto…». Al terminar, aparece uno de estos avisos:

- {servidor} «Proyecto «…» y carpeta de Drive eliminados.», o «Proyecto «…» eliminado. Carpeta de Drive no confirmada.» si no se pudo comprobar el borrado de sus archivos.
- {estudiantes} «Proyecto «…» y sus archivos eliminados.», o «Proyecto «…» eliminado. Archivos no confirmados.» si no se pudo comprobar el borrado de sus archivos.
- «Proyecto «…» eliminado.», si el proyecto no tenía archivos.

Si aparece «No se pudo eliminar el proyecto «…».», inténtalo de nuevo. Ver [[ref:problemas-edicion]].

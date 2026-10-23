# Primer análisis paso a paso {#cap-recorrido}

Este recorrido te lleva desde la aplicación vacía hasta tu primer informe en PDF. Cada paso dice lo esencial y remite a la guía de la tarea, donde están todos los detalles.

## Antes de empezar {#recorrido-antes}

Al terminar tendrás un proyecto activo, sus gráficas en el Dashboard y un informe en PDF de un participante.

Necesitas:

- **La carpeta del experimento** en tu computador: el archivo `.csv` exportado por el equipo de adquisición y las subcarpetas `Images` y `Videos` con lo que se mostró. Los nombres de las imágenes y vídeos deben coincidir con los escenarios del `.csv`. Ver [[ref:preparar-carpeta]].
- **Los datos de cada participante**: sexo y edad. NeuroDatics los pide para poder guardar el proyecto.
- **Unos minutos**: procesar la carpeta tarda más cuanto más grande sea.

## El recorrido {#recorrido-pasos}

### Paso 1. Revisa la pantalla del laboratorio

Abre el **menú de usuario** (arriba a la derecha) y elige **Configuración**. Comprueba el ancho y el alto en píxeles de la pantalla donde se mostraron los estímulos y haz clic en **Guardar configuración de pantalla**. Solo hace falta la primera vez. Ver [[ref:config-pantalla]].

### Paso 2. Crea el proyecto y elige la carpeta

En **Proyectos**, haz clic en **Crear proyecto** y deja marcado **Con datos**. Escribe el **Nombre del proyecto** (1), elige la carpeta del experimento (2) y haz clic en **Siguiente** (3), como en la [[fig:2-1]].

![[fig:2-1|El primer paso del asistente, con la carpeta ya elegida.|w=5.3]]

Si NeuroDatics te hace preguntas sobre la carpeta, respóndelas en el recuadro «Confirma la carpeta». Ver [[ref:confirmar-carpeta]]. Mientras se procesa, verás el avance en un panel con la barra y el tiempo restante. Ver [[ref:procesamiento]].

### Paso 3. Confirma los sensores y completa a los participantes

Cuando termina el procesamiento, el asistente pasa al paso 2 y marca los sensores que encontró en los datos con la etiqueta **Detectado**. Haz clic en **Siguiente**.

En el paso 3, abre la tarjeta de cada participante y completa **Sexo** y **Edad**. Si conoces el nombre o el documento, escríbelos también. Ver [[ref:crear-proyecto]].

### Paso 4. Dibuja un área de interés

En el paso 4 aparece cada imagen del experimento. Abre una, elige **Rectángulo** y arrastra sobre la zona que quieres medir, por ejemplo un logotipo o un precio. Escribe un nombre para el área y haz clic en **Guardar proyecto**. Ver [[ref:aoi]].

Al terminar aparece «Proyecto «…» creado.» y la tarjeta del proyecto pasa a **Activo**.

### Paso 5. Mira los resultados

Haz clic en la tarjeta del proyecto: se abre el **Dashboard** con ese proyecto ya elegido y la vista del primer sensor. A la izquierda están los sensores del proyecto; arriba, los filtros de escenario y participante; en el centro, las pestañas y las gráficas (la [[fig:5-1]] muestra esta pantalla).

Elige un participante y un escenario y recorre las pestañas. Ver [[ref:abrir-dashboard]].

### Paso 6. Descarga el informe

En **Informes**, elige el proyecto. Deja **Un participante**, elige el participante y el dispositivo y haz clic en **Descargar informe PDF**. Cuando aparece «Informe generado.», el PDF está en la carpeta de descargas del navegador. Ver [[ref:generar-informe]].

## Qué sigue {#recorrido-sigue}

- Para comparar a varios participantes, ver [[ref:cap-dashboard]].
- Para un informe de todo el grupo, ver [[ref:informe-grupo]].
- Para corregir datos de participantes o áreas de interés después, ver [[ref:editar-proyecto]].
- Para entender qué significa cada gráfica antes de sacar conclusiones, ver [[ref:cap-entender]].

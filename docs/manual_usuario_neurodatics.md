# Manual de Usuario de NeuroDatics

**Público:** investigadores, docentes y estudiantes
**Idioma:** español
**Alcance:** funcionalidades accesibles en la versión actual del proyecto

> Este manual se elaboró a partir de la interfaz y los flujos implementados actualmente en NeuroDatics. Las pantallas, opciones y mensajes pueden variar ligeramente según la edición instalada y los sensores disponibles en cada proyecto.

## 1. Introducción

NeuroDatics es una aplicación para organizar experimentos de neuromarketing y analizar datos de bioseñales. Permite cargar experimentos, asociar participantes y sensores, procesar archivos de adquisición y consultar visualizaciones de Eye Tracker, EEG y GSR.

La aplicación dispone de dos formas de uso:

- **Edición servidor:** utiliza cuentas de Google para el acceso y Google Drive para almacenar los archivos de los proyectos.
- **Edición local o de estudiantes:** funciona sin una cuenta de Google y conserva los archivos en el equipo donde se ejecuta.

NeuroDatics no sustituye la interpretación científica del investigador. Sus gráficas y métricas deben analizarse junto con el diseño experimental, la calidad de los datos y la metodología utilizada.

## 2. Objetivo del manual

Este manual explica cómo:

- Acceder a NeuroDatics.
- Crear y administrar proyectos.
- Cargar y procesar una carpeta de experimento.
- Organizar participantes, escenarios, sensores y áreas de interés.
- Consultar señales y métricas.
- Comparar participantes.
- Generar reportes PDF.
- Interpretar estados, avisos y errores habituales.

Las instrucciones están escritas para usuarios finales y no requieren conocimientos de programación.

## 3. Alcance de la versión

La versión documentada permite trabajar con los siguientes sensores:

| Sensor | Funcionalidades principales |
| --- | --- |
| Eye Tracker | Dilatación pupilar, gaze point, distancia al dispositivo, fijaciones, mapa de calor, mapa de recorridos y AOIs |
| EEG | Señal por canal, densidad espectral de potencia, espectrograma, topografía y avisos de calidad |
| GSR | Señal galvánica cruda y suavizada, estadísticas y selección de puntos |

La disponibilidad de una vista depende de que el proyecto contenga datos compatibles y de que el sensor esté registrado o detectado.

La edición servidor requiere conexión con Google para iniciar sesión y, para guardar archivos de experimentos, una conexión autorizada con Google Drive. La edición local está diseñada para trabajar sin esos servicios.

## 4. Requisitos

### 4.1. Requisitos para la edición servidor

En el paquete de distribución para Windows se requiere:

- Windows x64 en procesador Intel o AMD.
- Windows 11 23H2 o posterior, o Windows 10 22H2 con soporte vigente.
- Windows con virtualización habilitada en BIOS/UEFI.
- Mínimo 8 GB de RAM; se recomiendan 16 GB.
- Al menos 15 GB libres para la instalación, además del espacio de los experimentos.
- Docker Desktop.
- Conexión a Internet para el primer uso, Google y Google Drive.

La instalación entregada para Windows prepara o comprueba WSL y Docker Desktop. No es necesario instalar Node.js, Python, PostgreSQL ni Redis para utilizar el paquete distribuido.

### 4.2. Requisitos para la edición local o de estudiantes

La edición local se entrega como una aplicación para Windows que incluye sus componentes de ejecución. Requiere:

- Un equipo Windows compatible con el paquete entregado.
- Espacio suficiente para la aplicación y los experimentos.
- Permiso para ejecutar la aplicación y guardar datos en el perfil local.

No requiere inicio de sesión con Google ni conexión a Internet para realizar el análisis local.

### 4.3. Recomendaciones para los datos

- Mantenga una copia de respaldo de las carpetas originales.
- Verifique que los CSV correspondan a las grabaciones que desea analizar.
- Utilice nombres consistentes para participantes y escenarios.
- Evite cargar carpetas con archivos innecesarios o duplicados.
- Para cargas grandes, cierre aplicaciones que consuman mucha memoria.

`[CAPTURA: pantalla o ficha con los requisitos de la edición servidor y la edición local]`

## 5. Acceso a NeuroDatics

### 5.1. Iniciar la edición servidor

**Propósito:** abrir la aplicación disponible en el equipo o red institucional.

**Ruta para acceder:** navegador web, normalmente `http://localhost:3000`.

**Pasos:**

1. Inicie Docker Desktop.
2. Abra el grupo de contenedores `neurodatics`.
3. Pulse **Iniciar** en el grupo completo.
4. Espere a que los servicios aparezcan activos.
5. Abra `http://localhost:3000` o el acceso directo creado por el instalador.

**Resultado esperado:** se muestra la página de inicio de NeuroDatics.

**Posibles errores:**

- Si Docker Desktop no está abierto, la aplicación puede no responder.
- Si algún servicio no está saludable, espere unos instantes y vuelva a cargar la página.
- Si el puerto está ocupado, solicite al responsable de la instalación que revise la configuración.

`[CAPTURA: página de inicio de NeuroDatics en la edición servidor]`

### 5.2. Iniciar sesión con Google

**Propósito:** acceder a los proyectos protegidos de la edición servidor.

**Ruta para acceder:** `/login` o el icono de usuario de la barra superior.

**Pasos:**

1. Abra `/login`.
2. Pulse **Continuar con Google**.
3. Seleccione la cuenta autorizada por la institución o el equipo de investigación.
4. Acepte los permisos solicitados cuando corresponda.
5. Espere el regreso automático a NeuroDatics.

**Resultado esperado:** la sesión queda iniciada y se habilitan **Proyectos**, **Dashboard**, **Reportes** y **Configuración**.

**Posibles errores:**

- Si la red bloquea la redirección, revise la conexión y vuelva a intentarlo.
- Si la autorización falla, compruebe que la cuenta esté permitida en la configuración de la instalación.
- Si se cierra la sesión, vuelva a iniciar sesión con Google.

`[CAPTURA: pantalla de acceso con el botón Continuar con Google]`

### 5.3. Acceder a la edición local

**Propósito:** abrir la aplicación local sin autenticación externa.

**Ruta para acceder:** dirección local que muestra el lanzador, normalmente una dirección de loopback del equipo.

**Pasos:**

1. Ejecute el lanzador de NeuroDatics para estudiantes.
2. Espere a que el lanzador indique que la aplicación está lista.
3. Abra la dirección local mostrada o espere a que se abra el navegador.

**Resultado esperado:** la aplicación abre directamente con el usuario local fijo y muestra sus secciones protegidas.

**Posibles errores:**

- Si aparece que NeuroDatics no está disponible, compruebe que la ventana o proceso del lanzador siga abierto.
- Pulse **Reintentar** después de volver a iniciar el lanzador.

`[CAPTURA: pantalla de disponibilidad o acceso de la edición local]`

## 6. Interfaz general

### 6.1. Barra de navegación

**Propósito:** desplazarse entre las áreas principales.

**Ruta para acceder:** cualquier página de la aplicación.

**Pasos:**

1. Use **Inicio** para volver a la portada.
2. Use **Proyectos** para crear o administrar experimentos.
3. Use **Dashboard** para consultar análisis.
4. Use **Reportes** para generar documentos PDF.
5. Use **Configuración** para gestionar pre-experimentos y, en la edición servidor, Google Drive.

**Resultado esperado:** la página seleccionada se abre sin perder los datos guardados.

**Posibles errores:**

- Si una sección protegida redirige a `/login`, la sesión no está disponible.
- Si la carga tarda, espere a que desaparezca el indicador de carga.

`[CAPTURA: barra de navegación con Inicio, Proyectos, Dashboard, Reportes y Configuración]`

### 6.2. Cambiar el tema visual

**Propósito:** cambiar entre tema claro y oscuro.

**Ruta para acceder:** botón con icono de sol o luna en la barra superior.

**Pasos:**

1. Pulse el botón de tema.
2. Revise la actualización de colores de la interfaz.

**Resultado esperado:** la interfaz cambia al tema contrario.

**Posibles errores:** no hay errores funcionales conocidos; el cambio puede tardar un instante en reflejarse durante la carga inicial.

## 7. Gestión de proyectos

### 7.1. Consultar la lista de proyectos

**Propósito:** ver los experimentos disponibles y su estado.

**Ruta para acceder:** `/proyectos`.

**Pasos:**

1. Abra **Proyectos**.
2. Espere a que se carguen las tarjetas.
3. Revise el nombre, descripción, sensores, participantes y estado de cada proyecto.

**Resultado esperado:** aparece una tarjeta por proyecto.

**Posibles errores:**

- **No se pudieron cargar los proyectos del servidor:** revise que NeuroDatics esté iniciado.
- Si no hay proyectos, aparece una invitación para crear el primero.

`[CAPTURA: lista de proyectos con tarjetas y estados]`

### 7.2. Filtrar por estado

**Propósito:** encontrar proyectos por su etapa de trabajo.

**Ruta para acceder:** `/proyectos`, botones **Todos**, **Borradores**, **Activos** y **Archivados**.

**Pasos:**

1. Abra `/proyectos`.
2. Pulse el estado que desea consultar.
3. Seleccione **Todos** para volver a la lista completa.

**Resultado esperado:** solo se muestran los proyectos del estado elegido.

**Posibles errores:** si no hay proyectos en ese estado, aparece **No hay proyectos en este estado**.

### 7.3. Ver la información de un proyecto

**Propósito:** consultar los metadatos, sensores, participantes y escenarios sin editar.

**Ruta para acceder:** `/proyectos` > menú de opciones de una tarjeta > opción de visualización.

**Pasos:**

1. Ubique el proyecto.
2. Abra sus opciones.
3. Seleccione la opción para ver la información.
4. Revise nombre, descripción, carpeta, sensores, participantes y escenarios.

**Resultado esperado:** se abre un diálogo con la información disponible y las miniaturas de estímulos cuando existen.

**Posibles errores:**

- **No se pudo cargar la información del proyecto:** vuelva a abrir el diálogo o recargue la página.
- Si una imagen o vídeo no está disponible, se muestra un aviso en la previsualización.

`[CAPTURA: diálogo de información detallada de un proyecto]`

### 7.4. Editar un proyecto

**Propósito:** actualizar la información, sensores, participantes, AOIs o carpeta de un proyecto.

**Ruta para acceder:** `/proyectos` > menú de opciones > **Editar**.

**Pasos:**

1. Abra el menú de la tarjeta.
2. Seleccione **Editar**.
3. Modifique los pasos disponibles del asistente.
4. Si desea sustituir los archivos, active **Actualizar carpeta del experimento**.
5. Complete los datos requeridos.
6. Pulse **Guardar proyecto**.

**Resultado esperado:** aparece un mensaje de edición correcta y la tarjeta se actualiza.

**Posibles errores:**

- **No se pudo cargar la información del proyecto para editar:** cierre el diálogo y vuelva a intentarlo.
- **Completa sexo y edad de todos los participantes antes de guardar:** revise los datos demográficos.
- **No se pudo guardar la edición del proyecto:** compruebe la conexión y vuelva a intentar.
- Si no cambió nada, se informa **No hay cambios por guardar**.

### 7.5. Archivar y restaurar un proyecto

**Propósito:** retirar temporalmente un proyecto de la vista activa sin eliminarlo.

**Ruta para acceder:** `/proyectos` > menú de opciones de una tarjeta.

**Pasos para archivar:**

1. Abra las opciones del proyecto.
2. Seleccione **Archivar**.
3. Confirme la operación si se solicita.

**Pasos para restaurar:**

1. Seleccione el filtro **Archivados**.
2. Abra las opciones del proyecto.
3. Seleccione **Desarchivar**.

**Resultado esperado:** el proyecto cambia a **Archivado** o vuelve a **Activo**. Un pre-experimento restaurado vuelve a **Borrador**.

**Posibles errores:**

- **No se pudo archivar el proyecto:** revise la conexión y vuelva a intentarlo.
- **No se pudo desarchivar el proyecto:** confirme que el proyecto siga disponible.

### 7.6. Eliminar un proyecto

**Propósito:** eliminar un proyecto y sus registros asociados.

**Ruta para acceder:** `/proyectos` > menú de opciones > **Eliminar**.

**Pasos:**

1. Abra las opciones del proyecto.
2. Seleccione **Eliminar**.
3. Lea la advertencia.
4. Escriba exactamente `eliminar` para confirmar.
5. Confirme la eliminación.

**Resultado esperado:** el proyecto desaparece de la lista. En la edición servidor también se intenta eliminar su carpeta de Google Drive; en la edición local se eliminan sus archivos locales.

**Posibles errores:**

- Si no escribe `eliminar`, la operación no se confirma.
- **No se pudo eliminar el proyecto:** compruebe la conexión o que los archivos no estén siendo procesados.
- Si la carpeta de almacenamiento no puede confirmarse, el proyecto puede eliminarse aunque el sistema avise que la carpeta no fue confirmada.

`[CAPTURA: diálogo de confirmación de eliminación de un proyecto]`

## 8. Creación de proyectos

### 8.1. Crear un proyecto con carpeta de experimento

**Propósito:** crear un proyecto completo a partir de una carpeta que contiene los archivos del experimento.

**Ruta para acceder:** `/proyectos` > **Crear nuevo proyecto** > **Con carpeta**.

**Pasos:**

1. Abra `/proyectos`.
2. Pulse **Crear nuevo proyecto**.
3. Seleccione **Con carpeta**.
4. Complete el asistente de cuatro pasos.
5. En el último paso pulse **Guardar proyecto**.

**Resultado esperado:** se crea un proyecto y, cuando el procesamiento termina correctamente, queda disponible para análisis.

**Posibles errores:**

- El botón **Siguiente** permanece deshabilitado si el paso actual está incompleto.
- Si se cierra el asistente después de procesar la carpeta, el borrador puede conservarse para retomarlo.

`[CAPTURA: diálogo Crear nuevo proyecto mostrando el asistente de cuatro pasos]`

### 8.2. Paso 1: datos y carpeta

**Propósito:** registrar el nombre, descripción, calibración opcional y carpeta del experimento.

**Ruta para acceder:** `/proyectos` > **Crear nuevo proyecto** > **Con carpeta** > Paso 1.

**Pasos:**

1. Escriba el **Nombre del proyecto**.
2. Escriba una **Descripción** breve del objetivo.
3. Si conoce la pantalla usada en la adquisición, active **Usar geometría física para la detección ocular**.
4. Si activó la geometría, introduzca resolución horizontal y vertical, ancho y alto físicos y distancia ojo-pantalla.
5. Pulse **Seleccionar carpeta** o arrastre una carpeta al área indicada.
6. Si la estructura contiene varias opciones, responda las preguntas de confirmación.
7. Revise el resumen de CSV, imágenes y vídeos que se procesarán.

**Resultado esperado:** NeuroDatics identifica la carpeta y prepara el experimento para la carga.

**Posibles errores:**

- **No se encontraron archivos en la carpeta:** seleccione una carpeta con archivos.
- **La carpeta es demasiado grande. Máximo 500MB:** reduzca el contenido o divida el experimento.
- **Por favor arrastra una carpeta, no un archivo suelto:** arrastre el directorio completo.
- **Error al leer la carpeta arrastrada:** vuelva a seleccionarla con el selector del sistema.
- Si la estructura es ambigua, responda las preguntas mostradas antes de continuar.
- Si se activa la geometría, todos sus valores deben ser positivos.

`[CAPTURA: Paso 1 con nombre, descripción, geometría física y selector de carpeta]`

### 8.3. Ubicar estímulos en la pantalla

**Propósito:** indicar cómo se mostraron imágenes o vídeos dentro de la pantalla de adquisición cuando se dispone de esa información.

**Ruta para acceder:** Paso 1, después de seleccionar la carpeta, en el editor de colocación de estímulos.

**Pasos:**

1. Revise la lista de estímulos detectados.
2. Active los estímulos para los que desea registrar la transformación.
3. Indique el tamaño de la pantalla de adquisición en píxeles.
4. Seleccione el modo de visualización disponible.
5. Ajuste posición, tamaño y rotación cuando el modo lo permita.
6. Use **Centrar** si necesita restablecer la posición.
7. Use la opción de copiar la configuración a otros estímulos cuando corresponda.

**Resultado esperado:** la aplicación conserva la geometría de los estímulos para interpretar las coordenadas de mirada.

**Posibles errores:**

- Una ruta desconocida o una geometría incompatible impide completar el procesamiento.
- Los modos que ocupan o recortan toda la pantalla pueden desactivar algunos campos de posición.
- Si no se conoce la colocación, deje esta información sin activar y documente la limitación del experimento.

`[CAPTURA: editor de colocación de estímulos con la imagen y los controles de pantalla]`

### 8.4. Paso 2: sensores

**Propósito:** indicar qué dispositivos se utilizaron en el proyecto.

**Ruta para acceder:** asistente de creación > Paso 2, **Sensores utilizados**.

**Pasos:**

1. Seleccione **Electroencefalógrafo** para EEG.
2. Seleccione **Sensor Galvánico** para GSR.
3. Seleccione **Eye tracker** para Eye Tracker.
4. Verifique las etiquetas **Auto-detectado** cuando aparezcan.
5. Pulse **Siguiente**.

**Resultado esperado:** el proyecto queda asociado con los sensores seleccionados y se habilitan sus vistas analíticas cuando existan datos.

**Posibles errores:** si no selecciona sensores o los archivos no contienen columnas compatibles, algunas vistas no tendrán datos.

`[CAPTURA: Paso 2 con las tres tarjetas de sensores y una etiqueta Auto-detectado]`

### 8.5. Paso 3: participantes

**Propósito:** completar los datos demográficos que acompañan a los participantes detectados.

**Ruta para acceder:** asistente de creación > Paso 3, **Datos del participante**.

**Pasos:**

1. Abra el panel del participante que desea completar.
2. Seleccione el sexo: **Masculino**, **Femenino** u **Otro**.
3. Introduzca una edad mayor que cero.
4. Repita el proceso para cada participante.
5. Pulse **Siguiente**.

**Resultado esperado:** todos los participantes quedan completos y el asistente permite avanzar.

**Posibles errores:**

- La aplicación muestra cuántos participantes requieren sexo y edad.
- **Completa sexo y edad de todos los participantes antes de guardar:** revise los paneles marcados como **Completar**.

`[CAPTURA: Paso 3 con un participante expandido y sus campos demográficos]`

### 8.6. Paso 4: AOIs

**Propósito:** delimitar las áreas de interés de cada escenario de imagen.

**Ruta para acceder:** asistente de creación > Paso 4, **Áreas de Interés (AOIs)**.

**Pasos:**

1. Abra el escenario que desea editar.
2. Utilice el editor de AOIs sobre la imagen.
3. Cree y nombre cada área que sea relevante para la investigación.
4. Ajuste su forma y posición.
5. Repita la operación para los demás escenarios.
6. Pulse **Guardar proyecto**.

**Resultado esperado:** las AOIs quedan asociadas con cada escenario y pueden utilizarse en el Dashboard.

**Posibles errores:**

- Si no hay escenarios de imagen, aparece **No hay escenarios de imagen disponibles para definir AOIs**.
- Los escenarios de vídeo no muestran este editor de AOIs en este paso.

`[CAPTURA: editor de AOIs sobre la imagen de un escenario]`

### 8.7. Guardar el proyecto

**Propósito:** finalizar la creación después de completar los cuatro pasos.

**Ruta para acceder:** Paso 4 > **Guardar proyecto**.

**Pasos:**

1. Revise los sensores, participantes y AOIs.
2. Pulse **Guardar proyecto**.
3. Espere a que termine el guardado.

**Resultado esperado:** aparece un mensaje de creación correcta y el proyecto se muestra en `/proyectos`.

**Posibles errores:**

- **No hay un proyecto borrador para finalizar:** regrese al Paso 1 y procese la carpeta.
- **No se pudo guardar el proyecto:** vuelva a comprobar los datos obligatorios y la conexión.

## 9. Carga de experimentos

### 9.1. Seleccionar y cargar la carpeta

**Propósito:** enviar los archivos del experimento para que NeuroDatics los valide, procese y almacene.

**Ruta para acceder:** `/proyectos` > creación o edición de proyecto > Paso 1.

**Pasos:**

1. Seleccione una carpeta de experimento, no un archivo individual.
2. Espere el análisis de la estructura.
3. Si se solicita, elija el CSV, las carpetas de imágenes y vídeos y la carpeta de adquisición.
4. Confirme la selección cuando la estructura tenga varias alternativas.
5. Avance por el asistente y guarde el proyecto.

**Resultado esperado:** la carpeta se empaqueta y se inicia la carga al almacenamiento correspondiente.

**Posibles errores:**

- El archivo debe ser una carpeta seleccionada desde el navegador.
- Una carpeta vacía, demasiado grande o con estructura no resoluble no puede cargarse.
- Si falta una carpeta de imágenes o vídeos, NeuroDatics puede solicitar una confirmación explícita.

### 9.2. Qué archivos reconoce la aplicación

La carga puede detectar y contabilizar:

- Imágenes de escenarios.
- Vídeos de escenarios.
- Archivos CSV de adquisición.
- Otros archivos o recursos.
- Archivos de reporte cuando forman parte de la estructura reconocida.

La carpeta `Acquisition`, cuando existe, se utiliza para obtener posibles códigos de participantes y nombres de escenarios. Sus datos sirven como referencia para la organización; no reemplazan los archivos de adquisición seleccionados.

### 9.3. Almacenamiento según la edición

En la edición servidor, el proyecto y sus archivos se sincronizan con Google Drive. En la edición local, los archivos se guardan en el equipo.

La interfaz cambia sus mensajes para indicar **Google Drive** o **este equipo**, según la edición activa.

## 10. Procesamiento de datos

### 10.1. Seguir el procesamiento

**Propósito:** conocer el avance de la transferencia y del procesamiento de CSV.

**Ruta para acceder:** diálogo de creación o edición mientras se guarda el proyecto.

**Pasos:**

1. Después de guardar, observe la tarjeta de progreso.
2. Revise el porcentaje transferido.
3. Consulte velocidad, tiempo restante y tiempo transcurrido cuando estén disponibles.
4. Espere el mensaje de finalización.

**Resultado esperado:** el sistema muestra primero el avance de la transferencia y después el procesamiento de los datos.

**Posibles errores:**

- Si la carga tarda demasiado, mantenga abierta la ventana y compruebe la conexión.
- Si se cancela la carga, el proyecto puede quedar como borrador para retomarlo.
- Si el procesamiento falla, revise el resumen de errores y vuelva a cargar una carpeta corregida.

`[CAPTURA: tarjeta de progreso con porcentaje, velocidad, tiempo restante y botón Cancelar]`

### 10.2. Resultado de la ingesta

Al terminar, NeuroDatics muestra un resumen con cantidades de:

- Carpetas creadas.
- Archivos cargados.
- Imágenes.
- Vídeos.
- CSV detectados y procesados.
- Otros archivos.
- Escenarios creados.

También puede mostrar sensores y participantes detectados, advertencias de procesamiento y un enlace a la carpeta raíz de Google Drive en la edición servidor.

**Resultado esperado:** un procesamiento correcto deja el proyecto preparado para el Dashboard.

**Posibles errores:**

- **Ingesta con errores:** revise la información del resumen y las advertencias.
- **La ingesta no se completó en backend. Verifica estructura y contenido:** corrija la estructura o el contenido de la carpeta y vuelva a procesar.
- Si un CSV contiene bloques no válidos, la aplicación puede procesar otros bloques y registrar advertencias.

`[CAPTURA: resumen de carpeta procesada con conteos, sensores y participantes detectados]`

## 11. Dashboard

### 11.1. Abrir y seleccionar un proyecto

**Propósito:** consultar los análisis disponibles para un proyecto.

**Ruta para acceder:** `/dashboard`.

**Pasos:**

1. Abra **Dashboard**.
2. En el panel lateral, expanda un proyecto.
3. Seleccione el sensor que desea analizar: **Eye Tracker**, **Electroencefalógrafo**, **Sensor Galvánico** o **Comparativas**.
4. Use el botón de contraer o expandir el panel lateral si necesita más espacio.

**Resultado esperado:** el área principal muestra las vistas del sensor seleccionado.

**Posibles errores:**

- **Selecciona un proyecto del panel lateral:** elija un proyecto antes de consultar datos.
- Si un sensor no está registrado en el proyecto, no aparece como opción.
- Un proyecto sin datos puede mostrar vistas vacías o avisos de ausencia de datos.

`[CAPTURA: Dashboard con panel lateral, proyecto expandido y sensores disponibles]`

### 11.2. Navegar entre vistas

**Propósito:** cambiar entre las visualizaciones disponibles para el sensor activo.

**Ruta para acceder:** `/dashboard` > sensor > pestañas de análisis.

**Pasos:**

1. Seleccione un sensor.
2. Pulse una pestaña de vista.
3. Espere la carga de la gráfica o tabla.
4. Interactúe con los elementos disponibles, como selección de puntos, canales, zoom o AOIs.

**Resultado esperado:** la vista cambia sin salir del Dashboard.

## 12. Eye Tracker

### 12.1. Dilatación pupilar

**Propósito:** observar el diámetro pupilar a lo largo del tiempo y sus estadísticas.

**Ruta para acceder:** `/dashboard` > proyecto > **Eye Tracker** > **Dilatación pupilar**.

**Pasos:**

1. Seleccione un participante y un escenario en la barra de filtros.
2. Abra **Dilatación pupilar**.
3. Revise la serie temporal y las estadísticas.
4. Haga clic en un punto de la gráfica para seleccionar un instante.
5. Consulte el punto de fijación sobre el estímulo visual cuando esté disponible.

**Resultado esperado:** se muestra la amplitud pupilar en milímetros, el instante seleccionado y la ubicación de la mirada sobre la imagen o vídeo.

**Posibles errores:**

- **No hay datos de dilatación pupilar para los filtros seleccionados:** cambie participante o escenario.
- **No se pudo cargar la imagen del escenario:** compruebe que el estímulo se haya cargado correctamente.
- Si hay AOIs, el sistema informa si el punto cae dentro de una de ellas.

`[CAPTURA: vista de dilatación pupilar con serie temporal, estadísticas y estímulo]`

### 12.2. Gaze point

**Propósito:** revisar la posición horizontal y vertical de la mirada.

**Ruta para acceder:** `/dashboard` > proyecto > **Eye Tracker** > **Gaze point**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Gaze point**.
3. Observe las coordenadas X e Y a lo largo del tiempo.
4. Seleccione un punto de la gráfica.
5. Consulte su posición en el estímulo visual.

**Resultado esperado:** la mirada se presenta con coordenadas normalizadas y el punto seleccionado se superpone sobre el estímulo.

**Posibles errores:**

- **No hay datos de gaze para los filtros seleccionados:** pruebe otro participante o escenario.
- **No se pudo cargar la imagen del escenario:** revise la carga del estímulo.

`[CAPTURA: vista Gaze point con coordenadas y punto de mirada sobre el estímulo]`

### 12.3. Distancia al dispositivo

**Propósito:** consultar la distancia estimada entre los ojos y la pantalla.

**Ruta para acceder:** `/dashboard` > proyecto > **Eye Tracker** > **Distancia dispositivo**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Distancia dispositivo**.
3. Revise la serie temporal en centímetros.
4. Seleccione un instante si desea ver la mirada asociada.
5. Active la superposición de AOIs si el escenario las tiene.

**Resultado esperado:** se muestra la distancia en centímetros y, cuando corresponde, la posición de mirada sobre el estímulo.

**Posibles errores:**

- **No hay datos de distancia para los filtros seleccionados:** cambie los filtros o revise si el CSV contiene esa señal.
- Si no hay AOIs, el control de superposición no está disponible.

### 12.4. Histograma de fijación

**Propósito:** estudiar la distribución de la duración de las fijaciones.

**Ruta para acceder:** `/dashboard` > proyecto > **Eye Tracker** > **Histograma de fijación**.

**Pasos:**

1. Seleccione un participante y, si desea, un escenario específico.
2. Abra **Histograma de fijación**.
3. Revise el número de fijaciones, la duración media, mínima y máxima.
4. Use el selector **Duración mínima** para cambiar el umbral.
5. Observe cómo se actualizan las vistas derivadas de fijaciones.

**Resultado esperado:** el histograma refleja las fijaciones que cumplen el umbral seleccionado.

**Posibles errores:**

- **No hay suficientes fijaciones para comparar los umbrales:** revise otro escenario o participante.
- **No hay datos de fijación para este escenario:** el CSV no contiene suficientes datos válidos.
- **Comparación no disponible:** vuelva a procesar los archivos del proyecto para generar las variantes de duración.

`[CAPTURA: histograma de fijaciones con selector de duración mínima]`

### 12.5. Mapa de calor

**Propósito:** visualizar la concentración espacial de la atención sobre un estímulo.

**Ruta para acceder:** `/dashboard` > proyecto > **Eye Tracker** > **Mapa de calor**.

**Pasos:**

1. Seleccione un participante.
2. Seleccione un escenario específico.
3. Abra **Mapa de calor**.
4. Revise los indicadores de fijaciones, fijación más larga y duración media.
5. Active la superposición de AOIs si desea relacionar la intensidad con áreas definidas.

**Resultado esperado:** el mapa muestra la densidad acumulada de atención sobre la imagen del escenario.

**Posibles errores:**

- **Selecciona un escenario específico para visualizar el mapa de calor:** no se genera sobre todos los escenarios.
- **Selecciona un participante para ver el mapa de calor:** elija un participante.
- **No se encontró imagen del escenario seleccionado:** revise los archivos de estímulo.

`[CAPTURA: mapa de calor con indicadores y superposición opcional de AOIs]`

### 12.6. Mapa de recorridos

**Propósito:** observar la secuencia y duración de los objetivos visuales detectados.

**Ruta para acceder:** `/dashboard` > proyecto > **Eye Tracker** > **Mapa de recorridos**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Mapa de recorridos**.
3. Observe los nodos numerados según el orden de fijación.
4. Consulte recorridos, distancia total, duración media y tiempo fijado.
5. Active las AOIs si desea superponerlas.

**Resultado esperado:** la imagen muestra el recorrido visual con nodos y conexiones.

**Posibles errores:**

- **Selecciona un escenario específico para visualizar el mapa de recorridos:** elija un escenario.
- **Selecciona un participante para ver el mapa de recorridos:** elija un participante.
- **No hay datos de fijación para los filtros seleccionados:** revise la calidad o el contenido de la adquisición.

`[CAPTURA: mapa de recorridos con nodos numerados, métricas y AOIs]`

## 13. EEG

### 13.1. EEG por canal

**Propósito:** observar la amplitud de los canales EEG a lo largo del tiempo.

**Ruta para acceder:** `/dashboard` > proyecto > **Electroencefalógrafo** > **EEG por canal**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **EEG por canal**.
3. Use los botones de canales para mostrar u ocultar canales disponibles.
4. Seleccione el modo o disposición de gráfica disponible.
5. Haga clic en la señal para consultar un instante.
6. Revise las estadísticas por canal y las notas de calidad.

**Resultado esperado:** se muestran las amplitudes de los canales disponibles y sus estadísticas.

**Posibles errores:**

- Si un canal no está presente, su botón aparece deshabilitado.
- Si no hay suficientes datos, la vista informa que no puede calcularse.
- Los avisos de calidad pueden indicar unidades asumidas, discontinuidades o posibles artefactos.

`[CAPTURA: vista EEG por canal con selector de canales y panel de calidad]`

### 13.2. Densidad espectral de potencia

**Propósito:** analizar cómo se distribuye la potencia EEG por frecuencia.

**Ruta para acceder:** `/dashboard` > proyecto > **Electroencefalógrafo** > **Densidad espectral**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Densidad espectral**.
3. Seleccione los canales que desea comparar.
4. Use el zoom de la gráfica para revisar un intervalo de frecuencias.
5. Revise la frecuencia pico y la densidad pico por canal.
6. Active **Excluir ventanas con artefacto** si desea omitirlas del cálculo cuando la opción esté disponible.

**Resultado esperado:** la PSD muestra potencia por frecuencia y estadísticas de los canales seleccionados.

**Posibles errores:**

- Si no hay datos suficientes, no se puede calcular la PSD.
- Una ventana con artefacto puede aparecer como advertencia o ser excluida según la opción seleccionada.
- Los canales no disponibles no pueden seleccionarse.

`[CAPTURA: densidad espectral de potencia con canales, zoom y estadísticas]`

### 13.3. Espectrograma de frecuencias

**Propósito:** observar la evolución temporal de la potencia espectral.

**Ruta para acceder:** `/dashboard` > proyecto > **Electroencefalógrafo** > **Espectrograma de frecuencias**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Espectrograma de frecuencias**.
3. Seleccione los canales disponibles.
4. Use el zoom para examinar un tramo temporal.
5. Observe las bandas negras y los avisos de ventanas no disponibles.
6. Seleccione un instante para consultar la información asociada.

**Resultado esperado:** los colores representan la densidad espectral por tiempo y frecuencia; las bandas sin estimación permanecen identificadas.

**Posibles errores:**

- **No se pudo cargar el espectrograma de EEG:** vuelva a seleccionar el proyecto o los filtros.
- **No hay datos suficientes para calcular el espectrograma:** el tramo no contiene muestras suficientes.
- Las ventanas con datos ausentes o discontinuidades pueden aparecer sin estimación.

`[CAPTURA: espectrograma EEG con selector de canales y explicación de huecos]`

### 13.4. Topografía EEG

**Propósito:** representar la distribución espacial esquemática de potencia entre electrodos.

**Ruta para acceder:** `/dashboard` > proyecto > **Electroencefalógrafo** > **Topografía EEG**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Topografía EEG**.
3. Seleccione los canales disponibles.
4. Mueva el control de ventana temporal.
5. Revise el electrodo con mayor potencia y la ventana seleccionada.

**Resultado esperado:** aparece una representación esquemática de potencia por sensor para la ventana seleccionada.

**Posibles errores:**

- **No se pudo cargar la topografía EEG:** revise los filtros o vuelva a procesar los datos.
- **No hay datos suficientes para calcular la topografía EEG:** se requieren al menos los datos disponibles para formar la representación.
- La topografía es esquemática e interpolada; no localiza fuentes cerebrales.

`[CAPTURA: topografía EEG con control de ventana temporal y leyenda de potencia]`

### 13.5. Calidad y artefactos EEG

**Propósito:** revisar advertencias que ayudan a valorar el alcance de las señales EEG.

**Ruta para acceder:** `/dashboard` > cualquier vista EEG > panel **Calidad y alcance de EEG**.

**Pasos:**

1. Abra una vista EEG con datos.
2. Desplácese hasta el panel de calidad.
3. Revise las notas de unidades, discontinuidades y tramos con artefactos candidatos.
4. Consulte la tabla de calidad por canal.
5. Considere estas advertencias antes de interpretar las métricas.

**Resultado esperado:** se muestran las advertencias disponibles para el bloque EEG analizado.

**Posibles errores:** si no existe metadata de calidad, el panel puede mostrar una cantidad limitada de información.

## 14. GSR

### 14.1. Consultar la respuesta galvánica

**Propósito:** analizar la conductancia de la piel a lo largo del tiempo.

**Ruta para acceder:** `/dashboard` > proyecto > **Sensor Galvánico**.

**Pasos:**

1. Seleccione participante y escenario.
2. Abra **Sensor Galvánico**.
3. Elija **Suavizada**, **Cruda** o **Ambas**.
4. Revise media, mínimo y máximo.
5. Haga clic en la gráfica o en mínimo/máximo para seleccionar un instante.
6. Consulte la respuesta galvánica y la mirada asociada en el estímulo.

**Resultado esperado:** se muestra la señal en microsiemens, con la serie suavizada y/o cruda.

**Posibles errores:**

- **No hay datos de GSR para los filtros seleccionados:** cambie participante o escenario.
- Si el estímulo no está disponible, se muestra el análisis de la señal sin la previsualización correspondiente.

`[CAPTURA: vista GSR con selector de señal, KPIs y punto seleccionado]`

### 14.2. Interpretar los indicadores GSR

Los indicadores de la vista muestran:

- **Media:** promedio de la respuesta suavizada en el intervalo visible.
- **Mínimo:** valor más bajo registrado.
- **Máximo:** pico de conductancia registrado.
- **Punto seleccionado:** tiempo relativo, valor suavizado y valor crudo.

## 15. Filtros

### 15.1. Filtrar por escenario y participante

**Propósito:** limitar las visualizaciones a una combinación concreta de datos.

**Ruta para acceder:** `/dashboard`, barra superior de **Filtros**.

**Pasos:**

1. Abra el selector de escenarios.
2. Seleccione **Todos los escenarios** o un escenario específico.
3. Abra el selector de participantes.
4. Seleccione el código del participante.
5. Espere a que las vistas se actualicen.

**Resultado esperado:** las gráficas, tablas, métricas y estímulos corresponden a los filtros elegidos.

**Posibles errores:**

- Si los selectores están cargando, espere a que terminen.
- Si el proyecto no tiene participantes, el selector aparece sin opciones.
- Si una vista requiere un escenario específico, mostrará un aviso hasta que se seleccione uno.

`[CAPTURA: barra de filtros mostrando escenario y participante seleccionados]`

### 15.2. Ventana temporal y zoom

**Propósito:** examinar un tramo de la señal con mayor detalle.

**Ruta para acceder:** gráficas temporales del Dashboard.

**Pasos:**

1. Seleccione o arrastre sobre el tramo de la gráfica que desea ampliar.
2. Revise la actualización de los ejes y estadísticas visibles.
3. Use el control disponible para volver al intervalo completo.

**Resultado esperado:** la gráfica se limita al intervalo seleccionado sin cambiar los datos originales.

**Posibles errores:**

- Si el intervalo no es válido, la aplicación conserva la vista anterior.
- Si se selecciona un tramo sin datos, la vista puede mostrar un estado vacío.

## 16. AOIs

### 16.1. Definir AOIs en un escenario

**Propósito:** delimitar zonas de una imagen para medir fijaciones, permanencia y transiciones.

**Ruta para acceder:** `/proyectos` > crear o editar proyecto > Paso 4.

**Pasos:**

1. Abra un escenario de imagen.
2. Cree una AOI en el editor.
3. Asigne un nombre identificable.
4. Ajuste la forma y ubicación sobre el estímulo.
5. Guarde el proyecto.

**Resultado esperado:** la AOI aparece asociada al escenario y puede mostrarse en las vistas Eye Tracker.

**Posibles errores:**

- Si el escenario no tiene imagen, no se puede dibujar una AOI.
- Una AOI ubicada fuera del estímulo puede no recibir fijaciones.

### 16.2. Consultar la comparativa de AOIs

**Propósito:** conocer qué AOIs recibieron fijaciones y cuánto tiempo se observaron.

**Ruta para acceder:** `/dashboard` > **Eye Tracker** > **Comparativa AOIs**.

**Pasos:**

1. Seleccione un participante.
2. Seleccione un escenario específico.
3. Abra **Comparativa AOIs**.
4. Revise el número de AOIs, fijaciones, tiempo observado y AOI más observada.
5. Consulte la distribución temporal, transiciones, secuencia y picos de señales.

**Resultado esperado:** se muestran métricas y gráficas por AOI.

**Posibles errores:**

- **Selecciona un escenario para visualizar la comparativa:** elija un escenario específico.
- **Selecciona un participante para ver AOIs:** elija un participante.
- **No hay AOIs definidas para este escenario:** vuelva al Paso 4 de creación o edición.
- Si no hay fijaciones, la comparativa muestra datos vacíos.

`[CAPTURA: comparativa AOIs con métricas, distribución temporal y leyenda de áreas]`

### 16.3. Mostrar AOIs sobre las visualizaciones

**Propósito:** relacionar mapas, recorridos y puntos de mirada con las áreas definidas.

**Ruta para acceder:** vistas Eye Tracker que muestran el control **AOIs**.

**Pasos:**

1. Abra una vista con un estímulo.
2. Localice el botón **AOIs**.
3. Active o desactive la superposición.
4. Use la leyenda para identificar cada área.

**Resultado esperado:** las formas y nombres de las AOIs aparecen sobre el estímulo.

**Posibles errores:** el control queda deshabilitado si el escenario no tiene AOIs o si todavía se están cargando.

## 17. Comparaciones

### 17.1. Comparar varios participantes

**Propósito:** visualizar una misma señal o análisis para varios participantes.

**Ruta para acceder:** `/dashboard` > una vista compatible > **Comparar participantes**.

**Pasos:**

1. Seleccione un participante y escenario en el Dashboard.
2. Abra una vista compatible.
3. Pulse **Comparar participantes**.
4. Seleccione los participantes que desea incluir.
5. Elija **Escala común** o **Escalas propias** cuando esté disponible.
6. Revise las tarjetas de cada participante.

**Resultado esperado:** se abre una comparación a pantalla completa con una tarjeta por participante.

**Posibles errores:**

- Si no hay participantes seleccionables, la comparación no puede prepararse.
- **No hay participantes seleccionados:** elija al menos uno.
- **Preparando la comparación:** espere a que terminen las solicitudes de datos.
- Algunas vistas requieren un escenario específico y no funcionan con **Todos los escenarios**.

`[CAPTURA: diálogo de comparación con selector de participantes y tarjetas individuales]`

### 17.2. Comparativas integradas

**Propósito:** reunir varias señales y visualizaciones en un mismo espacio.

**Ruta para acceder:** `/dashboard` > proyecto > **Comparativas**.

**Pasos:**

1. Seleccione **Comparativas** en el panel lateral.
2. Seleccione un participante.
3. Use **Gráficas a comparar** para agregar señales o visualizaciones.
4. Revise los paneles temporales, de frecuencia o espaciales.
5. Consulte la tabla de estadísticas y la matriz de correlaciones cuando haya señales compatibles.
6. Haga clic en un punto temporal para relacionarlo con el estímulo visual cuando esté disponible.

**Resultado esperado:** las visualizaciones elegidas aparecen en un espacio común y se actualizan con los filtros.

**Posibles errores:**

- **Selecciona un participante para cargar las visualizaciones comparativas:** seleccione un participante.
- **No hay visualizaciones seleccionadas:** agregue una gráfica desde el selector.
- Si no hay datos para una señal, la tabla indica que no está disponible o que no hay datos.

`[CAPTURA: vista Comparativas con selector de gráficas, paneles y estadísticas]`

## 18. Métricas

### 18.1. Métricas de Eye Tracker

Las vistas pueden mostrar:

- Media, mediana, mínimo y máximo de una señal.
- Cantidad de fijaciones.
- Duración media, mínima y máxima de fijaciones.
- Tiempo total fijado.
- Número de objetivos visuales.
- Distancia total del recorrido.
- Tiempo y porcentaje observado por AOI.
- Tiempo hasta la primera fijación y transiciones entre AOIs cuando el análisis está disponible.

### 18.2. Métricas de GSR

La aplicación muestra media, mínimo, máximo, valor suavizado, valor crudo y estadísticas de la señal galvánica en microsiemens.

### 18.3. Métricas de EEG

Las vistas pueden presentar estadísticas por canal, frecuencia pico, densidad pico, potencia por bandas, nivel medio del espectrograma y mayor potencia de la ventana topográfica.

Las unidades y advertencias se muestran junto a cada vista. En particular, revise el panel de calidad EEG antes de comparar valores entre grabaciones.

### 18.4. Estadísticas y correlaciones

**Propósito:** consultar resúmenes numéricos y relaciones entre señales continuas compatibles.

**Ruta para acceder:** `/dashboard` > **Comparativas** > tabla de estadísticas o matriz de correlaciones.

**Pasos:**

1. Seleccione las visualizaciones que desea incluir.
2. Espere a que se carguen sus datos.
3. Consulte las filas por sensor, visualización, serie, unidad y resumen.
4. Revise la matriz de correlaciones cuando haya suficientes señales compatibles.

**Resultado esperado:** se muestran los resúmenes de las señales seleccionadas y las relaciones calculadas por la aplicación.

**Posibles errores:** una visualización sin datos aparece como **Sin datos** o **No disponible** y no debe interpretarse como un valor cero.

## 19. Reportes

### 19.1. Seleccionar el proyecto

**Propósito:** elegir el proyecto del que se generará el informe.

**Ruta para acceder:** `/reportes` > **Selección de proyecto**.

**Pasos:**

1. Abra **Reportes**.
2. Seleccione un proyecto.
3. Revise la información resumida del proyecto.

**Resultado esperado:** se habilitan las opciones de alcance, dispositivo y exportación.

**Posibles errores:** si no hay proyectos, aparece un estado vacío y no se puede continuar.

`[CAPTURA: página Reportes con proyecto seleccionado]`

### 19.2. Elegir el alcance

**Propósito:** decidir si el informe corresponde a una persona o al grupo completo.

**Ruta para acceder:** `/reportes` > **Alcance del informe**.

**Pasos:**

1. Seleccione **Un participante**.
2. Elija el código del participante; o
3. Seleccione **Resumen de todos los participantes**.
4. Revise la descripción del alcance elegido.

**Resultado esperado:** el informe se prepara con análisis individual o agregado.

**Posibles errores:** el alcance grupal queda deshabilitado si el proyecto no tiene participantes.

### 19.3. Elegir el dispositivo

**Propósito:** seleccionar qué reporte generar.

**Ruta para acceder:** `/reportes` > **Dispositivo**.

**Pasos:**

1. Seleccione Eye Tracking, GSR o EEG según los sensores del proyecto.
2. Si hay más de un dispositivo disponible, seleccione **Todos los dispositivos** para generar un informe por dispositivo dentro de un ZIP.
3. Revise la previsualización del contenido.

**Resultado esperado:** la aplicación muestra las secciones previstas para el dispositivo.

**Posibles errores:** si el proyecto no tiene dispositivos registrados, no se puede generar un informe.

### 19.4. Configurar y descargar el reporte

**Propósito:** personalizar y descargar el informe.

**Ruta para acceder:** `/reportes` > **Opciones de exportación**.

**Pasos:**

1. Active o desactive **Incluir portada**.
2. Active o desactive **Incluir fecha y nombre del proyecto**.
3. Revise la cantidad de escenarios y cualquier escenario de vídeo omitido.
4. Pulse **Descargar reporte PDF** para un dispositivo.
5. Pulse **Descargar reportes (ZIP)** cuando haya seleccionado todos los dispositivos.
6. Espere a que termine la generación.

**Resultado esperado:** se descarga un PDF o un ZIP con los informes generados.

**Posibles errores:**

- El botón de descarga permanece deshabilitado si faltan proyecto, alcance, participantes, escenarios o dispositivo.
- **No se pudo generar el informe:** revise los datos del proyecto y vuelva a intentarlo.
- Los escenarios de vídeo pueden omitirse de las secciones que requieren imágenes.

`[CAPTURA: opciones de exportación y previsualización del contenido del reporte]`

## 20. Estados y mensajes del sistema

### 20.1. Estados del proyecto

| Estado | Significado para el usuario |
| --- | --- |
| Borrador | El proyecto aún no está completamente finalizado o puede retomarse |
| Activo | El proyecto está disponible para análisis |
| Archivado | El proyecto se conserva, pero se separa de la vista activa |

### 20.2. Estados de procesamiento

| Estado | Significado |
| --- | --- |
| `PENDING` | La carga todavía no ha comenzado o debe retomarse |
| `PROCESSING` | Los archivos se están transfiriendo o procesando |
| `READY` | La ingesta terminó y los datos están publicados para análisis |
| `FAILED` | El intento de ingesta terminó con errores |

### 20.3. Mensajes habituales

| Mensaje o situación | Acción recomendada |
| --- | --- |
| Cargando proyectos | Esperar a que termine la consulta |
| No hay proyectos creados | Crear el primer proyecto |
| No hay datos para los filtros seleccionados | Cambiar participante o escenario y comprobar la carga |
| No se encontró imagen del escenario | Revisar que el estímulo haya sido cargado |
| Completa sexo y edad | Completar todos los participantes del proyecto |
| La estructura de la carpeta es ambigua | Responder las preguntas de confirmación |
| No se pudo comprobar la conexión de Google Drive | Verificar Docker Desktop y volver a comprobar |
| La conexión de Google Drive no está configurada | Solicitar al responsable que configure la cuenta autorizada |

`[CAPTURA: ejemplos de un estado de carga, un aviso de datos vacíos y un mensaje de error]`

## 21. Solución de problemas

### 21.1. La aplicación no abre

**Ruta para acceder:** inicio de la aplicación.

**Pasos:**

1. En la edición servidor, confirme que Docker Desktop esté abierto.
2. Compruebe que el grupo `neurodatics` esté iniciado.
3. Espere a que sus servicios estén activos.
4. Recargue `http://localhost:3000`.
5. En la edición local, reinicie el lanzador y pulse **Reintentar**.

**Resultado esperado:** la página de inicio o la sesión local se carga correctamente.

**Posibles errores:** si el problema continúa, registre el mensaje exacto y contacte al soporte de la instalación.

### 21.2. No puedo iniciar sesión

**Pasos:**

1. Compruebe la conexión a Internet.
2. Asegúrese de usar la cuenta de Google autorizada.
3. Vuelva a abrir `/login`.
4. Si la autorización fue cancelada, pulse nuevamente **Continuar con Google**.

**Resultado esperado:** el usuario regresa a NeuroDatics con la sesión iniciada.

### 21.3. Google Drive no está conectado

**Ruta para acceder:** `/configuracion` > **Google Drive**.

**Pasos:**

1. Abra **Configuración**.
2. Espere la comprobación de conexión.
3. Pulse **Conectar Google Drive** si aún no hay cuenta.
4. Autorice la cuenta en la pestaña de Google.
5. Regrese a NeuroDatics.
6. Pulse **Comprobar conexión**.

**Resultado esperado:** aparece **Conexión guardada** y la cuenta de almacenamiento autorizada.

**Posibles errores:**

- Si falta la configuración de Google de la instalación, debe intervenir el responsable técnico.
- Si el permiso expiró o fue revocado, reconecte la misma cuenta.
- Usar otra cuenta puede impedir el acceso a archivos existentes.

`[CAPTURA: sección Google Drive con conexión guardada y botones de comprobación/reconexión]`

### 21.4. Una carpeta no se puede cargar

**Pasos:**

1. Confirme que seleccionó una carpeta completa.
2. Compruebe que tenga al menos un archivo válido.
3. Verifique que su tamaño no supere 500 MB.
4. Resuelva las preguntas sobre CSV, imágenes, vídeos o adquisición.
5. Intente nuevamente.

**Resultado esperado:** se muestra el resumen de archivos que serán procesados.

### 21.5. El Dashboard no muestra datos

**Pasos:**

1. Compruebe que el proyecto esté en estado **Activo** o tenga una ingesta `READY`.
2. Revise el participante seleccionado.
3. Pruebe **Todos los escenarios** y después un escenario específico.
4. Confirme que el sensor correspondiente fue seleccionado en el proyecto.
5. Revise el resumen de procesamiento y sus advertencias.

**Resultado esperado:** la vista muestra datos o un mensaje explicativo de ausencia.

### 21.6. El reporte no se descarga

**Pasos:**

1. Seleccione un proyecto.
2. Confirme que existan participantes y escenarios de imagen.
3. Seleccione un alcance válido.
4. Seleccione un dispositivo disponible.
5. Vuelva a pulsar el botón de descarga.

**Resultado esperado:** el navegador descarga un PDF o ZIP.

## 22. Buenas prácticas

- Conserve los datos originales sin modificar.
- Utilice códigos de participantes consistentes y no identificables cuando sea posible.
- Complete la geometría física de pantalla cuando el experimento la tenga disponible.
- Revise los avisos de calidad EEG antes de interpretar potencia o topografías.
- Defina AOIs con nombres claros y relacionados con la hipótesis del experimento.
- Seleccione escenarios específicos para mapas de calor, recorridos y comparativas AOI.
- No interprete “Sin datos” como cero.
- Espere a que el estado de ingesta sea `READY` antes de analizar.
- No cierre el navegador durante una carga en curso.
- Haga copias de respaldo antes de eliminar proyectos.
- En la edición servidor, conserve el acceso a la cuenta de Google Drive autorizada.
- Documente las decisiones de filtrado y el umbral mínimo de fijación usado en sus resultados.
- Compare participantes con la misma señal, escenario y criterio de selección.

## 23. Glosario

| Término | Definición |
| --- | --- |
| AOI | Área de interés definida sobre un estímulo visual |
| Baseline | Valor de referencia usado para interpretar cambios en una señal |
| EEG | Registro de la actividad eléctrica cerebral mediante electrodos |
| Espectrograma | Representación de la potencia espectral a lo largo del tiempo |
| Eye Tracker | Sensor que registra la posición de la mirada y las fijaciones |
| Fijación | Periodo en el que la mirada permanece agrupada alrededor de una posición |
| Gaze point | Punto o coordenada de la mirada en un instante |
| GSR | Respuesta galvánica o conductancia eléctrica de la piel |
| Ingesta | Proceso de validar, procesar y publicar los archivos de un experimento |
| Mapa de calor | Visualización de la densidad espacial de las fijaciones |
| Mapa de recorridos | Secuencia espacial y temporal de las fijaciones |
| PSD | Densidad espectral de potencia; distribución de potencia por frecuencia |
| Participante | Persona asociada a una o más grabaciones del experimento |
| Escenario | Imagen o vídeo presentado durante una grabación |
| Sensor | Dispositivo o fuente de señal registrado en un proyecto |
| Topografía EEG | Representación esquemática de potencia entre electrodos |
| Umbral mínimo de fijación | Duración mínima usada para considerar una fijación en las vistas derivadas |

## 24. Soporte

### 24.1. Información que debe incluir una solicitud

Cuando solicite ayuda, incluya:

1. Edición utilizada: servidor o local.
2. Sistema operativo y navegador.
3. Ruta de la aplicación donde ocurrió el problema.
4. Nombre del proyecto, sin incluir datos personales sensibles.
5. Mensaje exacto mostrado por NeuroDatics.
6. Estado del proyecto y estado de ingesta.
7. Paso realizado antes del problema.
8. Captura de pantalla, ocultando participantes identificables o credenciales.

### 24.2. Canales y responsable

Para problemas de acceso, Docker Desktop, Google OAuth o Google Drive, contacte al responsable de la instalación o al administrador de la plataforma.

Para problemas relacionados con la estructura de los experimentos, sensores, participantes o interpretación de resultados, contacte al equipo de investigación responsable del proyecto.

No comparta contraseñas, tokens, archivos `.env`, credenciales de Google ni datos personales de participantes en una solicitud de soporte.


# Solución de problemas {#cap-problemas}

Busca el síntoma en la sección del momento en que ocurre. Donde dice «…» va un nombre o un número. Algunos mensajes aparecen en inglés o sin tilde: vienen tal cual de la aplicación y aquí se explican. Los avisos de estado y de confirmación, que no son errores, están en [[ref:ref-mensajes]]. Si un problema no aparece en estas tablas, recarga la página y vuelve a intentarlo; si persiste, {servidor} avisa a quien administra NeuroDatics o {estudiantes} cierra y vuelve a abrir el programa.

**Volver a procesar** un proyecto es crearlo de nuevo con la misma carpeta y, cuando el nuevo esté listo, eliminar el antiguo. La aplicación no tiene otra forma de procesar de nuevo un proyecto.

## Al entrar {#problemas-acceso}

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| {estudiantes} Aparece «NeuroDatics no está disponible» | La ventana negra de NeuroDatics se cerró o el programa dejó de responder. | Abre de nuevo NeuroDatics Estudiantes como lo abriste la primera vez (ver la guía de instalación) y, cuando esté listo, haz clic en **Reintentar**. |
| {estudiantes} El navegador dice que no puede abrir la página | La ventana negra está cerrada. | Abre de nuevo el programa. Mientras uses NeuroDatics, no cierres la ventana negra. |
| {servidor} Al hacer clic en **Proyectos**, **Dashboard** o **Informes** aparece «Inicia sesión para acceder a esta sección.» | No has entrado. | Entra con **Continuar con Google**. Ver [[ref:entrar-salir]]. |
| {servidor} «Esta cuenta de Google no tiene acceso a NeuroDatics. Pide a quien la administra que la añada.» | Tu cuenta no está en la lista de cuentas permitidas. | Pide a quien administra NeuroDatics que la añada, o entra con otra cuenta. |
| {servidor} Vuelves a la pantalla de acceso sin ningún aviso | Cerraste la ventana de Google sin elegir cuenta. | Haz clic otra vez en **Continuar con Google**. |
| {servidor} «La sesión de Google no coincide. Vuelve a intentarlo.» | Empezaste a entrar en otra pestaña o la página se recargó a mitad. | Cierra las demás pestañas de NeuroDatics y vuelve a entrar desde una sola. |
| {servidor} Otro mensaje que menciona a Google, en español o en inglés, como «Google rechazó el inicio de sesión. Vuelve a intentarlo.» o «No se pudo leer el perfil de Google. Vuelve a intentarlo.» | Google no aceptó el intento, falló la comunicación con Google o la conexión con Google no está bien configurada en esta instalación. | Comprueba tu conexión y vuelve a intentarlo en unos minutos. Si se repite, prueba con otra cuenta y avisa a quien administra NeuroDatics. |
| {servidor} Mientras trabajabas, NeuroDatics te devuelve a la pantalla de acceso | La sesión de 14 días caducó, o tu cuenta se retiró de la lista de permitidas. | Entra de nuevo. Si te rechaza, pide acceso. Los cambios que no habías guardado se pierden. |
| No ves los proyectos de un compañero | Cada cuenta ve solo sus proyectos. No se pueden compartir. | Pide a tu compañero la carpeta del experimento y crea tu propio proyecto. |

## Al cargar la carpeta {#problemas-datos}

NeuroDatics empaqueta tu carpeta en un archivo `.zip` para enviarla. Por eso algunos mensajes hablan de «ZIP»: se refieren a tu carpeta.

### Al elegir la carpeta

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| **Siguiente** sigue desactivado | Falta el nombre, hay preguntas sin responder en «Confirma la carpeta», una ubicación del estímulo está incompleta o la pantalla distinta tiene valores no válidos. | Revisa esos cuatro puntos. Un archivo marcado como «Incompleto» en la ubicación del estímulo también bloquea. Ver [[ref:cargar-carpeta]]. |
| «La carpeta es demasiado grande. Máximo 500 MB.» o «La carpeta supera el máximo de 500 MB. Reduce su tamaño.» | Cuentan todos los archivos visibles de la carpeta, también los que NeuroDatics no va a usar. | Copia en una carpeta nueva solo el `.csv` y las subcarpetas `Images`, `Videos` y `Acquisition`. |
| «Arrastra una carpeta, no un archivo suelto.» | Soltaste un archivo. | Arrastra la carpeta completa o usa **Seleccionar carpeta**. |
| «No se pudo leer la carpeta arrastrada.» | El navegador no pudo leerla al arrastrarla. | Usa **Seleccionar carpeta**. |
| «No se encontraron archivos en la carpeta.» | La carpeta está vacía o solo tiene archivos ocultos. | Elige la carpeta correcta. |
| «La carpeta debe contener al menos un archivo .csv con los datos del experimento.» | No hay `.csv` fuera de `Acquisition`. | Añade el archivo exportado del equipo de adquisición. |
| «La carpeta contiene una ruta duplicada o vacía: …» | Dos archivos tienen el mismo nombre en la misma ubicación, o uno no tiene nombre. | Renombra o quita el archivo indicado. |
| No aparece la sección **Ubicación del estímulo en pantalla** | La carpeta elegida no tiene imágenes ni vídeos. | Revisa que las subcarpetas se llamen `Images` y `Videos`. |

### Al cargar y procesar

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| «Ya tienes una carga de experimento en curso. Espera a que termine antes de iniciar otra.» | Solo se procesa una carpeta por persona a la vez. | Espera a que la otra termine (su tarjeta dice «Procesando archivos»). |
| «Demasiadas cargas seguidas. Espera unos segundos antes de reintentar.» o «El servidor está procesando el máximo de cargas simultáneas. Intenta de nuevo en unos minutos.» | Se iniciaron muchas cargas en poco tiempo. | Espera y vuelve a intentarlo. |
| «El proyecto tiene una operacion en curso. Intenta cuando termine.» (sin tilde) | El proyecto está guardando otra cosa. | Espera unos segundos y repite. |
| «La subida tardó demasiado.» | La carga superó los 30 minutos. | Reduce la carpeta (por ejemplo, vídeos más livianos) y vuelve a intentarlo. |
| «No se pudo conectar con NeuroDatics durante la subida.» | En la edición estudiantes, se cerró la ventana negra; en la edición servidor, se cortó la conexión. | Abre de nuevo el programa o recupera la conexión; luego usa **Retomar** en la tarjeta. |
| «Ninguno de los … CSV del ZIP pudo procesarse; no se reemplazaron los datos previos del proyecto. Motivo: …» | El `.csv` no tiene el formato esperado: falta la línea `Grabación :`, la columna de tiempo, o los tiempos no crecen. Lo que sigue a «Motivo:» dice qué falla en cada archivo. | Exporta de nuevo los datos desde el equipo de adquisición. Ver [[ref:ref-formatos]]. |
| «No se pudo determinar el codigo de participante para: …», «El código de participante excede el máximo de 50 caracteres.» o «El codigo de participante '…' aparece en los bloques … y … del CSV; …» | Las líneas `Grabación :` del `.csv` no identifican bien a cada participante, o un código se repite en dos bloques. | Corrige el código en el archivo, de modo que cada participante tenga uno solo y único. |
| «Stimulus placement screen pixels must match physical screen geometry» (en inglés) | Los píxeles de **Pantalla de la adquisición (px)** no coinciden con la pantalla del proyecto (la de Configuración o la de **Pantalla distinta a la configuración**). | Escribe la misma resolución en los dos sitios y haz clic en **Siguiente** otra vez. Ver [[ref:ubicacion-estimulo]]. |
| «No selected image or video matches …» (en inglés) | Registraste la ubicación de un archivo que no está en las subcarpetas elegidas. | Quita la carpeta con la X, revisa los archivos y vuelve a elegirla. |
| «Selected stimulus paths collide after scenario normalization: …» (en inglés) | Dos imágenes o vídeos tienen nombres que solo se distinguen por mayúsculas, espacios o la extensión, y darían el mismo escenario. | Cambia el nombre de uno de los archivos. |
| «Ruta insegura detectada en ZIP: …», «Rutas ambiguas o duplicadas en ZIP: …» o «Entrada duplicada en ZIP: …» | Un nombre de archivo usa caracteres no permitidos (`< > : " ? *` o la barra vertical), termina en punto o espacio o es un nombre reservado de Windows (`CON`, `NUL`, `COM1`…), o dos archivos se llaman igual salvo por las mayúsculas. | Renombra el archivo indicado. |
| «El ZIP contiene demasiadas entradas (…). Maximo permitido: 20000», «ZIP corrupto o con compresion no soportada», «No se pudo extraer una entrada del ZIP» o «El ZIP no contiene archivos utiles» | La carpeta tiene más de 20 000 archivos útiles, no se pudo empaquetar bien o no tiene nada útil. | Deja solo los archivos del experimento y vuelve a elegir la carpeta. Si se repite, copia los archivos a una carpeta nueva. |
| «La carpeta necesita una confirmacion antes de procesarse.» (sin tilde) y vuelves al paso 1 | La carpeta cambió después de responder «Confirma la carpeta». | Responde de nuevo las preguntas. |
| {servidor} El error termina en «La conexión con Google Drive necesita renovarse: avisa a quien administra NeuroDatics.», o aparece «Google Drive no esta conectado…» o «La conexion de Google Drive expiro o fue revocada…» | NeuroDatics perdió el permiso para guardar en Google Drive. | Avisa a quien administra NeuroDatics y vuelve a intentarlo cuando te confirme que se renovó. Ver [[ref:drive]]. |
| «No se pudo completar la carga. Consulta el estado del proyecto antes de reintentar.» | Falló algo inesperado. | Mira la tarjeta: si dice «Carpeta sin procesar», usa **Retomar**; si solo ofrece **Ver proyecto**, elimínalo y créalo de nuevo. Ver [[ref:tarjeta]]. |

### En los pasos 2 a 4

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Un participante planificado queda «Sin asignar» | Su documento no se parece a ninguno de los datos. | Elige su documento en **Asignar documento** si participó. Ver [[ref:asignar-documento]]. |

Los mensajes que salen junto a los campos de estos pasos están en [[ref:crear-proyecto]] y [[ref:aoi]].

## En el Dashboard {#problemas-dashboard}

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El panel «Proyectos» está vacío | No se pudo cargar la lista de proyectos. | Recarga la página. |
| El desplegable de participantes dice «Sin participantes» | El proyecto no tiene participantes con datos (por ejemplo, un pre-experimento). | Carga la carpeta del experimento. Ver [[ref:subir-preexperimento]]. |
| Falta un participante | Quedó **Sin asignar** al cargar la carpeta de un pre-experimento. | Asígnale su documento en el editor. Ver [[ref:participantes]]. |
| El estímulo aparece como una pantalla negra con el nombre del escenario en mayúsculas | No hay imagen para ese escenario: es una pantalla de instrucciones, práctica, descanso o similar, o el nombre del archivo no coincide con el de los datos. | Si debía tener imagen, revisa que el archivo de `Images` se llame igual que el escenario en el `.csv`. |
| «No se encontró imagen del escenario seleccionado.» | Igual que la fila anterior, en el mapa de calor o el de recorridos. | Revisa el nombre del archivo de imagen. |
| «No se pudo cargar la imagen del escenario.» o «No se pudo cargar el fotograma del vídeo.» | La imagen no llegó a cargarse. | Recarga la página. |
| «Se necesitan al menos dos AOIs para medir transiciones.» | El escenario tiene una sola área. | Dibuja otra si quieres medir transiciones. |
| «Comparación no disponible» junto a **Duración mínima**, o «Distribución reconstruida desde datos históricos; el umbral mínimo original es desconocido.» en el histograma | El proyecto se procesó con una versión anterior: no tiene las variantes de duración mínima y sus fijaciones son una estimación. | Vuelve a procesar la carpeta. |
| «Unidades EEG con salvedades», con el botón **Volver a procesar**, que solo abre **Proyectos** | Algún canal venía en otra unidad y se reescaló al procesar, o se excluyó por tener una unidad ambigua. | No compares a ese participante con otros procesados con otras unidades. Si necesitas compararlos, vuelve a procesar la carpeta para que todos queden procesados igual. |
| En ámbar, «t = 0: primera fijación» | No había datos para fijar el inicio del escenario. | Ten en cuenta que los tiempos cuentan desde la primera fijación. Ver [[ref:entender-aoi]]. |
| Un botón de canal del EEG está desactivado, o no se desmarca | Desactivado: ese canal no está en el archivo. No se desmarca: es el último que queda seleccionado y debe quedar al menos uno. | Nada que corregir. La topografía necesita al menos tres canales. |
| «Sin PSD: …» | Esos canales no tienen tramos continuos suficientes para calcular la densidad espectral. | Amplía la ventana temporal o elige otro escenario. |
| «Solapamiento insuficiente» en las correlaciones | Las dos señales comparten menos de 10 intervalos con datos. | Elige un escenario más largo o con menos pérdidas. |
| «No fue posible cargar las correlaciones.» | Falló el cálculo. | Haz clic en **Reintentar**. |
| «La cola de validación está llena. Vuelve a intentar.» | Se pidieron muchas gráficas a la vez. | Espera unos segundos y repite. |
| «Versión incompatible de la respuesta de comparativas» | La página quedó abierta mientras NeuroDatics se actualizaba. | Recarga la página. |
| Un mensaje que empieza por «No se pudo descargar…» | NeuroDatics no pudo leer los datos procesados del proyecto. | Recarga la página. Si se repite, vuelve a procesar la carpeta; {servidor} si menciona Google Drive, avisa a quien administra NeuroDatics. |

Los mensajes que dan las vistas al elegir filtros, instantes o ventanas temporales están en cada vista de [[ref:cap-dashboard]].

### Mensajes en inglés o sin tilde en el Dashboard

<!-- anchos: 34 30 36 -->
| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Error loading heatmap», «Error loading histogram» u otro «Error loading …» | No se pudo cargar esa vista (mapa de calor, histograma…). | Recarga la página o cambia de escenario y vuelve. |
| «No gaze data for this scenario/participant» | Ese participante no tiene datos de mirada en ese escenario. | Elige otro escenario o participante. |
| «Scenario not found» | El escenario elegido ya no existe en el proyecto. | Recarga la página y elige de nuevo. |
| «scenario must be specified» | La vista necesita un escenario concreto. | Elige un escenario. |
| En Comparativas, «Minimo», «Maximo», «Diametro (mm)», «Posicion X», «Conductancia (uS)» o la etiqueta «EyeTracker» | Son textos de las gráficas escritos sin tilde o sin espacio. | Significan lo mismo que en las demás vistas. |

## Al editar, en cuestionarios y en Configuración {#problemas-edicion}

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| «No se encontró este proyecto. Ábrelo desde su tarjeta en «Proyectos».» | La dirección no indica un proyecto, o el proyecto se eliminó. | Vuelve a **Proyectos** y abre el editor desde la tarjeta. |
| **Guardar cambios** está desactivado | No hay cambios, o hay un conflicto con otra sesión. | Si ves el mensaje de conflicto, sigue la fila siguiente. |
| «La configuración cambió en otra sesión. Conservamos tus cambios; descártalos y recarga la versión guardada antes de continuar.» | Otra pestaña o persona guardó el proyecto antes. | Haz clic en **Descartar cambios** y vuelve a hacer tus cambios sobre la versión guardada. |
| Una pestaña aparece en rojo con un punto | Tiene un dato que impide guardar. | Abre esa pestaña y corrige lo que indica el recuadro rojo. Los mensajes y su solución están en [[ref:editar-proyecto]], [[ref:participantes-planificados]], [[ref:cuestionarios]], [[ref:pantalla-proyecto]] y [[ref:config-pantalla]]. |
| El navegador pregunta si quieres salir de la página | Hay cambios sin guardar. | Quédate y guarda, o sal si quieres perderlos. |
| «Escribe el documento de identificación de cada participante.» o «Hay dos participantes con el documento ….» | Un participante no tiene documento, o se repite. | Corrígelo; el documento identifica a cada persona. |
| **Responder cuestionario** está desactivado | Hay cambios sin guardar, o faltan participantes o preguntas. | Lee la pista junto al botón y guarda. Ver [[ref:responder]]. |
| «Completa todas las respuestas obligatorias.» o «Falta la respuesta requerida: …» | Falta responder una pregunta marcada como obligatoria. | Respóndela. |
| «No se pudo completar la operación: El participante no pertenece a este pre-experimento» o «… Este cuestionario no está habilitado» | El participante o el cuestionario cambió desde que abriste el formulario. | Cierra el diálogo, recarga la página y vuelve a empezar. |
| «No se pudo completar la operación: Las respuestas exceden el límite de 2 MB» | Las respuestas abiertas son demasiado largas. | Acórtalas. |
| «No se pudieron guardar los cambios del proyecto.» u otro «No se pudo completar la operación: …» | No se pudo guardar. | Vuelve a intentarlo. Lo que ya se guardó no se pierde. |
| {servidor} El error termina en «La conexión con Google Drive necesita renovarse: avisa a quien administra NeuroDatics.» | NeuroDatics perdió el permiso para guardar en Google Drive. | Avisa a quien administra NeuroDatics; no se arregla desde la aplicación. Ver [[ref:drive]]. |
| Un lector de pantalla anuncia «Close» o «Close toast» | Es el nombre en inglés del botón para cerrar un diálogo o un aviso. | Funciona igual que cualquier botón de cerrar. |
| «Revisa la configuración de pantalla» aparece cada vez | Aún no has guardado la pantalla ni una vez. | Haz clic en **Ir a Configuración** y en **Guardar configuración de pantalla**, aunque no cambies nada. |
| «No se pudo cargar la configuración de pantalla.» | Falló la lectura de la configuración. | Haz clic en **Reintentar**. |
| «No se pudo guardar: …» | Algún valor quedó fuera de los límites. | Revisa los valores y guarda de nuevo. Ver [[ref:ref-limites]]. |

## Al generar informes {#problemas-informes}

<!-- anchos: 34 30 36 -->
| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El botón de descarga está desactivado | Falta elegir proyecto, participante o dispositivo, el proyecto no tiene escenarios de imagen, o ya se está generando un informe. | Revisa las cuatro tarjetas de la página. Ver [[ref:generar-informe]]. |
| «El proyecto no tiene dispositivos registrados.» | Es un pre-experimento o un borrador sin terminar. | Termina el proyecto con su carpeta. |
| «El proyecto no tiene escenarios de imagen.» o «No hay escenarios de imagen disponibles para generar el informe» | Solo tiene vídeos; los informes analizan imágenes. | No se puede generar informe de ese proyecto. |
| **Resumen de todos los participantes** está desactivado | El proyecto no tiene participantes con datos. | Carga la carpeta del experimento. |
| No encuentro a un participante en el desplegable | El desplegable muestra «Participante» y el código de los datos, no el nombre. Si quedó **Sin asignar**, no aparece. | Busca su código en **Ver proyecto**, o asígnale su documento. |
| «No hay sensores disponibles para el modo seleccionado» | El dispositivo elegido no está en el proyecto. | Elige otro dispositivo. |
| «El proyecto no tiene participantes» | Pediste un informe de grupo de un proyecto sin participantes con datos. | Carga la carpeta del experimento. |
| «No hay datos procesados para generar el informe» | No se pudo leer ningún participante. | Comprueba en el Dashboard que el proyecto muestra datos. Si no, vuelve a procesar la carpeta. |
| «Participant not found» (en inglés) | El participante elegido ya no existe en el proyecto, por ejemplo porque el proyecto se volvió a crear en otra pestaña. | Recarga la página y elige de nuevo. |
| «Project not found» (en inglés) | El proyecto se eliminó. | Recarga la página. |
| «No se pudo conectar con NeuroDatics. La solicitud tardó demasiado (600 s).» | El informe tardó más de 10 minutos. | Genera un dispositivo a la vez, o un participante en lugar del grupo. |
| «No se pudo generar el informe.» | Falló algo al preparar el PDF. | Vuelve a intentarlo. |
| La hora del nombre del archivo no coincide con la tuya | La fecha del nombre está en hora universal (UTC). | Nada que corregir. Ver [[ref:ref-descargas]]. |
| Dentro del PDF, «No se pudieron cargar los datos del participante …» | Ese participante no se pudo leer; el informe sigue sin él. | Genera el informe de nuevo más tarde. |
| Dentro del PDF, «Algunas imágenes de estímulo no se pudieron cargar; sus mapas se dibujan sobre un lienzo neutro.» | Faltaba la imagen de algún escenario. | Revisa el nombre de los archivos de `Images`. |
| {servidor} NeuroDatics te devuelve a la pantalla de acceso al generar | La sesión caducó. | Entra de nuevo y vuelve a generar el informe. |

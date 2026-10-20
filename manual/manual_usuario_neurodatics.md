# NeuroDatics

## Manual de usuario

**Versión:** 2.2  
**Idioma:** español  
**Audiencia:** investigadores, docentes y estudiantes que cargan, revisan y analizan experimentos de bioseñales.

![NeuroDatics - inicio](assets/screenshots/01-inicio.png)

> Las capturas usan un proyecto de demostración con datos sintéticos. No contienen datos personales ni representan resultados científicos.

## 1. Qué hace NeuroDatics

NeuroDatics organiza proyectos de neuromarketing y permite consultar datos de eye tracker, EEG y GSR. El trabajo suele empezar en Proyectos, continúa con la revisión de los datos cargados y termina en Dashboard o Informes, según se necesite explorar señales o compartir resultados.

**Acceder -> crear proyecto -> cargar carpeta -> confirmar sensores y participantes -> definir AOI -> analizar -> comparar -> descargar informes.**

La aplicación ayuda a preparar y visualizar datos; no reemplaza el diseño experimental, el control de calidad ni la interpretación científica.

## 2. Ediciones disponibles

La interfaz es la misma, pero el acceso y el almacenamiento cambian según la edición.

| Edición | Acceso | Almacenamiento | Uso previsto |
| --- | --- | --- | --- |
| Servidor | Inicio de sesión con Google | Una cuenta de Google Drive que define la administración | Trabajo compartido dentro de una institución |
| Estudiantes | Sin inicio de sesión: la aplicación abre una sesión propia | Una carpeta de este equipo | Prácticas, análisis sin internet y trabajo individual |

En la edición para estudiantes no aparecen Google, Google Drive ni el botón **Salir**. El usuario que muestra la cabecera es **Estudiante**. Todos los proyectos de esa instalación pertenecen al mismo espacio.

## 3. Quién puede hacer qué

La aplicación no tiene roles como administrador, editor o lector. Tampoco tiene invitaciones ni permisos por proyecto.

| Persona o contexto | Puede hacer | No puede hacer |
| --- | --- | --- |
| Visitante sin sesión | Ver Inicio y abrir el acceso | Entrar a Proyectos, Dashboard, Informes o Configuración |
| Usuario con sesión en el servidor | Crear y administrar sus proyectos, cargar archivos, analizar y descargar informes | Ver o modificar los proyectos de otra cuenta |
| Usuario de la edición para estudiantes | Usar todas las secciones con sus archivos locales | Compartir la instalación como si tuviera cuentas separadas |
| Administración técnica del servidor | Instalar la aplicación, configurar el acceso con Google y la cuenta de Google Drive, y hacer respaldos | Obtener un rol adicional dentro de la interfaz |

Cada proyecto pertenece a quien lo creó. La cuenta de Google Drive, en cambio, es una sola para todo el servidor: la define la administración y cambiarla afecta a todos los usuarios.

## 4. Secciones de la aplicación

### Inicio

Presenta la plataforma, los sensores que admite y los pasos de trabajo. El botón **Ir a proyectos** lleva al trabajo diario.

### Proyectos

Es el punto de entrada para crear, editar, archivar y eliminar proyectos. Los filtros **Todos**, **Borradores**, **Activos** y **Archivados** separan los proyectos según su estado.

![Proyectos](assets/screenshots/02-proyectos.png)

![Filtro de proyectos archivados](assets/screenshots/08-proyectos-archivados.png)

### Dashboard

Es el espacio de análisis. Tiene un panel lateral con los proyectos y sus sensores, una barra de filtros (escenario y participante) y vistas específicas para cada señal.

### Informes

Genera un PDF por dispositivo, o varios PDF dentro de un ZIP cuando se eligen todos los dispositivos.

### Configuración

Se abre desde el menú de usuario, arriba a la derecha. Solo contiene la pantalla donde se presentaron los estímulos: ancho y alto en píxeles y, si se conocen, ancho y alto físicos en centímetros. Los proyectos nuevos parten de estos valores y cada proyecto puede cambiarlos. Hasta que se guarden una vez, la aplicación recuerda revisarlos con el aviso **Revisa la configuración de pantalla** y el botón **Ir a Configuración**.

![Configuración](assets/screenshots/06-configuracion.png)

El resto de los datos de un proyecto (participantes, cuestionarios, pantalla propia, áreas de interés y notas) se cambia desde **Editar** en el propio proyecto (ver apartado 8).

## 5. Primer acceso

### Edición servidor

1. Abra la dirección que entregó la administración.
2. Pulse el icono de usuario de la barra superior. Si intenta abrir Proyectos, Dashboard o Informes sin sesión, la aplicación lo lleva a esta pantalla.
3. Pulse **Continuar con Google**.
4. Elija la cuenta autorizada por la institución o el equipo de investigación. La primera vez, la cuenta de NeuroDatics se crea sola.
5. Al terminar la autorización vuelve a NeuroDatics.

![Acceso con Google](assets/screenshots/07-login.png)

El inicio de sesión no da acceso a la cuenta de Google Drive donde se guardan los archivos: esa cuenta la define la administración.

### Edición para estudiantes

1. Abra `neurodatics-estudiantes.exe`.
2. Espere a que se abra el navegador con NeuroDatics (la primera vez tarda más).
3. No hay que iniciar sesión.
4. Entre en **Proyectos**.

No se necesita cuenta de Google ni internet para el uso normal. La guía de esa edición (`LEEME.txt`) explica cómo extraer, abrir y cerrar el programa.

## 6. Crear un proyecto

En **Proyectos**, pulse **Crear proyecto**. Arriba del diálogo elija el tipo:

- **Con datos**: ya tiene la carpeta del experimento. Sigue los cuatro pasos de este apartado.
- **Pre-experimento**: aún no tiene los datos y quiere preparar participantes, pantalla, cuestionarios y notas (ver apartado 10).

![Crear proyecto](assets/screenshots/03-crear-proyecto.png)

### Paso 1 de 4: nombre y carpeta

1. Escriba el nombre del proyecto.
2. Si el experimento se presentó en una pantalla distinta de la guardada en Configuración, marque **Pantalla distinta a la configuración** y complete el ancho y el alto en píxeles y en centímetros.
3. Añada una descripción si el proyecto necesita contexto.
4. Arrastre la carpeta del experimento o pulse **Seleccionar carpeta**. Debe contener los CSV, las imágenes y los vídeos del experimento; el tamaño máximo es 500 MB.
5. Si la carpeta tiene más de un CSV, varias carpetas de imágenes o vídeos u otra duda, aparece el bloque **Confirma la carpeta**: responda para que la aplicación sepa qué usar.
6. En **Ubicación del estímulo en pantalla** puede registrar dónde se mostró cada imagen o vídeo. Es un paso opcional.
7. Pulse **Siguiente**. La aplicación crea el proyecto, sube la carpeta y la procesa. No cierre la pestaña mientras avanza el progreso.

Nombre las imágenes y los vídeos igual que en los datos.

### Paso 2 de 4: sensores

Marque los sensores del experimento:

- **Eye tracker:** mirada, fijaciones, pupila, distancia, mapa de calor, mapa de recorridos y áreas de interés.
- **Electroencefalógrafo (EEG):** señal por canal, densidad espectral, espectrograma y topografía.
- **Sensor galvánico (GSR):** conductancia de la piel y estadísticas de la señal.

Los sensores que la aplicación reconoce en los archivos aparecen con la etiqueta **Detectado**. Revise la selección antes de continuar.

### Paso 3 de 4: datos del participante

Cada participante aparece en su propia tarjeta. Para cada uno:

1. Abra la tarjeta si está cerrada.
2. Compruebe el documento, que viene de los datos y se puede corregir. El nombre es opcional; si lo escribe, el Dashboard lo muestra en lugar del documento.
3. Complete el sexo y la edad: son obligatorios. Las tarjetas pendientes muestran la etiqueta **Completar**.
4. Si quiere, anote algo en **Notas del participante**.
5. Pulse **Siguiente**.

Si el proyecto era un pre-experimento, los participantes que registró antes aparecen primero, cada uno con **Asignar documento**: elija el documento con el que aparece en los datos. Quien quede **Sin asignar** sigue en el proyecto con sus cuestionarios y notas, pero no aparece en el Dashboard ni en los informes.

### Paso 4 de 4: áreas de interés (AOI)

Para cada escenario de imagen:

1. Abra su tarjeta.
2. Elija la forma (**Silueta**, **Rectángulo** o **Círculo**) y, si quiere, un color.
3. Dibuje la forma sobre la zona que le interesa.
4. Escriba un nombre breve para el área.
5. Repita para cada zona que vaya a analizar.

Los escenarios de vídeo no se usan en este paso. Pulse **Guardar proyecto**: la aplicación guarda sensores, participantes, escenarios y áreas, y el proyecto queda disponible para el análisis.

## 7. Estados de un proyecto

Cada tarjeta de **Proyectos** muestra el estado del proyecto:

- **Borrador:** falta terminar de crearlo.
- **Activo:** el proyecto está listo para trabajar.
- **Archivado:** se conserva, pero fuera de la vista principal.
- **Pre-experimento:** se preparó sin datos (mientras no esté archivado).

Además, la tarjeta avisa de lo que ocurre con los archivos:

| Aviso o botón | Significa |
| --- | --- |
| **Procesando archivos** | Los archivos se están procesando. La tarjeta no admite acciones hasta que termine. |
| **Carpeta sin procesar** y **Retomar** | La carga de la carpeta no terminó. **Retomar** vuelve al asistente. |
| **Continuar** | La carpeta ya está procesada y falta terminar el asistente. |
| **Subir** | Es un pre-experimento: sube la carpeta del experimento cuando la tenga. |
| **Actualizar proyecto** (en rojo) | Se procesó con una versión anterior y no muestra el punto de mirada. Créelo de nuevo con la misma carpeta. |

Si un proyecto está activo pero el Dashboard aparece vacío, compruebe que no tenga ningún aviso de estos y que haya elegido el sensor, el participante y el escenario correctos.

## 8. Revisar y editar un proyecto

En la tarjeta de un proyecto puede:

- Pulsar la tarjeta: en un proyecto activo abre el Dashboard.
- Pulsar **Ver proyecto** para consultar sus datos, sensores, participantes y escenarios.
- Abrir **Opciones del proyecto** (los tres puntos) y elegir **Editar**, **Eliminar** y **Archivar** (o **Desarchivar**).

**Editar** abre la página del proyecto, con las secciones **Proyecto**, **Participantes**, **Cuestionarios**, **Pantalla** y **Notas**, y **Áreas de interés** cuando el proyecto ya tiene datos. Cambie lo que necesite y pulse **Guardar cambios**; **Descartar cambios** vuelve a lo guardado. **Volver a proyectos** regresa a la lista.

![Pestaña Pantalla de un proyecto](assets/screenshots/12-pre-experimento.png)

Archivar no elimina los datos. Eliminar no se puede deshacer: se pide confirmar dos veces y escribir `eliminar`. En el servidor se elimina también la carpeta del proyecto en Google Drive; en la edición para estudiantes, los archivos guardados en este equipo.

## 9. Analizar en el Dashboard

Abra **Dashboard** y seleccione un proyecto en el panel lateral. El primer sensor disponible se selecciona solo; también hay una entrada **Comparativas**.

![Dashboard](assets/screenshots/04-dashboard.png)

### Barra de filtros

- El filtro de escenario permite trabajar con **Todos los escenarios** o con uno concreto.
- El filtro de participante cambia a quién se muestra.
- **Comparar participantes** abre una comparación de la gráfica actual entre los participantes del proyecto.
- **Exportar informe** no está disponible en esta barra: los informes se generan en **Informes** (apartado 12).

### Eye tracker

Las vistas son:

1. **Dilatación pupilar:** diámetro pupilar a lo largo del tiempo y sus estadísticas. El interruptor **Ajustar** acerca el eje vertical a los valores de la gráfica.
2. **Punto de mirada:** dónde miraba la persona en cada momento.
3. **Histograma de fijaciones:** cuántas fijaciones hubo según su duración.
4. **Mapa de calor:** zonas del estímulo donde más se detuvo la mirada.
5. **Mapa de recorridos:** el orden en que la mirada pasó de un punto a otro.
6. **Distancia al dispositivo:** distancia entre los ojos y la pantalla durante la prueba.
7. **Comparativa AOIs:** fijaciones, tiempo de permanencia, tiempo hasta la primera fijación y transiciones de las áreas de interés.

Las vistas que salen de las fijaciones muestran el control **Duración mínima**. Use el mismo valor cuando compare resultados.

### EEG

![Dashboard de EEG](assets/screenshots/09-dashboard-eeg.png)

Las vistas son:

1. **EEG por canal:** señal de cada electrodo y sus estadísticas.
2. **Densidad espectral:** energía de la señal en cada frecuencia.
3. **Espectrograma de frecuencias:** cómo cambia esa energía en el tiempo.
4. **Topografía EEG:** mapa de la cabeza con las zonas de mayor actividad.

Lea primero la **Calidad y alcance de EEG**: describe el archivo y sus limitaciones. No corrige la señal ni convierte datos faltantes en ceros.

### GSR

![Dashboard de GSR](assets/screenshots/10-dashboard-gsr.png)

La vista muestra la señal suavizada, la cruda o ambas, y sus estadísticas (media, mínimo y máximo). Interprete los picos junto con el protocolo del experimento.

### Comparativas

![Dashboard de Comparativas](assets/screenshots/11-dashboard-comparativas.png)

Reúne varias gráficas de los sensores del proyecto. Con **Gráficas a comparar** se añaden o se quitan paneles. Todas comparten el participante y el escenario elegidos en la barra de filtros, así que conviene fijarlos antes de leer los gráficos.

Con **Todos los escenarios**, algunas vistas espaciales no tienen un instante común y piden elegir un escenario. Una diferencia visual no es por sí sola una diferencia científica: revise las unidades, la cobertura y las advertencias de calidad.

## 10. Pre-experimento y cuestionarios

Un pre-experimento es un proyecto preparado antes de tener los datos.

1. En **Crear proyecto**, elija **Pre-experimento**. Solo el nombre es necesario; el resto se puede completar ahora o después.
2. En **Participantes**, pulse **Agregar participante**. El documento identifica a cada persona y no puede repetirse en el proyecto.
3. En **Cuestionarios**, agregue preguntas en **Antes del experimento**, **Después del experimento** o en ambos. Cada pregunta puede ser de **Respuesta abierta**, **Selección múltiple** o **Verdadero o falso**, y se puede marcar como **Obligatoria**.
4. En **Pantalla**, registre el ancho y el alto en píxeles, las medidas físicas y las notas de pantalla. Lo que deje vacío se completa con lo guardado en Configuración.
5. En **Notas**, apunte lo que quiera recordar del proyecto.
6. Pulse **Guardar cambios**. Mientras haya cambios sin guardar no se pueden tomar respuestas.

Para tomar las respuestas, abra **Cuestionarios** > **Respuestas**, pulse **Responder cuestionario**, elija participante y cuestionario, pulse **Comenzar** y entregue la pantalla a la persona. Al terminar, **Guardar respuestas**. **Descargar respuestas** baja un archivo con todas. La aplicación usa la sesión de quien investiga: no crea cuentas ni enlaces para los participantes.

Cuando tenga la carpeta del experimento, pulse **Subir** en la tarjeta del proyecto y siga los pasos del apartado 6. Las respuestas ya tomadas se conservan.

## 11. Google Drive en servidor

En la edición servidor los archivos de todos los usuarios se guardan en una sola cuenta de Google Drive. Esa cuenta la definen los administradores desde el equipo donde corre NeuroDatics; la aplicación no la muestra ni permite cambiarla.

Si al cargar un experimento aparece un aviso sobre Google Drive, avise a quien administra NeuroDatics. La administración conecta o renueva la cuenta con `_internal\scripts\conectar-drive.ps1` (ver anexo A) y debe usar la misma cuenta para conservar el acceso a los archivos existentes.

En la edición para estudiantes no se usa Drive: los archivos se conservan en el equipo.

## 12. Generar informes

Abra **Informes**.

![Informes](assets/screenshots/05-reportes.png)

1. **Selección de proyecto:** elija el proyecto.
2. **Alcance del informe:**
   - **Un participante**, con las gráficas y estadísticas completas de esa persona en cada escenario.
   - **Resumen de todos los participantes**, con mapas agregados, tablas por participante y media del grupo.
3. **Dispositivo:** Eye tracker, EEG o GSR (los que tenga el proyecto) o **Todos los dispositivos**, que genera un PDF por dispositivo.
4. **Opciones del informe:** **Incluir portada** e **Incluir fecha y nombre del proyecto**.
5. Revise la vista previa: lista lo que contendrá cada informe.
6. Pulse **Descargar informe PDF** o, si eligió todos los dispositivos, **Descargar informes (ZIP)**.

![Informe de grupo y descarga ZIP](assets/screenshots/13-reportes-grupo.png)

El informe se organiza por dispositivo e incluye un resumen y las secciones de cada escenario. Los escenarios de vídeo se omiten; la vista previa indica cuántos quedan fuera.

## 13. Problemas frecuentes

| Problema | Qué revisar primero |
| --- | --- |
| No puedo entrar a una sección | En el servidor, inicie sesión. En la edición para estudiantes, compruebe que la ventana negra del programa siga abierta. |
| No veo mis proyectos | Confirme que usa la cuenta que los creó o, en la edición para estudiantes, la misma instalación. |
| La carpeta no se puede cargar | Seleccione la carpeta completa, revise el límite de 500 MB y responda las preguntas de **Confirma la carpeta**. |
| El Dashboard está vacío | Compruebe que la tarjeta del proyecto no diga **Procesando archivos** y revise el sensor, el participante y el escenario elegidos. |
| Falta un estímulo | Compruebe que la imagen o el vídeo estén en la carpeta con el mismo nombre que en los datos. |
| EEG muestra advertencias | Revise la calidad, los canales incompletos y los artefactos antes de interpretar. |
| No se habilita la descarga de un informe | Debe haber un participante, al menos un escenario de imagen y un dispositivo elegido. |
| Un proyecto dice **Actualizar proyecto** | Créelo de nuevo con la misma carpeta. |
| Google Drive no conecta | Avise a la administración: reconecta la cuenta desde el servidor. |

No comparta contraseñas, archivos `.env`, credenciales de Google ni datos identificables de participantes al pedir ayuda.

## 14. Antes de analizar o exportar

- Conserve una copia de los datos originales.
- Use códigos y documentos consistentes para participantes y escenarios.
- Confirme los sensores antes de interpretar.
- Espere a que termine **Procesando archivos**.
- Compruebe la pantalla guardada en Configuración si va a interpretar coordenadas.
- Nombre las áreas de interés según la hipótesis o la estructura del estímulo.
- Use los mismos filtros al comparar.
- Revise unidades, escalas y advertencias.
- No interprete `Sin datos` como cero.
- Proteja los PDF y ZIP descargados según el protocolo de la investigación.

## 15. Glosario breve

| Término | Significado |
| --- | --- |
| AOI | Área de interés dibujada sobre un estímulo. |
| Línea base | Valor de referencia para interpretar cambios. |
| EEG | Registro de la actividad eléctrica del cerebro. |
| Eye tracker | Sensor que registra la mirada y las fijaciones. |
| Fijación | Periodo en que la mirada permanece sobre un mismo punto. |
| GSR | Respuesta galvánica o conductancia de la piel. |
| PSD | Densidad espectral de potencia. |
| Escenario | Imagen o vídeo presentado durante una grabación. |
| TTFF | Tiempo hasta la primera fijación sobre un área de interés. |

## 16. Ayuda

Al pedir ayuda incluya:

1. Edición utilizada: servidor o estudiantes.
2. Sistema operativo y navegador.
3. Sección donde ocurrió el problema.
4. Nombre del proyecto, sin datos sensibles.
5. Mensaje exacto de la pantalla.
6. Lo que había hecho justo antes.
7. Una captura de pantalla con las credenciales y los datos personales ocultos.

Para problemas de instalación, acceso con Google, Google Drive o respaldos, contacte a la administración técnica. Para la estructura de los experimentos, los sensores, los participantes o la interpretación, contacte al equipo de investigación responsable.

## Anexo A. Puesta en marcha para administración técnica

Este anexo no es necesario para el uso diario.

### Servidor

La entrega para Windows usa Docker Desktop y expone la interfaz en el puerto 3000. La base de datos y los demás servicios permanecen dentro de la red de Docker. El paquete no requiere instalar Node.js, Python, PostgreSQL ni Redis por separado.

1. Extraiga el paquete completo fuera del ZIP.
2. Ejecute `INSTALAR.bat` la primera vez.
3. Autorice WSL o reinicie Windows si el instalador lo pide.
4. Inicie la aplicación con `INICIAR.bat` o desde Docker Desktop.
5. Abra `http://localhost:3000`.
6. Configure el acceso con Google según la entrega de la institución y conecte la cuenta de Google Drive con `_internal\scripts\conectar-drive.ps1`.

No elimine volúmenes para resolver un error sin un respaldo previo. Antes de actualizar, conserve los datos y el archivo `.env`.

### Estudiantes

La edición para estudiantes usa un único usuario y guarda los archivos en `%LOCALAPPDATA%\NeuroDatics Estudiantes`. No depende de Google ni de internet. Mientras la ventana negra del programa esté abierta, la aplicación está en `http://neurodatics.localhost:8765/`. Borrar la carpeta del programa no borra los proyectos.

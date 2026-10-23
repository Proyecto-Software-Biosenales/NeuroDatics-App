# Informes {#cap-informes}

Un informe es un PDF por dispositivo con las gráficas y estadísticas de cada escenario. Puede ser de un participante o de todo el grupo, y de un dispositivo o de todos a la vez. Los informes se generan en la página **Informes** y funcionan igual en las dos ediciones.

## Generar un informe {#generar-informe}

Genera el PDF de un participante con un dispositivo: el Eye tracker, el GSR o el EEG.

Antes de empezar, el proyecto debe estar procesado y tener al menos un escenario de imagen. Los escenarios de vídeo no entran en los informes.

La [[fig:7-1]] muestra las tres primeras tarjetas de la página.

![[fig:7-1|La página Informes: proyecto, alcance y dispositivo.|w=6.5]]

1. Haz clic en **Informes** en la barra superior.
2. En «Selección de proyecto» (1), abre el desplegable y elige el proyecto.
   Aparece la ficha del proyecto con su fecha y sus sensores, y debajo las demás tarjetas.
3. En «Alcance del informe» (2), deja marcado **Un participante** y elige al participante.
   La lista muestra «Participante» seguido del código que trae la grabación, no el nombre ni el documento como en el Dashboard. NeuroDatics elige el primero automáticamente.
4. En «Dispositivo» (3), marca **Eye tracker**, **GSR** o **EEG**.
5. Revisa el recuadro «Contenido del informe», señalado con (1) en la [[fig:7-2]]: dice qué secciones tendrá el PDF.
6. En «Opciones del informe», deja marcadas o desmarca **Incluir portada** e **Incluir fecha y nombre del proyecto**.
7. Haz clic en **Descargar informe PDF**, señalado con (2) en la [[fig:7-2]].
   Aparece «Generando informe…» y, cuando termina, «Informe generado.».

![[fig:7-2|La vista previa del contenido, las opciones y el botón de descarga.|w=6.5]]

Al terminar, el PDF está en la carpeta de descargas del navegador. Su nombre dice el dispositivo, el proyecto, el participante y la fecha y hora de generación, por ejemplo `informe-eye-tracking-estudio-participante-p-001-20261014-1530.pdf`. La hora del nombre está en hora universal. Ver [[ref:ref-descargas]].

Las opciones del informe cambian lo siguiente:

<!-- anchos: 38 62 -->
| Opción | Qué añade al PDF |
| --- | --- |
| **Incluir portada** | Una página inicial con el dispositivo, el proyecto y el alcance del informe. |
| **Incluir fecha y nombre del proyecto** | La fecha de generación y el proyecto en la portada y en el pie de cada página. |

::: nota
La vista previa avisa si el proyecto tiene escenarios de vídeo: «se omite 1 escenario de vídeo» o «se omiten … escenarios de vídeo». Al cambiar de proyecto, el alcance y el dispositivo vuelven a sus valores iniciales.
:::

### Si algo sale mal

<!-- anchos: 45 55 -->
| Qué ves | Qué hacer |
| --- | --- |
| El botón de descarga está desactivado | Comprueba que elegiste proyecto, participante y dispositivo, y que no se está generando otro informe. |
| «El proyecto no tiene dispositivos registrados.» | El proyecto no tiene datos todavía (por ejemplo, un pre-experimento). Carga su carpeta. Ver [[ref:subir-preexperimento]]. |
| «El proyecto no tiene escenarios de imagen.» | Los informes solo analizan imágenes; ese proyecto solo tiene vídeos. |
| «No hay datos procesados para generar el informe» | No se pudieron leer los datos de ningún participante. Revisa el proyecto en el Dashboard. |
| «No se pudo generar el informe.» | Vuelve a intentarlo. Si se repite, ver [[ref:problemas-informes]]. |

Un informe puede tardar varios minutos. Si pasa de 10 minutos, NeuroDatics deja de esperar y muestra «No se pudo conectar con NeuroDatics. La solicitud tardó demasiado (600 s).». Ver [[ref:problemas-informes]].

## Generar el informe de grupo o de todos los dispositivos {#informe-grupo}

El informe de grupo compara a todos los participantes del proyecto: mapas agregados, tablas por participante y la media del grupo. Con **Todos los dispositivos** obtienes un PDF por cada dispositivo del proyecto, juntos en un archivo `.zip`.

1. Haz clic en **Informes** y elige el proyecto en «Selección de proyecto».
2. En «Alcance del informe», marca **Resumen de todos los participantes** para el informe de grupo, o deja **Un participante**.
3. En «Dispositivo», marca un dispositivo o **Todos los dispositivos**.
   **Todos los dispositivos** solo aparece si el proyecto tiene más de un sensor.
4. Revisa «Contenido del informe»: con varios dispositivos dice «… informes PDF en un archivo ZIP» y muestra un recuadro por dispositivo.
5. Haz clic en **Descargar informes (ZIP)**, como en la [[fig:7-3]], o en **Descargar informe PDF** si elegiste un solo dispositivo.
   Aparece «Generando informes…» y, al terminar, «Informes generados.».

![[fig:7-3|Informe de grupo con todos los dispositivos: el botón Descargar informes (ZIP).|w=6.5]]

Al terminar, en la carpeta de descargas tienes:

<!-- anchos: 34 66 -->
| Elección | Archivo |
| --- | --- |
| Grupo, un dispositivo | Un PDF cuyo nombre lleva `grupo` en lugar del participante, por ejemplo `informe-gsr-estudio-grupo-20261014-1530.pdf`. |
| Todos los dispositivos | Un archivo `.zip` que se llama `informes-` seguido del proyecto, del alcance y de la fecha. Dentro hay un PDF por dispositivo, en este orden: Eye tracker, GSR, EEG. |

**Resumen de todos los participantes** está desactivado si el proyecto no tiene participantes. Los participantes de un pre-experimento que quedaron **Sin asignar** no entran en el informe de grupo. Ver [[ref:asignar-documento]].

Si algo falla, ver [[ref:problemas-informes]].

## Qué contiene cada informe {#contenido-informe}

Todos los informes tienen la misma estructura. El recuadro «Contenido del informe» de la página la resume antes de descargar.

1. **Portada**, si marcaste **Incluir portada**: el dispositivo, el proyecto, el alcance y las cifras de participantes y escenarios.
2. **Contenido**: un índice con enlaces a cada sección.
3. **Resumen**: los datos del informe, una tabla y una gráfica que comparan los escenarios y, si hace falta, el recuadro «Avisos sobre los datos».
4. **Una sección por escenario de imagen**, con su duración y, en grupo, cuántos participantes tienen datos en él.
5. **Metodología y glosario**: cómo se procesó cada señal, sus límites y las definiciones.

Cada página lleva el nombre de la sección en el encabezado y «Página X de Y» en el pie.

Lo que cambia es la sección de cada escenario:

<!-- anchos: 16 42 42 -->
| Dispositivo | Un participante | Grupo |
| --- | --- | --- |
| **Eye tracker** | Mapa de calor y recorrido visual; áreas de interés con tiempo, TTFF y transiciones; histograma de fijaciones; dilatación pupilar, punto de mirada y distancia con sus estadísticas | Mapa de calor del grupo y recorridos individuales; cuántos participantes miraron cada área de interés y su tiempo medio; fijaciones por participante; pupila, mirada y distancia por participante con la media del grupo |
| **GSR** | Señal suavizada y cruda con base, mínimo y máximo; estadísticas de la señal | Variación de cada participante sobre su propia base; estadísticas por participante con la media del grupo; pico sobre la base por participante |
| **EEG** | Señal y estadísticas por canal; densidad espectral y potencia por banda; topografía esquemática; espectrograma por canal | Potencia relativa por banda de cada participante; espectro medio de cada participante; topografía media del grupo |

Las tablas de estadísticas usan las columnas **N**, **Base**, **Media**, **DE**, **Mediana**, **Mín.**, **Máx.** y **Pico %**; en grupo añaden las filas «Media del grupo» y «DE entre participantes». En el informe de grupo cada participante aparece con un alias (P1, P2…) y su código.

El recuadro «Avisos sobre los datos» del resumen explica lo que quedó fuera o se dibujó distinto:

- un participante cuyos datos no se pudieron leer;
- los escenarios de vídeo omitidos, porque los informes analizan imágenes;
- las imágenes de estímulo que no se pudieron cargar: sus mapas se dibujan sobre un lienzo neutro;
- con más de 8 participantes, que los primeros 8 tienen color propio en las gráficas y el resto se dibuja en gris; las tablas conservan el valor de cada persona.

::: importante
Un escenario sin datos aparece con el recuadro «Sin datos». Antes de sacar conclusiones de un informe, revisa sus avisos y qué datos entran en el análisis. Ver [[ref:calidad-datos]].
:::

Qué significa cada métrica está en [[ref:cap-entender]]; los nombres de todos los archivos que descarga NeuroDatics, en [[ref:ref-descargas]].

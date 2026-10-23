# Analizar en el Dashboard {#cap-dashboard}

El Dashboard muestra las gráficas y estadísticas de cada proyecto, participante y escenario. Este capítulo explica cómo moverte por él y qué ves en cada vista. Qué significa cada cifra y cuándo fiarte de ella está en [[ref:cap-entender]].

A la izquierda está el panel lateral con los proyectos y sus sensores; arriba, los filtros de escenario y participante; en el centro, las pestañas del sensor elegido. Si pasas el cursor sobre un sensor o una pestaña, aparece una frase que explica qué muestra.

## Abrir el análisis de un proyecto {#abrir-dashboard}

Abre el Dashboard con el proyecto que quieres analizar y elige el sensor. El proyecto debe estar procesado: su tarjeta dice **Activo**. Ver [[ref:tarjeta]].

La [[fig:5-1]] muestra el Dashboard con el Eye tracker abierto.

![[fig:5-1|El Dashboard: panel lateral con los sensores, filtros y pestañas del Eye tracker.|w=6.5]]

1. Haz clic en la tarjeta del proyecto en **Proyectos**, o en **Dashboard** en la barra superior.
   Desde la tarjeta, el proyecto ya viene elegido. Desde la barra superior se abre el primer proyecto de la lista.
2. En el panel lateral (1), haz clic en el nombre del proyecto.
   El proyecto se despliega con sus sensores y se abre el primero que tenga, en este orden: Eye tracker, Electroencefalógrafo, Sensor galvánico.
3. Haz clic en el sensor que quieres ver, o en **Comparativas**.
4. Elige el escenario y el participante en **Filtros** (2). Ver [[ref:filtros]].
5. Haz clic en la pestaña de la vista que necesitas (3).

Al terminar ves la vista elegida con el primer participante y **Todos los escenarios**.

La flecha junto al nombre de un proyecto lo pliega o lo despliega. El botón de doble flecha, **Contraer panel**, reduce el panel a iconos con los sensores del proyecto abierto; en pantallas angostas el panel empieza así.

::: nota
Al cambiar de proyecto, los filtros vuelven a empezar: el primer participante, **Todos los escenarios** y una duración mínima de fijación de 200 ms.
:::

### Si algo sale mal

Si aparece «Selecciona un proyecto del panel lateral», haz clic en un proyecto de la lista; si el panel lateral está vacío, recarga la página. Ver [[ref:problemas-dashboard]].

## Elegir escenario y participante {#filtros}

Los dos desplegables de **Filtros** deciden qué datos muestran todas las vistas: de qué escenario (la imagen o el vídeo que se mostró) y de qué participante.

1. Abre el primer desplegable y elige un escenario por su nombre, o **Todos los escenarios**.
2. Abre el segundo desplegable y elige un participante.
   La lista muestra el nombre del participante o, si no tiene nombre, «Participante» seguido de su documento.

Al terminar, la vista abierta se vuelve a calcular con el escenario y el participante elegidos. Mientras carga, los desplegables quedan desactivados un momento.

Algunas vistas necesitan un escenario concreto, porque dibujan sobre la imagen del estímulo. Con **Todos los escenarios** muestran «Selecciona un escenario específico para visualizar…» con el nombre de la vista:

<!-- anchos: 40 60 -->
| Vista | Qué necesita |
| --- | --- |
| **Mapa de calor**, **Mapa de recorridos**, **Comparativa AOIs** y «Correlaciones entre señales» (en **Comparativas**) | Un escenario concreto y un participante |
| Las demás vistas | Un participante; el escenario puede ser **Todos los escenarios** |

::: nota
Cambiar de escenario o de participante reinicia la vista: se pierden la ventana temporal, la ampliación, el instante seleccionado y los modos que hubieras elegido.
:::

## Ver la pupila, la mirada y la distancia {#eye-senales}

Tres pestañas del **Eye tracker** muestran señales a lo largo del tiempo: el tamaño de la pupila, la posición de la mirada en la pantalla y la distancia de los ojos a la pantalla. Las tres funcionan igual.

La [[fig:5-2]] muestra la pestaña **Dilatación pupilar**, la que se abre por defecto.

![[fig:5-2|La pestaña Dilatación pupilar con sus modos, el botón Ajustar y la ventana temporal.|w=6.5]]

1. Haz clic en **Eye tracker** en el panel lateral y elige un participante.
2. Haz clic en la pestaña **Dilatación pupilar**, **Punto de mirada** o **Distancia al dispositivo**.
3. Elige el modo (1): **Ambas pupilas**, **Izquierda** o **Derecha** en la pupila; **Ambos ejes**, **Eje X** o **Eje Y** en la mirada. La distancia no tiene modos.
4. Haz clic en **Ajustar** (2) si quieres que el eje vertical se acerque a los valores de la gráfica.
5. Si solo te interesa un tramo, usa la ventana temporal (3). Ver [[ref:ventana-zoom]].
6. Lee las tarjetas **Media**, **Mínimo** y **Máximo**, la gráfica y, más abajo, la tabla «Estadísticas».

Al terminar, la gráfica, las tarjetas y la tabla resumen solo el participante, el escenario y el tramo elegidos. Al pasar el cursor por la gráfica ves el valor de cada instante.

En la pupila, la curva roja es el ojo derecho y la violeta el izquierdo; la línea gris discontinua marca la media. En **Punto de mirada**, las tarjetas se refieren solo a la mirada horizontal (X). El icono de información de cada tarjeta explica la cifra; las columnas de la tabla y la línea base se explican en [[ref:entender-eye]].

### Si algo sale mal

Si aparece «No hay datos de dilatación pupilar para los filtros seleccionados.» (o el mismo aviso de la mirada o de la distancia), elige otro participante o **Todos los escenarios**. Ver [[ref:problemas-dashboard]].

## Ver dónde miraba en un instante {#instante}

En las gráficas de tiempo puedes elegir un instante y ver, sobre la imagen del estímulo, dónde estaba mirando el participante en ese momento.

1. Abre **Dilatación pupilar**, **Punto de mirada**, **Distancia al dispositivo** o **EEG por canal**.
2. Haz clic en un punto de la gráfica, o en la tarjeta **Mínimo** o **Máximo**.
   Una línea vertical marca ese segundo en la gráfica.
3. Baja hasta la tarjeta «Punto de fijación sobre estímulo visual».
4. Busca el círculo sobre la imagen: es el punto donde miraba la persona.
5. Para quitar la marca, haz clic en **Limpiar selección**.
   - En la pupila, la mirada y la distancia, volver a hacer clic en la misma tarjeta **Mínimo** o **Máximo** quita la línea de la gráfica, pero la tarjeta conserva el punto hasta que haces clic en **Limpiar selección**.

La [[fig:5-3]] muestra la tarjeta con el punto de mirada marcado.

![[fig:5-3|La tarjeta «Punto de fijación sobre estímulo visual» con el círculo en el punto donde miraba la persona.|w=5.3]]

La tarjeta muestra **SEGUNDO**, **VALOR**, **POS X** y **POS Y**; la imagen (o el fotograma del vídeo) con un círculo en el punto de la mirada y las áreas de interés, que no se dibujan sobre un vídeo; y, debajo, el aviso «Punto de atención», con el segundo y el valor. Si el escenario tiene áreas de interés, el aviso dice además si la mirada «Cae dentro del AOI…» o «No cae dentro de un AOI delimitado.».

En el **Espectrograma de frecuencias** se hace igual: haz clic en un panel o en la tarjeta **Nivel máximo**.

::: nota
Cambiar la ventana temporal o ampliar la gráfica borra el instante seleccionado. Vuelve a hacer clic después de acotar el tiempo.
:::

### Si algo sale mal

- La tarjeta dice «Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante»: todavía no hay instante elegido, o no se pudo leer la mirada de ese momento. Haz clic en otro punto.
- Aparece «Sin coordenadas de mirada registradas para t = …»: en ese instante el Eye tracker no registró la mirada. Ver [[ref:problemas-dashboard]].

## Acotar el tiempo y ajustar el eje {#ventana-zoom}

Por defecto, las gráficas muestran toda la grabación. Puedes limitarlas a un tramo escribiendo los segundos o arrastrando sobre la gráfica; las tarjetas y las tablas se recalculan para ese tramo.

### Escribir una ventana temporal

1. Haz clic en el botón **Todo el experimento**, sobre la gráfica.
2. Escribe en **Inicio** y **Fin** los segundos del tramo. Escribe los decimales con punto, por ejemplo 5.5.
3. Haz clic en **Aplicar**.
   El botón pasa a llamarse **Ventana activa** y muestra el intervalo.
4. Para volver a toda la grabación, abre de nuevo el botón y haz clic en **Restablecer**.

### Ampliar arrastrando

1. Haz clic sobre la gráfica y, sin soltar, arrastra hasta el final del tramo que quieres ver.
   Arrastrar equivale a escribir la ventana temporal.
2. Repite dentro del tramo ampliado si quieres acercarte más.
3. Para deshacer, usa los botones de la esquina superior derecha de la gráfica:
   - la flecha **Volver al zoom anterior**, cuando has ampliado varias veces;
   - la X **Volver a la vista completa**.

En la **Densidad espectral** del EEG, arrastrar amplía un rango de frecuencias, no de tiempo. En el **Espectrograma de frecuencias** amplía el tiempo.

### Ajustar el eje vertical

El botón **Ajustar** acerca el eje vertical a los valores que hay en la gráfica, para que las variaciones pequeñas se vean mejor. Está en **Dilatación pupilar**, **Punto de mirada**, **Distancia al dispositivo**, **Sensor galvánico** y **Densidad espectral**. En las demás vistas el eje se ajusta solo.

### Si algo sale mal

El panel de la ventana temporal no se cierra mientras haya un error:

<!-- anchos: 50 50 -->
| Mensaje | Qué hacer |
| --- | --- |
| «Usa valores numéricos válidos para la ventana temporal.» | Escribe solo números en **Inicio** y **Fin**. |
| «Los segundos deben ser mayores o iguales a 0.» | Corrige el valor negativo. |
| «El segundo final debe ser mayor que el segundo inicial.» | Escribe en **Fin** un valor mayor que en **Inicio**. |

## Analizar las fijaciones {#fijaciones}

La pestaña **Histograma de fijaciones** muestra cuántas fijaciones hubo según su duración y te deja elegir la duración mínima de una fijación.

La [[fig:5-4]] muestra la pestaña con el selector y la tabla de sensibilidad.

![[fig:5-4|El Histograma de fijaciones con el selector de duración mínima y la tabla «Sensibilidad del umbral».|w=6.5]]

1. Elige un participante; el escenario puede ser uno concreto o **Todos los escenarios**.
2. Haz clic en **Eye tracker** y en la pestaña **Histograma de fijaciones**.
3. Elige la duración en **Duración mínima** (1), arriba a la derecha: 100, 150, 200, 250 o 300 ms.
4. Para decidir cuál, mira la tabla «Sensibilidad del umbral» (2): compara cuántas fijaciones y cuánto tiempo fijado quedan con cada duración mínima.
   - También puedes elegir la duración con **Usar** en una fila de la tabla. La fila elegida dice **Activo**.
5. Lee las tarjetas **Media**, **Mínimo** (fijación más corta) y **Máximo** (fijación más larga), en ms, y las barras con su tabla de rangos: **Rango (ms)**, **Fijaciones**, **Porcentaje** y **Promedio (ms)**.

Al terminar, la duración elegida se aplica a las cuatro vistas de fijación del Eye tracker: **Histograma de fijaciones**, **Mapa de calor**, **Mapa de recorridos** y **Comparativa AOIs**, y su selector aparece en las cuatro. Compara siempre con la misma duración mínima. Ver [[ref:entender-fijaciones]].

### Si algo sale mal

- Aparece «Comparación no disponible» junto al selector: el proyecto no tiene las variantes de duración. El aviso dice «Vuelve a procesar los archivos del proyecto para generar las variantes de duración.».
- Aparece «Sin fijaciones de al menos … ms para este escenario.»: prueba con una duración mínima menor o con otro escenario.
- Aparece «No hay suficientes fijaciones para comparar los umbrales disponibles.»: la tabla de sensibilidad queda vacía, pero el histograma sigue funcionando. Ver [[ref:problemas-dashboard]].

## Ver el mapa de calor y el recorrido de la mirada {#mapa-calor}

El mapa de calor colorea las zonas del estímulo donde más se detuvo la mirada. El mapa de recorridos muestra el orden en que la mirada pasó de un punto a otro. Los dos necesitan un escenario concreto y un participante.

### Ver el mapa de calor

1. En **Filtros**, elige un escenario concreto y un participante.
2. Haz clic en **Eye tracker** y en la pestaña **Mapa de calor**.
3. Si el mapa se confunde con la imagen, haz clic en **Filtro violeta** (1): tiñe el fondo para que el mapa destaque.
4. Haz clic en **AOIs** (2) para mostrar u ocultar las áreas de interés; el botón indica cuántas hay.

La [[fig:5-5]] muestra un mapa de calor sobre su estímulo.

![[fig:5-5|El mapa de calor sobre la imagen del estímulo, con sus tarjetas de cifras.|w=6.5]]

Encima del mapa están las tarjetas **Fijaciones** (total en el escenario), **Fijación más larga** y **Duración media**, en ms. Los colores cálidos marcan más atención, siempre relativa a esa persona: no compares colores entre participantes. Ver [[ref:entender-fijaciones]].

### Reproducir el recorrido de la mirada

1. Con un escenario concreto y un participante, haz clic en la pestaña **Mapa de recorridos**.
   Cada círculo numerado es una fijación, en el orden en que ocurrió; cada línea, un salto entre dos fijaciones. Un círculo más grande es una fijación más larga.
2. Mueve el deslizador «Fijación n de N» para ver el recorrido paso a paso, como en la [[fig:5-6]].
3. Haz clic en **Ver todos** para volver a mostrar el recorrido completo.
4. Pasa el cursor sobre un círculo para ver su duración y sus segundos de inicio y fin.

![[fig:5-6|El mapa de recorridos con el deslizador para reproducir las fijaciones en orden.|w=6.5]]

Las tarjetas resumen el recorrido; qué mide cada una está en [[ref:entender-fijaciones]].

### Si algo sale mal

- Aparece «No hay datos de fijación para los filtros seleccionados.»: el participante no tiene fijaciones en ese escenario con la duración mínima elegida.
- Aparece «No se encontró imagen del escenario seleccionado.»: falta la imagen de ese escenario en la carpeta del proyecto. Ver [[ref:problemas-dashboard]].

## Analizar las áreas de interés {#aoi-analisis}

La pestaña **Comparativa AOIs** mide cuánta atención recibió cada área de interés de un escenario, cuándo la encontró la mirada y cómo respondió el participante.

Antes de empezar, el escenario debe tener áreas de interés dibujadas. Ver [[ref:aoi]].

1. En **Filtros**, elige un escenario concreto y un participante.
2. Haz clic en **Eye tracker** y en la pestaña **Comparativa AOIs**.
3. Lee los bloques de arriba abajo, en el orden de la tabla.
4. Haz clic en los avisos **Cómo leerlos**, **Cómo se calculan** y **Cómo se cuentan** para ver cómo se obtiene cada cifra.
5. En «Secuencia de atención», pasa el cursor sobre un bloque para ver esa fijación.

La [[fig:5-7]] muestra el comienzo de la pestaña: las tarjetas y el estímulo con sus áreas.

![[fig:5-7|El comienzo de Comparativa AOIs: tarjetas de resumen y estímulo con las áreas de interés.|w=6.5]]

<!-- anchos: 32 68 -->
| Bloque | Qué muestra |
| --- | --- |
| Tarjetas | **AOIs** (áreas analizadas), **Fijaciones** (total en el escenario), **Tiempo en AOIs** (%) y **Más observada** (el área con más tiempo). |
| Estímulo | La imagen con las áreas dibujadas y su leyenda de colores. |
| «Distribución temporal por áreas de interés (AOI)» | Una barra por área con su porcentaje de tiempo. |
| «Hallazgos clave» | Lo más destacado: qué área captó primero la mirada, cuál se revisitó más, cuál no recibió fijaciones… |
| «Secuencia de atención» | Un carril por área con un bloque por fijación; el ancho es su duración. |
| «Métricas por AOI» | Una tabla con las métricas de cada área. |
| «Transiciones entre AOIs» | Las «Conexiones más frecuentes» entre áreas y la «Matriz completa» de saltos. |
| «Picos de señal» | Dónde miraba el participante en el mínimo y el máximo de la pupila, la distancia y la mirada. |

Aquí el tiempo cuenta desde el inicio del escenario («t = 0: inicio del escenario»), no desde el inicio de la grabación. Qué significa cada métrica y qué pasa cuando dos áreas se solapan está en [[ref:entender-aoi]].

### Si algo sale mal

- Aparece «No hay AOIs definidas para este escenario.»: dibuja las áreas en el editor del proyecto. Ver [[ref:editar-proyecto]].
- Aparece «Selecciona un participante para ver AOIs.»: elige un participante en **Filtros**.
- Aparece «No hay fijaciones sobre las AOIs para extraer hallazgos.» o «La mirada no pasó de un AOI a otro en este escenario.»: la persona no miró las áreas, o no lo hizo con la duración mínima elegida. Prueba con otra duración. Ver [[ref:problemas-dashboard]].

## Revisar el EEG {#eeg}

El **Electroencefalógrafo** tiene cuatro pestañas: **EEG por canal**, **Densidad espectral**, **Espectrograma de frecuencias** y **Topografía EEG**. Qué mide cada una está en [[ref:entender-eeg]].

Si el procesamiento de esa grabación dejó avisos, al final de cada pestaña aparece el recuadro «Calidad y alcance de EEG» con ellos; si no los hay, el recuadro no aparece.

### Ver la señal de cada canal

1. Haz clic en **Electroencefalógrafo** en el panel lateral y elige un participante.
   Se abre la pestaña **EEG por canal**.
2. Activa o desactiva canales (1): **LE**, **F4**, **C4**, **P4**, **P3**, **C3** y **F3**. Debe quedar al menos uno.
3. Elige la señal (2): **Suavizada** (la que se abre por defecto), **Cruda** o **Ambas**.
4. Elige la disposición (3): **Superpuesta** (todos los canales en el mismo eje) o **Montaje** (cada canal en su carril).
5. En **Estadísticas de**, elige el canal que resumen las tarjetas **Media**, **Mínimo** y **Máximo**.
6. Haz clic en un punto de la gráfica para ver el estímulo en ese instante. Ver [[ref:instante]].

La [[fig:5-8]] señala los controles de esta pestaña.

![[fig:5-8|EEG por canal: canales, tipo de señal y disposición.|w=6.5]]

Bajo la gráfica hay notas breves (pasa el cursor para leerlas) y, más abajo, las estadísticas por canal, el punto seleccionado, los «Tramos con artefacto candidato» y la «Calidad por canal». Haz clic en un tramo con artefacto para verlo en la gráfica.

### Ver la energía por frecuencia

En la pestaña **Densidad espectral**, las tarjetas **Frecuencia pico**, **Densidad pico** y **Nivel medio** resumen el espectro, y la tabla «Estadísticas de densidad espectral» da los valores por canal. Puedes elegir canales y usar **Ajustar** y la ventana temporal. La casilla **Excluir ventanas con artefacto** deja fuera del cálculo los tramos marcados como artefacto. Arrastra sobre la gráfica para ampliar un rango de frecuencias; un clic no elige un instante.

### Ver el espectrograma y la topografía

En el **Espectrograma de frecuencias** hay un panel por canal, con el tiempo en horizontal, la frecuencia en vertical y la energía en colores. La [[fig:5-9]] muestra esta pestaña.

![[fig:5-9|El espectrograma de frecuencias, con un panel por canal.|w=6.5]]

- La casilla **Escala de color por canal** da a cada panel su propia escala; entonces no compares colores entre canales.
- La casilla **Interpolar celdas** dibuja los colores de forma continua en lugar de por celdas.
- El aviso «Bandas negras: n ventanas» explica los tramos sin estimación.
- Haz clic en un panel o en la tarjeta **Nivel máximo** para elegir un instante; arrastra para ampliar el tiempo.

En la **Topografía EEG**:

1. Elige los canales: **F3**, **F4**, **C3**, **C4**, **P3** y **P4**. Hacen falta al menos tres.
2. Mueve el deslizador «Ventana i / N» para recorrer la grabación.
   Junto al mapa de la cabeza aparece el estímulo que se mostraba en esa ventana.
3. Lee la lista «Potencia por electrodo», con la **Mínima** y la **Máxima**.

### Si algo sale mal

- Aparece «No hay datos de EEG para los filtros seleccionados.»: elige otro participante o **Todos los escenarios**.
- Aparece «No hay datos suficientes para calcular la PSD.», «…el espectrograma.» o «…la topografía EEG.»: prueba con una ventana temporal más amplia, con otros canales o con otro participante.
- «Calidad y alcance de EEG» muestra «Unidades EEG con salvedades»: algún canal se reescaló o se excluyó por su unidad. Ver [[ref:problemas-dashboard]].

## Revisar la respuesta galvánica {#gsr}

El **Sensor galvánico** muestra la conductancia de la piel a lo largo del tiempo, en microsiemens (µS). Es una sola vista, sin pestañas.

La [[fig:5-10]] muestra la vista completa.

![[fig:5-10|La vista del sensor galvánico con sus tarjetas y la gráfica de conductancia.|w=6.5]]

1. Haz clic en **Sensor galvánico** en el panel lateral y elige un participante.
2. Elige la señal (1): **Suavizada**, **Cruda** o **Ambas**.
3. Usa **Ajustar** (2) y la ventana temporal si quieres acercarte a un tramo. Ver [[ref:ventana-zoom]].
4. Lee las tarjetas **Media**, **Mínimo** y **Máximo**, con cuatro decimales.
5. Haz clic en un punto de la gráfica para ver la lectura de ese instante en «Punto seleccionado»: **SEGUNDO**, **SUAVIZADA** y **CRUDA**.
6. Baja hasta la tabla «Estadísticas», con las mismas columnas que en el Eye tracker.

Al terminar tienes el nivel de conductancia del participante y su variación respecto a la línea base en el tramo elegido. Esta vista no detecta respuestas galvánicas una a una. Ver [[ref:entender-gsr]].

### Si algo sale mal

Si aparece «No hay datos de GSR para los filtros seleccionados.», elige otro participante o **Todos los escenarios**. Ver [[ref:problemas-dashboard]].

## Comparar señales en Comparativas {#comparativas}

**Comparativas** reúne en una sola pantalla varias gráficas de un mismo participante, de uno o varios sensores, y calcula un resumen estadístico y las correlaciones entre señales.

1. En el panel lateral, haz clic en **Comparativas** y elige un participante en **Filtros**.
2. Haz clic en **Gráficas a comparar** (1).
3. Marca las gráficas que quieres ver; están agrupadas en «Señales temporales», «Distribución y frecuencia» y «Mapas y espacio».
   - **Seleccionar disponibles** marca todas las del proyecto; **Limpiar** las desmarca.
4. Haz clic en **Aplicar selección**.
   Cada gráfica aparece en su propio panel (2).
5. Haz clic en el título de un panel para plegarlo o desplegarlo.
6. Pasa el cursor por una gráfica de tiempo: el cursor se mueve a la vez en todas.
   - Arrastra sobre un panel para ampliarlo.
7. Haz clic en la gráfica de pupila, distancia o mirada para fijar un instante (necesita un escenario concreto).
   Una línea roja discontinua marca el instante en las gráficas y, bajo el panel, aparece «Punto sobre estímulo».

La [[fig:5-11]] muestra Comparativas con varias gráficas.

![[fig:5-11|Comparativas: el botón «Gráficas a comparar» y los paneles de cada gráfica.|w=6.5]]

Si no eliges nada, se muestran la pupila, la distancia y el punto de mirada (o el GSR o el EEG si el proyecto no tiene Eye tracker). NeuroDatics recuerda tu selección para cada proyecto en este navegador. Debajo de los paneles hay dos bloques más:

<!-- anchos: 32 68 -->
| Bloque | Qué muestra |
| --- | --- |
| «Resumen estadístico» | «Señales numéricas», con una fila por serie (**N**, **Media**, **Mediana**, **Desv. est.**, **Mín.**, **Máx.**, **Línea base**, **Pico vs. base**), y «Métricas específicas», con las cifras propias de cada gráfica. |
| «Correlaciones entre señales» | Una matriz de cuánto se mueven juntas dos señales: azul si van en sentido contrario, rojo si van en el mismo. Necesita un escenario concreto y al menos dos señales continuas. Ver [[ref:entender-comparar]]. |

::: nota
Los paneles de fijaciones de Comparativas (histograma, mapa de calor, recorridos y AOI) usan siempre una duración mínima de 200 ms, aunque en el Eye tracker hayas elegido otra.
:::

### Si algo sale mal

- Aparece «Selecciona un participante para cargar las visualizaciones comparativas.»: elige un participante en **Filtros**.
- Aparece «No hay visualizaciones seleccionadas. Usa “Gráficas a comparar” para agregarlas.»: sigue los pasos 2 a 4.
- Aparece «No fue posible cargar las correlaciones.»: haz clic en **Reintentar**. Ver [[ref:problemas-dashboard]].

## Comparar participantes {#comparar-participantes}

**Comparar participantes** dibuja la gráfica que tienes abierta para varios participantes a la vez, una tarjeta por persona y con los mismos ajustes.

1. Abre la vista que quieres comparar y déjala como la quieres ver: escenario, ojos o ejes, ventana temporal, canales.
2. Haz clic en **Comparar participantes**, en **Filtros**.
   Se abre «Comparar participantes» con el nombre de la vista, a pantalla completa, con todos los participantes seleccionados. La tarjeta de la que partiste lleva la marca «Vista de origen».
   - En **Comparativas**, cada panel tiene su propio botón **Comparar participantes**.
3. Haz clic en **Participantes** (1) para elegir a quién ver: busca por nombre o documento, o usa **Seleccionar todos** y **Quitar selección**.
4. Elige la escala (2): **Escala común** o **Escalas propias**.
5. Haz clic en un punto de una tarjeta para ver, en un panel a la derecha, el estímulo de ese participante en el mismo instante.
   - Arrastra sobre una tarjeta para ampliarla.
6. Cierra la comparación con la X, **Cerrar comparación**, o con la tecla Esc.

La [[fig:5-12]] muestra el diálogo con dos controles señalados.

![[fig:5-12|El diálogo «Comparar participantes» con el selector de participantes y la escala.|w=6.5]]

Al cerrar vuelves a la vista de origen tal como la dejaste.

<!-- anchos: 28 72 -->
| Escala | Cuándo usarla |
| --- | --- |
| **Escala común** | Todas las gráficas usan el mismo rango vertical: compara directamente los valores entre personas. En las señales en el tiempo (pupila, mirada, distancia, GSR y EEG por canal), el rango cubre del 1 % al 99 % de los valores de todos los participantes elegidos, juntos; los picos sueltos que quedan fuera se cortan en el borde de la gráfica. |
| **Escalas propias** | Cada gráfica se ajusta a sus datos: se ve mejor la forma, pero las alturas no se comparan entre tarjetas. |

El panel del estímulo identifica a cada persona como «Participante» seguido de su código, no por su nombre. Cómo comparar con cuidado está en [[ref:entender-comparar]].

### Si algo sale mal

- El botón **Comparar participantes** está desactivado: el proyecto no tiene participantes.
- En **Mapa de calor**, **Mapa de recorridos** y **Comparativa AOIs**, con **Todos los escenarios** el botón **Comparar participantes** no aparece: elige un escenario concreto.
- El diálogo pide un escenario concreto: la topografía y, en los paneles de **Comparativas**, los mapas sobre el estímulo (calor, recorridos, AOI) no se comparan con **Todos los escenarios**. Cierra, elige un escenario y vuelve a abrir.
- Una tarjeta dice «No se pudo cargar…»: haz clic en su botón **Reintentar**. Las demás tarjetas siguen funcionando. Ver [[ref:problemas-dashboard]].

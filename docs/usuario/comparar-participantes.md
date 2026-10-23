# Comparar participantes

El botón «Comparar participantes» está en la barra de filtros, junto al selector de participante, y compara
la gráfica que está abierta. Abre un diálogo a pantalla completa con una tarjeta por participante y la misma
gráfica, con los mismos parámetros, en todas.

## Qué se puede comparar

El botón aparece en las vistas individuales de pupila, punto de mirada, distancia al
dispositivo, GSR, histograma de fijaciones, mapa de calor, mapa de recorridos y distribución de
permanencia en AOIs, y en las cuatro vistas EEG: por canal, densidad espectral, espectrograma y
topografía. El mapa de calor, el mapa de recorridos y las AOIs lo muestran cuando hay un escenario
elegido, y el histograma cuando hay un participante. La pestaña «Comparativas» muestra varias gráficas a
la vez, así que allí cada panel conserva su propio botón, fuera del disparador que lo pliega.

La comparación hereda el escenario y los parámetros de la vista desde la que se abre: ojos o
ejes seleccionados, ventana temporal, modo crudo o suavizado, canales EEG, frecuencia máxima,
decibelios, normalización, bins, duración mínima de fijación, AOIs visibles y zoom de
frecuencia. Cambiar la vista de origen y volver a abrir el diálogo cambia lo que se compara.

Al abrir, todos los participantes del proyecto están seleccionados, ordenados por su código real
de forma natural (P2 antes que P10). La tarjeta de la que se partió lleva la marca «Vista de
origen».

## Controles de la pantalla

- **Selector de participantes** con búsqueda que ignora mayúsculas y tildes, «Seleccionar
  todos», «Quitar selección» y un contador. Con una búsqueda activa, las dos acciones afectan
  solo a los participantes que coinciden.
- **«Escala común» o «Escalas propias»**, junto a notas que explican el eje temporal, la
  reducción de puntos y las restricciones de la vista.
- **Un clic en un punto de una tarjeta temporal o del espectrograma** fija ese instante: traza
  una línea discontinua en todas las tarjetas cuya grabación contenga ese segundo y abre un
  panel lateral (inferior en pantallas estrechas) con el punto sobre el estímulo visual de ese
  participante. El panel dice qué segundo marca la línea.
- **Arrastrar con el botón pulsado** amplía solo esa tarjeta, con volver atrás y vista completa.
  Un arrastre no cuenta como clic, y el zoom de cada tarjeta se conserva aunque la tarjeta se
  desmonte al desplazarse.
- **Cerrar** con la X del encabezado o con Escape. Al cerrar, el foco vuelve al botón y la vista
  de origen conserva su participante, escenario, filtros, zoom y ventana temporal. Dentro del
  diálogo no se puede abrir otra comparación.

Cada tarjeta muestra su propio estado: en cola, cargando, sin datos, o error con «Reintentar».
Que una falle no bloquea a las demás.

## Tiempo y escalas

Con un escenario concreto, cada tarjeta dibuja los segundos transcurridos desde el inicio de ese
escenario **en su propia grabación**. El inicio es el primer registro etiquetado con ese
escenario, la misma referencia que usa la consulta de mirada. No se sincronizan relojes
absolutos ni se busca el primer dato válido de la señal. La ventana temporal de la vista de
origen se traduce a segundos desde ese inicio y se aplica a cada grabación; el tooltip muestra
los dos tiempos, el del estímulo y el original de la grabación.

Con «Todos los escenarios» no hay equivalencia posible: cada tarjeta conserva el eje de su vista
individual, la ventana de origen no se traslada y el diálogo lo explica. La topografía y los
mapas espaciales (calor, recorridos, AOIs) exigen un escenario concreto; sin él, el diálogo lo
dice y no consulta nada.

«Escala común» calcula un rango único con los participantes ya cargados. Mientras faltan
tarjetas, la nota lo advierte («Escala común parcial: calculada con n de N participantes cargados
hasta ahora»). En las señales en el tiempo (pupila, mirada, distancia, sensor galvánico y EEG por
canal) ese rango va del percentil 1 al 99 de todos los puntos dibujados de esos participantes,
juntos: un pico suelto de una persona no aplana las gráficas de las demás, y lo poco que queda
fuera se corta en el borde. La densidad espectral, el histograma, el espectrograma y la topografía
usan el rango completo. «Escalas propias» ajusta cada tarjeta a sus datos, y entonces las alturas no son
comparables entre tarjetas. Unidades, colores y normalizaciones son los de la vista de origen.
En el mapa de calor la intensidad está normalizada por participante, y la nota lo dice; los
recorridos usan la escala absoluta.

Las tarjetas dibujan 2.000 puntos por serie (1.600 en EEG), frente a 5.000 en las vistas
individuales. La reducción conserva, por tramo, el primero, el último, el mínimo, el máximo y el
primer valor ausente de cada serie dibujada: solo devuelve muestras reales y no altera
estadísticas ni procesamiento. La densidad espectral, el espectrograma y la topografía mantienen
los bins de origen, porque allí un muestreo uniforme descartaría ventanas enteras.

## Las cifras que aparecen

En el diálogo: el contador de participantes seleccionados y cargados, el escenario y la vista de
origen, la duración mínima de fijación cuando la gráfica deriva de fijaciones, y la nota de
escala. Son descripciones del estado de la pantalla, no resultados nuevos.

La tabla numérica vive en la pestaña «Comparativas» y resume las mismas muestras que se dibujan,
por participante y señal. Sus columnas:

| Columna | Qué es |
| --- | --- |
| N | Número de muestras finitas. Los valores ausentes o no finitos no entran en ninguna columna. |
| Media, Mediana | Promedio y valor central de esas muestras. |
| Desv. est. | Desviación estándar muestral (divide entre N−1); con una sola muestra es 0. |
| Mín., Máx. | Extremos observados. |
| Línea base | Media del tramo entre el 5 % y el 20 % de los valores **ordenados de menor a mayor**. Es una referencia baja y robusta, no un intervalo de tiempo previo al estímulo. |
| Pico vs. base | Diferencia entre el máximo y la línea base, en porcentaje del valor absoluto de la línea base. Queda vacío si la línea base es cero. |

Al proceder de las muestras dibujadas, estas cifras dependen de la ventana temporal, los filtros
y la reducción de puntos activos. Dos participantes solo son comparables si se miran con los
mismos parámetros.

## Límites conocidos

- El inicio del estímulo es el primer registro de ese escenario en la grabación: no hay
  marcadores de evento del equipo.
- No se trasladan a las tarjetas el tinte del mapa de calor, el reproductor del recorrido, el
  diseño apilado del EEG (los canales se superponen, y la nota lo dice) ni el zoom interno de los
  paneles de Comparativas.
- Los resultados ya calculados se reutilizan unos minutos y se descartan al reprocesar el proyecto.
- Comparar no es inferir: estas gráficas y cifras describen grabaciones concretas y no sostienen
  por sí solas una afirmación sobre emoción, atención o causalidad.

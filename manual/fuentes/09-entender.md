# Entender los resultados {#cap-entender}

Este capítulo explica qué mide cada gráfica y cada cifra del Dashboard, en qué unidad está, cómo se calcula a grandes rasgos y cuándo conviene no fiarse de ella. No repite cómo se abre cada vista: eso está en [[ref:cap-dashboard]]. Léelo antes de sacar conclusiones de un estudio y vuelve a la lista de [[ref:limites-interpretacion]] antes de escribir un informe.

## Qué datos entran en el análisis {#calidad-datos}

Antes de leer una cifra conviene saber de dónde sale. Estas reglas valen para todas las vistas del Dashboard y para los informes.

### Qué participantes cuentan

Solo cuentan los participantes con datos en la carpeta del experimento; los que quedaron **Sin asignar** en un pre-experimento no. Si falta alguien, revisa su documento. Ver [[ref:asignar-documento]].

### Un escenario o todos

Con **Todos los escenarios**, las gráficas temporales recorren la grabación completa y las estadísticas mezclan todo lo que vio el participante: imágenes, vídeos, instrucciones y pausas. Para comparar la respuesta a un estímulo concreto, elige ese escenario.

### Desde cuándo se cuenta el tiempo

El eje «Tiempo (s)» usa el reloj de la grabación: el segundo 30 de un escenario es el segundo 30 desde que empezó a grabarse el participante, no desde que apareció la imagen. Hay tres excepciones:

- La «Secuencia de atención» y el **TTFF** de las áreas de interés cuentan desde el inicio del escenario. La propia pestaña lo indica con «t = 0: inicio del escenario».
- La vista **Sensor galvánico** cuenta desde la primera muestra válida del sensor (del escenario elegido, si hay uno).
- En **Comparar participantes**, con un escenario concreto, el tiempo cuenta desde el inicio de ese escenario en cada grabación, para que todas las tarjetas queden alineadas y la línea vertical marque el mismo instante del estímulo. Con **Todos los escenarios**, cada tarjeta usa el reloj de su propia grabación, los tiempos no son equivalentes y por eso no se aplica la ventana temporal de la vista original.

### Señal suavizada y señal cruda

Casi todas las señales se muestran **suavizadas**: cada punto es el promedio de los valores que lo rodean en una ventana corta. El suavizado quita el ruido y deja ver la tendencia, pero también achata los picos muy breves. Donde existe el modo **Cruda**, puedes ver los valores originales del sensor. En la dilatación pupilar y la respuesta galvánica, las ayudas de las tarjetas **Media**, **Mínimo** y **Máximo** muestran además el «Valor real», calculado sin suavizar.

<!-- anchos: 24 28 48 -->
| Señal | Ventana de suavizado | Dónde lo ves |
| --- | --- | --- |
| Dilatación pupilar | 0,25 s | Siempre suavizada en la gráfica |
| Punto de mirada | Limpieza en varios pasos (ver [[ref:entender-eye]]) | Siempre limpia |
| Distancia al dispositivo | Sin suavizado | Valores tal como llegan |
| Respuesta galvánica | 1 s | Modos **Suavizada**, **Cruda** y **Ambas** |
| EEG por canal | 0,2 s | Modos **Suavizada**, **Cruda** y **Ambas** |

### La línea base

Varias cifras se comparan con una **línea base** («BASE» en las tablas, «Línea base» en Comparativas). NeuroDatics la calcula así: ordena todos los valores de la señal de menor a mayor y promedia los que quedan entre el 5 % y el 20 % más bajo. Es una estimación del nivel de reposo de esa persona en ese tramo.

::: importante
La línea base no es un periodo de reposo grabado antes del estímulo. Sale de los valores bajos del mismo tramo que estás mirando. Si cambias de escenario o acotas la ventana temporal, la base cambia, y con ella todo lo que se compara con ella (PICO %, la pupila por área de interés y la distancia frente a la base).
:::

### Cuántos puntos se dibujan

Para que las gráficas carguen rápido, NeuroDatics dibuja como mucho 5000 puntos por gráfica (2000 en cada tarjeta de **Comparar participantes**). En una grabación larga eso significa que la curva es un resumen: los puntos se reparten a lo largo del tiempo y, en el EEG, se conservan el mínimo y el máximo de cada tramo.

Las cifras de la **Dilatación pupilar** y del «Resumen estadístico» de Comparativas se calculan sobre esos puntos dibujados, así que en grabaciones largas describen una muestra repartida de la señal y no cada medición. Las estadísticas del EEG usan toda la señal, antes de reducir puntos. Si necesitas cifras de un tramo concreto con todo el detalle, acota la **Ventana temporal**: NeuroDatics vuelve a calcular la serie y las estadísticas solo para ese tramo. Ver [[ref:ventana-zoom]].

### Mirada y pantalla

La posición de la mirada se expresa en porcentaje del estímulo cuando registraste dónde se mostró en la pantalla, y en porcentaje de la pantalla cuando no. Ver [[ref:ubicacion-estimulo]].

## Pupila, mirada y distancia {#entender-eye}

Estas tres señales vienen del Eye tracker y se leen en las pestañas **Dilatación pupilar**, **Punto de mirada** y **Distancia al dispositivo**.

<!-- anchos: 20 12 34 34 -->
| Medida | Unidad | Qué indica | Cómo se obtiene |
| --- | --- | --- | --- |
| **Dilatación pupilar** | mm | El diámetro de la pupila de cada ojo. Suele crecer con el esfuerzo mental o la emoción. | Se suaviza cada ojo y se descartan los diámetros nulos o negativos. «Promedio» es la media de los dos ojos cuando ambos son válidos, o el ojo válido. |
| **Punto de mirada** (X e Y) | % | Dónde miraba la persona: X es la posición horizontal e Y la vertical, en porcentaje del ancho y del alto. | Se limpian parpadeos y valores fuera de rango, se rellenan hasta 150 ms desde cada borde de un hueco (un hueco de hasta 300 ms se cierra) y se suaviza en dos pasos cortos. Lo que cae fuera del estímulo queda vacío. |
| **Distancia al dispositivo** | cm | Cuánto se acercó o se alejó la persona de la pantalla. | El valor que exporta el Eye tracker, pasado a centímetros. |

### Cómo leerlas

- El eje se llama «Amplitud pupilar (mm)», pero lo que mide es el diámetro.
- La tabla «Estadísticas» resume la señal suavizada: cuántas muestras tiene (**NÚMERO**), su línea base (**BASE**), cuánto varía (**DESV. ESTÁNDAR**), su media (**MEDIA**), sus extremos (**MIN** y **MAX**) y **PICO %**.
- **PICO %** dice cuánto supera el máximo a la base, en porcentaje: PICO % = (máximo − base) ÷ base × 100. Un PICO % de 20 en la pupila significa que su diámetro máximo fue un 20 % mayor que su nivel de reposo estimado.

### Cuándo no fiarse

- **Luz y brillo.** La pupila responde a la luz mucho más que al esfuerzo. Una imagen más clara la contrae aunque interese más. Compara solo escenarios o áreas de brillo parecido y con la misma iluminación de sala.
- **Huecos.** Los cortes en la línea de la mirada son parpadeos, pérdidas del ojo o momentos en que la mirada salió del estímulo. No son ceros: esos instantes simplemente no tienen dato.
- **Distancia.** Solo existe si el Eye tracker exporta la distancia; si no, la pestaña queda vacía.
- **Pocos datos.** Con mucha pérdida de señal, la media y los extremos se apoyan en pocos instantes. Revisa **NÚMERO** antes de comparar.

## Fijaciones, mapa de calor y recorridos {#entender-fijaciones}

### Qué es una fijación

Una **fijación** es una pausa de la mirada sobre un punto: el momento en que el ojo se queda quieto el tiempo suficiente para ver algo. Entre una fijación y otra el ojo da un salto rápido, la **sacada**, durante el cual casi no se percibe nada. Todas las vistas de fijación del Dashboard (histograma, mapa de calor, recorridos y áreas de interés) parten de las fijaciones que NeuroDatics detecta al procesar la carpeta.

La forma de detectarlas depende de lo que NeuroDatics sabe de la pantalla:

- Si conoce el tamaño físico de la pantalla (en centímetros) y el archivo trae la distancia del participante, mide la velocidad del ojo en grados por segundo y separa las pausas de los saltos según esa velocidad.
- Si no, mide cuánto se dispersan los puntos de mirada en una ventana corta: si quedan juntos, es una fijación.

Por eso, para comparar proyectos entre sí, procésalos con la misma configuración de pantalla. Ver [[ref:config-pantalla]].

### La duración mínima

Una pausa solo cuenta como fijación si dura al menos la **Duración mínima** elegida: 100, 150, 200, 250 o 300 ms. El valor de partida es 200 ms. Con un umbral bajo aparecen más fijaciones, más cortas; con uno alto, menos y más largas.

::: importante
La duración mínima cambia los recuentos, las duraciones, el mapa de calor, los recorridos y todas las métricas de las áreas de interés. Compara participantes, escenarios y proyectos siempre con el mismo valor, e indícalo cuando presentes resultados.
:::

La tabla «Sensibilidad del umbral» del histograma ayuda a elegir. Para cada umbral muestra cuántas fijaciones quedan (**Fijaciones**), el tiempo total en fijaciones (**Permanencia total**), su duración media y su mediana, y la **Permanencia retenida**: qué parte del tiempo fijado con el umbral de 100 ms se conserva con ese umbral. Si la permanencia retenida baja mucho de un umbral al siguiente, buena parte de las fijaciones de ese participante son cortas y la elección pesa en los resultados.

### El histograma

Las barras agrupan las fijaciones por duración en rangos que NeuroDatics calcula para cada participante, desde 0 hasta su fijación más larga. Como los rangos cambian de una persona a otra, compara la forma general (muchas cortas, pocas largas) y las cifras de la tabla, no la altura de una barra concreta.

Si el histograma avisa de datos históricos, ver [[ref:problemas-dashboard]].

### El mapa de calor

El **Mapa de calor** muestra dónde se acumuló la atención sobre la imagen. Cada fijación suma en su posición según lo que duró, el resultado se difumina para formar manchas y los colores van del azul (poca atención) al rojo (la zona más mirada). Las zonas por debajo del 10 % del máximo se dejan sin color.

::: importante
El mapa de calor no tiene leyenda porque su escala es relativa a cada participante: el rojo es siempre la zona más mirada por esa persona, haya mirado mucho o poco. Dos mapas con el mismo rojo no indican la misma cantidad de atención. Para comparar cantidades entre personas usa las cifras de **Comparativa AOIs** o del histograma.
:::

### El mapa de recorridos

El **Mapa de recorridos** dibuja cada fijación como un círculo numerado por orden, unido a la siguiente por una línea. El área del círculo es proporcional a lo que duró la fijación, hasta un tope de 2 s, y la escala es la misma para todos los participantes: un círculo del mismo tamaño representa la misma duración en cualquier persona.

<!-- anchos: 22 14 64 -->
| Tarjeta | Unidad | Qué indica |
| --- | --- | --- |
| **Recorridos** | número | Cuántos círculos tiene el recorrido: uno por fijación. |
| **Distancia** | px | Lo que recorrió la mirada saltando de una fijación a la siguiente, en píxeles de la imagen tal como se mostró. Si no se conoce cómo se mostró, se calcula sobre una pantalla de 1920 × 1080. |
| **Promedio** | ms | Duración media de las fijaciones. |
| **Tiempo fijado** | s | Suma de todas las fijaciones válidas. No incluye sacadas, mirada perdida ni tiempo fuera del estímulo. |

Un recorrido largo con muchas fijaciones cortas suele indicar búsqueda o exploración; pocas fijaciones largas, una lectura detenida. Son orientaciones, no reglas: depende de la tarea que se pidió al participante.

## Áreas de interés {#entender-aoi}

La pestaña **Comparativa AOIs** cruza las fijaciones con las áreas de interés que dibujaste sobre la imagen. Todas sus cifras dependen de la duración mínima elegida.

<!-- anchos: 22 12 66 -->
| Métrica | Unidad | Qué indica |
| --- | --- | --- |
| **Tiempo en AOI** | % y s | Parte del tiempo de fijación del escenario que cayó dentro del área. Se calcula sobre el tiempo de fijación, no sobre la duración total del escenario. |
| **Tiempo en AOIs** (tarjeta) | % | Parte del tiempo de fijación que cayó en alguna área. Cada fijación cuenta una sola vez aunque esté en varias áreas. |
| **Fijaciones** y **tasa de acierto** | número y % | Cuántas fijaciones cayeron en el área y qué parte son del total del escenario. |
| **Duración media** | ms | Lo que duró, en promedio, una fijación dentro del área. Fijaciones largas suelen indicar un procesamiento más profundo o más costoso. |
| **TTFF** | s | Tiempo hasta la primera fijación en el área, contado desde el inicio del escenario. «fijación nº» dice en qué fijación ocurrió. El área con menor TTFF es la «Primera en captar la mirada». |
| **Visitas** | número | Cuántas veces entró la mirada en el área. Una visita termina cuando hay una fijación fuera de ella. |
| **Pupila** | % y mm | Diámetro medio de la pupila mientras se miraba el área, comparado con la línea base del escenario. |
| **Distancia** | cm | Distancia media a la pantalla mientras se miraba el área, frente a la base («cm vs. base»). |
| **Transiciones** | número | Saltos directos de la mirada de un área a otra. Una conexión suma los saltos en los dos sentidos; «ida» es el sentido más frecuente. |

### Detalles que cambian la lectura

- **Áreas que se solapan.** Si dos áreas comparten zona, una fijación en la zona común cuenta para las dos. Por eso la suma de la columna «Tiempo en AOI» puede pasar del 100 %. En las transiciones, una fijación en la zona común se asigna a la primera área por orden alfabético.
- **Fijaciones fuera de las áreas.** No cortan las transiciones: mirar A, luego fuera y luego B cuenta como A → B. Sí cierran una visita.
- **El origen del TTFF.** Si la pestaña muestra en ámbar «t = 0: primera fijación», no había datos para fijar el inicio del escenario y los tiempos se cuentan desde la primera fijación. En ese caso el TTFF no es comparable con el de otros participantes.
- **Pupila por área.** Es la métrica más expuesta al brillo: un área clara contrae la pupila aunque interese más. Compara áreas de brillo parecido.
- **Picos de señal.** Muestran dónde miraba la persona en el instante del mínimo y del máximo de la pupila (mm), la distancia (cm) y la mirada (%). Son instantes sueltos: para comparar áreas, usa las medias de **Pupila** y **Distancia** de «Métricas por AOI».
- **Áreas sin fijaciones.** Aparecen en «Sin fijaciones» y quedan fuera de la matriz de transiciones. No es un error: nadie las miró con la duración mínima elegida.

## EEG {#entender-eeg}

El electroencefalógrafo registra la actividad eléctrica del cerebro con electrodos sobre la cabeza. NeuroDatics usa los canales LE, F4, C4, P4, P3, C3 y F3. Ninguna vista corrige la señal: los artefactos (movimientos, parpadeos, malos contactos) se señalan, pero no se eliminan.

<!-- anchos: 22 14 64 -->
| Vista | Unidad | Qué muestra |
| --- | --- | --- |
| **EEG por canal** | µV (en pantalla, «uV») | La señal de cada electrodo en el tiempo. **Cruda** muestra los valores originales. **Montaje** pone cada canal en su propio carril, como un registro clínico. |
| **Densidad espectral** | dB y Hz | Cuánta energía tiene la señal en cada frecuencia, de los ritmos lentos a los rápidos, en todo el intervalo visible. NeuroDatics divide la señal en tramos que se solapan y promedia su energía. |
| **Espectrograma de frecuencias** | dB, Hz y s | Cómo cambia la energía de cada frecuencia a lo largo del tiempo, en ventanas de 1,5 s, hasta 25 Hz. |
| **Topografía EEG** | µV² (en pantalla, «uV^2») | Un mapa de la cabeza con la energía de cada electrodo en ventanas de 2 s, sin el nivel constante de cada canal. |

### Cuándo no fiarse

- **El suavizado atenúa los ritmos del EEG.** Úsalo para ver tendencias, no para analizar oscilaciones. En el modo **Ambas**, las tarjetas y la tabla muestran las cifras de la señal cruda.
- **La gráfica resume los extremos.** En grabaciones largas se dibuja el mínimo y el máximo de cada tramo; las estadísticas usan toda la señal válida. Si aparece «Eje recortado», algunos puntos quedan fuera de la vista para que un salto no aplaste a los demás canales; su valor real sigue en el recuadro emergente y en las estadísticas.
- **RMS** mide la amplitud típica de la señal e incluye su nivel constante, así que un canal desplazado tiene un RMS alto aunque oscile poco.
- **Los decibelios.** La densidad espectral está en decibelios referidos a 1 µV²/Hz. El «Nivel medio» promedia valores en decibelios: sirve para comparar canales o tramos entre sí, pero no es la energía total.
- **Frecuencia máxima no es la frecuencia del pico.** En el espectrograma, la tarjeta «Frecuencia máxima» es el límite del eje. La frecuencia con más energía es «Freq. pico» en la tabla.
- **Bandas negras.** En el espectrograma son tiempo sin estimación: huecos de la señal o tramos demasiado cortos.
- **La topografía es un esquema.** Rellena el espacio entre seis electrodos para dibujar un mapa continuo. No localiza de qué zona del cerebro viene la actividad y necesita al menos tres electrodos.
- **Artefactos.** Los «Tramos con artefacto candidato» son tramos sospechosos que NeuroDatics detecta por saltos o amplitudes anómalas. Es una señal de alerta, no un diagnóstico. En la densidad espectral siguen incluidos salvo que marques **Excluir ventanas con artefacto**.
- **Calidad por canal y unidades.** «Calidad por canal» y «Calidad y alcance de EEG» describen defectos del archivo (pasos de resolución gruesos, muestras repetidas o ausentes, desplazamiento). Nada de eso se corrige. NeuroDatics trata la señal en µV aunque el archivo no declare la unidad. Si aparece «Unidades EEG con salvedades», algún canal venía en otra unidad y se reescaló, o se excluyó por tener una unidad ambigua. Ver [[ref:problemas-dashboard]].

## GSR {#entender-gsr}

El sensor galvánico mide la **conductancia** de la piel: cuánto deja pasar la corriente. Sube con la sudoración, que aumenta con la activación emocional o el esfuerzo. Se mide en microsiemens (µS). Las tarjetas muestran cuatro decimales porque los cambios suelen ser pequeños, y **PICO %** se calcula como en la pupila ([[ref:entender-eye]]).

### Cuándo no fiarse

- **No hay detección de respuestas.** NeuroDatics no identifica cada subida breve de la conductancia ni su latencia respecto al estímulo. Solo da el máximo frente a la base y, en Comparativas, las marcas de mínimo y máximo. Para saber dónde miraba la persona en un instante, usa las vistas del Eye tracker.
- **Cada persona tiene su nivel.** La conductancia de reposo varía mucho entre personas. Comparar medias en µS entre participantes dice más de su piel que de su reacción. Para comparar, usa el PICO % o la variación respecto a la base de cada uno, como hacen los informes de grupo.
- **Bases cercanas a cero.** Como PICO % divide por la base, una base muy baja hace que pequeñas subidas den porcentajes enormes. Mira también los valores en µS.
- **Señal plana.** Una línea casi recta puede indicar que el sensor no hacía buen contacto. Los informes lo señalan como «Calidad de la señal».

## Comparaciones y correlaciones {#entender-comparar}

### Comparar participantes

En el diálogo **Comparar participantes** cada tarjeta muestra la misma vista para un participante distinto. La escala se elige como en [[ref:comparar-participantes]]. Además:

- Con **Escala común**, la densidad espectral, el histograma, el espectrograma y la topografía usan el rango completo de todos los participantes, no el del 1 % al 99 %. Mientras faltan tarjetas por cargar, la nota «Escala común parcial…» avisa de que el rango aún puede cambiar.
- Los mapas de calor siguen siendo relativos a cada participante, aunque elijas escala común. Los círculos de los recorridos sí usan la misma escala para todos.
- La permanencia en áreas de interés se expresa en porcentaje del tiempo de cada participante, de 0 a 100 %.

### Correlaciones entre señales

La tabla «Correlaciones entre señales» de Comparativas mide si dos señales del mismo participante suben y bajan juntas durante un escenario. NeuroDatics divide el escenario en intervalos de 250 ms, resume cada señal en cada intervalo y calcula el coeficiente de correlación de Pearson, sin retraso entre señales.

<!-- anchos: 26 74 -->
| Valor | Cómo leerlo |
| --- | --- |
| Cercano a 1 (rojo) | Las dos señales tienden a subir y bajar a la vez. |
| Cercano a 0 (neutro) | No hay relación lineal visible entre ellas. |
| Cercano a −1 (azul) | Cuando una sube, la otra tiende a bajar. |
| «Solapamiento insuficiente» | Las dos señales comparten menos de 10 intervalos con datos. No se calcula. |
| «Señal constante» | Una de las señales no varía en ese tramo. No se calcula. |

Solo participan señales continuas: pupila, mirada X e Y, distancia, respuesta galvánica y potencia del EEG. Las vistas de fijaciones o mapas no se correlacionan. Junto a cada coeficiente, «n=…» indica cuántos intervalos se usaron y qué porcentaje del escenario cubren.

::: importante
Una correlación no implica que una señal cause la otra. Dos señales pueden moverse juntas porque las dos responden al mismo estímulo, porque las dos cambian poco a poco a lo largo de la prueba, o por azar en un tramo corto. Además, como las señales se comparan sin retraso, no se ven relaciones retrasadas: la respuesta galvánica suele aparecer con algunos segundos de retraso. Con pocos intervalos, un coeficiente alto puede no significar nada.
:::

### Resumen estadístico

El «Resumen estadístico» de Comparativas se calcula sobre los puntos dibujados, así que en grabaciones largas sirve para orientarse, no para informar cifras finales. Ver [[ref:calidad-datos]].

## Antes de sacar conclusiones {#limites-interpretacion}

Repasa esta lista antes de comparar participantes, escribir un informe o presentar resultados:

- **¿Están todos?** Revisa que ningún participante haya quedado **Sin asignar** y que el selector muestre a todos los que hicieron el experimento.
- **¿Es el escenario correcto?** Las cifras con **Todos los escenarios** mezclan imágenes, vídeos, instrucciones y pausas.
- **¿Mismas fijaciones?** Usa la misma duración mínima en todas las comparaciones, y di cuál, y proyectos procesados con la misma configuración de pantalla.
- **¿Mismo tramo?** Al acotar el tiempo cambian las estadísticas y la línea base, que sale del propio tramo.
- **¿Datos suficientes y limpios?** Mira el número de muestras, las pérdidas de mirada, los avisos de calidad y, en el EEG, los «Tramos con artefacto candidato». En la pupila, no compares escenarios o áreas de brillo muy distinto.
- **¿Comparas alturas o colores?** Solo con **Escala común**; los mapas de calor, nunca.
- **¿Áreas solapadas?** Si las áreas se superponen, sus porcentajes pueden sumar más del 100 %.
- **¿Respuesta galvánica comparable?** Compara variaciones frente a la base de cada persona, no niveles absolutos.
- **¿Proyecto al día?** Si la tarjeta dice **Actualizar proyecto** o el histograma habla de datos históricos, vuelve a procesar la carpeta antes de comparar. Ver [[ref:cap-problemas]].

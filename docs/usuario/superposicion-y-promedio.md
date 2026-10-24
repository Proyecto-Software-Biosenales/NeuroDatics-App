# Superposición y promedio de participantes

En el selector de participante de la barra de filtros hay, bajo «Varios participantes», dos opciones que
cambian la vista abierta para que muestre a varios participantes a la vez en una sola gráfica:

- **Superposición:** cada participante se dibuja encima de los demás con su propio color.
- **Promedio:** la gráfica es la media de los participantes elegidos y las cifras son el promedio de las cifras
  de cada uno.

Al elegir cualquiera de las dos aparece al lado el desplegable **Participantes (n de N)**, con búsqueda,
«Seleccionar todos» y «Quitar selección». Al empezar están todos. La selección se conserva al cambiar de pestaña
o de una opción a la otra, y se reinicia al cambiar de proyecto. Para volver a la vista de un participante basta
con elegirlo en el mismo selector. Mientras una de las dos opciones está activa no aparece «Comparar
participantes», que es la otra forma de ver a varios (una tarjeta por persona, ver
[comparar-participantes.md](comparar-participantes.md)).

Cada participante conserva su color aunque se quiten o añadan otros. Con más de ocho participantes los colores
se repiten y las líneas se distinguen además por su trazo; entonces la leyenda se resume y la tabla lleva el
color de cada uno.

## Qué vistas lo admiten

| Vista | Superposición | Promedio |
| --- | --- | --- |
| Dilatación pupilar, punto de mirada, distancia al dispositivo, sensor galvánico | Una línea por participante | Curva media con banda de ±1 desviación estándar |
| EEG por canal | Una línea por participante | Curva media con banda de ±1 desviación estándar |
| Densidad espectral EEG | Una línea por participante | Espectro medio |
| Espectrograma y topografía EEG | — | Media de los participantes |
| Mapa de calor | Fijaciones de cada participante con su color | Mapa de calor del grupo |
| Mapa de recorridos | Recorrido de cada participante con su color | — |
| Comparativa AOIs | Una barra por participante en cada AOI | Media por AOI |
| Histograma de fijaciones, Comparativas | — | — |

Cuando una vista no admite la opción elegida, o necesita un escenario concreto y está «Todos los escenarios», el
área de la gráfica lo explica y ofrece «Ver un participante».

## Una línea por participante

Para que cada color sea una persona, cada participante aporta una sola serie:

- **Dilatación pupilar:** el ojo elegido; con «Ambas pupilas», la media de las dos en cada muestra.
- **Punto de mirada:** «Eje X» o «Eje Y» (con los dos ejes elegidos se muestra X).
- **Sensor galvánico:** la señal suavizada o la cruda (con «Ambas», la suavizada).
- **EEG por canal:** el canal elegido en «Canal:». No se promedian canales entre sí: sus niveles difieren tanto
  que la media no describiría ningún electrodo. «Ambas» no está; si estaba activa se usa la señal cruda.
- **Densidad espectral:** la media, en potencia lineal, de los canales seleccionados.

## Tiempo

Las señales en el tiempo, el espectrograma, la topografía y las vistas sobre el estímulo exigen un escenario
concreto. El eje cuenta los segundos desde el inicio de ese escenario **en cada grabación**, la misma referencia
que usa «Comparar participantes». La densidad espectral admite «Todos los escenarios».

En estas vistas no está la ventana temporal en segundos de grabación, que solo tiene sentido para una
grabación. Para acercar un tramo se arrastra sobre la gráfica, con volver atrás y vista completa.

## Cómo se calcula el promedio

- **Curva media:** cada grabación se lleva a una rejilla común de tiempo (como mucho 2.000 puntos) por
  interpolación lineal dentro de su propio tramo, sin extrapolar y sin cruzar huecos. En cada instante se
  promedian los participantes que tienen dato ahí; el tooltip dice cuántos son (n) y la desviación estándar. Al
  final de un escenario la media puede apoyarse en menos participantes.
- **Densidad espectral:** se promedia en potencia lineal y, si la vista está en decibelios, se convierte después.
  Promediar decibelios directamente daría otro resultado.
- **Espectrograma y topografía:** media celda a celda, o canal a canal, sobre el tiempo del estímulo.
- **Mapa de calor del grupo:** reúne las fijaciones de todos los participantes elegidos y da a cada uno el
  mismo peso total, para que quien tiene muchas fijaciones largas no tape a los demás. Usa el mismo suavizado y
  la misma escala de color que el mapa individual. Los participantes sin fijaciones en el escenario se indican
  aparte.
- **AOIs:** media de cada métrica por AOI entre los participantes que tienen dato en ella, con su n.

## Las cifras

- **Superposición:** la tabla de estadísticas tiene una fila por participante, con su color, calculada igual que
  en su vista individual.
- **Promedio:** cada tarjeta muestra el promedio, entre participantes, de la cifra de cada uno («Promedio de n
  participantes»). No son las cifras de la curva media: el máximo promedio es la media de los máximos de cada
  persona. La tabla empieza por la fila «Promedio (n participantes)» y sigue con una fila por participante.

En pupila, densidad espectral, espectrograma y topografía las cifras salen de lo dibujado. En punto de mirada,
distancia, sensor galvánico y EEG por canal salen de las mismas estadísticas del servidor que la vista
individual, sobre todo el escenario; la columna «Número» cuenta las muestras dibujadas. El sensor galvánico informa siempre las cifras de la señal suavizada,
como su vista individual.

Los participantes sin datos aparecen como filas vacías; los que fallaron al cargar se pueden reintentar desde el
aviso «sin cargar» bajo la gráfica.

## Límites

- El inicio del estímulo es el primer registro del escenario en cada grabación: no hay marcadores de evento del
  equipo.
- La curva media usa las muestras dibujadas de cada participante, no la señal completa.
- Promediar no es inferir: la gráfica media describe a esos participantes, no a una población, y no sostiene por
  sí sola una afirmación sobre emoción, atención o causalidad.

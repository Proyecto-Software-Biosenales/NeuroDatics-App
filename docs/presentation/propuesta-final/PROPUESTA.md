# Propuesta para tu intervención: NeuroDatics

**Alcance:** únicamente tu parte, después de que la estudiante genere la carpeta. Este documento contiene instrucciones de construcción, guiones y datos de apoyo; no es una presentación. Duración recomendada: **8 minutos 50 segundos**, con margen hasta 10 minutos. Público supuesto: profesores y estudiantes que conocen el experimento, pero no necesariamente los algoritmos.

**Idea que debe quedar:** «NeuroDatics organiza los datos del experimento y hace explícitas las decisiones que convierten esos datos en resultados interpretables».

## Tres maneras de contar tu parte

| Propuesta | Estructura | Cuándo elegirla |
|---|---|---|
| **A. Seguir una carpeta — recomendada** | Carpeta → proceso → mirada → comparación → ubicación → EEG → control de calidad → análisis e informe | Audiencia mixta; explica el software y demuestra su valor con datos |
| B. Tres hallazgos que cambiaron el análisis | Carpeta → frecuencias de mirada → escala EEG → ventanas sospechosas → aplicación → cierre | Versión de 7 minutos; prioriza hallazgos y reduce detalles de implementación |
| C. Cómo se construye una métrica | Entrada → validación → I-DT/I-VT → duración válida → Welch → sensibilidad → visualización → reproducibilidad | Audiencia más técnica; usa los 10 minutos completos y reserva detalles para preguntas |

No repetir la justificación del proyecto ni la toma de datos: ya las cubrieron las intervenciones anteriores. Tampoco dedicar una lámina al listado de lenguajes y frameworks. Explicar cada método junto a la decisión que permite tomar.

## Guion de la propuesta A

### 1. La carpeta del experimento · 0:40

**Propósito:** enlazar directamente con la demostración de la estudiante.

**Texto visible:** «La carpeta del experimento»; debajo, «Grabaciones · estímulos · participantes».

**Cómo construirla:** a la izquierda, una captura recortada de la carpeta utilizada en la demostración, con identidades ocultas. A la derecha, una captura de la entrada del proyecto en NeuroDatics. Unir ambas con una sola flecha. No mostrar rutas personales, nombres reales ni toda la interfaz del explorador.

**Guion sugerido:**

> «Aquí empieza mi parte. La carpeta que acabamos de generar contiene las grabaciones y los estímulos del experimento. Para analizarlos tenemos que saber a quién pertenece cada registro, qué estaba viendo esa persona y cómo interpretar los valores de cada sensor. NeuroDatics recibe esa información y la organiza para que podamos explorar resultados por participante y por escenario. Voy a mostrar el recorrido y tres ejemplos de por qué las decisiones de procesamiento sí cambian lo que terminamos viendo».

**Transición:** «Primero veamos qué ocurre entre cargar la carpeta y abrir una gráfica».

### 2. El procesamiento dentro de NeuroDatics · 1:00

**Propósito:** dar un mapa que permita entender el resto de la explicación.

**Texto visible:** «Validar → separar → interpretar → analizar → consultar».

**Cómo construirla:** diagrama horizontal editable de cinco pasos. Bajo cada paso, una expresión: «archivo y tiempos», «participante y escenario», «unidades y calidad», «eventos y ventanas», «gráficas e informes». En la segunda etapa mostrar una bifurcación pequeña hacia P01 y P02; después de interpretar, dos ramas paralelas: mirada y EEG. Revelar los pasos por grupos; no animar cada palabra.

**Guion sugerido:**

> «El primer paso es validar la estructura: no cualquier tabla permite un análisis correcto. Después se separan los bloques de grabación y los escenarios, y se interpretan las unidades y las frecuencias. Cada sensor tiene su propio tratamiento. En la mirada buscamos eventos de fijación; en EEG analizamos la señal y su contenido en frecuencias. Los resultados procesados se guardan junto con información sobre cómo se obtuvieron. Así, las visualizaciones parten de datos organizados y de métodos que podemos revisar. Si una entrada es ambigua o está mal formada, esa condición debe aparecer antes de que se convierta en una cifra».

**Detalle para preguntas:** los archivos de análisis se guardan en Parquet por bloque y escenario. No atribuir mejoras de velocidad ni ahorro de horas: esta comparación no midió esos aspectos.

### 3. La frecuencia del archivo no es la frecuencia de la mirada · 1:10

**Propósito:** mostrar un problema real que un script sencillo puede pasar por alto.

**Texto visible:** «Exportación: ≈300 Hz · Mirada declarada: ≈60 Hz» y «Más filas no significan más observaciones independientes».

**Cómo construirla:** dos líneas de tiempo alineadas. Arriba, muchas marcas para las filas de exportación; abajo, marcas menos frecuentes para el eye tracker. Usar un intervalo ilustrativo de 100 ms, con rótulo **«esquema explicativo»**. No dibujar cinco valores idénticos como si fueran una observación verificada de todas las filas: la exportación puede haber sido remuestreada. Añadir una interrupción gris que represente pérdida de señal.

**Guion sugerido:**

> «En una de las exportaciones el archivo tiene unas trescientas filas por segundo, mientras que la mirada declara unas sesenta actualizaciones. Una fila del archivo no equivale necesariamente a una nueva observación ocular. La aplicación distingue esas frecuencias y adapta la detección a la información disponible. También distingue una pérdida de señal de una mirada estable: un hueco no debe convertirse en tiempo de fijación. Esta diferencia importa porque nuestras preguntas son cuánto duró un evento y dónde ocurrió, y ambas respuestas dependen de interpretar correctamente los tiempos».

**Evidencia:** exportación `csv-05`: rejilla ≈300,314 Hz; mirada declarada ≈60,119 Hz. El mínimo entre las tasas determina la frecuencia efectiva. No afirmar que la comparación de este experimento mostró un error de duración de exactamente 5×; ese factor solo explica el riesgo de mezclar denominadores.

### 4. La misma grabación, dos procesamientos · 1:30

**Propósito:** presentar el experimento comparativo y explicar I-DT sin convertir la lámina en una clase de programación.

**Texto visible:** «I-DT básico y NeuroDatics»; subtítulo: «Mismas muestras · mínimo de 200 ms · dispersión de 0,03».

**Cómo construirla:** reservar el tercio izquierdo para un conjunto pequeño de puntos y su caja envolvente, rotulado «I-DT: posición estable durante un tiempo mínimo». A la derecha, dos pares de barras horizontales para SAIO (`csv-08`, seis bloques): **862 → 793 eventos** y **233,61 → 237,58 segundos**. Cada par tiene su propio eje y unidad; ambos métodos comparten escala dentro de cada par. Mostrar referencia básica en gris y aplicación en azul. Pie obligatorio: **«232.195 filas; comparación descriptiva, no mide exactitud»**. En las notas añadir: «Se incluyen dos eventos reconstruidos menores de 200 ms; ver nota técnica».

**Guion sugerido:**

> «Para contrastarlo ejecuté un script básico que separa las grabaciones y detecta fijaciones con I-DT. La idea es buscar puntos suficientemente cercanos durante un tiempo mínimo. En ambos recorridos configuramos doscientos milisegundos y el mismo umbral espacial. En los seis bloques de este archivo, la referencia produjo ochocientos sesenta y dos eventos y la aplicación setecientos noventa y tres. Sin embargo, el tiempo total clasificado aumentó ligeramente: de doscientos treinta y cuatro a doscientos treinta y ocho segundos. Cambia cómo se delimitan y se cuentan los eventos. La aplicación incorpora la frecuencia efectiva y su tratamiento de continuidad. Para demostrar mayor exactitud necesitaríamos eventos etiquetados de referencia; aquí demostramos una diferencia reproducible».

**Al presentar:** leer un par de cifras de la tabla; no leer todos los porcentajes. La referencia ya rechaza coordenadas inválidas y separa escenarios: no se construyó deliberadamente una comparación que cuente ausencias como observaciones.

**Detalle para preguntas:** cuando existe geometría física completa, la aplicación puede usar I-VT angular adaptativo, basado en velocidad. En esta ejecución se usó I-DT normalizado; no se compararon ambos detectores entre sí.

**Limitación comprobada:** el detector configura 200 ms, pero la reconstrucción analítica produjo dos eventos de 199,779 y 156,493 ms en este conjunto. No se ocultaron ni se filtraron del resultado. Explicación en [nota-fijaciones.md](nota-fijaciones.md). No decir «todos los eventos de la aplicación duran al menos 200 ms».

### 5. Ubicar la mirada sobre el estímulo · 0:55

**Propósito:** conectar el procesamiento con una pregunta visual comprensible.

**Texto visible:** «La posición en pantalla debe ubicarse dentro de la imagen».

**Cómo construirla:** esquema editable de una pantalla de 1920 × 1080 con una imagen cuadrada de 1080 × 1080 centrada; márgenes laterales de 420 px. Marcar un punto en x = 600 px. Mostrar sus dos referencias: **31,25 % de la pantalla** y **16,67 % de la imagen**. Es un ejemplo geométrico, no una medición de las grabaciones. Al lado, una región de interés dibujada sobre la imagen.

**Guion sugerido:**

> «El sensor registra una posición en la pantalla, pero queremos saber qué parte de la imagen miró la persona. Si la imagen tiene márgenes, esas dos coordenadas son diferentes. En este ejemplo, el mismo punto está al treinta y uno por ciento de la pantalla, pero al diecisiete por ciento de la imagen. La aplicación puede aplicar esa transformación cuando conocemos cómo se mostró el estímulo. Eso permite ubicar las fijaciones, los mapas de calor y las áreas de interés en el lugar correspondiente. Sin esa información, conserva la advertencia: no podemos asumir que la imagen ocupaba toda la pantalla».

**Límite visible en notas:** la comparación ejecutada no recibió posiciones de estímulos ni calibración física; sus cifras son de coordenadas normalizadas de pantalla. Esta función se explica como capacidad separada. La transformación actual es estática, no una reconstrucción de desplazamientos o zoom variables.

### 6. En EEG, interpretar la escala cambia el resultado · 1:10

**Propósito:** presentar un hallazgo de la exportación y su consecuencia numérica.

**Texto visible:** «×1.000 en amplitud → ×1.000.000 en potencia».

**Cómo construirla:** una secuencia de tres elementos: «Metadato: kilo» → «Escala aplicada» → «Potencia coherente con esa escala». Debajo, un ejemplo: «9,64 × 1.000 = 9.640 unidades base». No usar barras de amplitud con ejes automáticos independientes; podrían parecer iguales. Si se desea una gráfica, usar escala logarítmica claramente rotulada para la potencia, con los valores reproducidos en `eeg-evidencia.md`.

**Guion sugerido:**

> «En el EEG encontramos un canal exportado con el multiplicador kilo. Si leemos sus números sin interpretar ese metadato, la amplitud queda mil veces menor. Y como la potencia depende del cuadrado de la amplitud, la diferencia llega a un millón. La aplicación reconoce ese multiplicador, aplica la escala y conserva su procedencia. Esto muestra por qué dibujar un archivo no es suficiente: primero hay que interpretar sus valores. La corrección tiene un límite: no recupera los decimales perdidos durante la exportación, y cuando la unidad física no está declarada, esa suposición sigue indicada».

**Precisión al hablar:** llamar a esto «hallazgo en la exportación analizada». El multiplicador estaba en el archivo; no afirmar que era un error desconocido del equipo ni que afecta a todos sus registros.

### 7. Cuánto depende el EEG de las ventanas sospechosas · 1:20

**Propósito:** mostrar el valor de inspeccionar y comparar decisiones de calidad.

**Texto visible:** «4 de 55 ventanas marcadas» y «La decisión de exclusión queda explícita».

**Cómo construirla:** arriba, una captura del canal F3 con los segmentos marcados, recortada y anonimizada. Abajo, dos barras: «Todas: 207.384,4» y «Exclusión explícita: 3.252,2», eje «Potencia integrada de PSD (µV² asumidos)». Eje lineal desde cero, etiquetas legibles y anotación «≈63,8×». Indicar **«55 ventanas frente a 51 utilizadas»** y **«Un canal, un bloque; ejemplo de sensibilidad»**. No colorear el resultado menor como una señal científicamente validada.

**Guion sugerido:**

> «La escala correcta todavía no garantiza que toda la señal sea adecuada para interpretar. Para estimar el contenido en frecuencias usamos Welch: dividimos la señal en ventanas que se solapan y combinamos sus espectros. En este caso hay cincuenta y cinco ventanas y cuatro están marcadas como sospechosas. Si las incluimos, la potencia es aproximadamente doscientos siete mil; con su exclusión explícita queda alrededor de tres mil doscientos cincuenta. Cambia casi sesenta y cuatro veces. La aplicación permite localizar esos segmentos y ver cuánto afectan al resultado. La marca es una heurística de calidad: no identifica por sí sola la causa del artefacto ni garantiza que la señal restante esté limpia».

**Evidencia:** recálculo actual de `csv-08`, bloque 5, F3, registro completo. Ventanas superpuestas de 1.024 muestras, solapamiento del 50 %, sin filtro ni cambio de referencia; detalle y hashes en [eeg-evidencia.md](eeg-evidencia.md). Las unidades µV se asumen donde la fuente las omite. Es sensibilidad a una decisión analítica, no una reducción medida del error.

### 8. El resultado para quien investiga · 1:05

**Propósito:** cerrar mostrando qué puede hacer el usuario con todo lo anterior.

**Texto visible:** «Explorar · comparar · revisar · comunicar».

**Cómo construirla:** una captura amplia y legible de un escenario con su mapa o áreas de interés; tres llamadas breves: «Dónde», «Cuánto tiempo», «Con qué método». En un borde, una miniatura de un informe ya existente si está disponible. No crear estadísticas de ejemplo que parezcan resultados reales.

**Guion sugerido:**

> «Con este procesamiento podemos elegir un participante y un escenario, ver dónde se concentraron las fijaciones, recorrer su secuencia y medir el tiempo dentro de áreas de interés. En EEG podemos revisar la señal, sus frecuencias y las advertencias de calidad. Los informes ayudan a comunicar los resultados con su metodología. El aporte del software está en reunir estas tareas y conservar las decisiones que dan significado a cada cifra. El investigador sigue interpretando los resultados; ahora dispone de una forma consistente de explorarlos, comparar parámetros y revisar los datos que los sostienen».

**Demostración opcional, dentro del tiempo de esta lámina:** proyecto ya procesado → participante → escenario → área de interés → aviso de método/calidad. Preparar el estado previamente. Si la carga falla, usar las mismas capturas y mantener el guion. No hacer una importación completa en vivo ni recorrer todas las pestañas.

**Última frase sugerida:** «La carpeta queda convertida en resultados que podemos explorar y cuya forma de cálculo podemos revisar».

## Versión de 7 minutos

Usar las láminas 1, 2, 3, 4, 6 y 8. En la 6 integrar una mención de 20 segundos al caso de las ventanas sospechosas; llevar la gráfica completa a respaldo. Explicar la transformación de coordenadas sobre el mapa de la lámina 8 en una frase. Distribución: 0:35 + 0:50 + 1:00 + 1:25 + 1:35 + 1:15 = **6:40**, con 20 segundos de transiciones.

## Respaldo para preguntas, fuera de tus 7–10 minutos

1. **I-DT e I-VT:** dispersión frente a velocidad; condiciones de calibración. La comparación principal solo ejecuta I-DT.
2. **Sensibilidad al mínimo:** gráfica con mínimos 100, 150, 200, 250 y 300 ms. Eje Y: número de eventos; segunda gráfica para tiempo total. Mantener conjunto de datos fijo. No escoger el umbral que produzca la historia más favorable.
3. **Método de la comparación:** lector independiente, máscaras de validez, datos excluidos, hashes y ausencia de verdad de referencia.
4. **EEG incompleto:** conservar ausencias; ejemplo de los 604 registros sin EEG en `csv-05`, todos en los extremos. No confundirlo con huecos internos observados.
5. **Alcance de las interpretaciones:** fijación como evento de mirada estable; potencia como medida descriptiva. No equivalen automáticamente a preferencia, emoción, diagnóstico o intención de compra. Correlación no establece causalidad.

## Instrucciones generales de diseño

- Formato 16:9. Fondo claro, texto oscuro, referencia básica en gris y NeuroDatics en azul. Reservar ámbar para segmentos marcados; no usar rojo/verde para declarar qué método tiene razón.
- Un visual principal y una conclusión por lámina. Títulos de unas 6–10 palabras; cuerpo mínimo de 24 pt siempre que sea posible. Máximo de dos cifras protagonistas, salvo la comparación que necesita las parejas.
- Diagramas y gráficas editables; evitar fotos decorativas de cerebros y capturas de código. Los guiones van en notas, no en el lienzo.
- En las gráficas: unidades, método, bloque o conjunto, denominador y alcance. En las notas: ruta de evidencia y parámetros.
- Distinguir explícitamente «ejemplo ilustrativo», «medición actual» y «capacidad de la aplicación». Las capturas se obtienen de la aplicación; no se generaron ni se validaron capturas de una sesión en vivo en esta tarea.
- No anunciar ahorro de tiempo, mayor precisión, significación estadística, identificación de emociones ni correcciones universales del hardware. Esas afirmaciones no fueron medidas aquí.

## Fuentes para preparar las notas

La evidencia numérica actual y el protocolo están en [COMPARACION.md](COMPARACION.md) y [eeg-evidencia.md](eeg-evidencia.md). La comparación usa el código local; los documentos anteriores de `docs/presentation/` y `docs/eeg-audit/` aportan contexto histórico y contienen detalles que han cambiado.

Para explicar Welch, su documentación oficial describe la división en segmentos solapados y el promedio de periodogramas: [SciPy: Welch](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html). Para contextualizar la exclusión explícita de tramos malos, sin atribuir a NeuroDatics el uso de MNE: [MNE: manejo de tramos malos](https://mne.tools/stable/auto_tutorials/preprocessing/20_rejecting_bad_data.html).

## Preparación y siguiente paso

Esta propuesta está lista para elegir recorrido y construir las láminas. Antes de exponer: ensayar una vez con cronómetro, seleccionar un escenario que coincida con el experimento explicado por la estudiante y preparar capturas anónimas del estado real. Si el experimento final es distinto de estas referencias, ejecutar el mismo protocolo sobre esa carpeta y reemplazar las cifras, conservando los métodos y las limitaciones.

Configuración sugerida para una siguiente tarea de construcción: mantener la selección actual; Codex con esfuerzo alto o Claude Sonnet con esfuerzo alto. La verificación debe concentrarse en correspondencia entre gráficas y evidencia, legibilidad y duración del ensayo.

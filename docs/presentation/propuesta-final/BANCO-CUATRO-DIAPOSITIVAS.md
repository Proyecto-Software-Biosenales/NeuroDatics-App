# Banco de contenidos para cuatro diapositivas

Preparado el 26 de septiembre de 2026 con la evidencia calculada el 25 de septiembre. Destinatario: agente que propondrá distintas representaciones gráficas y combinaciones. Este documento enumera qué explicar y qué datos utilizar; deja abiertas la composición, las gráficas, el estilo y el guion definitivo.

Aquí «eye tracking» se refiere al análisis ocular que realiza NeuroDatics, no a un producto independiente llamado Light Tracker. No confundir la aplicación con el equipo que captura la mirada.

Las cuatro diapositivas son: **1) problemas y soluciones de eye tracking; 2) métricas de eye tracking; 3) problemas y soluciones de EEG; 4) métricas de EEG**. Los elementos siguientes son alternativas para seleccionar y combinar, no contenido que deba entrar completo en cuatro láminas.

## 1. Eye tracking: problemas que abordar y respuestas del software

| ID | Problema o dificultad que se puede explicar | Qué hace NeuroDatics y qué valor aporta |
|---|---|---|
| O1 | Un archivo mezcla varias grabaciones y escenarios | Separa bloques y escenarios para consultar a quién y a qué condición corresponde cada resultado. Un bloque no prueba por sí solo que sea una persona diferente. |
| O2 | Más filas exportadas pueden confundirse con más observaciones oculares | Distingue frecuencia del archivo, frecuencia observada de los tiempos y frecuencia declarada de la mirada; utiliza una frecuencia efectiva para detectar eventos. |
| O3 | Un punto de mirada aislado no es una fijación | I-DT busca estabilidad espacial durante un tiempo mínimo. Convierte una secuencia de posiciones en eventos con duración y ubicación. |
| O4 | La misma distancia en píxeles no representa siempre el mismo movimiento visual | Con geometría física completa puede usar I-VT angular adaptativo y trabajar con velocidad en grados por segundo. Sin ella utiliza I-DT normalizado y declara el método. No se midió una ventaja de I-VT en este benchmark. |
| O5 | Datos faltantes, centinelas y coordenadas imposibles pueden parecer observaciones reales | Construye una máscara explícita de mirada válida y conserva las ausencias. No convierte coordenadas fuera de rango en puntos pegados al borde. |
| O6 | Una pérdida breve puede fragmentar una fijación | Permite continuidad a través de huecos de hasta 75 ms si los extremos son compatibles, sin asignar mirada válida a las filas perdidas. No rellena las muestras originales. |
| O7 | El tiempo entre inicio y fin puede incluir intervalos sin medición | Distingue intervalo temporal del evento y soporte válido acumulado; los huecos no se contabilizan como tiempo observado. |
| O8 | Miradas parecidas antes y después de una interrupción pueden unirse indebidamente | Segmenta por cambios de escenario, discontinuidades largas y límites espaciales. Hay una discrepancia detector/reconstructor documentada en dos casos: no presentar todas las capas como idénticas. |
| O9 | Las fijaciones exportadas por el proveedor pueden tener una semántica distinta de la mirada cruda | Conserva las columnas originales y recalcula desde gx/gy con reglas explícitas. Permite auditar discrepancias sin asumir que el proveedor está equivocado. |
| O10 | Coordenadas en porcentaje, fracción o píxeles pueden mezclarse | Interpreta las unidades declaradas, normaliza para el procesamiento y emite advertencias cuando debe inferirlas. Una inferencia no equivale a calibración confirmada. |
| O11 | La posición en pantalla puede no coincidir con la posición dentro de la imagen | Si se conoce la ubicación estática del estímulo, transforma coordenadas de pantalla a imagen. Evita asignar una fijación a una región equivocada por márgenes o escalado. |
| O12 | Mirar un margen de pantalla puede confundirse con mirar el contenido | Utiliza límites de pantalla, viewport y estímulo; rechaza puntos exteriores en lugar de desplazarlos artificialmente al contenido. |
| O13 | El mínimo elegido cambia qué cuenta como fijación | Calcula variantes de 100, 150, 200, 250 y 300 ms para revisar sensibilidad. El valor predeterminado de detección es 200 ms; no es una garantía de mínimo para todos los fragmentos reconstruidos. |
| O14 | Contar filas puede sobrerrepresentar una fijación | La analítica utiliza eventos reconstruidos; distingue filas originales, muestras del detector y duración. |
| O15 | Un mapa de calor, una secuencia y una tabla podrían aplicar criterios diferentes | Comparten la tabla canónica de eventos: duración para ponderar el mapa, orden para el recorrido y posición para áreas de interés. |
| O16 | Ver muchos puntos no responde dónde, cuánto y en qué orden se miró | Ofrece mapas de calor, secuencias de fijaciones y métricas por áreas de interés, como conteo, tiempo y primera fijación. Son medidas oculares, no una lectura automática de preferencias. |
| O17 | Un resultado aislado no explica cómo se obtuvo | Conserva método, versión, frecuencia efectiva, parámetros y advertencias para revisar y reproducir el cálculo. |
| O18 | Una mirada ausente podría arrastrar la eliminación de otros sensores | Mantiene la alineación de filas y no elimina EEG, GSR o pupila porque falle la mirada. El remuestreo para detectar fijaciones no remuestrea silenciosamente todos los sensores. |

### Conjuntos de ideas que pueden combinarse

- **Tiempo correctamente interpretado:** O2 + O6 + O7.
- **Cómo nacen las fijaciones:** O3 + O5 + O13.
- **Dónde ocurrió realmente la mirada:** O10 + O11 + O12.
- **Resultados que se pueden revisar:** O9 + O15 + O17.
- **Recorrido completo del usuario:** O1 + O14 + O16.

## 2. Eye tracking: métricas y comparaciones disponibles

### M1. Comparación principal: I-DT básico frente a NeuroDatics

**Conjunto:** SAIO, `csv-08`, seis bloques, 232.195 filas. Ambos recorridos usan las mismas muestras, mínimo configurado de 200 ms y dispersión normalizada de 0,03. El script básico ya rechaza mirada inválida y separa escenarios; no se lo compara con una referencia deliberadamente defectuosa.

| Medida | I-DT básico | NeuroDatics | Diferencia |
|---|---:|---:|---:|
| Número de eventos | 862 | 793 | −8,00 % |
| Tiempo total clasificado como fijación | 233,61 s | 237,58 s | +1,70 % |
| Duración media por evento | 271,02 ms | 299,60 ms | +28,58 ms |

**Qué comunica:** las reglas de procesamiento cambian la segmentación y la distribución de duraciones. **No demuestra:** 8 % menos errores, 1,7 % más atención ni mayor exactitud.

### M2. Diferencias entre grabaciones

Cada pareja indica básico → aplicación. Es una alternativa al agregado; permite mostrar variación entre bloques.

| Bloque de SAIO | Eventos | Tiempo total (s) |
|---|---:|---:|
| B01 | 107 → 96 | 26,411 → 26,367 |
| B02 | 128 → 116 | 31,735 → 32,204 |
| B03 | 192 → 177 | 53,584 → 54,937 |
| B04 | 125 → 117 | 31,991 → 32,588 |
| B05 | 144 → 134 | 42,723 → 43,411 |
| B06 | 166 → 153 | 47,171 → 48,074 |

### M3. El efecto no tiene siempre la misma dirección

| Exportación | Eventos básico → app | Tiempo total básico → app |
|---|---:|---:|
| Referencia solo mirada, ocho bloques | 632 → 715 | 213,30 → 226,70 s |
| Realidad ~300 Hz, un bloque | 127 → 123 | 37,90 → 39,60 s |
| Realidad ~60 Hz, un bloque | 122 → 122 | 38,69 → 38,74 s |
| SAIO, seis bloques | 862 → 793 | 233,61 → 237,58 s |

**Qué comunica:** el software no aumenta o disminuye el conteo por una regla comercial; la diferencia depende de los datos. Las dos exportaciones Realidad son versiones de una grabación, no sujetos independientes.

### M4. Sensibilidad al mínimo de fijación

| Mínimo configurado, SAIO | Eventos reconstruidos | Tiempo total |
|---|---:|---:|
| 100 ms | 2.372 | 433,271 s |
| 150 ms | 1.359 | 322,767 s |
| 200 ms | 793 | 237,582 s |
| 250 ms | 520 | 183,271 s |
| 300 ms | 349 | 141,469 s |

**Qué comunica:** el resultado depende de un parámetro que puede examinarse. Es una comparación entre configuraciones de la aplicación, no entre el script básico y la aplicación.

### M5–M8. Otras cifras utilizables, con otro significado

- **M5. Frecuencias diferentes:** en `csv-05`, ≈300,314 filas/s frente a ≈60,119 Hz declarados para mirada. Explica el problema multirrate; no demuestra un error medido de duración de 5×.
- **M6. Calidad de entrada:** 16.592 de 232.195 filas de SAIO tienen mirada inválida: **7,15 %**. Es un conteo de calidad, no una reducción frente al script básico, que también las excluye.
- **M7. Discordancia con columnas del proveedor:** 1.238 filas de SAIO contienen fijación del proveedor en rango mientras la mirada cruda es inválida. Son filas y discrepancias de representación, no fijaciones falsas demostradas.
- **M8. Coordenadas de pantalla frente a imagen:** ejemplo geométrico: pantalla 1920 × 1080, imagen 1080 × 1080 centrada y punto x = 600 px. El punto está en **31,25 % de la pantalla** y **16,67 % de la imagen**. Es un ejemplo calculado, no evidencia experimental de un mapa corregido en estas grabaciones.

**Beneficios todavía no cuantificados:** exactitud frente a anotaciones humanas; reducción de falsos positivos; ahorro de tiempo del investigador; ventaja de I-VT frente a I-DT; mejora en asignaciones de áreas de interés con ubicación real del estímulo. No inventar porcentajes para estos aspectos.

**Nota técnica necesaria para el agente:** los resultados de SAIO incluyen dos eventos reconstruidos de 199,779 y 156,493 ms. El detector original respetó el mínimo; la discrepancia aparece al reconstruir/partir eventos. No eliminarlos de la comparación ni afirmar que todos los eventos finales superan 200 ms.

## 3. EEG: problemas que abordar y respuestas del software

| ID | Problema o dificultad que se puede explicar | Qué hace NeuroDatics y qué valor aporta |
|---|---|---|
| E1 | Leer números sin interpretar multiplicadores cambia su significado físico | Reconoce el multiplicador `kilo` del caso auditado y aplica ×1.000 a la amplitud, conservando procedencia. |
| E2 | Un error de amplitud se amplifica al calcular potencia | Trabaja con la escala normalizada: un factor 1.000 de amplitud implica 1.000.000 de potencia. |
| E3 | Unidades físicas ausentes pueden aparentar certeza | Explicita la suposición de µV donde falta la unidad y conserva advertencias. No convierte una suposición en calibración validada. |
| E4 | Un vacío puede convertirse en cero o desaparecer del eje temporal | Conserva valores faltantes y sus tiempos; no los trata como voltajes medidos ni concatena señales a ambos lados de un hueco. |
| E5 | Una ventana de análisis puede atravesar huecos o cambios de condición | Evalúa tramos continuos y ventanas válidas; mantiene límites temporales y de escenario. |
| E6 | Pocos segmentos extremos pueden dominar el resumen | Marca saltos, amplitudes y excursiones sospechosas mediante heurísticas, y permite inspeccionar su ubicación. No diagnostica automáticamente la causa. |
| E7 | Excluir segmentos sin mostrarlo hace opaco el resultado | En PSD permite comparar inclusión y exclusión explícita de ventanas marcadas, mostrando conteos y cobertura. La exclusión está apagada inicialmente. |
| E8 | Suavizar una señal para verla mejor puede atenuar ritmos de interés | La vista inicial conserva la señal original; el suavizado es opcional y se identifica como transformación. |
| E9 | Una traza temporal compleja no muestra fácilmente su contenido en frecuencias | Estima PSD mediante Welch y potencia por bandas; el espectrograma permite examinar cambios temporales. Esto describe señal, no emociones. |
| E10 | Una exportación lenta no permite estimar todas las bandas | Comprueba el límite de Nyquist y la resolución; devuelve no disponible cuando una banda excede el soporte, en vez de completar silenciosamente un número. |
| E11 | No todos los canales o tramos alcanzan la longitud necesaria | Declara canales/resultados sin estimación cuando no tienen soporte suficiente; informa ventanas y resolución. |
| E12 | Filtros y referencias distintos cambian los resultados | Ofrece referencia, pasabanda y notch opcionales; la configuración inicial no los aplica silenciosamente. No existe una mejora cuantificada de estos filtros en la comparación preparada. |
| E13 | Reducir puntos de visualización puede esconder picos | La vista temporal utiliza una reducción que conserva extremos por intervalo cuando corresponde; estadísticas y espectros se calculan sobre muestras fuente, no sobre una captura de la gráfica. |
| E14 | Un mapa de sensores puede confundirse con una imagen cerebral | Presenta la distribución de potencia en el montaje como representación esquemática; no es localización cortical. |
| E15 | Un archivo nativo mal formado puede desplazar columnas sin que resulte evidente | Rechaza estructuras ambiguas y tiempos inválidos. En los archivos auditados había conflictos entre separador de columnas y coma decimal; no se declara reparado su formato nativo. |
| E16 | Corregir escala puede crear una falsa impresión de precisión recuperada | La auditoría identifica la cuantización y repetición del canal exportado. La multiplicación corrige escala, pero no recupera decimales; puede ser necesario reexportar. |

### Conjuntos de ideas que pueden combinarse

- **Entender el número antes de analizarlo:** E1 + E2 + E3.
- **Respetar la señal disponible:** E4 + E5 + E10.
- **Ver por qué cambia una conclusión numérica:** E6 + E7 + E9.
- **Separar visualización e interpretación:** E8 + E13 + E14.
- **Límites de la exportación:** E10 + E15 + E16.

## 4. EEG: métricas y comparaciones disponibles

**Distinción imprescindible:** no se ejecutó un script EEG genérico independiente equivalente al I-DT básico. Hay un control con el mismo Welch actual sobre valores sin/con normalización de escala, y un análisis con/sin exclusión de ventanas. Los rótulos deben describir esas comparaciones exactas. No llamar a toda esta sección «script genérico contra NeuroDatics» como si esa prueba completa ya existiera.

### Q1. Efecto de interpretar el multiplicador

**Mismo canal F3, bloque 5 de SAIO y mismo Welch actual.**

| Magnitud | Sin aplicar el multiplicador de escala | Aplicando el multiplicador |
|---|---:|---:|
| Máximo numérico de amplitud | 9,64 | 9.640 |
| Potencia total calculada | 0,207384 | 207.384,417757 |
| Razón de amplitud | — | ×1.000 |
| Razón de potencia | — | ×1.000.000, equivalente a 60 dB |

Los valores sin normalizar no deben rotularse como si ya tuvieran la misma unidad física que los normalizados. Después de la normalización, µV y µV² siguen dependiendo de la suposición declarada donde el archivo omite la unidad. **Beneficio demostrado:** evitar ignorar un multiplicador documentado; no un millón de veces más precisión.

### Q2. Influencia de las ventanas marcadas

**Mismo F3, bloque 5 completo de SAIO; límites de escenario conservados; sin filtros ni cambio de referencia.**

| Medida | Incluir todas las ventanas | Excluir explícitamente las marcadas |
|---|---:|---:|
| Ventanas utilizadas | 55 | 51 |
| Potencia total | 207.384,42 µV² asumidos | 3.252,18 µV² asumidos |
| Potencia alfa | 103,77 µV² asumidos | 38,49 µV² asumidos |

- **4 de 55 ventanas marcadas: 7,27 %.** Son ventanas superpuestas, no el porcentaje exacto de tiempo ni cuatro artefactos independientes.
- Razón de potencia total incluida/excluida: **63,77×**.
- Resolución de frecuencia: **0,293293 Hz**, con ventanas de **1.024 muestras**.
- **Beneficio demostrado:** cuantificar cuánto depende el resultado de una decisión de exclusión. No equivale a 63,77 veces más exactitud ni prueba que las 51 ventanas restantes sean señal neuronal pura.

### Q3. Disponibilidad real de EEG

| Referencia | Filas de exportación | Filas EEG válidas | Filas sin EEG |
|---|---:|---:|---:|
| Realidad ~300 Hz | 27.425 | 26.821 | 604 |
| Realidad ~60 Hz | 5.491 | 5.365 | 126 |
| SAIO, seis bloques | 232.195 | 224.573 | 7.622 |

En las referencias auditadas las ausencias EEG están en los bordes. En Realidad ~300 Hz son **395 filas iniciales y 209 finales**. **Beneficio:** distinguir datos observados de ausencias. No se midió una reducción numérica del error frente a rellenar con ceros.

### Q4–Q7. Otros contrastes cuantitativos utilizables

- **Q4. Límite de frecuencia:** exportación de 60,119497 Hz → Nyquist de 30,059749 Hz → banda gamma de 30–45 Hz no disponible completa. Es una limitación reconocida, no una banda recuperada por el software.
- **Q5. Precisión perdida en la exportación:** F3 conserva pasos de 10 unidades base y 4.632 pares adyacentes idénticos, frente a 115 en el archivo de adquisición candidato. Los registros no están demostrados como alineados muestra a muestra; no usar esos conteos como tasa exacta de pérdida ni mejora de la aplicación.
- **Q6. Estructura de archivos nativos:** tres archivos declaran 15 columnas pero contienen 23 campos por fila; cada uno presenta 40 filas iniciales con un mismo timestamp y 39 intervalos no positivos. Ilustra por qué rechazar la ambigüedad evita interpretar mal columnas; no demuestra que esos archivos se importen correctamente.
- **Q7. Cobertura de auditoría:** 76 combinaciones bloque/escenario recorridas. Es cobertura técnica de la comprobación, no 76 participantes ni 76 estimaciones necesariamente disponibles.

**Posibles experimentos futuros, aún sin cifras comparativas:** error de un PSD genérico que concatena huecos; pérdida de potencia por suavizado de 0,2 s en una señal sintética conocida; tiempo manual frente a interfaz; efecto de filtros sobre una referencia etiquetada. Mantener estos candidatos separados de las mediciones existentes.

## Fuentes y límites para el agente receptor

- [COMPARACION.md](COMPARACION.md) y [comparacion.json](comparacion.json): protocolo ocular y todos los resultados por bloque/escenario.
- [eeg-evidencia.md](eeg-evidencia.md) y [eeg-comparacion.json](eeg-comparacion.json): controles EEG reproducidos.
- [nota-fijaciones.md](nota-fijaciones.md): dos discrepancias entre detección y reconstrucción.

Las propuestas pueden mezclar contenidos de un mismo bloque temático, manteniendo la relación entre problema y métrica. Toda cifra debe conservar conjunto, unidad, denominador y comparación original. No atribuir diagnóstico, emoción, atención psicológica, causalidad, ahorro de tiempo no medido ni una mejora de exactitud no validada. Los hallazgos son de las exportaciones y del procesamiento auditados; no prueban defectos universales de los equipos.

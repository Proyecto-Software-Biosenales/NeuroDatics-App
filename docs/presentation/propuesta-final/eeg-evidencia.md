# EEG: evidencia para la presentación final

Ejecución local: 25 de septiembre de 2026. No se modificaron grabaciones, base de datos ni código de la aplicación. Los identificadores `csv-XX` y números de bloque identifican archivos/bloques de auditoría, no identidades de participantes. Las cifras siguientes son descriptivas de estas referencias; no son resultados poblacionales ni diagnósticos.

## Qué se ejecutó

Desde la raíz del repositorio:

```powershell
.venv/Scripts/python.exe -X utf8 backend/scripts/audit_eeg_references.py docs/RefererenceExperiments --report output/presentation-eeg-audit.json
.venv/Scripts/python.exe -X utf8 backend/scripts/presentation_eeg_comparison.py
```

La auditoría terminó correctamente sobre ocho CSV. Los ocho SHA-256 coinciden con el registro histórico `docs/eeg-audit/reference-evidence.json`. La comparación focal utiliza los servicios actuales de la aplicación y verifica el hash del archivo antes de procesar el bloque 5 de `csv-08`.

- Auditoría completa, local: `output/presentation-eeg-audit.json`.
- Evidencia compacta reproducible: [eeg-comparacion.json](eeg-comparacion.json).
- Script conservado: `backend/scripts/presentation_eeg_comparison.py`.
- No se ejecutó toda la batería de pruebas de la aplicación. Los recuentos de 770 o 919 pruebas que aparecen en la documentación son verificaciones históricas, no esta ejecución.

## Mensaje 1: primero hay que interpretar lo que significa un número

**Propuesta de título:** «Una diferencia de escala se convierte en un millón de veces en potencia».

**Visual sugerido:** dos tarjetas con el mismo canal, bloque e intervalo. A la izquierda, datos en la escala exportada; a la derecha, escala interpretada según los metadatos. Entre ellas: «amplitud ×1.000 → potencia ×1.000.000». Especificar que es un control con el mismo Welch actual, no la reconstrucción del programa histórico. No usar escalas de ejes diferentes sin señalarlas.

**Guion:** «El archivo parecía contener números normales. Pero este canal venía con un multiplicador de visualización `kilo`. Si ignoramos ese detalle, subestimamos su amplitud mil veces y su potencia un millón. La aplicación interpreta la escala y conserva de dónde salió la corrección».

| F3, bloque 5 de csv-08 | Escala exportada | Escala normalizada |
|---|---:|---:|
| Mínimo | −0,97 | −970,00 |
| Máximo | 9,64 | 9.640,00 |
| Mediana | −0,21 | −210,00 |
| Desviación estándar poblacional, usada por esta auditoría | 0,5656804 | 565,6804038 |
| Potencia total, mismo Welch actual | 0,2073844178 | 207.384,4177574 |

La razón de potencia recalculada es **1.000.000,0000000002**, equivalente a **60 dB** dentro de precisión numérica. La unidad normalizada se expresa como µV, y la potencia como µV², **bajo la suposición física declarada** cuando el archivo no especifica la unidad. La corrección del prefijo no confirma por sí sola la calibración.

La auditoría histórica y la actual son consistentes con el archivo de adquisición candidato: su máximo F3 es 9.646,6904 y su mediana −212,4663. Esta comparación respalda la escala; no demuestra alineación exacta muestra a muestra. La decodificación binaria es una inferencia de auditoría, no un importador nativo validado por el fabricante.

**Límite útil para explicar:** corregir escala no recupera precisión. F3 conserva pasos de 10 unidades y 4.632 pares adyacentes idénticos; el candidato de adquisición tiene 115. No presentar este canal exportado como equivalente en precisión a los restantes.

Fuentes: `docs/eeg-audit/FINDINGS.md:14`, `:64`; `backend/src/neurodatics/modules/projects/application/services/csv_processing_service.py:864`; claves `f3.source`, `f3.normalized` y `f3.scale_correction_power_ratio` de la evidencia compacta.

## Mensaje 2: un espacio sin datos debe seguir siendo un espacio sin datos

**Propuesta de título:** «Respetamos cuándo hay señal y cuándo no la hay».

**Visual sugerido:** una línea de tiempo con un borde inicial gris, un tramo medido y un borde final gris. Debajo, ventanas de análisis que caben dentro del tramo válido. Si se ilustra cómo sería rellenar con ceros o unir extremos, rotularlo claramente como simulación del error.

**Guion:** «Los sensores no siempre registran durante el mismo intervalo. Que exista una fila en el archivo no significa que exista una medición EEG. Rellenar un vacío con cero inventaría una medición; eliminarlo y juntar los extremos cambiaría el tiempo. Por eso conservamos los huecos y calculamos con ventanas continuas».

Resultados actuales, coincidentes con el registro histórico:

| Referencia | Filas de exportación | Filas EEG válidas | Filas sin EEG |
|---|---:|---:|---:|
| Realidad, exportación cercana a 300 Hz | 27.425 | 26.821 | 604 |
| Realidad, exportación cercana a 60 Hz | 5.491 | 5.365 | 126 |
| SAIO, seis bloques | 232.195 | 224.573 | 7.622 |

En la exportación Realidad de 300 Hz, las 604 filas corresponden a 395 iniciales y 209 finales. Los ocho bloques EEG utilizables presentan **cero huecos internos y cero vectores completos de siete canales repetidos**. Las ausencias observadas son de los bordes. La protección frente a huecos internos también existe en el código, pero no debe venderse como un defecto interno encontrado en estos archivos.

La auditoría recorre **76 combinaciones bloque/escenario**: 8 + 8 + 6 × 10. Algunas condiciones breves pueden no producir una estimación, correctamente. Las dos exportaciones Realidad son variantes de una misma grabación; **no son dos participantes independientes**.

Fuentes: `docs/eeg-audit/FINDINGS.md:46`; auditoría actual `files[].blocks[].channels`, `.held_eeg_vectors` y `.scenarios`; `eeg_signal.py:44` y `:49`; `eeg_analytics_service.py:383`.

## Mensaje 3: mostrar cuánto depende la cifra de un segmento sospechoso

**Propuesta de título:** «Cuatro ventanas pueden cambiar radicalmente el resumen».

**Visual sugerido:** señal de F3 con intervalos marcados → esquema de ventanas superpuestas → barras «incluidas» y «excluidas por decisión explícita». Usar eje logarítmico identificado si se quiere que ambas barras sean legibles. Rotular la exclusión como análisis de sensibilidad, no como verdad corregida.

**Guion:** «Además de calcular un espectro, la aplicación señala dónde aparecen cambios sospechosos. Aquí cuatro de 55 ventanas afectan mucho la potencia total. Podemos comparar el resultado conservándolas o excluyéndolas explícitamente. El objetivo es que la decisión sea visible y reproducible».

| F3, bloque 5 completo, límites de escenario conservados | Resultado actual |
|---|---:|
| Ventanas Welch disponibles | 55 |
| Ventanas que solapan algún segmento marcado | 4 (7,27 %) |
| Ventanas conservadas con exclusión activada | 51 |
| Longitud de ventana | 1.024 muestras |
| Resolución en frecuencia | 0,293293 Hz |
| Potencia total incluyendo todas las ventanas | 207.384,417757 µV² asumidos |
| Potencia total excluyendo las ventanas marcadas | 3.252,180097 µV² asumidos |
| Razón incluida/excluida | 63,7678× |
| Potencia alfa, incluyendo / excluyendo | 103,768508 / 38,491247 µV² asumidos |

Estas cifras **se recalcularon** y confirman las publicadas en el cambio del 21 de septiembre. La exclusión está desactivada por defecto. El criterio marca una ventana si solapa cualquier segmento detectado para ese canal; con ventanas superpuestas una muestra puede afectar más de una ventana. No se aplicó filtro pasabanda, notch ni cambio de referencia en esta comparación.

La implementación actual combina tres descripciones: salto entre muestras con umbral robusto acotado entre 100 y 500 unidades asumidas, amplitud con z robusto >10 y excursión pico a pico >1.000 en una ventana de un segundo. **Son heurísticas de revisión; no son etiquetas de verdad ni un clasificador clínicamente validado.** Excluir ventanas cambia la cobertura temporal y no garantiza que lo restante sea señal neuronal pura. Tampoco permite atribuir el origen del segmento a movimiento, contacto o fisiología a partir del CSV solamente.

Fuentes: [eeg-comparacion.json](eeg-comparacion.json); `docs/CHANGELOG.md:111`; `backend/src/neurodatics/modules/analytics/application/services/eeg_analytics_service.py:278`, `:369`; `backend/src/neurodatics/modules/analytics/application/services/eeg_signal.py:27`, `:143`.

## Otros hallazgos útiles para una diapositiva de respaldo

- Tres CSV nativos declaran 15 columnas y contienen 23 campos por los decimales con coma sin comillas. Sus 40 filas iniciales comparten un timestamp, pero contienen muestras distintas. La auditoría confirma 39 intervalos no positivos en cada uno. Ordenar o deduplicar indiscriminadamente perdería información. El importador ordinario los rechaza; la reconstrucción diagnóstica no constituye soporte productivo para ese formato.
- La exportación Realidad de aproximadamente 60 Hz tiene una malla medida de 60,119497 Hz y Nyquist de 30,059749 Hz. Gamma 30–45 Hz queda **no disponible**, y la auditoría actual devuelve `null` para esa banda. La falta de documentación del antialias impide asumir que las bandas inferiores sean equivalentes a las de la exportación de aproximadamente 300 Hz.
- El antiguo promedio móvil de 0,2 s atenúa fuertemente ritmos como 10 Hz. La vista actual parte de la señal original; cualquier demostración gráfica de esta cancelación debe rotularse como respuesta del filtro o señal sintética, no como un hallazgo cerebral experimental.

## Diferencias entre documentación histórica y código actual

Para explicar el comportamiento actual, priorizar el código y las mediciones recién ejecutadas:

1. `docs/eeg-audit/METHODS.md:58` dice que el canal más corto determina la longitud Welch. Actualmente se usa el tramo válido más largo, limitado a 1.024 muestras, y se declaran incompletos los canales que no pueden llenarlo (`eeg_analytics_service.py:321–336`).
2. `METHODS.md:125` describe solo el umbral MAD sin techo; hoy hay tres detectores y techo de 500. No tomar los umbrales antiguos como descripción del algoritmo actual.
3. Hay referencia promedio, pasabanda y notch opcionales, desactivados inicialmente. Es correcto decir que la aplicación no los aplica silenciosamente; sería incorrecto decir que no tiene esas funciones.
4. La afectación de correlaciones por artefactos sigue documentada como pendiente en `correlation_service._eeg_signal`. No afirmar que la exclusión de ventanas de PSD se aplica también a las correlaciones.
5. El cambio histórico del 21/09 dice «21 de 341 bins (5,7 %)». Esa proporción aritmética es **6,16 %**. No reutilizar 5,7 %. No se recalculó ese experimento de correlaciones en esta entrega.

## Afirmaciones que deben evitarse

«Identifica emociones», «mide atención», «localiza actividad cortical», «demuestra causalidad», «elimina todos los artefactos», «el fabricante falla siempre», «63,8 veces más exacto» o «un millón de veces mejor». Lo demostrado es una corrección de escala, preservación de datos faltantes, disponibilidad explícita y sensibilidad del resumen a decisiones de procesamiento sobre referencias concretas.

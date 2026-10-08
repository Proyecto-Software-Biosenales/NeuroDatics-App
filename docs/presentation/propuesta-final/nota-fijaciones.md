# Nota técnica: mínimo del detector y duraciones reconstruidas

Diagnóstico del 25 de septiembre de 2026, realizado durante la preparación de la presentación. No se modificó la aplicación ni las grabaciones. Esta nota sirve de respaldo para preguntas; no demuestra mayor exactitud de un algoritmo frente a otro.

## Hallazgo confirmado

La comparación detectó dos eventos analíticos por debajo de 200 ms en `csv-08`. Al ejecutar el detector y reconstruir sus eventos en memoria, se confirma que **el detector original no emitió esos eventos con menos de 200 ms**. La discrepancia aparece después, en la reconstrucción a partir de las filas exportadas.

| Bloque anónimo | Eventos del detector | Eventos reconstruidos | Mínimo del detector, ms | Reconstruidos <200 ms |
|---|---:|---:|---:|---:|
| B01 | 96 | 96 | 216,259880 | 0 |
| B02 | 116 | 116 | 216,245329 | 1 |
| B03 | 176 | 177 | 216,248574 | 1 |
| B04 | 117 | 117 | 216,257452 | 0 |
| B05 | 134 | 134 | 216,224036 | 0 |
| B06 | 153 | 153 | 216,251209 | 0 |

Los 792 eventos del detector pasan a 793 reconstruidos. Se usó `FixationDetectionService.detect` con configuración canónica de 200 ms, las unidades y tasas declaradas extraídas por el lector actual y sin escribir Parquet. La reconstrucción se realizó con `FixationEventService.build_events`. Las cifras corresponden al bloque completo, no a filtros posteriores por escenario o ventana temporal.

## B02: soporte temporal del detector frente al soporte de las filas

El evento local 45 tiene 13 muestras del detector a 60,116905 Hz, equivalentes a **216,245329 ms**. Su representación exportada contiene 60 filas con un span entre primera y última de **196,449219 ms**.

La reconstrucción acepta el soporte del detector solo si cabe en el span de las filas más el mayor de sus periodos. Aquí el límite es **213,083475 ms**, inferior a 216,245329 ms. Por ello descarta ese metadato para la duración y vuelve a medir el soporte de las filas: **199,779 ms**. Emite una advertencia indicando que los metadatos del detector no encajan con los timestamps.

Esto demuestra una discrepancia entre representaciones temporales durante el remuestreo y la reconstrucción. No demuestra que el detector haya incumplido su umbral. No se cambió la política de tolerancia ni se corrigió el caso en esta tarea.

Código relevante: `backend/src/neurodatics/modules/analytics/application/services/fixation_event_reconstruction.py:58` (validación del soporte y fallback); `backend/src/neurodatics/modules/analytics/application/services/fixation_analytics_service.py:554` (soporte temporal de filas).

## B03: un evento del detector se divide en dos grupos

El evento local 145 dura **365,959125 ms** en el detector, con 22 muestras y 108 filas exportadas. Dentro del intervalo aparecen **dos filas consideradas límites duros** por la máscara de estímulo/pantalla. Las filas del evento quedan en dos épocas de estímulo distintas, 399 y 401.

La reconstrucción agrupa por segmento, época de estímulo e identificador; por tanto produce dos eventos:

- 47 filas: **156,493 ms**.
- 61 filas: **203,109 ms**.

Ambos grupos conservan el conteo almacenado de 22 muestras del evento completo, pero ese soporte no cabe en el intervalo de cada fragmento. El reconstructor recurre al soporte de sus respectivas filas. Esto explica el evento adicional y el fragmento menor de 200 ms. La suma de las duraciones reconstruidas no tiene por qué coincidir con el soporte del detector: cambia la partición y la representación temporal.

La máscara defensiva trata como límites las filas fuera de pantalla/viewport/estímulo. Esta ejecución confirma dos límites y dos épocas; no adjudica una causa experimental a las coordenadas fuera de rango. Tampoco se evaluó aquí cuál debe ser la política final para descartar, conservar o volver a clasificar esos fragmentos.

Código relevante: `backend/src/neurodatics/modules/analytics/application/services/fixation_event_reconstruction.py:139`, `:184`; `backend/src/neurodatics/modules/analytics/domain/coordinate_transform.py:110`.

## Qué decir en la presentación

«Configuramos un mínimo de 200 ms en el detector. Además, comprobamos cómo esos eventos llegan a los resúmenes: encontramos dos casos en que la reconstrucción temporal produce fragmentos más cortos. Por eso mantenemos separadas la regla de detección y la duración reconstruida, y conservamos advertencias para revisión».

Evitar «todas las fijaciones mostradas duran al menos 200 ms», «las diferencias prueban mayor precisión» o atribuir el caso al fabricante. El benchmark compara comportamientos y encuentra límites de la aplicación actual; no dispone de anotaciones de verdad para medir exactitud.

## Evidencia y reproducción

Evidencia agregada anónima: [fijaciones-diagnostico.json](fijaciones-diagnostico.json). Solo incluye bloques, identificadores internos de eventos, conteos, duraciones y advertencias; no contiene identidades ni trayectorias crudas.

Script diagnóstico local conservado en `output/presentation-short-fixations.py`:

```powershell
.venv/Scripts/python.exe -X utf8 output/presentation-short-fixations.py
.venv/Scripts/python.exe -X utf8 output/presentation-short-fixations.py 3
```

Las dos ejecuciones finalizaron correctamente. La segunda amplió el detalle del bloque 3 y se integró en la evidencia agregada. No se ejecutaron pruebas generales ni se implementó una reparación.

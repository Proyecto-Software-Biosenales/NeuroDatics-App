# Informes por dispositivo

Para quien mantiene el subsistema de informes. Describe cómo se generan los PDF: un informe por dispositivo
(eye tracker, GSR, EEG), que sustituyó al antiguo «informe ejecutivo» dibujado con matplotlib.

## Qué es un informe

Un informe responde a una pregunta —*qué midió este dispositivo, escenario por escenario*— para un alcance:

| Alcance | Solicitud | Contenido |
| --- | --- | --- |
| Individual | `scope.kind = "participant"` | Todas las gráficas y tablas de estadísticas de ese participante. |
| Grupo | `scope.kind = "all_participants"` | Mapas agregados, una fila por participante en cada tabla, y media y desviación del grupo. |

`mode.kind = "sensor"` genera el PDF de ese dispositivo. `mode.kind = "comparative"` genera **un PDF por cada
dispositivo del proyecto** y los devuelve en un ZIP. Ambos salen de `POST /api/reports/executive`; el tipo de
la respuesta y el nombre de archivo de `Content-Disposition` le dicen al navegador cuál recibió.

Todos los informes comparten el mismo esqueleto: portada (opcional) → índice enlazado → **Resumen** (alcance,
participantes, avisos sobre los datos, una tabla y una gráfica entre escenarios) → una sección por cada
escenario de imagen → **Metodología y glosario**. Los escenarios de vídeo no se incluyen.

## Flujo

```text
servicios de analítica ──► sensor_reports/<dispositivo>.py ──► ReportDocument ──► PDFAdapter ──► PDF
     (números)               (qué dice el informe)            (bloques y recursos)  (Typst)    (maquetación)
```

| Módulo | Responsabilidad |
| --- | --- |
| `application/sensor_reports/eye_tracking.py`, `gsr.py`, `eeg.py` | Por dispositivo: reunir un registro por participante y escenario y convertirlo en bloques. |
| `application/sensor_reports/common.py` | `ReportContext` (proyecto, dispositivo, participantes, escenarios, alcance), el armazón del documento, la tabla de estadísticas compartida y el motivo de la portada. |
| `application/sensor_reports/document.py` | El modelo de bloques (`kpis`, `figure`, `table`, `images`, `callout`, `columns`, `group`…) y el almacén de recursos. |
| `application/sensor_reports/charts.py` | Gráficas de matplotlib generadas como SVG a tamaño de impresión. |
| `application/sensor_reports/stimulus.py` | Mapa de calor, recorrido de la mirada y AOIs sobre el estímulo. |
| `application/sensor_reports/statistics.py`, `formatting.py` | Las definiciones estadísticas del tablero y el formato de los valores. |
| `infrastructure/templates/sensor_report.typ` | Maquetación: páginas, títulos, tablas, figuras. |
| `infrastructure/pdf_adapter.py` | Compila el documento con Typst en un directorio temporal. |
| `application/services/executive_report_service.py` | Carga el proyecto, los datos y las imágenes de estímulo; construye los contextos; empaqueta el PDF o el ZIP. |

Los constructores nunca emiten marcado: entregan a la plantilla cadenas listas para mostrar, y la plantilla las
inserta como texto. Un escenario llamado `#set page(width: 1pt)` se imprime literalmente
(`tests/unit/test_report_pdf_adapter.py` lo fija).

## Números

Las estadísticas usan las mismas definiciones que el tablero, así que un valor del PDF coincide con el de la
pantalla: media, desviación estándar con `n - 1`, mediana, extremos, la línea base robusta (media de los valores
entre los percentiles 5 y 20) y `Pico %` = `(max - base) / |base| × 100`. Las filas de grupo añaden la media y
la desviación estándar **entre participantes**.

Dos diferencias deliberadas con el tablero:

- **El tiempo se mide desde el inicio del escenario**, no desde el inicio de la grabación, en todas las gráficas
  y en el TTFF. `AoiAnalyticsService` informa `ttff_ms` con el reloj de la grabación, así que el informe le
  resta el inicio del escenario (`eye_tracking._relative_ttff_s`). La pestaña de AOIs del tablero hace lo mismo
  (`features/analytics/aoiInsights.ts`); las demás gráficas del tablero siguen usando el reloj de la grabación.
- **Los resúmenes de EEG dan la desviación estándar, no el RMS**, porque los canales exportados llevan grandes
  desplazamientos de continua que harían pasar el RMS por amplitud sin serlo.

Los informes también señalan lo que antes parecía, sin decirlo, «sin respuesta»: un canal de GSR constante o
limitado por su resolución se marca por escenario y en el resumen, y los avisos de adquisición del EEG (µV
supuestos, cortes de reloj, posibles artefactos) aparecen como notas destacadas.

## Maquetación y fuentes

La plantilla usa Poppins desde `application/assets/fonts` y compila con `ignore_system_fonts=True`, así que un
informe se ve igual en cualquier máquina y en el contenedor. Poppins no tiene letras griegas (las bandas se
escriben: Delta, Theta, Alfa, Beta, Gamma) ni espacio fino de no separación (los miles usan un espacio de no
separación normal).

Las gráficas se generan a su ancho físico final (el ancho del contenido es 174 mm) y se colocan al 100 %, así
que su texto tiene el tamaño que dice tener. Los colores de las series salen de una paleta categórica validada
para deficiencias de visión del color en pares adyacentes; cada participante conserva su color en todo el
informe, y cada gráfica va acompañada de una tabla.

## Dependencia

`typst = "^0.15.0"` (enlace de Python, ruedas abi3 para Windows y manylinux). La plantilla se compila desde un
directorio temporal que contiene solo la plantilla, el JSON del documento y sus recursos; no se descarga nada de
la red ni se importan paquetes de Typst. Basta con reconstruir la imagen del backend para desplegarlo.

## Trabajar en un informe

- **Vista previa con datos reales:** construye un `ReportContext` a partir de los Parquet y llama al constructor
  del dispositivo; después `PDFAdapter().render(..., output_format="png", ppi=70)` devuelve un PNG por página
  para revisarlo. Las grabaciones privadas y lo que salga de ellas no entran en el repositorio.
- **Añadir un tipo de bloque:** amplía `document.py` con un constructor y atiende el nuevo `type` en
  `render-blocks` de la plantilla. Los datos deben poder serializarse a JSON.
- **Añadir una gráfica:** añade a `charts.py` un constructor que devuelva bytes SVG a un ancho dado en
  milímetros, y acompáñala de una tabla en el constructor del dispositivo.
- **Pruebas:** `tests/characterization/test_sensor_reports.py` (cada dispositivo y alcance sobre la grabación
  sintética, más el empaquetado HTTP), `tests/unit/test_report_pdf_adapter.py` (todos los tipos de bloque,
  seguridad del marcado, aislamiento de recursos), `tests/unit/test_report_formatting.py` (valores y
  estadísticas) y `tests/unit/test_executive_report_heatmap_geometry.py` (geometría del estímulo).

"""Methods and glossary appendices, so a shared report can be read on its own."""

from __future__ import annotations

from typing import List, Sequence, Tuple

from . import document as doc

GLOSSARY_COLUMNS = [doc.column("Término", "left", "42mm"), doc.column("Definición", "left", "1fr")]


def _glossary(entries: Sequence[Tuple[str, str]]) -> doc.Block:
    return doc.table(GLOSSARY_COLUMNS, [doc.row(entry) for entry in entries], title="Glosario")


COMMON_STATISTICS: Sequence[Tuple[str, str]] = (
    ("N", "Número de muestras válidas usadas en el cálculo."),
    ("Base", "Nivel de referencia robusto: media de los valores situados entre los percentiles 5 y 20 de la señal del escenario."),
    ("Media / DE / Mediana", "Estadísticos de la señal mostrada; la desviación estándar (DE) usa n − 1."),
    ("Pico %", "Cambio del valor máximo respecto a la base: (máximo − base) / base × 100."),
    ("Media del grupo / DE entre participantes", "Media y desviación estándar de los valores de cada participante; describen la variación entre personas, no entre muestras."),
)

SCOPE_NOTE = (
    "Los tiempos de cada gráfico se expresan desde el inicio del escenario. Las estadísticas usan las mismas "
    "definiciones que el panel de analítica de NeuroDatics, por lo que los valores coinciden con los de la aplicación."
)


def eye_tracking() -> List[doc.Block]:
    return [
        doc.paragraph(SCOPE_NOTE),
        doc.heading("Procesamiento"),
        doc.table(
            GLOSSARY_COLUMNS,
            [
                doc.row(["Fijaciones", "Eventos detectados por el algoritmo de fijaciones de NeuroDatics con una duración mínima de 200 ms (umbral por defecto del panel). Se excluyen sacadas, mirada inválida y mirada fuera del estímulo."]),
                doc.row(["Mapa de calor", "Densidad de fijaciones ponderada por su duración, suavizada con un núcleo gaussiano (sigma = 10,5 % del lado corto del estímulo) y normalizada al máximo del escenario. Los colores son relativos a cada mapa."]),
                doc.row(["Recorrido visual", "Fijaciones numeradas en orden temporal y unidas por líneas. El área de cada círculo es proporcional a la duración, con la misma escala para todos los participantes (tope de 2 s)."]),
                doc.row(["Dilatación pupilar", "Diámetro en mm suavizado con una media móvil de 0,25 s. «Promedio» combina ambos ojos cuando los dos son válidos."]),
                doc.row(["Punto de mirada", "Posición horizontal (X) y vertical (Y) en % del estímulo, tras limpieza de parpadeos, saltos imposibles y suavizado."]),
                doc.row(["Distancia", "Distancia de los ojos a la pantalla registrada por el eye tracker, en cm."]),
            ],
        ),
        _glossary(
            [
                ("Tiempo fijado", "Suma de la duración de todas las fijaciones del escenario."),
                ("Primera fijación", "Tiempo desde el inicio del escenario hasta la primera fijación."),
                ("AOI", "Área de interés definida sobre el estímulo en NeuroDatics."),
                ("Tiempo en AOI (%)", "Porcentaje del tiempo fijado total que recae dentro del AOI."),
                ("TTFF", "Time to first fixation: tiempo desde el inicio del escenario hasta la primera fijación dentro del AOI."),
                ("Tasa de acierto", "Porcentaje de las fijaciones del escenario que caen dentro del AOI."),
                ("Fijaciones hasta el AOI", "Número de orden de la primera fijación que entra en el AOI."),
                ("Transiciones", "Saltos de la mirada de un AOI a otro distinto dentro del mismo segmento continuo de registro."),
                ("Participantes que lo miraron", "Participantes con al menos una fijación dentro del AOI."),
                *COMMON_STATISTICS,
            ]
        ),
    ]


def gsr() -> List[doc.Block]:
    return [
        doc.paragraph(SCOPE_NOTE),
        doc.heading("Procesamiento"),
        doc.table(
            GLOSSARY_COLUMNS,
            [
                doc.row(["Conductancia", "Respuesta galvánica de la piel en microsiemens (µS), tal como la registra el sensor."]),
                doc.row(["Suavizado", "Media móvil centrada de 1 s. Las estadísticas se calculan sobre la señal suavizada; la señal cruda se muestra como referencia."]),
                doc.row(["Variación respecto a la base", "En los informes de grupo, cada participante se representa como su señal suavizada menos su propia base, para comparar respuestas con niveles tónicos distintos."]),
            ],
        ),
        doc.callout(
            "Interpretación",
            [
                "La conductancia refleja activación fisiológica (arousal), no la dirección de la emoción.",
                "La respuesta electrodérmica suele aparecer entre 1 y 3 s después del estímulo; en escenarios breves puede quedar parcialmente fuera de la ventana.",
                "El nivel tónico deriva a lo largo de la sesión, por lo que conviene comparar escenarios con el Pico % y no solo con la media.",
            ],
        ),
        _glossary(
            [
                ("Amplitud", "Diferencia entre el máximo del escenario y su base, en µS."),
                *COMMON_STATISTICS,
            ]
        ),
    ]


def eeg() -> List[doc.Block]:
    return [
        doc.paragraph(SCOPE_NOTE),
        doc.heading("Procesamiento"),
        doc.table(
            GLOSSARY_COLUMNS,
            [
                doc.row(["Señal", "Amplitud por canal tal como se exportó (referencia original), sin filtrado ni corrección de artefactos. Los huecos y discontinuidades temporales no se interpolan."]),
                doc.row(["Densidad espectral (PSD)", "Método de Welch con ventana de Hann, segmentos de hasta 1024 muestras y 50 % de solapamiento, calculado solo sobre tramos continuos válidos. Nivel en dB respecto a 1 µV²/Hz."]),
                doc.row(["Potencia por banda", "Integral de la densidad espectral en cada banda (µV²): Delta 0,5–4 Hz, Theta 4–8 Hz, Alfa 8–13 Hz, Beta 13–30 Hz y Gamma 30–45 Hz."]),
                doc.row(["Potencia relativa", "Potencia de cada banda dividida entre la suma de las cinco bandas (%)."]),
                doc.row(["Espectrograma", "Densidad espectral en ventanas de 1,5 s con 75 % de solapamiento, en dB respecto a 1 µV²/Hz, con una escala de color común a todos los canales del escenario."]),
                doc.row(["Topografía", "Mapa esquemático de seis electrodos (F3, F4, C3, C4, P3, P4) con la potencia relativa de cada banda. Cada mapa usa su propia escala; no representa localización de fuentes."]),
            ],
        ),
        doc.callout(
            "Limitaciones",
            [
                "Sin eliminación automática de artefactos (parpadeos, movimiento, actividad muscular): revisar la señal antes de interpretar diferencias.",
                "En escenarios de pocos segundos la resolución espectral es limitada y las estimaciones de banda son ruidosas.",
                "Si la unidad del canal no se declaró al exportar, µV es una suposición y debe confirmarse la calibración.",
                "Estas métricas no permiten, por sí solas, conclusiones diagnósticas, emocionales o de atención.",
            ],
            tone="warning",
        ),
        _glossary(
            [
                ("RMS", "Raíz cuadrática media de la amplitud; resume la energía de la señal en µV."),
                ("Muestras válidas", "Muestras con tiempo y valor finitos."),
                ("Resolución espectral", "Separación entre frecuencias consecutivas de la PSD: frecuencia de muestreo / tamaño de segmento."),
                *COMMON_STATISTICS[:3],
            ]
        ),
    ]

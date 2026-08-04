"use client"

import { useMemo } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import type { ComparisonData } from "./useComparisonData"
import type { VisualizationId } from "./registry"

interface Summary {
  count: number
  mean: number
  median: number
  std: number
  min: number
  max: number
  baseline: number
  peak: number | null
}

interface NumericRow extends Summary {
  sensor: string
  visualization: string
  series: string
  unit: string
}

interface NumericStateRow {
  sensor: string
  visualization: string
  series: "Estado"
  state: string
}

interface MetricRow {
  sensor: string
  visualization: string
  metric: string
  value: number | string | null
  unit: string
}

function finite(values: Array<number | null | undefined>) {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  )
}

function summarize(input: Array<number | null | undefined>): Summary | null {
  const values = finite(input)
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const median =
    values.length % 2
      ? sorted[Math.floor(values.length / 2)]
      : (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
  const std =
    values.length > 1
      ? Math.sqrt(
          values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            (values.length - 1)
        )
      : 0
  const baselineStart = Math.floor(sorted.length * 0.05)
  const baselineEnd = Math.max(
    baselineStart + 1,
    Math.ceil(sorted.length * 0.2)
  )
  const baselineSlice = sorted.slice(baselineStart, baselineEnd)
  const baseline =
    baselineSlice.reduce((sum, value) => sum + value, 0) / baselineSlice.length
  const max = sorted[sorted.length - 1]
  return {
    count: values.length,
    mean,
    median,
    std,
    min: sorted[0],
    max,
    baseline,
    peak: baseline === 0 ? null : ((max - baseline) / Math.abs(baseline)) * 100,
  }
}

function numericRow(
  sensor: string,
  visualization: string,
  series: string,
  unit: string,
  values: Array<number | null | undefined>
): NumericRow | null {
  const summary = summarize(values)
  return summary ? { sensor, visualization, series, unit, ...summary } : null
}

function numericStateRow(
  sensor: string,
  visualization: string,
  loading: boolean,
  error: string | null
): NumericStateRow {
  return {
    sensor,
    visualization,
    series: "Estado",
    state: loading
      ? "Cargando…"
      : error
        ? `No disponible: ${error}`
        : "Sin datos",
  }
}

function format(value: number | string | null, decimals = 3) {
  if (value == null) return "—"
  if (typeof value === "string") return value
  if (!Number.isFinite(value)) return "—"
  return value.toLocaleString("es-CO", { maximumFractionDigits: decimals })
}

function selectedState(
  selected: Set<VisualizationId>,
  id: VisualizationId,
  loading: boolean,
  error: string | null,
  hasData: boolean,
  visualization: string,
  sensor: string
): MetricRow | null {
  if (!selected.has(id) || hasData) return null
  return {
    sensor,
    visualization,
    metric: "Estado",
    value: loading
      ? "Cargando…"
      : error
        ? `No disponible: ${error}`
        : "Sin datos",
    unit: "",
  }
}

export function ComparisonStatistics({
  selectedIds,
  data,
  pinnedTime,
}: {
  selectedIds: VisualizationId[]
  data: ComparisonData
  pinnedTime: number | null
}) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const numericRows = (() => {
    const rows: Array<NumericRow | NumericStateRow | null> = []
    if (selected.has("pupil")) {
      if (data.pupil.data) {
        const pupilRows = [
          numericRow(
            "Eye Tracker",
            "Dilatación pupilar",
            "Izquierda suavizada",
            "mm",
            data.pupil.data.smooth_left
          ),
          numericRow(
            "Eye Tracker",
            "Dilatación pupilar",
            "Derecha suavizada",
            "mm",
            data.pupil.data.smooth_right
          ),
        ].filter((row): row is NumericRow => row != null)
        rows.push(
          ...(pupilRows.length
            ? pupilRows
            : [
                numericStateRow(
                  "Eye Tracker",
                  "Dilatación pupilar",
                  false,
                  null
                ),
              ])
        )
      } else {
        rows.push(
          numericStateRow(
            "Eye Tracker",
            "Dilatación pupilar",
            data.pupil.loading,
            data.pupil.error
          )
        )
      }
    }
    if (selected.has("distance")) {
      const row = data.distance.data
        ? numericRow(
            "Eye Tracker",
            "Distancia al dispositivo",
            "Distancia",
            "cm",
            data.distance.data.distance_cm
          )
        : null
      rows.push(
        row ??
          numericStateRow(
            "Eye Tracker",
            "Distancia al dispositivo",
            data.distance.loading,
            data.distance.error
          )
      )
    }
    if (selected.has("gaze")) {
      if (data.gaze.data) {
        const gazeRows = [
          numericRow(
            "Eye Tracker",
            "Gaze point",
            "Posición X",
            "%",
            data.gaze.data.gx_clean
          ),
          numericRow(
            "Eye Tracker",
            "Gaze point",
            "Posición Y",
            "%",
            data.gaze.data.gy_clean
          ),
        ].filter((row): row is NumericRow => row != null)
        rows.push(
          ...(gazeRows.length
            ? gazeRows
            : [numericStateRow("Eye Tracker", "Gaze point", false, null)])
        )
      } else {
        rows.push(
          numericStateRow(
            "Eye Tracker",
            "Gaze point",
            data.gaze.loading,
            data.gaze.error
          )
        )
      }
    }
    if (selected.has("gsr")) {
      const row = data.gsr.data
        ? numericRow(
            "GSR",
            "Respuesta galvánica",
            "Señal suavizada",
            "µS",
            data.gsr.data.gsr_smooth
          )
        : null
      rows.push(
        row ??
          numericStateRow(
            "GSR",
            "Respuesta galvánica",
            data.gsr.loading,
            data.gsr.error
          )
      )
    }
    if (selected.has("eeg_timeseries")) {
      if (data.eegTimeseries.data?.channels.length) {
        const eeg = data.eegTimeseries.data
        const eegRows: NumericRow[] = []
        for (const channel of eeg.channels) {
          const row = numericRow(
            "EEG",
            "EEG por canal",
            channel.toUpperCase(),
            "µV",
            eeg.smooth[channel] ?? []
          )
          if (row) eegRows.push(row)
        }
        rows.push(
          ...(eegRows.length
            ? eegRows
            : [numericStateRow("EEG", "EEG por canal", false, null)])
        )
      } else {
        rows.push(
          numericStateRow(
            "EEG",
            "EEG por canal",
            data.eegTimeseries.loading,
            data.eegTimeseries.error
          )
        )
      }
    }
    return rows.filter((row): row is NumericRow | NumericStateRow =>
      Boolean(row)
    )
  })()

  const metricRows = useMemo(() => {
    const rows: MetricRow[] = []
    const histogram = data.fixationHistogram.data
    if (selected.has("fixation_histogram") && histogram) {
      rows.push(
        {
          sensor: "Eye Tracker",
          visualization: "Histograma de fijación",
          metric: "Fijaciones",
          value: histogram.n_fixations,
          unit: "",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Histograma de fijación",
          metric: "Duración total",
          value: histogram.total_duration_ms,
          unit: "ms",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Histograma de fijación",
          metric: "Duración media",
          value: histogram.mean_duration_ms,
          unit: "ms",
        }
      )
    }
    const fixation = data.fixation.data
    if (selected.has("heatmap") && fixation) {
      rows.push(
        {
          sensor: "Eye Tracker",
          visualization: "Mapa de calor",
          metric: "Fijaciones",
          value: fixation.stats.n_fixations,
          unit: "",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Mapa de calor",
          metric: "Duración media",
          value: fixation.stats.avg_duration_s * 1000,
          unit: "ms",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Mapa de calor",
          metric: "Fijación máxima",
          value: fixation.stats.max_duration_s * 1000,
          unit: "ms",
        }
      )
    }
    const scanpath = data.scanpath.data
    if (selected.has("scanpath") && scanpath) {
      rows.push(
        {
          sensor: "Eye Tracker",
          visualization: "Mapa de recorridos",
          metric: "Objetivos",
          value: scanpath.n_objectives,
          unit: "",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Mapa de recorridos",
          metric: "Distancia total",
          value: scanpath.total_distance_px,
          unit: "px",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Mapa de recorridos",
          metric: "Duración media",
          value: scanpath.avg_duration_s * 1000,
          unit: "ms",
        }
      )
    }
    if (pinnedTime != null) {
      rows.push(
        {
          sensor: "Eye Tracker",
          visualization: "Punto sobre estímulo",
          metric: "Instante fijado",
          value: pinnedTime,
          unit: "s",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Punto sobre estímulo",
          metric: "Posición X",
          value: data.gazeAt.data?.gx ?? null,
          unit: "%",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Punto sobre estímulo",
          metric: "Posición Y",
          value: data.gazeAt.data?.gy ?? null,
          unit: "%",
        }
      )
    }
    const aoi = data.aoi.data
    if (selected.has("aoi") && aoi) {
      rows.push(
        {
          sensor: "Eye Tracker",
          visualization: "Comparativa AOIs",
          metric: "Áreas",
          value: aoi.aois.length,
          unit: "",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Comparativa AOIs",
          metric: "Fijaciones",
          value: aoi.total_fixations,
          unit: "",
        },
        {
          sensor: "Eye Tracker",
          visualization: "Comparativa AOIs",
          metric: "Permanencia observada",
          value: aoi.observed_aoi_dwell_time_percent,
          unit: "%",
        }
      )
    }
    const psd = data.eegPsd.data
    if (selected.has("eeg_psd") && psd) {
      for (const channel of psd.channels) {
        const values = psd.power[channel] ?? []
        let peakIndex = -1
        values.forEach((value, index) => {
          if (peakIndex < 0 || value > values[peakIndex]) peakIndex = index
        })
        rows.push(
          {
            sensor: "EEG",
            visualization: "Densidad espectral",
            metric: `${channel.toUpperCase()} frecuencia pico`,
            value: psd.frequency[peakIndex] ?? null,
            unit: "Hz",
          },
          {
            sensor: "EEG",
            visualization: "Densidad espectral",
            metric: `${channel.toUpperCase()} potencia pico`,
            value: values[peakIndex] ?? null,
            unit: psd.unit,
          }
        )
      }
    }
    const spectrogram = data.eegSpectrogram.data
    if (selected.has("eeg_spectrogram") && spectrogram) {
      for (const channel of spectrogram.channels) {
        const values = finite((spectrogram.power[channel] ?? []).flat())
        const summary = summarize(values)
        rows.push(
          {
            sensor: "EEG",
            visualization: "Espectrograma",
            metric: `${channel.toUpperCase()} potencia media`,
            value: summary?.mean ?? null,
            unit: spectrogram.unit,
          },
          {
            sensor: "EEG",
            visualization: "Espectrograma",
            metric: `${channel.toUpperCase()} potencia pico`,
            value: summary?.max ?? null,
            unit: spectrogram.unit,
          }
        )
      }
    }
    const states = [
      selectedState(
        selected,
        "fixation_histogram",
        data.fixationHistogram.loading,
        data.fixationHistogram.error,
        Boolean(histogram),
        "Histograma de fijación",
        "Eye Tracker"
      ),
      selectedState(
        selected,
        "heatmap",
        data.fixation.loading || data.heatmap.loading,
        data.fixation.error || data.heatmap.error,
        Boolean(fixation),
        "Mapa de calor",
        "Eye Tracker"
      ),
      selectedState(
        selected,
        "scanpath",
        data.scanpath.loading,
        data.scanpath.error,
        Boolean(scanpath),
        "Mapa de recorridos",
        "Eye Tracker"
      ),
      selectedState(
        selected,
        "aoi",
        data.aoi.loading,
        data.aoi.error,
        Boolean(aoi),
        "Comparativa AOIs",
        "Eye Tracker"
      ),
      selectedState(
        selected,
        "eeg_psd",
        data.eegPsd.loading,
        data.eegPsd.error,
        Boolean(psd),
        "Densidad espectral",
        "EEG"
      ),
      selectedState(
        selected,
        "eeg_spectrogram",
        data.eegSpectrogram.loading,
        data.eegSpectrogram.error,
        Boolean(spectrogram),
        "Espectrograma",
        "EEG"
      ),
    ]
    return [...rows, ...states.filter((row): row is MetricRow => Boolean(row))]
  }, [data, pinnedTime, selected])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Resumen estadístico</CardTitle>
        <CardDescription>
          Métricas comparables calculadas sobre las mismas señales procesadas
          que aparecen en las visualizaciones seleccionadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-7">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Señales numéricas</h3>
            <p className="text-xs text-muted-foreground">
              Tendencia, dispersión, rango y cambio frente a la línea base.
            </p>
          </div>
          <div className="max-h-[440px] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[1180px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-20 bg-muted/95 text-xs text-muted-foreground backdrop-blur">
                <tr>
                  {[
                    "Sensor",
                    "Visualización",
                    "Serie",
                    "Unidad",
                    "N",
                    "Media",
                    "Mediana",
                    "Desv. est.",
                    "Mín.",
                    "Máx.",
                    "Línea base",
                    "Pico vs. base",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-3 font-semibold whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {numericRows.length ? (
                  numericRows.map((row) => (
                    <tr
                      key={`${row.visualization}-${row.series}`}
                      className="hover:bg-muted/20"
                    >
                      <td className="sticky left-0 bg-card px-3 py-3 font-medium">
                        {row.sensor}
                      </td>
                      <td className="px-3 py-3">{row.visualization}</td>
                      <td className="px-3 py-3 font-medium">{row.series}</td>
                      {"state" in row ? (
                        <td
                          colSpan={9}
                          className="px-3 py-3 text-muted-foreground"
                        >
                          {row.state}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-muted-foreground">
                            {row.unit}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {row.count.toLocaleString("es-CO")}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {format(row.mean)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {format(row.median)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {format(row.std)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {format(row.min)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {format(row.max)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {format(row.baseline)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {row.peak == null ? "—" : `${format(row.peak, 2)}%`}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No hay señales numéricas seleccionadas o disponibles.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Métricas específicas</h3>
            <p className="text-xs text-muted-foreground">
              Indicadores propios de distribuciones, mapas y análisis
              espectrales.
            </p>
          </div>
          <div className="max-h-[440px] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-20 bg-muted/95 text-xs text-muted-foreground backdrop-blur">
                <tr>
                  {[
                    "Sensor",
                    "Visualización",
                    "Métrica",
                    "Valor",
                    "Unidad",
                  ].map((label) => (
                    <th key={label} className="px-3 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metricRows.length ? (
                  metricRows.map((row, index) => (
                    <tr
                      key={`${row.visualization}-${row.metric}-${index}`}
                      className="hover:bg-muted/20"
                    >
                      <td className="sticky left-0 bg-card px-3 py-3 font-medium">
                        {row.sensor}
                      </td>
                      <td className="px-3 py-3">{row.visualization}</td>
                      <td className="px-3 py-3 font-medium">{row.metric}</td>
                      <td className="px-3 py-3 text-right">
                        {format(row.value)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {row.unit}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No hay métricas específicas seleccionadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selected.has("aoi") && data.aoi.data?.aois.length ? (
          <details className="rounded-xl border border-border bg-muted/10">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
              Detalle por AOI ({data.aoi.data.aois.length})
            </summary>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[880px] text-sm tabular-nums">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {[
                      "AOI",
                      "Fijaciones",
                      "Dwell total",
                      "Dwell %",
                      "Duración media",
                      "TTFF",
                      "Hit rate",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-3 py-3 text-left font-semibold"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.aoi.data.aois.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-medium">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.name}
                      </td>
                      <td className="px-3 py-3">{item.fixation_count}</td>
                      <td className="px-3 py-3">
                        {format(item.total_dwell_time_ms)} ms
                      </td>
                      <td className="px-3 py-3">
                        {format(item.total_dwell_time_percent)}%
                      </td>
                      <td className="px-3 py-3">
                        {format(item.avg_fixation_duration_ms)} ms
                      </td>
                      <td className="px-3 py-3">
                        {item.ttff_ms == null
                          ? "—"
                          : `${format(item.ttff_ms)} ms`}
                      </td>
                      <td className="px-3 py-3">
                        {format(item.hit_rate_percent)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}

"use client"

import { Activity, Radio, TrendingDown, TrendingUp, Waves } from "lucide-react"
import type { AnalyticsChartNote } from "../AnalyticsChartShell"
import { formatChannel } from "../../eegPresentation"
import { GroupStimulusCard } from "../../groupMode/GroupStimulusCard"
import { groupLoadNotes } from "../../groupMode/groupNotes"
import type { GroupView } from "../../groupMode/useGroupData"
import {
  EegGroupChips,
  EegGroupKpis,
  EegGroupPsdChart,
  EegGroupState,
  EegGroupStatsCard,
  type EegGroupColumn,
  type EegGroupKpi,
  type EegGroupSlots,
} from "./EegGroupPieces"
import type {
  EegGroupFigures,
  GroupPsd,
  PsdField,
  SpectrogramField,
  TimeseriesField,
} from "./useEegGroupData"
import { CHANNEL_COLORS } from "./eegViewShared"

/** The view's own cards that sit in a three-column row. */
const CARD_ROW = "mb-5 grid grid-cols-1 gap-3 md:grid-cols-3"
const MIN_CLASS = "font-medium text-emerald-500 dark:text-emerald-400"
const MAX_CLASS = "font-medium text-rose-500 dark:text-rose-400"
const MAIN_CLASS = "font-semibold text-foreground"
/** The averaged spectrum: violet, like the view's «Frecuencia pico» card. */
const PSD_AVERAGE_COLOR = "#8B5CF6"

const EMERALD = {
  iconBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
  iconColorClass: "text-emerald-600 dark:text-emerald-400",
  labelColorClass: "text-emerald-700 dark:text-emerald-400",
}
const ROSE = {
  iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
  iconColorClass: "text-rose-600 dark:text-rose-400",
  labelColorClass: "text-rose-700 dark:text-rose-400",
}
const VIOLET = {
  iconBgClass: "bg-violet-100 dark:bg-violet-900/40",
  iconColorClass: "text-violet-600 dark:text-violet-400",
  labelColorClass: "text-violet-700 dark:text-violet-400",
}

// ---------------------------------------------------------------------------
// EEG por canal
// ---------------------------------------------------------------------------

const TIMESERIES_COLUMNS: EegGroupColumn<TimeseriesField>[] = [
  { field: "count", label: "N válidas", decimals: 0, className: "text-muted-foreground" },
  { field: "rms", label: "RMS", decimals: 4, unit: " uV", className: "text-muted-foreground" },
  { field: "mean", label: "Media", decimals: 4, unit: " uV", className: MAIN_CLASS },
  { field: "std", label: "Desv.", decimals: 4, unit: " uV" },
  { field: "median", label: "Mediana", decimals: 4, unit: " uV" },
  { field: "min", label: "Min", decimals: 4, unit: " uV", className: MIN_CLASS },
  { field: "max", label: "Max", decimals: 4, unit: " uV", className: MAX_CLASS },
]

/**
 * «Promedio» of «EEG por canal»: the view draws the averaged channels itself
 * (`useEegGroupTimeseriesAverage`); the cards and the table give each
 * participant's figures for the channel chosen in «Estadísticas de».
 */
export function timeseriesGroupSlots({
  view,
  hasData,
  figures,
  channel,
  signal,
  scenario,
}: {
  view: GroupView
  /** The averaged channels have something to draw. */
  hasData: boolean
  figures: EegGroupFigures<TimeseriesField>
  channel: string | null
  signal: "smooth" | "raw"
  scenario: string
}): EegGroupSlots | null {
  if (!view.active) return null
  if (!view.mode) return null
  const label = channel ? formatChannel(channel) : "—"
  const loading = !hasData && view.data.loading
  const kpis: EegGroupKpi<TimeseriesField>[] = [
    { label: `Media · ${label}`, field: "mean", unit: "uV", decimals: 4, Icon: Activity, ...EMERALD },
    { label: `Mínimo · ${label}`, field: "min", unit: "uV", decimals: 4, Icon: TrendingDown, ...EMERALD },
    { label: `Máximo · ${label}`, field: "max", unit: "uV", decimals: 4, Icon: TrendingUp, ...ROSE },
  ]
  const chartNotes: AnalyticsChartNote[] = [
    {
      id: "group-how",
      label: "Cómo se calcula",
      detail: (
        <>
          <span>
            Cada participante se cuenta desde {view.timeAxis.origin} y se lleva a una rejilla común de tiempo. Cada línea
            es la media, en ese canal, de los participantes que lo tienen; una pérdida larga de señal queda como hueco.
          </span>
          <span>Cada canal se promedia por separado: la media de varios canales no describe ningún electrodo.</span>
        </>
      ),
    },
    // Say beside the chart when the axis is not simply the scenario's own time.
    ...(view.timeAxis.noted ? [{ id: "group-time", label: view.timeAxis.chip, detail: view.timeAxis.detail }] : []),
    ...groupLoadNotes(view.data),
  ]
  return {
    kpis: <EegGroupKpis kpis={kpis} average={figures.average} loading={loading} />,
    description: `Promedio de ${view.data.successes.length === 1 ? "1 participante" : `${view.data.successes.length} participantes`} en cada canal, sin corrección de artefactos.`,
    chart: hasData ? undefined : (
      <EegGroupState data={view.data} frameClassName="analytics-state-frame-eeg" emptyMessage="Ninguno de los participantes elegidos tiene EEG en estos canales." notes={groupLoadNotes(view.data)} />
    ),
    chartNotes,
    xAxisLabel: view.timeAxis.label,
    stimulus: <GroupStimulusCard view={view} scenario={scenario} />,
    stats: (
      <EegGroupStatsCard
        columns={TIMESERIES_COLUMNS}
        entries={figures.entries}
        average={figures.average}
        loading={loading}
        scope={view.timeAxis.scope}
        averageColor={channel ? CHANNEL_COLORS[channel] : undefined}
        detail={`Cifras del canal ${label} sobre la señal ${signal === "smooth" ? "suavizada" : "cruda"} completa, antes de reducir los puntos de la gráfica.`}
      />
    ),
  }
}

// ---------------------------------------------------------------------------
// Densidad espectral
// ---------------------------------------------------------------------------

export function psdGroupSlots({
  view,
  psd,
  onZoom,
  onZoomReset,
  onZoomBack,
}: {
  view: GroupView
  psd: GroupPsd
  onZoom: (start: number, end: number) => void
  onZoomReset?: () => void
  onZoomBack?: () => void
}): EegGroupSlots | null {
  if (!view.active) return null
  const mode = view.mode
  if (!mode) return null
  const unit = ` ${psd.unit}`
  const loading = psd.series.length === 0 && view.data.loading
  const kpis: EegGroupKpi<PsdField>[] = [
    { label: "Frecuencia pico", field: "peakFrequency", unit: "Hz", decimals: 2, Icon: Radio, ...VIOLET },
    { label: "Densidad pico", field: "peakPower", unit: psd.unit, decimals: 4, Icon: TrendingUp, ...ROSE },
    { label: "Nivel medio", field: "mean", unit: psd.unit, decimals: 4, Icon: Waves, ...EMERALD },
  ]
  const columns: EegGroupColumn<PsdField>[] = [
    { field: "count", label: "Intervalos", decimals: 0, className: "text-muted-foreground" },
    { field: "peakFrequency", label: "Freq. pico", decimals: 2, unit: " Hz", className: MAIN_CLASS },
    { field: "peakPower", label: "Nivel pico", decimals: 4, unit, className: MAX_CLASS },
    { field: "mean", label: "Nivel medio", decimals: 4, unit },
    { field: "std", label: "Desv.", decimals: 4, unit },
    { field: "median", label: "Mediana", decimals: 4, unit },
    { field: "min", label: "Min", decimals: 4, unit, className: MIN_CLASS },
    { field: "max", label: "Max", decimals: 4, unit, className: MAX_CLASS },
  ]
  return {
    kpis: <EegGroupKpis kpis={kpis} average={psd.average} loading={loading} />,
    chart: ({ fit }) => (
      <EegGroupPsdChart mode={mode} psd={psd} data={view.data} fit={fit} onZoom={onZoom} onZoomReset={onZoomReset} onZoomBack={onZoomBack} averageColor={PSD_AVERAGE_COLOR} />
    ),
    stats: (
      <EegGroupStatsCard
        columns={columns}
        entries={psd.entries}
        average={psd.average}
        loading={loading}
        db={psd.db}
        averageColor={PSD_AVERAGE_COLOR}
        scope={view.timeAxis.scope}
        detail="Cada fila describe la línea del participante: la media de sus canales elegidos, en el rango de frecuencias visible."
      />
    ),
  }
}

// ---------------------------------------------------------------------------
// Espectrograma (solo promedio)
// ---------------------------------------------------------------------------

export function spectrogramGroupSlots({
  view,
  hasData,
  figures,
  unit,
}: {
  view: GroupView
  /** The averaged spectrogram has something to draw. */
  hasData: boolean
  figures: EegGroupFigures<SpectrogramField>
  unit: string
}): EegGroupSlots | null {
  if (!view.active) return null
  const mode = view.mode
  if (!mode) return null
  const levels = ` ${unit}`
  const loading = !hasData && view.data.loading
  const kpis: EegGroupKpi<SpectrogramField>[] = [
    { label: "Frecuencia máxima", field: "maxFrequency", unit: "Hz", decimals: 2, Icon: Radio, ...VIOLET },
    { label: "Nivel máximo", field: "maxPower", unit, decimals: 4, Icon: TrendingUp, ...ROSE },
    { label: "Nivel medio", field: "meanPower", unit, decimals: 4, Icon: Activity, ...EMERALD },
  ]
  const columns: EegGroupColumn<SpectrogramField>[] = [
    { field: "peakFrequency", label: "Freq. pico", decimals: 2, unit: " Hz", className: MAIN_CLASS },
    { field: "peakTime", label: "T. pico", decimals: 2, unit: " s" },
    { field: "peakPower", label: "Nivel pico", decimals: 4, unit: levels, className: MAX_CLASS },
    { field: "meanPower", label: "Nivel medio", decimals: 4, unit: levels },
    { field: "stdPower", label: "Desv.", decimals: 4, unit: levels },
    { field: "medianPower", label: "Mediana", decimals: 4, unit: levels },
    { field: "minPower", label: "Min", decimals: 4, unit: levels, className: MIN_CLASS },
    { field: "maxPower", label: "Max", decimals: 4, unit: levels, className: MAX_CLASS },
  ]
  const notes: AnalyticsChartNote[] = [
    {
      id: "group-how",
      label: "Cómo se calcula",
      detail: (
        <>
          <span>{view.timeAxis.detail}</span>
          <span>
            Cada espectrograma se lleva a una rejilla común de tiempo y frecuencia, sin rellenar huecos, y se promedia
            celda a celda en potencia lineal; el resultado se pasa a dB.
          </span>
          <span>Una celda negra no tiene datos de ningún participante. La escala de color va del percentil 2 al 98 de la media.</span>
        </>
      ),
    },
    // Say beside the chart when the axis is not simply the scenario's own time.
    ...(view.timeAxis.noted ? [{ id: "group-time", label: view.timeAxis.chip, detail: view.timeAxis.detail }] : []),
    ...groupLoadNotes(view.data),
  ]
  return {
    kpis: <EegGroupKpis className={CARD_ROW} kpis={kpis} average={figures.average} loading={loading} />,
    description: `Media de varios participantes en cada ventana y frecuencia, desde ${view.timeAxis.origin}. dB referidos a 1 uV²/Hz.`,
    chart: hasData ? undefined : (
      <EegGroupState data={view.data} frameClassName="h-[420px]" emptyMessage="Ninguno de los participantes elegidos tiene espectrograma." notes={notes} />
    ),
    notes: <EegGroupChips notes={notes} />,
    stats: (
      <EegGroupStatsCard
        columns={columns}
        entries={figures.entries}
        average={figures.average}
        loading={loading}
        db
        scope={view.timeAxis.scope}
        detail={`Cada fila reúne las celdas de todos los canales visibles del participante, en el tramo visible; el tiempo del pico se cuenta desde ${view.timeAxis.origin}.`}
      />
    ),
  }
}

"use client"

import { Activity, Clock, Radio, TrendingDown, TrendingUp, Waves } from "lucide-react"
import { KpiCard } from "../KpiCard"
import type { AnalyticsChartNote } from "../AnalyticsChartShell"
import { fittedAxis } from "../../fittedAxis"
import { formatChannel, robustDomain } from "../../eegPresentation"
import { GroupTemporalChart, type GroupTrace } from "../../groupMode/GroupTemporalChart"
import { GroupUnsupported } from "../../groupMode/GroupUnsupported"
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
  TopographyField,
} from "./useEegGroupData"

/** The view's own cards that sit in a three-column row. */
const CARD_ROW = "mb-5 grid grid-cols-1 gap-3 md:grid-cols-3"
const MIN_CLASS = "font-medium text-emerald-500 dark:text-emerald-400"
const MAX_CLASS = "font-medium text-rose-500 dark:text-rose-400"
const MAIN_CLASS = "font-semibold text-foreground"

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

const ALIGNED = "Cada participante se cuenta desde el inicio del escenario en su propia grabación."

/** The view cannot show this mode here: the reason in the chart's place, no cards or table. */
function unsupported(reason: string, frameClassName: string): EegGroupSlots {
  return { kpis: null, chart: <GroupUnsupported reason={reason} className={frameClassName} />, stats: null }
}

// ---------------------------------------------------------------------------
// EEG por canal
// ---------------------------------------------------------------------------

/** The EEG axis: the robust range of what is drawn, so one excursion cannot flatten everyone else. */
function eegAxis(values: number[]) {
  const domain = robustDomain(values)
  return domain ? fittedAxis([domain.min, domain.max]) : null
}

const TIMESERIES_COLUMNS: EegGroupColumn<TimeseriesField>[] = [
  { field: "count", label: "N válidas", decimals: 0, className: "text-muted-foreground" },
  { field: "rms", label: "RMS", decimals: 4, unit: " uV", className: "text-muted-foreground" },
  { field: "mean", label: "Media", decimals: 4, unit: " uV", className: MAIN_CLASS },
  { field: "std", label: "Desv.", decimals: 4, unit: " uV" },
  { field: "median", label: "Mediana", decimals: 4, unit: " uV" },
  { field: "min", label: "Min", decimals: 4, unit: " uV", className: MIN_CLASS },
  { field: "max", label: "Max", decimals: 4, unit: " uV", className: MAX_CLASS },
]

export function timeseriesGroupSlots({
  view,
  traces,
  figures,
  channel,
  signal,
}: {
  view: GroupView
  traces: GroupTrace[]
  figures: EegGroupFigures<TimeseriesField>
  channel: string | null
  signal: "smooth" | "raw"
}): EegGroupSlots | null {
  if (!view.active) return null
  if (view.unsupportedReason) return unsupported(view.unsupportedReason, "analytics-state-frame-eeg")
  if (!view.mode) return null
  const label = channel ? formatChannel(channel) : "—"
  const loading = traces.length === 0 && view.data.loading
  const kpis: EegGroupKpi<TimeseriesField>[] = [
    { label: `Media · ${label}`, field: "mean", unit: "uV", decimals: 4, Icon: Activity, ...EMERALD },
    { label: `Mínimo · ${label}`, field: "min", unit: "uV", decimals: 4, Icon: TrendingDown, ...EMERALD },
    { label: `Máximo · ${label}`, field: "max", unit: "uV", decimals: 4, Icon: TrendingUp, ...ROSE },
  ]
  const detail = `Se dibuja el canal ${label} de cada participante, el que eliges en «Canal»: la media de varios canales no describe ningún electrodo.${
    signal === "smooth" ? " La señal está suavizada con una media móvil de 0.2 s." : ""
  } El eje recorta las excursiones extremas; la ayuda emergente da el valor real.`
  return {
    kpis: view.mode === "average" ? <EegGroupKpis kpis={kpis} average={figures.average} loading={loading} /> : null,
    chart: (
      <GroupTemporalChart
        mode={view.mode}
        traces={traces}
        data={view.data}
        unit="uV"
        yLabel="EEG (uV)"
        yAxis={eegAxis}
        averageDetail={detail}
        emptyMessage={`Ninguno de los participantes elegidos tiene el canal ${label}.`}
      />
    ),
    stats: (
      <EegGroupStatsCard
        mode={view.mode}
        columns={TIMESERIES_COLUMNS}
        entries={figures.entries}
        average={figures.average}
        loading={loading}
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
  if (view.unsupportedReason) return unsupported(view.unsupportedReason, "analytics-state-frame-mid")
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
    kpis: mode === "average" ? <EegGroupKpis kpis={kpis} average={psd.average} loading={loading} /> : null,
    chart: ({ fit }) => (
      <EegGroupPsdChart mode={mode} psd={psd} data={view.data} fit={fit} onZoom={onZoom} onZoomReset={onZoomReset} onZoomBack={onZoomBack} />
    ),
    stats: (
      <EegGroupStatsCard
        mode={mode}
        columns={columns}
        entries={psd.entries}
        average={psd.average}
        loading={loading}
        db={psd.db}
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
  if (view.unsupportedReason) return unsupported(view.unsupportedReason, "h-[420px]")
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
          <span>{ALIGNED}</span>
          <span>
            Cada espectrograma se lleva a una rejilla común de tiempo y frecuencia, sin rellenar huecos, y se promedia
            celda a celda en potencia lineal; el resultado se pasa a dB.
          </span>
          <span>Una celda negra no tiene datos de ningún participante. La escala de color va del percentil 2 al 98 de la media.</span>
        </>
      ),
    },
    ...groupLoadNotes(view.data),
  ]
  return {
    kpis: <EegGroupKpis className={CARD_ROW} kpis={kpis} average={figures.average} loading={loading} />,
    chart: hasData ? undefined : (
      <EegGroupState data={view.data} frameClassName="h-[420px]" emptyMessage="Ninguno de los participantes elegidos tiene espectrograma en este escenario." notes={notes} />
    ),
    notes: <EegGroupChips notes={notes} />,
    stats: (
      <EegGroupStatsCard
        mode={mode}
        columns={columns}
        entries={figures.entries}
        average={figures.average}
        loading={loading}
        db
        detail="Cada fila reúne las celdas de todos los canales visibles del participante, en el tramo visible; el tiempo del pico se cuenta desde el inicio del escenario."
      />
    ),
  }
}

// ---------------------------------------------------------------------------
// Topografía (solo promedio)
// ---------------------------------------------------------------------------

export function topographyGroupSlots({
  view,
  hasData,
  figures,
  unit,
  frameTime,
}: {
  view: GroupView
  hasData: boolean
  figures: EegGroupFigures<TopographyField>
  unit: string
  /** The chosen instant, seconds since the scenario's onset. */
  frameTime: number | null
}): EegGroupSlots | null {
  if (!view.active) return null
  if (view.unsupportedReason) return unsupported(view.unsupportedReason, "h-[420px]")
  const mode = view.mode
  if (!mode) return null
  const levels = ` ${unit}`
  const loading = !hasData && view.data.loading
  const kpis: EegGroupKpi<TopographyField>[] = [
    { label: "Mayor potencia", field: "strongest", unit, decimals: 4, Icon: TrendingUp, ...ROSE },
    { label: "Potencia media", field: "meanPower", unit, decimals: 4, Icon: Activity, ...EMERALD },
  ]
  const columns: EegGroupColumn<TopographyField>[] = [
    { field: "strongest", label: "Mayor potencia", decimals: 4, unit: levels, className: MAX_CLASS },
    { field: "meanPower", label: "Potencia media", decimals: 4, unit: levels, className: MAIN_CLASS },
    { field: "minPower", label: "Mínima", decimals: 4, unit: levels, className: MIN_CLASS },
    { field: "maxPower", label: "Máxima", decimals: 4, unit: levels, className: MAX_CLASS },
  ]
  const notes: AnalyticsChartNote[] = [
    {
      id: "group-how",
      label: "Cómo se calcula",
      detail: (
        <>
          <span>{ALIGNED}</span>
          <span>
            La potencia de cada electrodo se lleva a una rejilla común de ventanas, sin rellenar huecos, y se promedia
            entre los participantes con dato en ese instante.
          </span>
          <span>La escala de color va del percentil 2 al 98 de todas las ventanas medias y no cambia al mover el deslizador.</span>
        </>
      ),
    },
    ...groupLoadNotes(view.data),
  ]
  return {
    kpis: (
      <EegGroupKpis className={CARD_ROW} kpis={kpis} average={figures.average} loading={loading}>
        <KpiCard
          label="Tiempo"
          value={frameTime}
          unit="s"
          decimals={2}
          description="Desde el inicio del escenario"
          Icon={Clock}
          loading={loading}
          iconBgClass="bg-blue-100 dark:bg-blue-900/40"
          iconColorClass="text-blue-600 dark:text-blue-400"
          labelColorClass="text-blue-700 dark:text-blue-400"
        />
      </EegGroupKpis>
    ),
    chart: hasData ? undefined : (
      <EegGroupState data={view.data} frameClassName="h-[420px]" emptyMessage="Ninguno de los participantes elegidos tiene topografía en este escenario." notes={notes} />
    ),
    notes: <EegGroupChips notes={notes} />,
    stats: (
      <EegGroupStatsCard
        mode={mode}
        columns={columns}
        entries={figures.entries}
        average={figures.average}
        loading={loading}
        detail="Cada fila son los electrodos del participante en el instante elegido; un participante sin ventana en ese instante queda sin cifras."
      />
    ),
  }
}

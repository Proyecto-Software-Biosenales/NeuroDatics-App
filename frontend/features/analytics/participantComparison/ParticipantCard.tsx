"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  EegPsdChart,
  FixationHistogramChart,
  TemporalLineChart,
  type TemporalChartPoint,
  type TemporalSeries,
  type ZoomController,
} from "../comparison/ComparisonCharts"
import { AoiPanel, HeatmapPanel, ScanpathPanel } from "../comparison/SpatialPanels"
import { SpectrogramPanel, TopographyPanel } from "../components/eeg/EegCanvasPanels"
import { CHANNEL_COLORS, TOPOGRAPHY_CHANNELS } from "../components/eeg/eegViewShared"
import {
  EMPTY_ZOOM_HISTORY,
  popZoom,
  pushZoom,
  sameZoomRange,
  sliceEegSpectrogram,
  type ZoomHistory,
} from "../chartZoom"
import {
  formatChannel,
  robustDomain,
  rotateTopographyPositionClockwise,
  type TopographyFrameRow,
} from "../eegPresentation"
import type { AoiMetricsData } from "../types"
import { loadCardData, type CardResult } from "./cardData"
import { participantComparisonLoader, useBlobUrl, useCardVisibility, useLoaderEntry, useStimulusImage, type ViewportTracker } from "./cardHooks"
import { finiteDomain, paddedDomain, type Domain, type ScaleMode } from "./scales"
import { cardCacheKey, CARD_POINT_BUDGET, EEG_CARD_POINT_BUDGET, KIND_INFO, type ParticipantComparisonSpec, type ZoomRange } from "./spec"
import type { WindowTransfer } from "./timeAlignment"
import { analyticsKey } from "../analyticsCache"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"

export interface PinnedPoint {
  participant: string
  /** Recording time used to locate the gaze. */
  sourceTime: number
  /** Time on the drawn axis. */
  displayTime: number
  /** Drawn axis counts from the stimulus onset: the instant exists in every card. */
  aligned: boolean
}

export type DomainReport = Record<string, Domain>

export interface ParticipantCardProps {
  participant: string
  index: number
  isSource: boolean
  projectId: string
  generation: number | null
  spec: ParticipantComparisonSpec
  transfer: WindowTransfer
  frameStimulusTime: number | null
  tracker: ViewportTracker
  scaleMode: ScaleMode
  /** Shared ranges by domain key, or empty in independent mode. */
  commonDomains: Record<string, Domain>
  commonX: [number, number] | null
  pinTime: number | null
  onPin: (pin: PinnedPoint) => void
  onReport: (participant: string, report: DomainReport | null) => void
  aoiOverlay: AoiMetricsData | null
  zoomMemory: Map<string, ZoomHistory<ZoomRange>>
  initialZoom: ZoomRange | null
}

const EMPTY_IMAGE = { url: null, loading: false, error: null }

function useCardZoom(memory: Map<string, ZoomHistory<ZoomRange>>, participant: string, initial: ZoomRange | null): ZoomController {
  const [history, setHistory] = useState<ZoomHistory<ZoomRange>>(
    () => memory.get(participant) ?? (initial ? { current: initial, previous: [] } : EMPTY_ZOOM_HISTORY)
  )
  // The dialog keeps each card's zoom, so scrolling away and back restores it.
  useEffect(() => {
    memory.set(participant, history)
  }, [history, memory, participant])
  return {
    range: history.current,
    canGoBack: history.previous.length > 0,
    zoomTo: (next: ZoomRange) => setHistory((current) => pushZoom(current, next, sameZoomRange)),
    back: () => setHistory((current) => popZoom(current)),
    reset: () => setHistory(EMPTY_ZOOM_HISTORY),
  }
}

export const ParticipantCard = memo(function ParticipantCard(props: ParticipantCardProps) {
  const { participant, isSource, spec, tracker } = props
  const ref = useRef<HTMLElement>(null)
  const { near, visible } = useCardVisibility(tracker, ref)
  const height = KIND_INFO[spec.kind].cardHeight
  return (
    <article
      ref={ref}
      aria-label={`Participante ${participant}`}
      data-testid="participant-comparison-card"
      data-participant={participant}
      data-card-state={near ? "mounted" : "placeholder"}
      style={{ height }}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs",
        isSource ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">Participante {participant}</h3>
        {isSource ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Vista de origen</span>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1 p-2" style={{ "--card-chart-height": `${height - 58}px` } as CSSProperties}>
        {near ? <CardBody {...props} visible={visible} /> : <div aria-hidden="true" className="h-full rounded-lg bg-muted/25" />}
      </div>
    </article>
  )
})

function CardBody(props: ParticipantCardProps & { visible: boolean }) {
  useAnalyticsRevision()
  const { participant, index, projectId, generation, spec, transfer, frameStimulusTime, visible, onReport } = props
  const budget = spec.kind === "eeg_timeseries" ? EEG_CARD_POINT_BUDGET : CARD_POINT_BUDGET
  const key = analyticsKey(projectId, "participant-card", [cardCacheKey({ projectId, generation }, participant, spec, budget), transfer, frameStimulusTime])
  const fetcher = useCallback(
    (signal: AbortSignal) => loadCardData({ projectId, generation, participant, spec, transfer, frameStimulusTime }, signal),
    [frameStimulusTime, generation, participant, projectId, spec, transfer]
  )
  // Visible cards first, then the margin; within each, grid order.
  const priority = (visible ? 0 : 1) * 100_000 + index
  const entry = useLoaderEntry<CardResult>(key, fetcher, priority, participant, projectId)

  if (entry.status === "queued" || entry.status === "loading") {
    return (
      <div role="status" className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground" data-testid="card-loading">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        {entry.status === "queued" ? "En cola…" : "Cargando…"}
      </div>
    )
  }
  if (entry.status === "error") {
    return (
      <div role="alert" data-testid="card-error" className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-4 text-center text-xs text-destructive">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        <span className="line-clamp-3">No se pudo cargar: {entry.error}</span>
        <Button type="button" size="xs" variant="outline" onClick={() => participantComparisonLoader.retry(key)}>
          <RotateCcw aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    )
  }
  const result = entry.data as CardResult
  return <CardResultView {...props} result={result} onReport={onReport} />
}

function EmptyState({ message }: { message: string }) {
  return (
    <div data-testid="card-empty" className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function useReport(onReport: ParticipantCardProps["onReport"], participant: string, report: DomainReport | null) {
  const serialized = JSON.stringify(report)
  useEffect(() => {
    onReport(participant, serialized === "null" ? null : (JSON.parse(serialized) as DomainReport))
  }, [onReport, participant, serialized])
}

function CardResultView(props: ParticipantCardProps & { result: CardResult }) {
  const { result } = props
  switch (result.type) {
    case "empty":
      return <EmptyCard {...props} message={result.message} />
    case "temporal":
      return <TemporalCard {...props} result={result} />
    case "histogram":
      return <HistogramCard {...props} result={result} />
    case "psd":
      return <PsdCard {...props} result={result} />
    case "spectrogram":
      return <SpectrogramCard {...props} result={result} />
    case "topography":
      return <TopographyCard {...props} result={result} />
    case "heatmap":
      return <HeatmapCard {...props} result={result} />
    case "scanpath":
      return <ScanpathCard {...props} result={result} />
    case "aoi":
      return <AoiPanel data={result.data} loading={false} error={null} image={EMPTY_IMAGE} compact />
  }
}

function EmptyCard({ participant, onReport, message }: ParticipantCardProps & { message: string }) {
  // An empty card is loaded: it counts toward the common scale's coverage.
  useReport(onReport, participant, {})
  return <EmptyState message={message} />
}

type Temporal = Extract<CardResult, { type: "temporal" }>

function temporalSeries(spec: ParticipantComparisonSpec, result: Temporal): TemporalSeries[] {
  switch (spec.kind) {
    case "pupil": {
      const series: TemporalSeries[] = []
      if (spec.params.eyes !== "right") series.push({ key: "left", label: "Pupila izquierda", color: "#818CF8", unit: "mm", strokeWidth: 1.5 })
      if (spec.params.eyes !== "left") series.push({ key: "right", label: "Pupila derecha", color: "#F87171", unit: "mm", strokeWidth: 1.5 })
      return series
    }
    case "gaze": {
      const series: TemporalSeries[] = []
      if (spec.params.axes !== "y") series.push({ key: "x", label: "Gaze X (%) filtrado", color: "#818CF8", unit: "%", strokeWidth: 1.5 })
      if (spec.params.axes !== "x") series.push({ key: "y", label: "Gaze Y (%) filtrado", color: "#22C55E", unit: "%", strokeWidth: 1.5 })
      return series
    }
    case "distance":
      return [{ key: "distance", label: "Distancia ojo-pantalla", color: "#3B82F6", unit: "cm", strokeWidth: 1.5 }]
    case "gsr": {
      const mode = spec.params.signalMode
      const series: TemporalSeries[] = []
      if (mode !== "raw") series.push({ key: "smooth", label: "GSR suavizada", color: "#10B981", unit: "µS", strokeWidth: 1.8 })
      if (mode !== "smooth") series.push({ key: "raw", label: "GSR cruda", color: "#6366F1", unit: "µS", strokeWidth: mode === "raw" ? 1.6 : 1 })
      return series
    }
    case "eeg_timeseries": {
      const mode = spec.params.signalMode
      return result.channels.flatMap((channel) => {
        const color = CHANNEL_COLORS[channel] ?? "#4B5563"
        const label = formatChannel(channel)
        if (mode === "smooth") return [{ key: `${channel}_smooth`, label, color, unit: "µV", strokeWidth: 1.4 }]
        if (mode === "raw") return [{ key: `${channel}_raw`, label, color, unit: "µV", strokeWidth: 1.2 }]
        return [
          { key: `${channel}_smooth`, label: `${label} suavizada`, color, unit: "µV", strokeWidth: 1.8 },
          { key: `${channel}_raw`, label: `${label} cruda`, color, unit: "µV", strokeWidth: 1, opacity: 0.36 },
        ]
      })
    }
    default:
      return []
  }
}

const Y_LABELS: Partial<Record<ParticipantComparisonSpec["kind"], string>> = {
  pupil: "Diámetro (mm)",
  gaze: "Posición (%)",
  distance: "Distancia (cm)",
  gsr: "Conductancia (µS)",
  eeg_timeseries: "Amplitud (µV)",
}

function resolveDomain(scaleMode: ScaleMode, common: Domain | undefined, own: Domain | null) {
  return paddedDomain(scaleMode === "common" && common ? common : own)
}

function TemporalCard(props: ParticipantCardProps & { result: Temporal }) {
  const { spec, result, participant, scaleMode, commonDomains, commonX, pinTime, onPin, onReport, zoomMemory, initialZoom } = props
  const series = useMemo(() => temporalSeries(spec, result), [result, spec])
  const ownY = useMemo(() => {
    const values: number[] = []
    for (const point of result.points) for (const item of series) values.push(point[item.key])
    if (spec.kind === "eeg_timeseries") {
      // The EEG view scales on a robust range so one artefact cannot flatten the rest.
      const robust = robustDomain(values)
      return robust ? { min: robust.min, max: robust.max } : null
    }
    return finiteDomain(values)
  }, [result.points, series, spec.kind])
  const ownX = useMemo(() => finiteDomain([result.points[0]?.time, result.points.at(-1)?.time]), [result.points])
  useReport(onReport, participant, ownY && ownX ? { y: ownY, x: ownX } : {})
  const zoom = useCardZoom(zoomMemory, participant, initialZoom)
  const yDomain = resolveDomain(scaleMode, commonDomains.y, ownY)
  const xDomain = result.aligned && scaleMode === "common" && commonX ? commonX : null
  const xLabel = result.aligned
    ? "Tiempo desde el inicio del estímulo (s)"
    : spec.kind === "gsr"
      ? "Tiempo desde la primera muestra GSR (s)"
      : "Tiempo de la grabación (s)"
  const canPin = KIND_INFO[spec.kind].pinsStimulusPoint
  const handlePin = useCallback(
    (point: TemporalChartPoint) => {
      if (!Number.isFinite(point.sourceTime)) return
      onPin({ participant, sourceTime: point.sourceTime, displayTime: point.time, aligned: result.aligned })
    },
    [onPin, participant, result.aligned]
  )
  if (!series.length) return <EmptyState message="La serie seleccionada no tiene datos." />
  return (
    <TemporalLineChart
      data={result.points}
      series={series}
      yLabel={Y_LABELS[spec.kind] ?? ""}
      xLabel={xLabel}
      xDomain={xDomain}
      pinnedTime={pinTime}
      onPin={canPin ? handlePin : undefined}
      interactionHint={canPin ? "Haz clic en un punto para ver el estímulo; arrastra para ampliar." : "Arrastra para ampliar."}
      synchronized={false}
      height={260}
      yDomain={yDomain}
      animate={false}
      zoom={zoom}
      timeAxisDescription={result.aligned ? "eje horizontal en segundos desde el inicio del estímulo" : "eje horizontal en segundos de la grabación"}
      shellClassName="h-(--card-chart-height)! min-h-0!"
    />
  )
}

function HistogramCard(props: ParticipantCardProps & { result: Extract<CardResult, { type: "histogram" }> }) {
  const { result, participant, onReport, scaleMode, commonDomains } = props
  const own = useMemo(() => finiteDomain([0, ...result.data.bins.map((bin) => bin.conteo)]), [result.data.bins])
  useReport(onReport, participant, own ? { y: own } : {})
  const domain = scaleMode === "common" && commonDomains.y ? commonDomains.y : own
  return (
    <FixationHistogramChart
      data={result.data}
      yDomain={domain ? [0, Math.max(1, Math.ceil(domain.max * 1.05))] : null}
      animate={false}
      shellClassName="h-(--card-chart-height)! min-h-0!"
    />
  )
}

function PsdCard(props: ParticipantCardProps & { result: Extract<CardResult, { type: "psd" }> }) {
  const { result, participant, onReport, scaleMode, commonDomains, zoomMemory, initialZoom } = props
  const own = useMemo(
    () => finiteDomain(result.data.channels.flatMap((channel) => result.data.power[channel] ?? [])),
    [result.data]
  )
  useReport(onReport, participant, own ? { y: own } : {})
  const zoom = useCardZoom(zoomMemory, participant, initialZoom)
  return (
    <EegPsdChart
      data={result.data}
      yDomain={resolveDomain(scaleMode, commonDomains.y, own)}
      animate={false}
      zoom={zoom}
      shellClassName="h-(--card-chart-height)! min-h-0!"
    />
  )
}

function SpectrogramCard(props: ParticipantCardProps & { result: Extract<CardResult, { type: "spectrogram" }> }) {
  const { result, participant, onReport, scaleMode, commonDomains, zoomMemory, initialZoom, onPin, pinTime, spec } = props
  const data = result.data
  const perChannel = spec.kind === "eeg_spectrogram" && spec.params.perChannelColorDomain
  const report = useMemo(() => {
    const domains: DomainReport = { color: data.color_domain }
    if (perChannel) {
      for (const channel of data.channels) {
        const domain = data.channel_color_domain?.[channel]
        if (domain) domains[`color:${channel}`] = domain
      }
    }
    return domains
  }, [data, perChannel])
  useReport(onReport, participant, report)
  const zoom = useCardZoom(zoomMemory, participant, initialZoom)
  const sliced = useMemo(() => sliceEegSpectrogram(data, zoom.range) ?? data, [data, zoom.range])
  const zoomed = sliced !== data
  const hopS = Number(data.metadata?.display_hop_s ?? data.metadata?.hop_s)
  const interpolate = spec.kind === "eeg_spectrogram" && spec.params.interpolate
  return (
    <div className="grid h-full auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto">
      {sliced.channels.map((channel) => {
        const own = perChannel ? data.channel_color_domain?.[channel] ?? data.color_domain : data.color_domain
        const common = perChannel ? commonDomains[`color:${channel}`] : commonDomains.color
        return (
          <SpectrogramPanel
            key={channel}
            compact
            channel={channel}
            time={sliced.time}
            frequency={sliced.frequency}
            matrix={sliced.power[channel] ?? []}
            colorDomain={scaleMode === "common" && common ? common : own}
            unit={data.unit}
            hopS={Number.isFinite(hopS) ? hopS : undefined}
            interpolate={interpolate}
            selectedTime={pinTime}
            onTimeSelect={(time) =>
              onPin({
                participant,
                sourceTime: time - result.displayOffset + (result.recordingOffset ?? 0),
                displayTime: time,
                aligned: result.aligned,
              })
            }
            onTimeZoom={(start, end) => zoom.zoomTo({ start, end })}
            onZoomReset={zoomed ? zoom.reset : undefined}
            onZoomBack={zoomed && zoom.canGoBack ? zoom.back : undefined}
          />
        )
      })}
    </div>
  )
}

function TopographyCard(props: ParticipantCardProps & { result: Extract<CardResult, { type: "topography" }> }) {
  const { result, participant, onReport, scaleMode, commonDomains } = props
  const data = result.data
  const rows = useMemo<TopographyFrameRow[]>(
    () =>
      data.channels
        .filter((channel) => TOPOGRAPHY_CHANNELS.includes(channel))
        .map((channel) => {
          const position = data.positions[channel]
          const value = data.power[channel]?.[result.frameIndex]
          if (!position || position.length < 2 || typeof value !== "number" || !Number.isFinite(value)) return null
          const rotated = rotateTopographyPositionClockwise(position[0], position[1])
          return { channel, value, x: rotated.x, y: rotated.y }
        })
        .filter((row): row is TopographyFrameRow => row != null),
    [data, result.frameIndex]
  )
  useReport(onReport, participant, rows.length >= 3 ? { color: data.color_domain } : {})
  if (rows.length < 3) return <EmptyState message="No hay datos suficientes de al menos tres electrodos en este instante." />
  const domain = scaleMode === "common" && commonDomains.color ? commonDomains.color : data.color_domain
  const frameTime = data.time[result.frameIndex]
  return (
    <div className="flex h-full flex-col items-center gap-1">
      <TopographyPanel rows={rows} colorDomain={domain} unit={data.unit} className="max-h-full max-w-[300px] flex-1" />
      <p className="text-[11px] text-muted-foreground tabular-nums">
        Ventana en {frameTime.toFixed(2)} s {result.aligned ? "desde el inicio del estímulo" : ""} · {domain.min.toFixed(2)}–{domain.max.toFixed(2)} {data.unit}
      </p>
    </div>
  )
}

function HeatmapCard(props: ParticipantCardProps & { result: Extract<CardResult, { type: "heatmap" }> }) {
  const { result, participant, onReport, projectId, aoiOverlay, spec } = props
  useReport(onReport, participant, {})
  const overlayUrl = useBlobUrl(result.overlay)
  const image = useStimulusImage(projectId, result.fixation.scenario_file_id)
  const showAois = spec.kind === "heatmap" && spec.params.showAois
  return (
    <HeatmapPanel
      fixation={result.fixation}
      loading={false}
      error={null}
      image={image}
      overlayUrl={overlayUrl}
      aoi={showAois ? aoiOverlay : null}
      compact
    />
  )
}

function ScanpathCard(props: ParticipantCardProps & { result: Extract<CardResult, { type: "scanpath" }> }) {
  const { result, participant, onReport, projectId, aoiOverlay, spec } = props
  useReport(onReport, participant, {})
  const image = useStimulusImage(projectId, result.data.scenario_file_id)
  const showAois = spec.kind === "scanpath" && spec.params.showAois
  return <ScanpathPanel data={result.data} loading={false} error={null} image={image} aoi={showAois ? aoiOverlay : null} compact />
}

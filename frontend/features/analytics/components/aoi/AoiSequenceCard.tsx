"use client"

import { useMemo, useState } from "react"
import { Activity, ChevronRight, Ruler } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import { AoiName, OUTSIDE_AOI_COLOR, OutsideAoiName } from "./AoiName"
import type { AoiEventItem, AoiMetricItem } from "../../types"
import {
  formatDecimal,
  formatMilliseconds,
  formatSeconds,
  isFiniteNumber,
  plural,
  timeTicks,
  type AoiDiscovery,
  type AoiFixationSpan,
} from "../../aoiInsights"

const OUTSIDE_LANE = "__outside__"
const MARKER_ROW_PX = 28
/** Marker chips closer than this share of the width go to a second row. */
const MARKER_MIN_GAP_PERCENT = 6

const MARKER_STYLES = {
  pupil: {
    name: "Pupila",
    Icon: Activity,
    decimals: 2,
    chip: "border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300",
    // Solid colours: Chromium tints the anti-aliased edges of translucent oklch borders.
    line: "border-violet-400 dark:border-violet-400",
    swatch: "text-violet-600 dark:text-violet-300",
  },
  distance: {
    name: "Distancia",
    Icon: Ruler,
    decimals: 1,
    chip: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
    line: "border-emerald-500 dark:border-emerald-400",
    swatch: "text-emerald-700 dark:text-emerald-300",
  },
} as const

type MarkerSignal = keyof typeof MARKER_STYLES

interface Lane {
  key: string
  aoi: AoiMetricItem | null
  spans: AoiFixationSpan[]
}

interface Marker {
  event: AoiEventItem
  signal: MarkerSignal
  relativeS: number
  leftPercent: number
  row: number
}

interface AoiSequenceCardProps {
  discovery: { seen: AoiDiscovery[]; unseen: AoiMetricItem[] }
  sequence: AoiFixationSpan[] | null
  visits: Map<string, number> | null
  loading: boolean
  error: string | null
  /** Scenario onset on the recording clock; null when no series could fix it. */
  onsetS: number | null
  endS: number | null
  events: AoiEventItem[]
}

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)

function tickDecimals(ticks: number[]) {
  if (ticks.every((tick) => Number.isInteger(tick))) return 0
  return ticks.every((tick) => Number.isInteger(Math.round(tick * 1e6) / 1e5)) ? 1 : 2
}

function markerValue(event: AoiEventItem, signal: MarkerSignal) {
  return `${formatDecimal(event.value, MARKER_STYLES[signal].decimals)} ${event.unit}`
}

/**
 * AOI sequence chart: one lane per AOI in the order they were discovered, one
 * block per fixation, plus the pupil and distance extremes as marks, so a
 * physiological peak can be read against what the participant was looking at.
 */
export function AoiSequenceCard({
  discovery,
  sequence,
  visits,
  loading,
  error,
  onsetS,
  endS,
  events,
}: AoiSequenceCardProps) {
  const [hovered, setHovered] = useState<AoiFixationSpan | null>(null)
  const originS = onsetS ?? sequence?.[0]?.startS ?? null

  const spanS = useMemo(() => {
    if (originS == null) return 0
    const lastFixationEnd = (sequence ?? []).reduce((max, span) => Math.max(max, span.endS), originS)
    return Math.max(endS ?? lastFixationEnd, lastFixationEnd) - originS
  }, [endS, originS, sequence])

  const lanes = useMemo<Lane[]>(() => {
    const byLane = new Map<string, AoiFixationSpan[]>()
    for (const span of sequence ?? []) {
      const key = span.aoi?.id ?? OUTSIDE_LANE
      const lane = byLane.get(key)
      if (lane) lane.push(span)
      else byLane.set(key, [span])
    }
    const ordered = [...discovery.seen.map((item) => item.aoi), ...discovery.unseen]
    return [
      ...ordered.map((aoi) => ({ key: aoi.id, aoi, spans: byLane.get(aoi.id) ?? [] })),
      { key: OUTSIDE_LANE, aoi: null, spans: byLane.get(OUTSIDE_LANE) ?? [] },
    ]
  }, [discovery, sequence])

  const markers = useMemo<Marker[]>(() => {
    if (originS == null || spanS <= 0) return []
    const lastLeftByRow: number[] = []
    return events
      .filter((event): event is AoiEventItem & { time_s: number } => (
        (event.metric === "pupil" || event.metric === "distance") && isFiniteNumber(event.time_s)
      ))
      .map((event) => ({ event, signal: event.metric as MarkerSignal, relativeS: event.time_s - originS }))
      .filter(({ relativeS }) => relativeS >= 0 && relativeS <= spanS)
      .sort((a, b) => a.relativeS - b.relativeS)
      .map((item) => {
        const leftPercent = (item.relativeS / spanS) * 100
        let row = lastLeftByRow.findIndex((left) => leftPercent - left >= MARKER_MIN_GAP_PERCENT)
        if (row < 0) row = lastLeftByRow.length < 2 ? lastLeftByRow.length : 0
        lastLeftByRow[row] = leftPercent
        return { ...item, leftPercent, row }
      })
  }, [events, originS, spanS])

  const ticks = useMemo(() => timeTicks(spanS, 6), [spanS])
  const decimals = tickDecimals(ticks)
  const markerRows = markers.reduce((rows, marker) => Math.max(rows, marker.row + 1), 0)

  const summary = useMemo(() => {
    const order = discovery.seen
      .map((item) => `${item.aoi.name}${item.ttffS != null ? ` a ${formatSeconds(item.ttffS)}` : ""}`)
      .join(", ")
    const unseen = discovery.unseen.map((aoi) => aoi.name).join(", ")
    return [
      `Secuencia de ${plural(sequence?.length ?? 0, "fijación", "fijaciones")} en ${formatSeconds(spanS)}.`,
      order ? `Orden de descubrimiento: ${order}.` : "Ninguna AOI recibió fijaciones.",
      unseen ? `Sin fijaciones: ${unseen}.` : "",
    ].join(" ").trim()
  }, [discovery, sequence, spanS])

  const originChip = onsetS != null ? (
    <InfoChip
      label="t = 0: inicio del escenario"
      detail={(
        <>
          <span>Los tiempos de esta pestaña se miden desde el inicio del escenario.</span>
          <span>En el reloj de la grabación, el que usan las demás pestañas, ese inicio es {formatSeconds(onsetS)}.</span>
        </>
      )}
    />
  ) : (
    <InfoChip
      tone="warning"
      label="t = 0: primera fijación"
      detail="No hay series temporales para fijar el inicio del escenario, así que el eje empieza en la primera fijación."
    />
  )

  const body = (() => {
    if (loading && !sequence) {
      return <Skeleton className="h-44 w-full animate-pulse rounded-lg bg-muted" />
    }
    if (error && !sequence) {
      return (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50/50 px-4 text-center text-sm text-red-500 dark:border-red-900/50 dark:bg-red-900/10">
          No se pudo cargar la secuencia de fijaciones: {error}
        </div>
      )
    }
    if (!sequence || sequence.length === 0 || originS == null || spanS <= 0) {
      return (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
          No hay fijaciones en este escenario con el umbral seleccionado.
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-medium text-muted-foreground">Orden de descubrimiento</span>
          {discovery.seen.length === 0 ? (
            <span className="text-xs text-muted-foreground">Ninguna AOI recibió fijaciones.</span>
          ) : (
            <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
              {discovery.seen.map((item, index) => (
                <li key={item.aoi.id} className="inline-flex min-w-0 items-center gap-1.5">
                  {index > 0 ? <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs">
                    <span className="font-semibold tabular-nums text-muted-foreground">{item.rank}</span>
                    <AoiName aoi={item.aoi} />
                    {item.ttffS != null ? (
                      <span className="tabular-nums text-muted-foreground">{formatSeconds(item.ttffS)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {discovery.unseen.length > 0 ? (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>· Sin fijaciones:</span>
              {discovery.unseen.map((aoi) => (
                <span key={aoi.id} className="inline-flex rounded-full border border-dashed border-border px-2 py-0.5">
                  <AoiName aoi={aoi} className="font-normal text-muted-foreground" />
                </span>
              ))}
            </span>
          ) : null}
        </div>

        <div className="flex gap-3">
          <div className="w-28 shrink-0 sm:w-36 lg:w-44">
            <div style={{ height: markerRows * MARKER_ROW_PX }} />
            <ul>
              {lanes.map((lane) => {
                const laneVisits = lane.aoi ? visits?.get(lane.aoi.id) ?? 0 : 0
                const meta = lane.aoi
                  ? lane.spans.length === 0
                    ? "—"
                    : plural(laneVisits, "visita", "visitas")
                  : plural(lane.spans.length, "fij.", "fij.")
                return (
                  <li key={lane.key} className="flex h-7 min-w-0 items-center justify-between gap-2 text-xs">
                    {lane.aoi ? <AoiName aoi={lane.aoi} /> : <OutsideAoiName />}
                    <span className="hidden shrink-0 tabular-nums text-muted-foreground lg:inline">{meta}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="min-w-0 flex-1">
            {markerRows > 0 ? (
              <div className="relative" style={{ height: markerRows * MARKER_ROW_PX }}>
                {markers.map((marker) => {
                  const style = MARKER_STYLES[marker.signal]
                  const extreme = marker.event.kind === "max" ? "máxima" : "mínima"
                  const where = marker.event.aoi_name
                    ? `mirando ${marker.event.aoi_name}`
                    : "con la mirada fuera de las AOIs"
                  return (
                    <div
                      key={marker.event.id}
                      className="absolute -translate-x-1/2"
                      style={{
                        left: `${Math.min(Math.max(marker.leftPercent, 3), 97)}%`,
                        top: marker.row * MARKER_ROW_PX,
                      }}
                    >
                      <InfoChip
                        Icon={style.Icon}
                        label={marker.event.kind === "max" ? "máx" : "mín"}
                        ariaLabel={`${style.name} ${extreme}: ${markerValue(marker.event, marker.signal)} a ${formatSeconds(marker.relativeS)}, ${where}`}
                        className={cn("bg-background px-1.5", style.chip)}
                        detail={(
                          <>
                            <span className="font-medium">
                              {style.name} {extreme}: {markerValue(marker.event, marker.signal)}
                            </span>
                            <span>{formatSeconds(marker.relativeS)} desde el inicio, {where}.</span>
                          </>
                        )}
                      />
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div role="img" aria-label={summary} className="relative">
              {lanes.map((lane) => {
                const color = lane.aoi?.color ?? OUTSIDE_AOI_COLOR
                return (
                  <div key={lane.key} className="relative h-7">
                    <div className="absolute inset-x-0 top-1 bottom-1 overflow-hidden rounded-md bg-muted/70 dark:bg-muted/50">
                      {ticks.map((tick) => (
                        <span
                          key={tick}
                          aria-hidden="true"
                          className="absolute inset-y-0 w-px bg-border"
                          style={{ left: `${clampPercent((tick / spanS) * 100)}%` }}
                        />
                      ))}
                      {lane.spans.map((span) => {
                        const active = hovered === span
                        const left = clampPercent(((span.startS - originS) / spanS) * 100)
                        const width = Math.max(((span.endS - span.startS) / spanS) * 100, 0)
                        return (
                          <div
                            key={span.order}
                            className={cn(
                              "absolute inset-y-0 rounded-[3px] transition-opacity",
                              active && "z-10 ring-2 ring-foreground"
                            )}
                            style={{
                              left: `${left}%`,
                              width: `max(${width}%, 3px)`,
                              backgroundColor: color,
                              opacity: hovered && !active ? 0.45 : 0.95,
                            }}
                            onMouseEnter={() => setHovered(span)}
                            onMouseLeave={() => setHovered((current) => (current === span ? null : current))}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
                {markers.map((marker) => (
                  <span
                    key={marker.event.id}
                    className={cn("absolute inset-y-0 border-l border-dashed", MARKER_STYLES[marker.signal].line)}
                    style={{ left: `${marker.leftPercent}%` }}
                  />
                ))}
              </div>
            </div>

            <div aria-hidden="true" className="relative h-5 text-[11px] tabular-nums text-muted-foreground">
              {ticks.map((tick) => {
                const left = clampPercent((tick / spanS) * 100)
                return (
                  <span
                    key={tick}
                    className={cn(
                      "absolute top-1 whitespace-nowrap",
                      left <= 0.5 ? "translate-x-0" : left >= 96 ? "-translate-x-full" : "-translate-x-1/2"
                    )}
                    style={{ left: `${left}%` }}
                  >
                    {formatDecimal(tick, decimals)} s
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <p className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-1.5">
            {hovered ? (
              <>
                <span className="font-medium text-foreground">Fijación {hovered.order}</span>
                <span aria-hidden="true">·</span>
                {hovered.aoi ? <AoiName aoi={hovered.aoi} /> : <OutsideAoiName />}
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {formatSeconds(hovered.startS - originS)} – {formatSeconds(hovered.endS - originS)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatMilliseconds(hovered.durationS * 1000)}</span>
              </>
            ) : (
              "Pasa el cursor sobre un bloque para ver esa fijación."
            )}
          </p>
          {markers.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Marcas de máximo y mínimo:</span>
              {(Object.keys(MARKER_STYLES) as MarkerSignal[])
                .filter((signal) => markers.some((marker) => marker.signal === signal))
                .map((signal) => {
                  const { Icon, name, swatch } = MARKER_STYLES[signal]
                  return (
                    <span key={signal} className="inline-flex items-center gap-1">
                      <Icon aria-hidden="true" className={cn("size-3.5", swatch)} />
                      {name}
                    </span>
                  )
                })}
            </p>
          ) : null}
        </div>
      </div>
    )
  })()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Secuencia de atención</CardTitle>
        <CardDescription>
          Cuándo y en qué orden se miró cada área. Cada bloque es una fijación y su ancho, su duración.
        </CardDescription>
        <CardAction>{originChip}</CardAction>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

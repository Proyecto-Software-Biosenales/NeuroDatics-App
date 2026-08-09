"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, Clock, Crosshair, Eye, Hash, Ruler, Target } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import {
  useAoiMetrics,
  useDistanceTimeseries,
  useGazeTimeseries,
  usePupilTimeseries,
} from "../hooks/useAnalyticsData"
import type { AoiEventItem, AoiMetricItem } from "../types"
import {
  AoiLegend,
  AoiOverlay,
  findAoiAtPoint,
  getContainedImageBox,
  type ContainedImageBox,
} from "./AoiOverlay"
import { AnalyticsChartShell } from "./AnalyticsChartShell"

interface AoiComparisonTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

const formatMs = (value: number | null | undefined) => (
  value == null ? "-" : `${Math.round(value)} ms`
)

const formatPercent = (value: number | null | undefined) => (
  value == null ? "-" : `${value.toFixed(1)}%`
)

const formatEventValue = (event: AoiEventItem) => (
  event.unit === "%"
    ? `${event.value.toFixed(1)}%`
    : `${event.value.toFixed(2)} ${event.unit}`
)

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const eventShortLabel = (event: AoiEventItem) => {
  const kind = event.kind === "min" ? "Minimo" : "Maximo"
  if (event.metric === "gaze_x") return `Eje X ${kind.toLowerCase()}`
  if (event.metric === "gaze_y") return `Eje Y ${kind.toLowerCase()}`
  return kind
}

const eventPosition = (event: AoiEventItem) => (
  event.gx == null || event.gy == null
    ? "Sin posicion"
    : `${event.gx.toFixed(1)}%, ${event.gy.toFixed(1)}%`
)

const eventTone = (kind: string) => (
  kind === "min"
    ? {
        badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      }
    : {
        badge: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
      }
)

function AoiTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload as AoiMetricItem | undefined
  if (!item) return null

  return (
    <div className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>
      <p>Tiempo observado: {formatPercent(item.total_dwell_time_percent)}</p>
      <p>Fijaciones: {item.fixation_count}</p>
      <p>Dwell time: {formatMs(item.total_dwell_time_ms)}</p>
    </div>
  )
}

export function AoiComparisonTab({
  projectId,
  participantCode,
  scenario,
}: AoiComparisonTabProps) {
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const { data, loading, error } = useAoiMetrics(projectId, participantCode, scenario)
  const { data: pupilSeries } = usePupilTimeseries(projectId, participantCode, scenario)
  const { data: gazeSeries } = useGazeTimeseries(projectId, participantCode, scenario)
  const { data: distanceSeries } = useDistanceTimeseries(projectId, participantCode, scenario)

  const computeLetterbox = useCallback(() => {
    setLetterbox(getContainedImageBox(imageRef.current, imageContainerRef.current))
  }, [])

  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null

    const load = async () => {
      if (!data?.scenario_file_id) {
        setScenarioImageUrl(null)
        return
      }

      try {
        const blob = await apiFetchBlob(`/api/projects/${projectId}/files/${data.scenario_file_id}/image`)
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setScenarioImageUrl(currentUrl)
      } catch {
        if (!cancelled) setScenarioImageUrl(null)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [projectId, data?.scenario_file_id])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeLetterbox())
    const container = imageContainerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(() => computeLetterbox())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeLetterbox, scenarioImageUrl])

  const topAoi = useMemo(() => {
    if (!data?.aois.length) return null
    return data.aois.reduce((best, item) => (
      item.total_dwell_time_percent > best.total_dwell_time_percent ? item : best
    ))
  }, [data])

  const fallbackEvents = useMemo<AoiEventItem[]>(() => {
    const aois = data?.aois ?? []
    if (aois.length === 0) return []

    const nearestGaze = (timeS: number) => {
      if (!gazeSeries?.time.length) return { gx: null, gy: null }
      let nearestIndex = 0
      let nearestDistance = Math.abs(gazeSeries.time[0] - timeS)
      for (let index = 1; index < gazeSeries.time.length; index += 1) {
        const distance = Math.abs(gazeSeries.time[index] - timeS)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      }
      const gx = gazeSeries.gx_clean[nearestIndex]
      const gy = gazeSeries.gy_clean[nearestIndex]
      return {
        gx: isFiniteNumber(gx) ? gx : null,
        gy: isFiniteNumber(gy) ? gy : null,
      }
    }

    const makeEvent = (
      metric: string,
      kind: "min" | "max",
      label: string,
      unit: string,
      value: number,
      timeS: number,
      gx: number | null,
      gy: number | null
    ): AoiEventItem => {
      const aoi = findAoiAtPoint(aois, gx, gy)
      return {
        id: `${metric}_${kind}_fallback`,
        label,
        metric,
        kind,
        value,
        unit,
        time_s: timeS,
        gx,
        gy,
        aoi_id: aoi?.id ?? null,
        aoi_name: aoi?.name ?? null,
        aoi_color: aoi?.color ?? null,
      }
    }

    const events: AoiEventItem[] = []
    const addExtrema = (
      metric: string,
      labelBase: string,
      unit: string,
      times: number[] | undefined,
      values: Array<number | undefined>,
      coordsAt: (index: number, timeS: number) => { gx: number | null; gy: number | null }
    ) => {
      if (!times?.length) return
      const validIndexes = values
        .map((value, index) => ({ value, index }))
        .filter((item): item is { value: number; index: number } => isFiniteNumber(item.value))
      if (validIndexes.length === 0) return

      const minItem = validIndexes.reduce((best, item) => item.value < best.value ? item : best)
      const maxItem = validIndexes.reduce((best, item) => item.value > best.value ? item : best)

      for (const [kind, item] of [["min", minItem], ["max", maxItem]] as const) {
        const timeS = times[item.index]
        if (!isFiniteNumber(timeS)) continue
        const coords = coordsAt(item.index, timeS)
        events.push(makeEvent(
          metric,
          kind,
          `${labelBase} ${kind === "min" ? "minimo" : "maximo"}`,
          unit,
          item.value,
          timeS,
          coords.gx,
          coords.gy
        ))
      }
    }

    const pupilValues = pupilSeries?.time.map((_, index) => {
      const average = pupilSeries.average[index]
      const smoothLeft = pupilSeries.smooth_left[index]
      const smoothRight = pupilSeries.smooth_right[index]
      if (isFiniteNumber(average) && average > 0) return average
      if (isFiniteNumber(smoothLeft) && isFiniteNumber(smoothRight)) return (smoothLeft + smoothRight) / 2
      if (isFiniteNumber(smoothLeft)) return smoothLeft
      if (isFiniteNumber(smoothRight)) return smoothRight
      return undefined
    }) ?? []

    addExtrema(
      "pupil",
      "Dilatacion pupilar",
      "mm",
      pupilSeries?.time,
      pupilValues,
      (_index, timeS) => nearestGaze(timeS)
    )

    addExtrema(
      "gaze_x",
      "Gaze X",
      "%",
      gazeSeries?.time,
      gazeSeries?.gx_clean ?? [],
      (index) => ({
        gx: isFiniteNumber(gazeSeries?.gx_clean[index]) ? gazeSeries.gx_clean[index] : null,
        gy: isFiniteNumber(gazeSeries?.gy_clean[index]) ? gazeSeries.gy_clean[index] : null,
      })
    )

    addExtrema(
      "gaze_y",
      "Gaze Y",
      "%",
      gazeSeries?.time,
      gazeSeries?.gy_clean ?? [],
      (index) => ({
        gx: isFiniteNumber(gazeSeries?.gx_clean[index]) ? gazeSeries.gx_clean[index] : null,
        gy: isFiniteNumber(gazeSeries?.gy_clean[index]) ? gazeSeries.gy_clean[index] : null,
      })
    )

    addExtrema(
      "distance",
      "Distancia",
      "cm",
      distanceSeries?.time,
      distanceSeries?.distance_cm ?? [],
      (_index, timeS) => nearestGaze(timeS)
    )

    return events
  }, [data?.aois, distanceSeries, gazeSeries, pupilSeries])

  const events = data?.events?.length ? data.events : fallbackEvents
  const eventSummary = useMemo(() => {
    const counts = new Map<string, { name: string; color: string | null; count: number }>()
    for (const event of events) {
      if (!event.aoi_name) continue
      const key = event.aoi_id ?? event.aoi_name
      const current = counts.get(key)
      counts.set(key, {
        name: event.aoi_name,
        color: event.aoi_color,
        count: (current?.count ?? 0) + 1,
      })
    }
    const topAssociated = [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null
    const insideCount = events.filter((event) => event.aoi_name).length
    return {
      insideCount,
      outsideCount: events.length - insideCount,
      topAssociated,
    }
  }, [events])

  const eventGroups = useMemo(() => [
    {
      key: "pupil",
      title: "Dilatacion pupilar",
      description: "Extremos de respuesta pupilar y su AOI asociado.",
      Icon: Activity,
      iconClassName: "text-violet-600 dark:text-violet-300",
      events: events.filter((event) => event.metric === "pupil"),
    },
    {
      key: "gaze",
      title: "Gaze point",
      description: "Puntos extremos en los ejes X e Y de la mirada.",
      Icon: Crosshair,
      iconClassName: "text-blue-600 dark:text-blue-300",
      events: events.filter((event) => event.metric === "gaze_x" || event.metric === "gaze_y"),
    },
    {
      key: "distance",
      title: "Distancia dispositivo",
      description: "Momentos de distancia minima y maxima frente a pantalla.",
      Icon: Ruler,
      iconClassName: "text-emerald-700 dark:text-emerald-300",
      events: events.filter((event) => event.metric === "distance"),
    },
  ], [events])

  const maxTransitionCount = useMemo(() => {
    if (!data) return 0
    return data.transitions.reduce((max, row) => {
      const rowMax = data.aois.reduce((innerMax, aoi) => (
        Math.max(innerMax, row.counts[aoi.name] ?? 0)
      ), 0)
      return Math.max(max, rowMax)
    }, 0)
  }, [data])

  if (scenario === "all") {
    return (
      <div className="analytics-stack">
        <Card>
          <CardHeader>
            <CardTitle>Comparativa AOIs</CardTitle>
            <CardDescription>
              Selecciona un escenario especifico para analizar sus areas de interes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              Selecciona un escenario para visualizar la comparativa.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!participantCode) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">Selecciona un participante para ver AOIs.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="analytics-stack">
        <div className="analytics-state-frame animate-pulse rounded-lg bg-muted" />
        <div className="analytics-state-frame-compact animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  if (!data || data.aois.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          No hay AOIs definidas para este escenario.
        </p>
      </div>
    )
  }

  return (
    <div className="analytics-stack">
      <div className="analytics-kpi-grid analytics-kpi-grid-four">
        <KpiCard
          label="AOIs"
          value={data.aois.length}
          unit=""
          description="Areas analizadas"
          Icon={Target}
          bgClass="bg-card"
          iconBgClass="bg-blue-100 dark:bg-blue-900/30"
          iconColorClass="text-blue-500"
          labelColorClass="text-blue-600 dark:text-blue-400"
          decimals={0}
        />
        <KpiCard
          label="Fijaciones"
          value={data.total_fixations}
          unit=""
          description="Total en el escenario"
          Icon={Hash}
          bgClass="bg-card"
          iconBgClass="bg-emerald-100 dark:bg-emerald-900/30"
          iconColorClass="text-emerald-500"
          labelColorClass="text-emerald-600 dark:text-emerald-400"
          decimals={0}
        />
        <KpiCard
          label="Tiempo en AOIs"
          value={data.observed_aoi_dwell_time_percent}
          unit="%"
          description="Dwell time cubierto"
          Icon={Clock}
          bgClass="bg-card"
          iconBgClass="bg-amber-100 dark:bg-amber-900/30"
          iconColorClass="text-amber-500"
          labelColorClass="text-amber-600 dark:text-amber-400"
          decimals={1}
        />
        <KpiCard
          label="Mas observada"
          value={topAoi?.total_dwell_time_percent ?? 0}
          unit="%"
          description={topAoi?.name ?? "Sin datos"}
          Icon={Eye}
          bgClass="bg-card"
          iconBgClass="bg-rose-100 dark:bg-rose-900/30"
          iconColorClass="text-rose-500"
          labelColorClass="text-rose-600 dark:text-rose-400"
          decimals={1}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparativa AOIs</CardTitle>
          <CardDescription>
            Fijaciones y concentracion visual sobre las areas definidas del escenario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] 2xl:gap-6">
            <div className="relative overflow-hidden rounded-lg bg-muted" ref={imageContainerRef}>
              {!scenarioImageUrl ? (
                <div className="analytics-state-frame w-full animate-pulse bg-muted" />
              ) : (
                <img
                  ref={imageRef}
                  src={scenarioImageUrl}
                  alt={data.scenario}
                  className="analytics-visual-image"
                  onLoad={computeLetterbox}
                />
              )}

              <AoiOverlay aois={data.aois} box={letterbox} />
            </div>

            <div className="self-start pt-2">
              <AoiLegend aois={data.aois} className="flex-col items-start" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribucion temporal por Areas de Interes (AOI)</CardTitle>
          <CardDescription>
            Porcentaje del tiempo total de observacion dedicado a cada zona del estimulo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsChartShell xAxisLabel="AOI" variant="compact">
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <BarChart data={data.aois} margin={{ top: 16, right: 24, left: 0, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" height={36} tick={{ fontSize: 12 }} tickMargin={8} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Tiempo en AOI (%)",
                    angle: -90,
                    position: "insideLeft",
                    style: { textAnchor: "middle" },
                  }}
                />
                <RechartsTooltip content={<AoiTooltip />} cursor={{ fill: "rgba(0, 0, 0, 0.04)" }} />
                <Bar dataKey="total_dwell_time_percent" radius={[4, 4, 0, 0]}>
                  {data.aois.map((aoi) => (
                    <Cell key={aoi.id} fill={aoi.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsChartShell>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos clave sobre AOIs</CardTitle>
          <CardDescription>
            Resumen de maximos y minimos de pupila, gaze point y distancia, indicando si la mirada cae dentro de un AOI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              No hay eventos suficientes para cruzar con AOIs.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="flex min-h-[72px] items-center gap-4 rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-violet-600 dark:text-violet-300">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Dentro de AOIs</p>
                    <p className="mt-0.5 text-2xl font-semibold leading-none text-foreground">
                      {eventSummary.insideCount}/{events.length}
                    </p>
                  </div>
                </div>

                <div className="flex min-h-[72px] items-center gap-4 rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: eventSummary.topAssociated?.color ?? "#14B8A6" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">AOI mas asociada</p>
                    {eventSummary.topAssociated ? (
                      <p className="mt-0.5 flex min-w-0 items-baseline gap-2 text-2xl font-semibold leading-none text-foreground">
                        <span className="truncate">{eventSummary.topAssociated.name}</span>
                        <span className="shrink-0 text-base font-medium text-muted-foreground">
                          ({eventSummary.topAssociated.count})
                        </span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-2xl font-semibold leading-none text-muted-foreground">Ninguna</p>
                    )}
                  </div>
                </div>

                <div className="flex min-h-[72px] items-center gap-4 rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-rose-600 dark:text-rose-300">
                    <Target className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Fuera de AOI</p>
                    <p className="mt-0.5 text-2xl font-semibold leading-none text-foreground">
                      {eventSummary.outsideCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {eventGroups.map(({ key, title, description, Icon, iconClassName, events: groupEvents }) => (
                  <section
                    key={key}
                    className="min-w-0 rounded-xl border border-border bg-background"
                  >
                    <div className="flex items-start gap-3 border-b border-border px-4 py-4">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${iconClassName}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-semibold text-foreground">{title}</h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                      </div>
                    </div>

                    {groupEvents.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-muted-foreground">
                        Sin eventos para esta metrica.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {groupEvents.map((event) => {
                          const tone = eventTone(event.kind)
                          return (
                            <div
                              key={event.id}
                              className="px-4 py-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
                                  {eventShortLabel(event)}
                                </span>

                                {event.aoi_name ? (
                                  <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs font-semibold text-foreground">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: event.aoi_color ?? "#3B82F6" }}
                                    />
                                    <span className="truncate">{event.aoi_name}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex shrink-0 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                    Fuera de AOI
                                  </span>
                                )}
                              </div>

                              <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                                <div className="min-w-0">
                                  <p className="truncate text-xl font-semibold leading-tight text-foreground">
                                    {formatEventValue(event)}
                                  </p>
                                  <p>Valor</p>
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-foreground">
                                    {event.time_s == null ? "-" : `${event.time_s.toFixed(2)} s`}
                                  </p>
                                  <p>Tiempo</p>
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-foreground">{eventPosition(event)}</p>
                                  <p>Posicion</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estadisticas</CardTitle>
          <CardDescription>
            Resumen cuantitativo por AOI y transiciones entre areas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Resumen por AOI</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Metricas principales de fijacion, permanencia y llegada al objetivo.
                </p>
              </div>
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                {data.aois.length} AOIs
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">AOI</th>
                    <th className="px-4 py-3 text-right font-semibold">Fijaciones</th>
                    <th className="px-4 py-3 text-right font-semibold">Dwell total</th>
                    <th className="px-4 py-3 text-right font-semibold">Duracion media</th>
                    <th className="px-4 py-3 text-right font-semibold">TTFF</th>
                    <th className="px-4 py-3 text-right font-semibold">Hit rate</th>
                    <th className="px-4 py-3 text-right font-semibold">Hasta objetivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.aois.map((aoi) => (
                    <tr key={aoi.id} className="transition-colors hover:bg-muted/25">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: aoi.color }}
                          />
                          <span className="truncate">{aoi.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {aoi.fixation_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMs(aoi.total_dwell_time_ms)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMs(aoi.avg_fixation_duration_ms)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMs(aoi.ttff_ms)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(Math.max(aoi.hit_rate_percent, 0), 100)}%`,
                                backgroundColor: aoi.color,
                              }}
                            />
                          </div>
                          <span className="min-w-[48px] text-right font-medium tabular-nums">
                            {formatPercent(aoi.hit_rate_percent)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {aoi.fixations_to_target ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Matriz de transiciones AOI {"->"} AOI
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Conteo de saltos visuales entre areas; mayor intensidad indica mas transiciones.
                </p>
              </div>
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                Max {maxTransitionCount}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Desde \ Hacia</th>
                    {data.aois.map((aoi) => (
                      <th key={aoi.id} className="px-4 py-3 text-center font-semibold">
                        <span className="inline-flex items-center justify-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: aoi.color }}
                          />
                          {aoi.name}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.transitions.map((row) => {
                    const fromAoi = data.aois.find((aoi) => aoi.name === row.from_aoi)
                    return (
                      <tr key={row.from_aoi} className="transition-colors hover:bg-muted/25">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: fromAoi?.color ?? "#64748B" }}
                            />
                            <span className="truncate">{row.from_aoi}</span>
                          </div>
                        </td>
                        {data.aois.map((aoi) => {
                          const count = row.counts[aoi.name] ?? 0
                          const intensity = maxTransitionCount > 0
                            ? 0.08 + (count / maxTransitionCount) * 0.24
                            : 0
                          return (
                            <td key={aoi.id} className="px-3 py-2 text-center">
                              {aoi.name === row.from_aoi ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <span
                                  className="inline-flex min-w-10 justify-center rounded-md px-3 py-1.5 font-medium tabular-nums text-foreground"
                                  style={{
                                    backgroundColor: count > 0
                                      ? `rgba(59, 130, 246, ${intensity.toFixed(2)})`
                                      : undefined,
                                  }}
                                >
                                  {count}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center font-semibold tabular-nums">
                          {row.total}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

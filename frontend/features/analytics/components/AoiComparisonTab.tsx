"use client"

import { Skeleton } from "@/components/ui/skeleton"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CompareParticipantsButton } from "../participantComparison/CompareParticipantsButton"
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
import { Clock, Eye, Hash, Target } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { useStimulusImage } from "../participantComparison/cardHooks"
import {
  useAoiMetrics,
  useDistanceTimeseries,
  useFixationData,
  useGazeTimeseries,
  usePupilTimeseries,
} from "../hooks/useAnalyticsData"
import type { AoiMetricItem, FixationDurationMs } from "../types"
import {
  aoiFindings,
  buildAoiSequence,
  countAoiVisits,
  deriveKeyEvents,
  discoveryOrder,
  scenarioEndS,
  scenarioOnsetS,
  summarizeTransitions,
  type AoiLocator,
} from "../aoiInsights"
import {
  AoiLegend,
  AoiOverlay,
  findAoiAtPoint,
  getContainedImageBox,
  type ContainedImageBox,
} from "./AoiOverlay"
import { AnalyticsChartShell } from "./AnalyticsChartShell"
import { AoiFindingsCard } from "./aoi/AoiFindingsCard"
import { AoiMetricsCard } from "./aoi/AoiMetricsCard"
import { AoiSequenceCard } from "./aoi/AoiSequenceCard"
import { AoiSignalPeaksCard } from "./aoi/AoiSignalPeaksCard"
import { AoiTransitionsCard } from "./aoi/AoiTransitionsCard"

interface AoiComparisonTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  minFixationDurationMs: FixationDurationMs
}

/** Transitions and peaks share a row only while the matrix fits half the width. */
const sideBySideClass = (fixatedAoiCount: number) => (
  fixatedAoiCount <= 3 ? "xl:grid-cols-2" : fixatedAoiCount <= 4 ? "2xl:grid-cols-2" : undefined
)

const formatMs = (value: number | null | undefined) => (
  value == null ? "-" : `${Math.round(value)} ms`
)

const formatPercent = (value: number | null | undefined) => (
  value == null ? "-" : `${value.toFixed(1)}%`
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
  minFixationDurationMs,
}: AoiComparisonTabProps) {
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const { data, loading, error } = useAoiMetrics(
    projectId,
    participantCode,
    scenario,
    minFixationDurationMs
  )
  // Same detector and threshold as the AOI metrics, so the sequence built
  // from these fixations agrees with the counts and transitions above it.
  const {
    data: fixationData,
    loading: fixationsLoading,
    error: fixationsError,
  } = useFixationData(projectId, participantCode, scenario, minFixationDurationMs)
  const { data: pupilSeries } = usePupilTimeseries(projectId, participantCode, scenario)
  const { data: gazeSeries } = useGazeTimeseries(projectId, participantCode, scenario)
  const { data: distanceSeries } = useDistanceTimeseries(projectId, participantCode, scenario)

  const computeLetterbox = useCallback(() => {
    setLetterbox(getContainedImageBox(imageRef.current, imageContainerRef.current))
  }, [])



  const scenarioImageUrl = useStimulusImage(projectId, data?.scenario_file_id ?? null).url
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

  const aois = useMemo(() => data?.aois ?? [], [data])

  const topAoi = useMemo(() => {
    if (!aois.length) return null
    return aois.reduce((best, item) => (
      item.total_dwell_time_percent > best.total_dwell_time_percent ? item : best
    ))
  }, [aois])

  const locate = useCallback<AoiLocator>((x, y) => findAoiAtPoint(aois, x, y), [aois])

  const seriesTimes = useMemo(
    () => [pupilSeries?.time, gazeSeries?.time, distanceSeries?.time],
    [distanceSeries, gazeSeries, pupilSeries]
  )
  const onsetS = useMemo(() => scenarioOnsetS(seriesTimes), [seriesTimes])
  const endS = useMemo(
    () => scenarioEndS(seriesTimes, fixationData?.fixations ?? []),
    [fixationData, seriesTimes]
  )

  const sequence = useMemo(
    () => (fixationData && aois.length > 0 ? buildAoiSequence(fixationData.fixations, locate) : null),
    [aois.length, fixationData, locate]
  )
  const visits = useMemo(() => (sequence ? countAoiVisits(sequence) : null), [sequence])
  const discovery = useMemo(() => discoveryOrder(aois, onsetS), [aois, onsetS])
  const ranks = useMemo(
    () => new Map(discovery.seen.map((item) => [item.aoi.id, item.rank])),
    [discovery]
  )
  const transitions = useMemo(
    () => summarizeTransitions(data?.transitions ?? [], aois),
    [aois, data?.transitions]
  )
  const findings = useMemo(
    () => aoiFindings({ aois, discovery, visits, transitions }),
    [aois, discovery, transitions, visits]
  )

  const backendEvents = data?.events
  const events = useMemo(() => {
    if (backendEvents?.length) return backendEvents
    if (aois.length === 0) return []
    return deriveKeyEvents({ pupil: pupilSeries, gaze: gazeSeries, distance: distanceSeries }, locate)
  }, [aois.length, backendEvents, distanceSeries, gazeSeries, locate, pupilSeries])

  const outside = useMemo(() => {
    const totalMs = data?.total_dwell_time_ms ?? 0
    const observedMs = data?.observed_aoi_dwell_time_ms ?? 0
    return {
      percent: totalMs > 0 ? Math.max(0, 100 - (data?.observed_aoi_dwell_time_percent ?? 0)) : 0,
      seconds: Math.max(0, totalMs - observedMs) / 1000,
      fixations: sequence ? sequence.filter((span) => span.aoi == null).length : null,
    }
  }, [data, sequence])

  const fixatedAoiCount = aois.filter((aoi) => aoi.fixation_count > 0).length

  if (scenario === "all") {
    return (
      <div className="analytics-stack">
        <Card>
          <CardHeader>
            <CardTitle>Comparativa AOIs</CardTitle>
            <CardDescription>
              Selecciona un escenario específico para analizar sus áreas de interés.
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
        <Skeleton className="analytics-state-frame animate-pulse rounded-lg bg-muted" />
        <Skeleton className="analytics-state-frame-compact animate-pulse rounded-lg bg-muted" />
        <Skeleton className="h-64 animate-pulse rounded-lg bg-muted" />
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
          description="Áreas analizadas"
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
          label="Más observada"
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
            Fijaciones y concentración visual sobre las áreas definidas del escenario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] 2xl:gap-6">
            <div className="relative overflow-hidden rounded-lg bg-muted" ref={imageContainerRef}>
              {!scenarioImageUrl ? (
                <Skeleton className="analytics-state-frame w-full animate-pulse bg-muted" />
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
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle>Distribución temporal por áreas de interés (AOI)</CardTitle>
            <CardDescription>
              Porcentaje del tiempo total de observación dedicado a cada zona del estímulo.
            </CardDescription>
          </div>
          <CompareParticipantsButton
            spec={() => ({
              kind: "aoi",
              title: "Distribución temporal por áreas de interés (AOI)",
              scenario,
              sourceParticipant: participantCode,
              origin: "individual",
              params: { minFixationDurationMs },
            })}
          />
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

      {/* From here on: conclusions first, then when, how much, and how the gaze moved. */}
      <AoiFindingsCard findings={findings} />

      <AoiSequenceCard
        discovery={discovery}
        sequence={sequence}
        visits={visits}
        loading={fixationsLoading}
        error={fixationsError}
        onsetS={onsetS}
        endS={endS}
        events={events}
      />

      <AoiMetricsCard
        aois={data.aois}
        ranks={ranks}
        onsetS={onsetS}
        visits={visits}
        outside={outside}
        totalFixations={data.total_fixations}
      />

      <div className={cn("grid gap-4", sideBySideClass(fixatedAoiCount))}>
        <AoiTransitionsCard aois={data.aois} summary={transitions} />
        <AoiSignalPeaksCard events={events} onsetS={onsetS} />
      </div>
    </div>
  )
}

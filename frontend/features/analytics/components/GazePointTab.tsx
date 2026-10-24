"use client"
import { AnalyticsModeSelector, FitAxisToggle } from "@/features/analytics/components/AnalyticsModeSelector"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCompareParticipantsSpec } from "../participantComparison/ParticipantComparisonProvider"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Activity,
  Clock,
  Crosshair,
  Eye,
  MapPin,
  RotateCcw,
  Ruler,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useStimulusImage } from "../participantComparison/cardHooks"
import { cn } from "@/lib/utils"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { StatisticsTable } from "@/features/analytics/components/StatisticsTable"
import type { StatRow } from "@/features/analytics/components/StatisticsTable"
import {
  useAoiMetrics,
  useGazeAt,
  useGazeStatistics,
  useGazeTimeseries,
} from "../hooks/useAnalyticsData"
import {
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  findAoiAtPoint,
  getContainedImageBox,
  imagePointToContainerPercent,
  type ContainedImageBox,
} from "./AoiOverlay"
import { TimeWindowControls } from "./TimeWindowControls"
import { useTimeWindow } from "../hooks/useZoomHistory"
import { MissingStimulusImage } from "./MissingStimulusImage"
import { AnalyticsChartShell, LINE_CHART_MARGIN } from "./AnalyticsChartShell"
import { useChartDragZoom } from "./ChartDragZoom"
import { axisTickDecimals, formatAxisTick } from "../chartZoom"
import { readClickedTime } from "../comparison/chartInteraction"
import { useFittedAxis } from "../hooks/useFittedAxis"
import { AnalyticsApi } from "../api/analyticsApi"
import { fittedAxis } from "../fittedAxis"
import { gazeAxisStatistics, signalStatRow, type GazeAxis } from "../signalStats"
import type { GazeStatistics } from "../types"
import type { ParticipantComparisonSpec } from "../participantComparison/spec"
import { useGroupView } from "../groupMode/useGroupData"
import type { GroupKpi } from "../groupMode/GroupStats"
import { GroupSignalChart, GroupSignalStats, useGroupSignal } from "../groupMode/groupSignal"

type ViewMode = "both" | GazeAxis

const AXIS_NAMES: Record<GazeAxis, string> = { x: "mirada X", y: "mirada Y" }

/**
 * «Promedio» cards for one axis. In a group mode each participant is one line
 * of one colour, so the view shows one axis at a time: «Ambos ejes» would
 * double the lines with nothing but the line style to tell X from Y, and an
 * average of X and Y has no meaning.
 */
function groupKpis(axis: GazeAxis): GroupKpi[] {
  const name = AXIS_NAMES[axis]
  return [
    {
      label: "Media",
      field: "mean",
      unit: "%",
      tooltip: `Promedio, entre participantes, de la media de cada uno en la ${name}`,
      Icon: Activity,
      iconBgClass: "bg-indigo-100 dark:bg-indigo-900/40",
      iconColorClass: "text-indigo-500",
      labelColorClass: "text-indigo-600 dark:text-indigo-400",
    },
    {
      label: "Mínimo",
      field: "min",
      unit: "%",
      tooltip: `Promedio, entre participantes, del mínimo de cada uno en la señal suavizada de ${name}`,
      Icon: TrendingDown,
      iconBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
      iconColorClass: "text-emerald-500",
      labelColorClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Máximo",
      field: "max",
      unit: "%",
      tooltip: `Promedio, entre participantes, del máximo de cada uno en la señal suavizada de ${name}`,
      Icon: TrendingUp,
      iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
      iconColorClass: "text-rose-500",
      labelColorClass: "text-rose-600 dark:text-rose-400",
    },
  ]
}

interface GazePointTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

interface LinePoint {
  time: number
  // null is a gap in the gaze; the line breaks there.
  gx_clean: number | null
  gy_clean: number | null
}

const gazeValues = (data: LinePoint[]) => data.flatMap((point) => [point.gx_clean, point.gy_clean])

interface GazeTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface GazeTooltipProps {
  active?: boolean
  payload?: GazeTooltipPayloadEntry[]
  label?: number
}

function GazeTooltip({ active, payload, label }: GazeTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      {typeof label === "number" && (
        <p className="mb-1 font-medium text-gray-300">{label.toFixed(1)}s</p>
      )}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>
            {entry.name}: {Number(entry.value).toFixed(2)} %
          </span>
        </div>
      ))}
    </div>
  )
}

export function GazePointTab({
  projectId,
  participantCode,
  scenario,
}: GazePointTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [showAois, setShowAois] = useState(true)

  // Group modes read the whole scenario, so the time window is left out here.
  const groupSpec = useMemo<ParticipantComparisonSpec>(() => ({
    kind: "gaze",
    title: "Punto de mirada",
    scenario,
    sourceParticipant: participantCode,
    origin: "individual",
    params: { axes: viewMode, window: { start: null, end: null } },
  }), [participantCode, scenario, viewMode])
  const groupView = useGroupView(groupSpec)
  // In a group mode the single recording is not loaded at all.
  const individualParticipant = groupView.active ? null : participantCode
  const groupAxis: GazeAxis = viewMode === "y" ? "y" : "x"

  const {
    data: gazeData,
    loading: gazeLoading,
    fetchGaze,
    clear: clearGaze,
  } = useGazeAt(projectId, individualParticipant)
  const windowState = useTimeWindow(() => {
    setSelectedTime(null)
    clearGaze()
  })
  const timeWindow = windowState.window
  // Refs for letterbox-corrected gaze positioning
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  // Gaze position remapped to account for object-contain letterboxing
  const [gazeOffset, setGazeOffset] = useState<{ x: number; y: number } | null>(null)
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)

  const { data: timeseriesData, loading: timeseriesLoading } = useGazeTimeseries(
    projectId,
    individualParticipant,
    scenario,
    timeWindow.start,
    timeWindow.end
  )
  const { data: stats, loading: statsLoading } = useGazeStatistics(
    projectId,
    individualParticipant,
    scenario,
    timeWindow.start,
    timeWindow.end
  )
  const aoiScenario = scenario !== "all" ? scenario : gazeData?.scenario ?? "all"
  const { data: aoiData, loading: aoiLoading } = useAoiMetrics(
    projectId,
    individualParticipant,
    aoiScenario
  )
  const aois = aoiData?.aois ?? []
  const gazeX = gazeData?.gx
  const gazeY = gazeData?.gy
  const currentAoi = findAoiAtPoint(aois, gazeX, gazeY)

  const chartData = useMemo<LinePoint[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.time.map((time, index) => ({
      time,
      gx_clean: timeseriesData.gx_clean[index],
      gy_clean: timeseriesData.gy_clean[index],
    }))
  }, [timeseriesData])

  // Pin the XAxis domain to the full data range so ReferenceLine never causes zoom.
  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])
  // Both axes set the scale, so switching between them never moves it.
  const { fit: fitAxis, setFit: setFitAxis, yAxisProps } = useFittedAxis(chartData, gazeValues)
  const chartLegend = [
    ...(viewMode === "both" || viewMode === "x"
      ? [{ label: "Mirada X (%)", color: "#818CF8" }]
      : []),
    ...(viewMode === "both" || viewMode === "y"
      ? [{ label: "Mirada Y (%)", color: "#22C55E" }]
      : []),
  ]

  const minTime = useMemo(() => {
    if (chartData.length === 0) return null
    let minVal = Infinity
    let minT = chartData[0].time
    for (const pt of chartData) {
      const v = pt.gx_clean
      if (v != null && v < minVal) {
        minVal = v
        minT = pt.time
      }
    }
    return minT
  }, [chartData])

  const maxTime = useMemo(() => {
    if (chartData.length === 0) return null
    let maxVal = -Infinity
    let maxT = chartData[0].time
    for (const pt of chartData) {
      const v = pt.gx_clean
      if (v != null && v > maxVal) {
        maxVal = v
        maxT = pt.time
      }
    }
    return maxT
  }, [chartData])

  const selectedValue = useMemo<number | null>(() => {
    if (selectedTime == null || chartData.length === 0) return null
    let nearest = chartData[0]
    let minDiff = Math.abs(chartData[0].time - selectedTime)
    for (const pt of chartData) {
      const diff = Math.abs(pt.time - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        nearest = pt
      }
    }
    return nearest.gx_clean
  }, [selectedTime, chartData])

  const tableRows = useMemo<StatRow[]>(() => {
    const countX = chartData.filter((pt) => pt.gx_clean != null).length
    const countY = chartData.filter((pt) => pt.gy_clean != null).length
    return [
      signalStatRow("Mirada X", gazeAxisStatistics(stats, "x"), countX),
      signalStatRow("Mirada Y", gazeAxisStatistics(stats, "y"), countY),
    ]
  }, [stats, chartData])

  // Group modes: each participant's chosen axis and its own statistics, as in this view.
  const groupStatRow = useCallback(
    (serie: string, groupStats: GazeStatistics | null, count: number | null) =>
      signalStatRow(serie, gazeAxisStatistics(groupStats, groupAxis), count),
    [groupAxis]
  )
  const groupResults = useGroupSignal(groupView, {
    scenario,
    column: groupAxis,
    operation: "getGazeStatistics",
    request: AnalyticsApi.getGazeStatistics,
    statRow: groupStatRow,
  })
  const groupYAxis = useCallback((values: number[]) => (fitAxis ? fittedAxis(values) : null), [fitAxis])
  const groupKpiCards = useMemo(() => groupKpis(groupAxis), [groupAxis])

  /**
   * Remaps gaze coordinates from "% of image" to "% of container".
   *
   * object-contain adds letterbox padding when the image aspect ratio doesn't
   * match the container. Without this correction, dots at extreme x or y values
   * land in the empty letterbox area rather than on the visible image content.
   */
  const computeGazeOffset = useCallback(() => {
    const box = getContainedImageBox(imageRef.current, imageContainerRef.current)
    setLetterbox(box)

    if (!box || gazeX == null || gazeY == null) {
      setGazeOffset(null)
      return
    }

    setGazeOffset(imagePointToContainerPercent(box, gazeX, gazeY))
  }, [gazeX, gazeY])

  // Recompute offset when gazeData changes (image may already be loaded)
  const scenarioImageUrl = useStimulusImage(projectId, gazeData?.scenario_file_id ?? null).url
  useEffect(() => {
    computeGazeOffset()
  }, [computeGazeOffset])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeGazeOffset())
    const container = imageContainerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(() => computeGazeOffset())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeGazeOffset, scenarioImageUrl])

  const handleKpiClick = (time: number | null) => {
    if (time == null) return
    const next = selectedTime === time ? null : time
    setSelectedTime(next)
    if (next !== null) fetchGaze(next)
  }



  const handleChartClick = (state: unknown) => {
    const time = readClickedTime(state)
    if (time === null) return
    setSelectedTime(time)
    fetchGaze(time)
  }

  // A dragged range behaves exactly like typing it into the window controls.
  const dragZoom = useChartDragZoom(windowState.zoomTo)

  useCompareParticipantsSpec(() => ({
    kind: "gaze",
    title: "Punto de mirada",
    scenario,
    sourceParticipant: participantCode,
    origin: "individual",
    params: { axes: viewMode, window: timeWindow },
  }))

  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle className="text-xl">Punto de mirada</CardTitle>
            <CardDescription>
              {groupView.active
                ? `Posición ${groupAxis === "x" ? "horizontal" : "vertical"} de la mirada en pantalla (%) de varios participantes.`
                : "Posición de la mirada en pantalla (%) a lo largo del tiempo."}
            </CardDescription>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-2">
            <FitAxisToggle pressed={fitAxis} onPressedChange={setFitAxis} />
            {groupView.active ? (
              <AnalyticsModeSelector<GazeAxis> value={groupAxis} onValueChange={setViewMode} options={[
                { key: "x", label: "Eje X", hint: "La posición horizontal de la mirada de cada participante." },
                { key: "y", label: "Eje Y", hint: "La posición vertical de la mirada de cada participante." },
              ]} />
            ) : (
              <AnalyticsModeSelector value={viewMode} onValueChange={setViewMode} options={[
                { key: "both", label: "Ambos ejes", hint: "Posición horizontal y vertical de la mirada juntas." },
                { key: "x", label: "Eje X", hint: "Solo la posición horizontal de la mirada (izquierda y derecha)." },
                { key: "y", label: "Eje Y", hint: "Solo la posición vertical de la mirada (arriba y abajo)." },
              ]} />
            )}
            {/* Recording seconds belong to one recording: no window in a group mode. */}
            {groupView.active ? null : <TimeWindowControls
              draftStart={windowState.draft.start}
              draftEnd={windowState.draft.end}
              appliedWindow={timeWindow}
              error={windowState.error}
              loading={timeseriesLoading || statsLoading}
              onDraftStartChange={(value) =>
                windowState.setDraft((current) => ({ ...current, start: value }))
              }
              onDraftEndChange={(value) =>
                windowState.setDraft((current) => ({ ...current, end: value }))
              }
              onApply={windowState.apply}
              onReset={windowState.reset}
            />}
          </div>
        </CardHeader>

        <CardContent>
          {groupView.active ? (
            <GroupSignalChart
              view={groupView}
              results={groupResults}
              kpis={groupKpiCards}
              unit="%"
              yLabel="Posición (%)"
              yAxis={groupYAxis}
            />
          ) : <>
          <div className="analytics-kpi-grid">
            {[
              {
                label: "Media",
                value: stats?.gx_mean,
                description: "Mirada X",
                Icon: Activity,
                unit: "%",
                iconBgClass: "bg-indigo-100 dark:bg-indigo-900/40",
                iconColorClass: "text-indigo-500",
                labelColorClass: "text-indigo-600 dark:text-indigo-400",
                hoverBgClass: "hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
                activeBgClass: "bg-indigo-50 dark:bg-indigo-950/30",
                onClick: undefined as (() => void) | undefined,
                active: false,
              },
              {
                label: "Mínimo",
                value: stats?.gx_min,
                tooltip: "En la señal suavizada de mirada X",
                Icon: TrendingDown,
                unit: "%",
                iconBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
                iconColorClass: "text-emerald-500",
                labelColorClass: "text-emerald-600 dark:text-emerald-400",
                hoverBgClass: "hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30",
                activeBgClass: "bg-emerald-50/50 dark:bg-emerald-950/30",
                onClick: minTime != null ? () => handleKpiClick(minTime) : undefined,
                active: selectedTime === minTime,
              },
              {
                label: "Máximo",
                value: stats?.gx_max,
                tooltip: "En la señal suavizada de mirada X",
                Icon: TrendingUp,
                unit: "%",
                iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
                iconColorClass: "text-rose-500",
                labelColorClass: "text-rose-600 dark:text-rose-400",
                hoverBgClass: "hover:bg-rose-50/50 dark:hover:bg-rose-950/30",
                activeBgClass: "bg-rose-50/50 dark:bg-rose-950/30",
                onClick: maxTime != null ? () => handleKpiClick(maxTime) : undefined,
                active: selectedTime === maxTime,
              },
            ].map((cardProps) => (
              <KpiCard key={cardProps.label} loading={statsLoading} {...cardProps} />
            ))}
          </div>

          {timeseriesLoading ? (
            <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
          ) : chartData.length === 0 ? (
            <div className="analytics-state-frame flex items-center justify-center text-sm text-muted-foreground">
              No hay datos de mirada para los filtros seleccionados.
            </div>
          ) : (
            <AnalyticsChartShell
              legend={chartLegend}
              dragZoom={dragZoom}
              onZoomReset={windowState.isZoomed ? windowState.reset : undefined}
              onZoomBack={windowState.canGoBack ? windowState.back : undefined}
            >
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={chartData}
                {...dragZoom.chartProps(handleChartClick)}
                margin={LINE_CHART_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={chartDomain}
                  tickFormatter={(value) => formatAxisTick(value, axisTickDecimals(chartDomain))}
                  tickMargin={8}
                />
                <YAxis
                  width={72}
                  {...yAxisProps}
                  label={{
                    value: "Posición (%)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    style: { textAnchor: "middle" },
                  }}
                />
                <RechartsTooltip content={<GazeTooltip />} />

                {typeof stats?.gx_mean === "number" ? (
                  <ReferenceLine y={stats.gx_mean} stroke="#9CA3AF" strokeDasharray="4 4" />
                ) : null}

                {selectedTime != null ? (
                  <ReferenceLine
                    x={selectedTime}
                    className="analytics-selected-time"
                    stroke="#374151"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{
                      value: `${Math.round(selectedTime)}s`,
                      position: "top",
                      fontSize: 11,
                      fill: "#374151",
                    }}
                  />
                ) : null}

                {viewMode === "both" || viewMode === "x" ? (
                  <Line
                    type="monotone"
                    dataKey="gx_clean"
                    name="Mirada X (%)"
                    stroke="#818CF8"
                    strokeWidth={1.5}
                    dot={false}
                  />
                ) : null}

                {viewMode === "both" || viewMode === "y" ? (
                  <Line
                    type="monotone"
                    dataKey="gy_clean"
                    name="Mirada Y (%)"
                    stroke="#22C55E"
                    strokeWidth={1.5}
                    dot={false}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
            </AnalyticsChartShell>
          )}
          </>}
        </CardContent>
      </Card>

      {groupView.active ? (
        <GroupSignalStats view={groupView} results={groupResults} unit="%" />
      ) : <>
      {/* Gaze Snapshot Section */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">Punto de fijación sobre estímulo visual</CardTitle>
              {gazeData?.scenario && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-100 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {gazeData.scenario}
                </span>
              )}
            </div>
            <CardDescription>
              Dónde miraba el participante en el instante seleccionado.
            </CardDescription>
          </div>
          {gazeData && (
            <div className="flex shrink-0 items-center gap-2">
              <AoiToggleButton
                enabled={showAois}
                onToggle={() => setShowAois((value) => !value)}
                disabled={aois.length === 0 || aoiLoading}
                count={aois.length}
              />
              <Button variant="ghost"
                type="button"
                onClick={() => {
                  clearGaze()
                  setSelectedTime(null)
                }}
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar selección
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4 mt-4">
          {/* 4-metric summary row */}
          {gazeData && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "SEGUNDO",
                  value: `${gazeData.nearest_time_s.toFixed(0)}`,
                  sub: `de ${Math.round(chartData[chartData.length - 1]?.time ?? 0)} segundos`,
                  Icon: Clock,
                  bg: "bg-blue-50 dark:bg-blue-950/40",
                  iconColor: "text-blue-500",
                },
                {
                  label: "VALOR",
                  value: selectedValue != null ? `${selectedValue.toFixed(2)}` : "—",
                  sub: "% posición X",
                  Icon: Ruler,
                  bg: "bg-emerald-50 dark:bg-emerald-950/40",
                  iconColor: "text-emerald-500",
                },
                {
                  label: "POS X",
                  value: gazeData.gx != null ? `${gazeData.gx.toFixed(0)}%` : "—",
                  sub: "horizontal",
                  Icon: Crosshair,
                  bg: "bg-violet-50 dark:bg-violet-950/40",
                  iconColor: "text-violet-500",
                },
                {
                  label: "POS Y",
                  value: gazeData.gy != null ? `${gazeData.gy.toFixed(0)}%` : "—",
                  sub: "vertical",
                  Icon: Crosshair,
                  bg: "bg-emerald-50 dark:bg-emerald-950/40",
                  iconColor: "text-emerald-500",
                },
              ].map(({ label, value, sub, Icon, bg, iconColor }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm roomy:p-4"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg roomy:h-10 roomy:w-10 roomy:rounded-xl",
                      bg
                    )}
                  >
                    <Icon className={cn("h-4 w-4 roomy:h-5 roomy:w-5", iconColor)} />
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-0.5 text-xl font-bold leading-tight text-foreground roomy:mt-2 roomy:text-3xl">{value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conditional rendering states */}
          {!gazeData && !gazeLoading ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante
            </div>
          ) : gazeLoading ? (
            <Skeleton className="h-48 animate-pulse rounded-xl bg-muted" />
          ) : gazeData && (gazeData.gx == null || gazeData.gy == null) ? (
            <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
              <span>
                Sin coordenadas de mirada registradas para t = {gazeData.nearest_time_s.toFixed(1)}s
              </span>
              {gazeData.scenario && (
                <span className="text-xs text-muted-foreground/60">Escenario: {gazeData.scenario}</span>
              )}
            </div>
          ) : gazeData && !gazeData.scenario_file_id ? (
            <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-xl bg-card">
              <MissingStimulusImage
                scenario={gazeData.scenario}
                gazeX={gazeData.gx}
                gazeY={gazeData.gy}
                showGazePoint
                markerTone="cyan"
                className="w-full"
              />
              <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                t = {gazeData.nearest_time_s.toFixed(2)}s · Posición de mirada:
                ({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})
              </div>
            </div>
          ) : gazeData ? (
            <div className="overflow-hidden rounded-xl bg-card">
              {scenarioImageUrl ? (
                <div className="relative" ref={imageContainerRef}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={scenarioImageUrl}
                    alt="Escenario"
                    className="max-h-[500px] w-full object-contain"
                    onLoad={computeGazeOffset}
                  />
                  {showAois && (
                    <AoiOverlay aois={aois} box={letterbox} />
                  )}
                  {gazeOffset && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                            style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                          >
                            <div className="h-8 w-8 rounded-full border-[5px] border-cyan-400 bg-cyan-400/20 shadow-[0_6px_20px_rgba(6,182,212,0.35)]" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950">
                            <Crosshair className="h-4 w-4 text-cyan-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold leading-none">Punto de atención</p>
                            <p className="mt-1 text-xs leading-none text-muted-foreground">
                              ({gazeData.gx?.toFixed(0)}, {gazeData.gy?.toFixed(0)})
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  No se pudo cargar la imagen del escenario.
                </div>
              )}
            </div>
          ) : null}

          {gazeData && showAois ? <AoiLegend aois={aois} /> : null}

          {/* Bottom callout - only when gaze data is loaded */}
          {gazeData && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 dark:bg-slate-100">
                <Eye className="h-5 w-5 text-white dark:text-slate-950" />
              </div>
              <div>
                <p className="text-base font-medium text-slate-900 dark:text-slate-100">Punto de atención</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Mirada en el segundo {Math.round(gazeData.nearest_time_s)}.
                  {currentAoi ? ` Cae dentro del AOI "${currentAoi.name}".` : aois.length > 0 ? " No cae dentro de un AOI delimitado." : ""}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>
            Resumen numérico de la señal de mirada suavizada: posición, variabilidad y extremos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={tableRows}
            summaryRow={tableRows[0]}
            loading={statsLoading || !stats}
            unit="%"
          />
        </CardContent>
      </Card>
      </>}

    </div>
  )
}

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { getStimulusPreviewUrl } from "@/features/projects/api/stimulusUrls"
import { cn } from "@/lib/utils"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { StatisticsTable } from "@/features/analytics/components/StatisticsTable"
import type { StatRow } from "@/features/analytics/components/StatisticsTable"
import {
  useAoiMetrics,
  useGazeAt,
  usePupilTimeseries,
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
import { fittedAxis } from "../fittedAxis"
import { pupilAxis } from "../pupilAxis"
import {
  computePupilStats,
  extremePupilSample,
  isValidPupilValue,
  pupilSamples,
  pupilStatRow,
  pupilTrace,
  type PupilEyes,
  type PupilPoint,
} from "../pupilStats"
import type { ParticipantComparisonSpec } from "../participantComparison/spec"
import type { CardResult } from "../participantComparison/cardData"
import { useGroupView } from "../groupMode/useGroupData"
import { GroupTemporalChart, type GroupTrace } from "../groupMode/GroupTemporalChart"
import { GroupKpiGrid, GroupStatsCard, type GroupKpi, type GroupStatEntry } from "../groupMode/GroupStats"
import { GroupStimulusCard } from "../groupMode/GroupStimulusCard"

type ViewMode = PupilEyes

interface PupilDilationTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

type LinePoint = PupilPoint

/** A comparison card's pupil trace as the view's points (smoothed and raw). */
function cardPupilPoints(result: CardResult): PupilPoint[] {
  if (result.type !== "temporal") return []
  return result.points.map((point) => ({
    time: point.time,
    // Results cached before the raw columns existed fall back to the smoothed ones.
    left: "raw_left" in point ? point.raw_left : point.left,
    right: "raw_right" in point ? point.raw_right : point.right,
    smooth_left: point.left,
    smooth_right: point.right,
  }))
}

const GROUP_KPIS: GroupKpi[] = [
  {
    label: "Media",
    field: "mean",
    tooltip: "Promedio, entre participantes, de la media de cada uno",
    Icon: Activity,
    iconBgClass: "bg-indigo-100 dark:bg-indigo-900/40",
    iconColorClass: "text-indigo-500",
    labelColorClass: "text-indigo-600 dark:text-indigo-400",
  },
  {
    label: "Mínimo",
    field: "min",
    tooltip: "Promedio, entre participantes, del mínimo de cada uno en la señal suavizada",
    Icon: TrendingDown,
    iconBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColorClass: "text-emerald-500",
    labelColorClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Máximo",
    field: "max",
    tooltip: "Promedio, entre participantes, del máximo de cada uno en la señal suavizada",
    Icon: TrendingUp,
    iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
    iconColorClass: "text-rose-500",
    labelColorClass: "text-rose-600 dark:text-rose-400",
  },
]

const BOTH_EYES_DETAIL =
  "Con ambas pupilas, cada participante aporta en cada instante la media de su pupila izquierda y derecha, o la que tenga dato."

interface PupilTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface PupilTooltipProps {
  active?: boolean
  payload?: PupilTooltipPayloadEntry[]
  label?: number
}

function PupilTooltip({ active, payload, label }: PupilTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  // Instantaneous binocular average, same rule as the "Promedio" series:
  // only shown when both pupils are plotted and have a valid value.
  const validValues = payload
    .map((entry) => Number(entry.value))
    .filter((value) => isValidPupilValue(value))
  const average = payload.length >= 2 && validValues.length === payload.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : null

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
          <span>{entry.name}: {Number(entry.value).toFixed(2)} mm</span>
        </div>
      ))}
      {average != null && (
        <div className="mt-1 flex items-center gap-2 border-t border-gray-600 pt-1">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
          <span className="font-medium">Promedio: {average.toFixed(2)} mm</span>
        </div>
      )}
    </div>
  )
}

export function PupilDilationTab({
  projectId,
  participantCode,
  scenario,
}: PupilDilationTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [fitAxis, setFitAxis] = useState(false)
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [scenarioPreviewLoading, setScenarioPreviewLoading] = useState(false)
  const [scenarioPreviewError, setScenarioPreviewError] = useState<string | null>(null)
  const [showAois, setShowAois] = useState(true)
  const {
    data: gazeData,
    loading: gazeLoading,
    fetchGaze,
    clear: clearGaze,
  } = useGazeAt(projectId, participantCode)
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

  // The chart «Comparar participantes» and the group modes both start from.
  const comparisonSpec = useMemo<ParticipantComparisonSpec>(() => ({
    kind: "pupil",
    title: "Dilatación pupilar",
    scenario,
    sourceParticipant: participantCode,
    origin: "individual",
    params: { eyes: viewMode, window: timeWindow },
  }), [participantCode, scenario, timeWindow, viewMode])
  const groupView = useGroupView(comparisonSpec)
  // In a group mode the single recording is not loaded at all.
  const individualParticipant = groupView.active ? null : participantCode

  const { data: timeseriesData, loading: timeseriesLoading } = usePupilTimeseries(
    projectId,
    individualParticipant,
    scenario,
    timeWindow.start,
    timeWindow.end
  )
  const isVideoScenario = String(gazeData?.scenario_type || "").toLowerCase() === "video"
  const aoiScenario = isVideoScenario
    ? "all"
    : scenario !== "all" ? scenario : gazeData?.scenario ?? "all"
  const { data: aoiData, loading: aoiLoading } = useAoiMetrics(
    projectId,
    individualParticipant,
    aoiScenario
  )
  const aois = aoiData?.aois ?? []
  const canUseAois = !isVideoScenario
  const canShowAois = canUseAois && showAois
  const gazeX = gazeData?.gx
  const gazeY = gazeData?.gy
  const currentAoi = canUseAois ? findAoiAtPoint(aois, gazeX, gazeY) : null
  let aoiStatusText = ""
  if (canUseAois) {
    if (currentAoi) {
      aoiStatusText = ` Cae dentro del AOI "${currentAoi.name}".`
    } else if (aois.length > 0) {
      aoiStatusText = " No cae dentro de un AOI delimitado."
    }
  }

  const chartData = useMemo<LinePoint[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.time.map((time, index) => ({
      time,
      left: timeseriesData.left[index] ?? 0,
      right: timeseriesData.right[index] ?? 0,
      smooth_left: timeseriesData.smooth_left[index] ?? 0,
      smooth_right: timeseriesData.smooth_right[index] ?? 0,
    }))
  }, [timeseriesData])

  const pupilModeData = useMemo(() => {
    const both = pupilSamples(chartData, "both")
    const left = pupilSamples(chartData, "left")
    const right = pupilSamples(chartData, "right")
    return {
      both: { samples: both, stats: computePupilStats(both) },
      left: { samples: left, stats: computePupilStats(left) },
      right: { samples: right, stats: computePupilStats(right) },
    }
  }, [chartData])

  // Group modes: each participant's trace and figures, computed like this view's own.
  const groupResults = useMemo(() => {
    const traces: GroupTrace[] = []
    const stats: GroupStatEntry[] = []
    for (const entry of groupView.data.entries) {
      if (entry.status === "empty") stats.push({ participant: entry.participant, row: null })
      if (entry.status !== "success" || !entry.result) continue
      const points = cardPupilPoints(entry.result)
      const trace = pupilTrace(points, viewMode)
      traces.push({ participant: entry.participant, time: trace.time, value: trace.value })
      stats.push({ participant: entry.participant, row: pupilStatRow(entry.participant.label, computePupilStats(pupilSamples(points, viewMode))) })
    }
    return { traces, stats }
  }, [groupView.data.entries, viewMode])
  const groupYAxis = useCallback(
    (values: number[]) => (fitAxis ? fittedAxis(values) : pupilAxis(values.filter((value) => value > 0))),
    [fitAxis]
  )

  const activeModeData = pupilModeData[viewMode]
  const activeStats = activeModeData.stats
  const activeModeLabel = viewMode === "both"
    ? "ambas pupilas"
    : viewMode === "left"
      ? "pupila izquierda"
      : "pupila derecha"
  const activeSerie = viewMode === "both"
    ? "Promedio"
    : viewMode === "left"
      ? "Izquierda"
      : "Derecha"

  // Pin the XAxis domain to the full data range so ReferenceLine never causes zoom.
  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])
  // Both pupils set the scale, so switching between them never moves the axis.
  const yAxis = useMemo(() => {
    // A zero diameter is a lost sample, not a value to scale to.
    const values = chartData.flatMap((point) => [point.smooth_left, point.smooth_right]).filter((value) => value > 0)
    return fitAxis ? fittedAxis(values) : pupilAxis(values)
  }, [chartData, fitAxis])
  const chartLegend = [
    ...(viewMode === "both" || viewMode === "right"
      ? [{ label: "Pupila derecha", color: "#F87171" }]
      : []),
    ...(viewMode === "both" || viewMode === "left"
      ? [{ label: "Pupila izquierda", color: "#818CF8" }]
      : []),
  ]

  const minTime = useMemo(() => {
    return extremePupilSample(activeModeData.samples, "min")?.time ?? null
  }, [activeModeData.samples])

  const maxTime = useMemo(() => {
    return extremePupilSample(activeModeData.samples, "max")?.time ?? null
  }, [activeModeData.samples])

  const selectedValue = useMemo<number | null>(() => {
    if (selectedTime == null || activeModeData.samples.length === 0) return null
    let nearest = activeModeData.samples[0]
    let minDiff = Math.abs(activeModeData.samples[0].time - selectedTime)
    for (const sample of activeModeData.samples) {
      const diff = Math.abs(sample.time - selectedTime)
      if (diff < minDiff) { minDiff = diff; nearest = sample }
    }
    return nearest.value
  }, [selectedTime, activeModeData.samples])

  const tableRows = useMemo<StatRow[]>(() => [
    pupilStatRow("Promedio", pupilModeData.both.stats),
    pupilStatRow("Izquierda", pupilModeData.left.stats),
    pupilStatRow("Derecha", pupilModeData.right.stats),
  ], [pupilModeData])


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

  useEffect(() => {
    let cancelled = false

    if (!gazeData?.scenario_file_id) {
      queueMicrotask(() => {
        if (cancelled) return
        setScenarioImageUrl(null)
        setScenarioPreviewLoading(false)
        setScenarioPreviewError(null)
      })
      return () => {
        cancelled = true
      }
    }

    let currentUrl: string | null = null

    queueMicrotask(() => {
      if (cancelled) return
      setScenarioImageUrl(null)
      setScenarioPreviewLoading(true)
      setScenarioPreviewError(null)
    })

    apiFetchBlob(getStimulusPreviewUrl(projectId, gazeData.scenario_file_id, {
      timeS: gazeData.nearest_time_s,
      participantCode,
      scenario: gazeData.scenario,
    }))
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setScenarioImageUrl(currentUrl)
      })
      .catch((error) => {
        if (!cancelled) {
          setScenarioImageUrl(null)
          setScenarioPreviewError(error?.message || "No se pudo cargar el estímulo visual")
        }
      })
      .finally(() => {
        if (!cancelled) setScenarioPreviewLoading(false)
      })

    return () => {
      cancelled = true
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [
    gazeData?.nearest_time_s,
    gazeData?.scenario,
    gazeData?.scenario_file_id,
    participantCode,
    projectId,
  ])

  const handleChartClick = (state: unknown) => {
    const time = readClickedTime(state)
    if (time === null) return
    setSelectedTime(time)
    fetchGaze(time)
  }

  // A dragged range behaves exactly like typing it into the window controls.
  const dragZoom = useChartDragZoom(windowState.zoomTo)
  useCompareParticipantsSpec(() => comparisonSpec)

  const groupDetail = viewMode === "both" ? BOTH_EYES_DETAIL : undefined
  const groupContent = groupView.mode ? (
    <>
      <GroupKpiGrid kpis={GROUP_KPIS} entries={groupResults.stats} loading={groupResults.traces.length === 0 && groupView.data.loading} />
      <GroupTemporalChart
        mode={groupView.mode}
        traces={groupResults.traces}
        data={groupView.data}
        timeAxis={groupView.timeAxis}
        unit="mm"
        yLabel="Amplitud pupilar (mm)"
        yAxis={groupYAxis}
        averageColor={viewMode === "right" ? "#F87171" : "#818CF8"}
        averageDetail={groupDetail}
        selectedTime={groupView.selectedTime}
        onSelectTime={groupView.selectTime}
      />
    </>
  ) : null

  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle className="text-xl">Dilatación pupilar</CardTitle>
            <CardDescription>
              {groupView.active
                ? `Diámetro pupilar (mm) de varios participantes, ${activeModeLabel}.`
                : `Diámetro pupilar a lo largo del tiempo (mm), ${activeModeLabel}.`}
            </CardDescription>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-2">
            <FitAxisToggle pressed={fitAxis} onPressedChange={setFitAxis} />
            <AnalyticsModeSelector value={viewMode} onValueChange={setViewMode} options={[
                { key: "both", label: "Ambas pupilas" },
                { key: "left", label: "Izquierda" },
                { key: "right", label: "Derecha" },
              ]} />
            {/* Recording seconds belong to one recording: no window in a group mode. */}
            {groupView.active ? null : <TimeWindowControls
              draftStart={windowState.draft.start}
              draftEnd={windowState.draft.end}
              appliedWindow={timeWindow}
              error={windowState.error}
              loading={timeseriesLoading}
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
          {groupView.active ? groupContent : <>
          <div className="analytics-kpi-grid">
            {[
              {
                label: "Media",
                value: activeStats?.mean,
                description: `${activeModeLabel.charAt(0).toUpperCase()}${activeModeLabel.slice(1)}`,
                tooltip: "Promedio del diámetro pupilar en el intervalo visualizado",
                tooltipExtra: activeStats?.raw_mean != null ? `Valor real: ${activeStats.raw_mean.toFixed(4)} mm` : undefined,
                Icon: Activity,
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
                value: activeStats?.min,
                tooltip: "En la señal suavizada",
                tooltipExtra: activeStats?.raw_min != null ? `Valor real: ${activeStats.raw_min.toFixed(4)} mm` : undefined,
                Icon: TrendingDown,
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
                value: activeStats?.max,
                tooltip: "En la señal suavizada",
                tooltipExtra: activeStats?.raw_max != null ? `Valor real: ${activeStats.raw_max.toFixed(4)} mm` : undefined,
                Icon: TrendingUp,
                iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
                iconColorClass: "text-rose-500",
                labelColorClass: "text-rose-600 dark:text-rose-400",
                hoverBgClass: "hover:bg-rose-50/50 dark:hover:bg-rose-950/30",
                activeBgClass: "bg-rose-50/50 dark:bg-rose-950/30",
                onClick: maxTime != null ? () => handleKpiClick(maxTime) : undefined,
                active: selectedTime === maxTime,
              },
            ].map((cardProps) => (
              <KpiCard key={cardProps.label} loading={timeseriesLoading} {...cardProps} />
            ))}
          </div>

          {timeseriesLoading ? (
            <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
          ) : chartData.length === 0 ? (
            <div className="analytics-state-frame flex items-center justify-center text-sm text-muted-foreground">
              No hay datos de dilatación pupilar para los filtros seleccionados.
            </div>
          ) : (
            <AnalyticsChartShell
              legend={chartLegend}
              dragZoom={dragZoom}
              onZoomReset={windowState.isZoomed ? windowState.reset : undefined}
              onZoomBack={windowState.canGoBack ? windowState.back : undefined}
            >
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart data={chartData} {...dragZoom.chartProps(handleChartClick)} margin={LINE_CHART_MARGIN}>
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
                  domain={yAxis?.domain ?? [0, "auto"]}
                  ticks={yAxis?.ticks}
                  allowDataOverflow={Boolean(yAxis)}
                  tickFormatter={yAxis ? (value: number) => Number(value).toFixed(yAxis.decimals) : undefined}
                  label={{ value: "Amplitud pupilar (mm)", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<PupilTooltip />} />

                {typeof activeStats?.mean === "number" ? (
                  <ReferenceLine y={activeStats.mean} stroke="#9CA3AF" strokeDasharray="4 4" />
                ) : null}

                {selectedTime != null ? (
                  <ReferenceLine
                    x={selectedTime}
                    className="analytics-selected-time"
                    stroke="#374151"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{ value: `${Math.round(selectedTime)}s`, position: "top", fontSize: 11, fill: "#374151" }}
                  />
                ) : null}

                {(viewMode === "both" || viewMode === "left") ? (
                  <Line
                    type="monotone"
                    dataKey="smooth_left"
                    name="Pupila izquierda"
                    stroke="#818CF8"
                    strokeWidth={1.5}
                    dot={false}
                  />
                ) : null}

                {(viewMode === "both" || viewMode === "right") ? (
                  <Line
                    type="monotone"
                    dataKey="smooth_right"
                    name="Pupila derecha"
                    stroke="#F87171"
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
        groupView.mode ? (
          <>
            <GroupStimulusCard view={groupView} scenario={scenario} />
            <GroupStatsCard
              entries={groupResults.stats}
              loading={groupResults.stats.length === 0 && groupView.data.loading}
              detail={groupDetail}
              basis={`Cada fila de participante usa sus propias muestras dibujadas de ${groupView.timeAxis.scope}.`}
            />
          </>
        ) : null
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
              Ubicación del punto de dilatación pupilar durante la visualización del estímulo.
            </CardDescription>
          </div>
          {gazeData && (
            <div className="flex shrink-0 items-center gap-2">
              {canUseAois ? (
                <AoiToggleButton
                  enabled={showAois}
                  onToggle={() => setShowAois((value) => !value)}
                  disabled={aois.length === 0 || aoiLoading}
                  count={aois.length}
                />
              ) : null}
              <Button variant="ghost"
                type="button"
                onClick={() => { clearGaze(); setSelectedTime(null) }}
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
                  sub: "mm dilatación",
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
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg roomy:h-10 roomy:w-10 roomy:rounded-xl", bg)}>
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
              <span>Sin coordenadas de mirada registradas para t = {gazeData.nearest_time_s.toFixed(1)}s</span>
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
              {scenarioPreviewLoading ? (
                <Skeleton className="h-48 animate-pulse rounded-xl bg-muted" />
              ) : scenarioImageUrl ? (
                <div className="relative" ref={imageContainerRef}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={scenarioImageUrl}
                    alt="Escenario"
                    className="max-h-[500px] w-full object-contain"
                    onLoad={computeGazeOffset}
                  />
                  {canShowAois && (
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
                  {isVideoScenario
                    ? "No se pudo cargar el fotograma del vídeo."
                    : scenarioPreviewError || "No se pudo cargar la imagen del escenario."}
                </div>
              )}
            </div>
          ) : null}

          {gazeData && canShowAois ? <AoiLegend aois={aois} /> : null}

          {/* Bottom callout — only when gaze data is loaded */}
          {gazeData && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 dark:bg-slate-100">
                <Eye className="h-5 w-5 text-white dark:text-slate-950" />
              </div>
              <div>
                <p className="text-base font-medium text-slate-900 dark:text-slate-100">Punto de atención</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedValue != null
                    ? `Mirada en el segundo ${Math.round(gazeData.nearest_time_s)} · ${selectedValue.toFixed(2)} mm`
                    : "Mirada en el instante seleccionado."}
                  {aoiStatusText}
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
            Resumen numérico de la señal suavizada: tendencia, variabilidad y extremos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={tableRows}
            activeSerie={activeSerie}
            loading={timeseriesLoading}
          />
        </CardContent>
      </Card>
      </>}

    </div>
  )
}
